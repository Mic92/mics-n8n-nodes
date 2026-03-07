import { NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

import type { NostrEvent } from "nostr-tools";

import { decode } from "nostr-tools/nip19";
import { wrapEvent } from "nostr-tools/nip59";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

/**
 * Parse a private key supplied as nsec1… bech32 or raw 64-char hex.
 */
function parsePrivateKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("Expected an nsec-encoded private key");
    }
    return decoded.data as Uint8Array;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return Uint8Array.from(Buffer.from(trimmed, "hex"));
  }
  throw new Error(
    "Private key must be nsec1… bech32 or a 64-character hex string",
  );
}

/**
 * Parse a recipient public key supplied as npub1… bech32 or raw 64-char hex.
 */
function parseRecipientPubkey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("npub1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "npub") {
      throw new Error("Expected an npub-encoded public key");
    }
    return decoded.data as string;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed;
  }
  throw new Error(
    "Recipient public key must be npub1… bech32 or a 64-character hex string",
  );
}

/**
 * Parse a comma-separated relay list into an array of URLs.
 */
function parseRelays(raw: string): string[] {
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/** Exported so tests can override with small values. */
export const retryConfig = {
  maxRetries: 20,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a message as a NIP-59 gift-wrapped kind-14 DM and publish it.
 * Retries with exponential back-off until at least one relay accepts.
 */
async function sendGiftWrappedDM(
  senderPrivateKey: Uint8Array,
  recipientPubkey: string,
  message: string,
  relays: string[],
): Promise<NostrEvent> {
  const wrap = wrapEvent(
    {
      kind: 14,
      content: message,
      tags: [["p", recipientPubkey]],
      created_at: Math.round(Date.now() / 1000),
    },
    senderPrivateKey,
    recipientPubkey,
  );

  await publishToRelays(wrap, relays);

  return wrap;
}

/**
 * Build a NIP-01 kind 0 metadata event from profile fields, sign it,
 * and publish to the configured relays.
 * Retries with exponential back-off like sendGiftWrappedDM.
 */
async function publishProfile(
  senderPrivateKey: Uint8Array,
  profile: { name: string; displayName: string; about: string; picture: string },
  relays: string[],
): Promise<NostrEvent> {
  const meta: Record<string, string> = {};
  if (profile.name) meta["name"] = profile.name;
  if (profile.displayName) meta["display_name"] = profile.displayName;
  if (profile.about) meta["about"] = profile.about;
  if (profile.picture) meta["picture"] = profile.picture;

  const event = finalizeEvent(
    {
      kind: 0,
      content: JSON.stringify(meta),
      tags: [],
      created_at: Math.round(Date.now() / 1000),
    },
    senderPrivateKey,
  );

  await publishToRelays(event, relays);

  return event;
}

/**
 * Publish an event to relays with exponential back-off retry.
 * Resolves once at least one relay accepts.
 */
async function publishToRelays(
  event: NostrEvent,
  relays: string[],
): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(
        retryConfig.baseDelayMs * Math.pow(2, attempt - 1),
        retryConfig.maxDelayMs,
      );
      await sleep(delay);
    }

    const pool = new SimplePool();
    try {
      const publishPromises = pool.publish(relays, event).map((p) =>
        p.then((result) => {
          if (
            typeof result === "string" &&
            (result.startsWith("connection failure:") ||
              result === "duplicate url" ||
              result.startsWith("connection skipped"))
          ) {
            throw new Error(result);
          }
          return result;
        }),
      );
      await Promise.any(publishPromises);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      pool.close(relays);
    }
  }

  throw new Error(
    `Failed to publish to any relay after ${retryConfig.maxRetries + 1} attempts: ${lastError?.message}`,
  );
}

export class Nostr implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Nostr",
    name: "nostr",
    icon: "fa:hashtag",
    group: ["output"],
    version: 1,
    subtitle:
      '={{$parameter["resource"] === "profile" ? "Set Profile" : "Send DM"}}',
    description:
      "Interact with Nostr: send encrypted DMs (NIP-59) or publish profile metadata (NIP-01)",
    defaults: {
      name: "Nostr",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "nostrApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Message",
            value: "message",
            description: "Send an encrypted direct message (NIP-59 Gift Wrap)",
          },
          {
            name: "Profile",
            value: "profile",
            description: "Publish profile metadata (NIP-01 kind 0)",
          },
        ],
        default: "message",
      },
      // --- Message fields ---
      {
        displayName: "Recipient Public Key",
        name: "recipientPubkey",
        type: "string",
        default: "",
        required: true,
        displayOptions: {
          show: {
            resource: ["message"],
          },
        },
        description:
          "The recipient's public key in npub1… bech32 or 64-char hex format",
      },
      {
        displayName: "Message",
        name: "message",
        type: "string",
        default: "",
        required: true,
        typeOptions: {
          rows: 4,
        },
        displayOptions: {
          show: {
            resource: ["message"],
          },
        },
        description: "The message content to send as a NIP-59 gift-wrapped DM",
      },
      // --- Profile fields ---
      {
        displayName: "Name",
        name: "profileName",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["profile"],
          },
        },
        description: "Username / handle (NIP-01 \"name\" field)",
      },
      {
        displayName: "Display Name",
        name: "profileDisplayName",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["profile"],
          },
        },
        description:
          "Human-readable display name (NIP-01 \"display_name\" field)",
      },
      {
        displayName: "About",
        name: "profileAbout",
        type: "string",
        default: "",
        typeOptions: {
          rows: 3,
        },
        displayOptions: {
          show: {
            resource: ["profile"],
          },
        },
        description: "Bio / description (NIP-01 \"about\" field)",
      },
      {
        displayName: "Picture URL",
        name: "profilePicture",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            resource: ["profile"],
          },
        },
        description: "URL of the profile picture (NIP-01 \"picture\" field)",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("nostrApi");

    let senderPrivateKey: Uint8Array;
    try {
      senderPrivateKey = parsePrivateKey(credentials.privateKey as string);
    } catch (error) {
      throw new NodeOperationError(
        this.getNode(),
        `Invalid sender private key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const senderPubkey = getPublicKey(senderPrivateKey);

    const relays = parseRelays(credentials.relays as string);
    if (relays.length === 0) {
      throw new NodeOperationError(
        this.getNode(),
        "At least one relay URL must be configured in credentials",
      );
    }

    const resource = this.getNodeParameter("resource", 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === "profile") {
          const profile = {
            name: this.getNodeParameter("profileName", i) as string,
            displayName: this.getNodeParameter(
              "profileDisplayName",
              i,
            ) as string,
            about: this.getNodeParameter("profileAbout", i) as string,
            picture: this.getNodeParameter("profilePicture", i) as string,
          };

          if (!profile.name && !profile.displayName && !profile.about && !profile.picture) {
            throw new NodeOperationError(
              this.getNode(),
              "At least one profile field must be set",
              { itemIndex: i },
            );
          }

          const event = await publishProfile(
            senderPrivateKey,
            profile,
            relays,
          );

          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({
                success: true,
                pubkey: senderPubkey,
                eventId: event.id,
                profile,
                relays,
              }),
              { itemData: { item: i } },
            ),
          );
        } else {
          const message = this.getNodeParameter("message", i) as string;
          const recipientRaw = this.getNodeParameter(
            "recipientPubkey",
            i,
          ) as string;

          if (!message.trim()) {
            throw new NodeOperationError(
              this.getNode(),
              "Message cannot be empty",
              { itemIndex: i },
            );
          }

          const recipientPubkey = parseRecipientPubkey(recipientRaw);

          const wrap = await sendGiftWrappedDM(
            senderPrivateKey,
            recipientPubkey,
            message,
            relays,
          );

          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({
                success: true,
                senderPubkey,
                recipientPubkey,
                eventId: wrap.id,
                relays,
              }),
              { itemData: { item: i } },
            ),
          );
        }
      } catch (error) {
        if (this.continueOnFail()) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({ error: errorMessage }),
              { itemData: { item: i } },
            ),
          );
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
