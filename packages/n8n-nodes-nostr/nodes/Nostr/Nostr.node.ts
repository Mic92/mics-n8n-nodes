import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

import type { NostrEvent } from "nostr-tools";

import { decode } from "nostr-tools/nip19";
import { wrapManyEvents } from "nostr-tools/nip59";
import { SimplePool, useWebSocketImplementation } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import WebSocket from "ws";

// Inject a WebSocket implementation that sets a recognizable User-Agent
// so relay operators can identify (and rate-limit) us instead of seeing
// a generic "Node" agent hammering them with connections.
// Note: this is a process-global side effect that affects every
// nostr-tools SimplePool in the n8n process. Harmless in practice since
// we're the only nostr-tools consumer.
class NostrNodeWebSocket extends WebSocket {
  constructor(address: string, protocols?: string | string[]) {
    super(address, protocols, {
      headers: {
        "User-Agent":
          "n8n-nodes-nostr (+https://github.com/Mic92/mics-n8n-nodes)",
      },
    });
  }
}
useWebSocketImplementation(
  NostrNodeWebSocket as unknown as typeof globalThis.WebSocket,
);

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
    // Nostr requires lowercase hex; uppercase in a p-tag won't match
    // the recipient's subscription filter.
    return trimmed.toLowerCase();
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
  maxRetries: 8,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  /** Per-attempt publish timeout so a slow relay doesn't hang forever. */
  publishTimeoutMs: 15000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a message as NIP-59 gift-wrapped kind-14 DM events.
 * Returns [toUs, toThem] so the sender's own client also sees the
 * outgoing message in its conversation view (NIP-17).
 */
function buildGiftWrappedDM(
  senderPrivateKey: Uint8Array,
  recipientPubkey: string,
  message: string,
): NostrEvent[] {
  return wrapManyEvents(
    {
      kind: 14,
      content: message,
      tags: [["p", recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPrivateKey,
    [recipientPubkey],
  );
}

/**
 * Build and sign a NIP-01 kind 0 metadata event from the given
 * profile fields. Empty fields are omitted from the content JSON.
 */
function buildProfileEvent(
  senderPrivateKey: Uint8Array,
  profile: {
    name: string;
    displayName: string;
    about: string;
    picture: string;
  },
): NostrEvent {
  const fieldMap: Record<string, string> = {
    name: "name",
    displayName: "display_name",
    about: "about",
    picture: "picture",
  };
  const meta = Object.fromEntries(
    Object.entries(profile)
      .filter(([, v]) => v)
      .map(([k, v]) => [fieldMap[k], v]),
  );

  const event = finalizeEvent(
    {
      kind: 0,
      content: JSON.stringify(meta),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPrivateKey,
  );

  return event;
}

/** Extract a readable message from Promise.any's AggregateError. */
function formatError(err: unknown): string {
  if (err instanceof AggregateError) {
    const msgs = err.errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter((m, i, a) => a.indexOf(m) === i); // dedupe
    return msgs.join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Publish an event to relays with exponential back-off retry.
 * Resolves once at least one relay accepts.
 *
 * The deadRelays set is a poor man's circuit breaker shared across the
 * whole execute() call: once a relay fails maxRetries+1 times for one
 * event, subsequent items skip it immediately so a 100-item batch with
 * continueOnFail doesn't spend hours retrying a dead relay.
 */
async function publishToRelays(
  pool: SimplePool,
  event: NostrEvent,
  relays: string[],
  deadRelays: Set<string>,
): Promise<void> {
  const liveRelays = relays.filter((r) => !deadRelays.has(r));
  if (liveRelays.length === 0) {
    throw new Error(
      `All relays marked dead after earlier failures: ${[...deadRelays].join(", ")}`,
    );
  }

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(
        retryConfig.baseDelayMs * 2 ** (attempt - 1),
        retryConfig.maxDelayMs,
      );
      await sleep(delay);
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error("publish timeout")),
          retryConfig.publishTimeoutMs,
        );
      });
      const publishPromises = pool.publish(liveRelays, event).map((p) =>
        Promise.race([p, timeout]).then((result) => {
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
      lastError = formatError(err);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // Trip the breaker: none of the live relays accepted after full
  // retry budget, so don't bother with them for later items.
  for (const r of liveRelays) deadRelays.add(r);

  throw new Error(
    `Failed to publish to any relay after ${retryConfig.maxRetries + 1} attempts: ${lastError}`,
  );
}

export class Nostr implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Nostr",
    name: "nostr",
    icon: "file:nostr.svg",
    group: ["output"],
    version: 1,
    subtitle:
      '={{$parameter["resource"] === "profile" ? "Set Profile" : "Send DM"}}',
    description:
      "Interact with Nostr: send encrypted DMs (NIP-59) or publish profile metadata (NIP-01)",
    defaults: {
      name: "Nostr",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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
        description: 'Username / handle (NIP-01 "name" field)',
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
          'Human-readable display name (NIP-01 "display_name" field)',
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
        description: 'Bio / description (NIP-01 "about" field)',
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
        description: 'URL of the profile picture (NIP-01 "picture" field)',
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

    // Reuse a single pool across all items and retries so we don't open
    // a fresh WebSocket per attempt and DDoS the relay.
    const pool = new SimplePool();
    const deadRelays = new Set<string>();

    try {
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

            if (
              !profile.name &&
              !profile.displayName &&
              !profile.about &&
              !profile.picture
            ) {
              throw new NodeOperationError(
                this.getNode(),
                "At least one profile field must be set",
                { itemIndex: i },
              );
            }

            const event = buildProfileEvent(senderPrivateKey, profile);
            await publishToRelays(pool, event, relays, deadRelays);

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

            const [toUs, toThem] = buildGiftWrappedDM(
              senderPrivateKey,
              recipientPubkey,
              message,
            );
            // Recipient's copy is the one that matters; publish it first.
            await publishToRelays(pool, toThem, relays, deadRelays);
            // Self-copy is best-effort so our own client shows the sent
            // message. Don't fail the whole item if this one doesn't land.
            try {
              await publishToRelays(pool, toUs, relays, deadRelays);
            } catch {
              // already delivered to recipient; ignore
            }

            returnData.push(
              ...this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray({
                  success: true,
                  senderPubkey,
                  recipientPubkey,
                  eventId: toThem.id,
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
    } finally {
      pool.close(relays);
    }

    return [returnData];
  }
}
