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
import { getPublicKey } from "nostr-tools/pure";

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

/**
 * Wrap a message as a NIP-59 gift-wrapped kind-14 DM and publish it.
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

  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(relays, wrap));
  } finally {
    pool.close(relays);
  }

  return wrap;
}

export class Nostr implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Nostr",
    name: "nostr",
    icon: "fa:hashtag",
    group: ["output"],
    version: 1,
    subtitle: "Send NIP-59 Gift-Wrapped DM",
    description:
      "Send an encrypted direct message via Nostr using the NIP-59 Gift Wrap protocol",
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
        displayName: "Recipient Public Key",
        name: "recipientPubkey",
        type: "string",
        default: "",
        required: true,
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
        description: "The message content to send as a NIP-59 gift-wrapped DM",
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

    for (let i = 0; i < items.length; i++) {
      try {
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
