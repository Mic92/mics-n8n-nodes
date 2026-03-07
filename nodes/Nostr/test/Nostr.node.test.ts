import { Server, WebSocket as MockWebSocket } from "mock-socket";

import { unwrapEvent } from "nostr-tools/nip59";
import { useWebSocketImplementation } from "nostr-tools/pool";
import { getPublicKey, generateSecretKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";

import type { NostrEvent } from "nostr-tools";
import type { IExecuteFunctions, INodeExecutionData } from "n8n-workflow";

import { Nostr } from "../Nostr.node";

// Route SimplePool through mock-socket so we never hit the network
useWebSocketImplementation(MockWebSocket);

const SENDER_KEY = generateSecretKey();
const SENDER_PUBKEY = getPublicKey(SENDER_KEY);
const SENDER_HEX = Buffer.from(SENDER_KEY).toString("hex");

const RECIPIENT_KEY = generateSecretKey();
const RECIPIENT_PUBKEY = getPublicKey(RECIPIENT_KEY);

function createMockExecuteFunctions(opts: {
  message: string;
  recipientPubkey: string;
  privateKey: string;
  relays: string;
  continueOnFail?: boolean;
}): IExecuteFunctions {
  const params: Record<string, string> = {
    message: opts.message,
    recipientPubkey: opts.recipientPubkey,
  };

  return {
    getInputData: () => [{ json: {} }] as INodeExecutionData[],
    getNodeParameter: (name: string) => params[name],
    getCredentials: async () => ({
      privateKey: opts.privateKey,
      relays: opts.relays,
    }),
    getNode: () => ({ name: "Nostr", typeVersion: 1, type: "nostr" }),
    continueOnFail: () => opts.continueOnFail ?? false,
    helpers: {
      returnJsonArray: (data: object) => [{ json: data }],
      constructExecutionMetaData: (
        inputData: INodeExecutionData[],
        _opts: object,
      ) => inputData,
    },
  } as unknown as IExecuteFunctions;
}

describe("Nostr node", () => {
  const RELAY_URL = "wss://mock.relay.nostr-node/1";
  let server: Server;
  let receivedEvents: NostrEvent[];

  beforeEach(() => {
    receivedEvents = [];
    server = new Server(RELAY_URL);

    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const data = JSON.parse(raw as string);
        if (data[0] === "EVENT") {
          const event = data[1] as NostrEvent;
          receivedEvents.push(event);
          socket.send(JSON.stringify(["OK", event.id, true]));
        }
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it("sends a gift-wrapped DM that the recipient can decrypt", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions({
      message: "Are you going to the party tonight?",
      recipientPubkey: RECIPIENT_PUBKEY,
      privateKey: SENDER_HEX,
      relays: RELAY_URL,
    });

    const [[result]] = await node.execute.call(ctx);

    // Node reports success with expected metadata
    expect(result.json).toMatchObject({
      success: true,
      senderPubkey: SENDER_PUBKEY,
      recipientPubkey: RECIPIENT_PUBKEY,
    });
    expect(result.json).toHaveProperty("eventId");

    // Relay received exactly one kind-1059 event
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].kind).toBe(1059);

    // Recipient can unwrap and read the plaintext
    const rumor = unwrapEvent(receivedEvents[0], RECIPIENT_KEY);
    expect(rumor.kind).toBe(14);
    expect(rumor.content).toBe("Are you going to the party tonight?");
    expect(rumor.pubkey).toBe(SENDER_PUBKEY);
  });

  it("accepts npub-encoded recipient keys", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions({
      message: "hello npub",
      recipientPubkey: npubEncode(RECIPIENT_PUBKEY),
      privateKey: SENDER_HEX,
      relays: RELAY_URL,
    });

    const [[result]] = await node.execute.call(ctx);
    expect(result.json).toMatchObject({ success: true });

    const rumor = unwrapEvent(receivedEvents[0], RECIPIENT_KEY);
    expect(rumor.content).toBe("hello npub");
  });

  it("third party cannot decrypt the wrapped event", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions({
      message: "secret stuff",
      recipientPubkey: RECIPIENT_PUBKEY,
      privateKey: SENDER_HEX,
      relays: RELAY_URL,
    });

    await node.execute.call(ctx);
    expect(receivedEvents).toHaveLength(1);

    const thirdPartyKey = generateSecretKey();
    expect(() => unwrapEvent(receivedEvents[0], thirdPartyKey)).toThrow();
  });
});
