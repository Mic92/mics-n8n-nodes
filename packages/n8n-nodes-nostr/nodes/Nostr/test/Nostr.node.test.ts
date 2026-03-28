import { Server, WebSocket as MockWebSocket } from "mock-socket";

import { unwrapEvent } from "nostr-tools/nip59";
import { useWebSocketImplementation } from "nostr-tools/pool";
import { verifyEvent } from "nostr-tools/pure";
import { getPublicKey, generateSecretKey } from "nostr-tools/pure";
import { npubEncode } from "nostr-tools/nip19";

import type { NostrEvent } from "nostr-tools";

import { createMockExecuteFunctions } from "../../../../../test/helpers";
import { Nostr, retryConfig, withUserAgent, USER_AGENT } from "../Nostr.node";

// Record options passed to the WebSocket constructor so tests can verify
// that withUserAgent() actually injects the header. mock-socket ignores
// the third argument, so we have to capture it ourselves.
const wsOptionsSeen: Array<{ headers?: Record<string, string> }> = [];

class RecordingMockWebSocket extends MockWebSocket {
  constructor(url: string, protocols?: string | string[], opts?: object) {
    wsOptionsSeen.push((opts as { headers?: Record<string, string> }) ?? {});
    super(url, protocols);
  }
}

// Route SimplePool through mock-socket wrapped in the same User-Agent
// shim production uses, so we never hit the network *and* we exercise
// the wrapper.
useWebSocketImplementation(withUserAgent(RecordingMockWebSocket));

const SENDER_KEY = generateSecretKey();
const SENDER_PUBKEY = getPublicKey(SENDER_KEY);
const SENDER_HEX = Buffer.from(SENDER_KEY).toString("hex");

const RECIPIENT_KEY = generateSecretKey();
const RECIPIENT_PUBKEY = getPublicKey(RECIPIENT_KEY);

/** Shared mock relay setup */
function setupMockRelay(
  relayUrl: string,
  receivedEvents: NostrEvent[],
): Server {
  const server = new Server(relayUrl);

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

  return server;
}

describe("Nostr node – Message resource", () => {
  const RELAY_URL = "wss://mock.relay.nostr-node/1";
  let server: Server;
  let receivedEvents: NostrEvent[];

  beforeEach(() => {
    receivedEvents = [];
    wsOptionsSeen.length = 0;
    server = setupMockRelay(RELAY_URL, receivedEvents);
  });

  afterEach(() => {
    server.close();
  });

  it("sets the User-Agent header on relay connections", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "message",
        message: "ua test",
        recipientPubkey: RECIPIENT_PUBKEY,
      },
      { nostrApi: { privateKey: SENDER_HEX, relays: RELAY_URL } },
    );

    await node.execute.call(ctx);

    expect(wsOptionsSeen.length).toBeGreaterThan(0);
    for (const opts of wsOptionsSeen) {
      expect(opts.headers?.["User-Agent"]).toBe(USER_AGENT);
    }
  });

  it("sends a gift-wrapped DM that the recipient can decrypt", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "message",
        message: "Are you going to the party tonight?",
        recipientPubkey: RECIPIENT_PUBKEY,
      },
      {
        nostrApi: {
          privateKey: SENDER_HEX,
          relays: RELAY_URL,
        },
      },
    );

    const [[result]] = await node.execute.call(ctx);

    // Node reports success with expected metadata
    expect(result.json).toMatchObject({
      success: true,
      senderPubkey: SENDER_PUBKEY,
      recipientPubkey: RECIPIENT_PUBKEY,
    });
    expect(result.json).toHaveProperty("eventId");

    // Relay received two kind-1059 events: recipient's copy + self-copy
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents.every((e) => e.kind === 1059)).toBe(true);

    // First published = recipient's copy (toThem)
    const toThem = receivedEvents[0];
    const rumor = unwrapEvent(toThem, RECIPIENT_KEY);
    expect(rumor.kind).toBe(14);
    expect(rumor.content).toBe("Are you going to the party tonight?");
    expect(rumor.pubkey).toBe(SENDER_PUBKEY);

    // Second = self-copy (toUs), unwrappable by sender
    const toUs = receivedEvents[1];
    const selfRumor = unwrapEvent(toUs, SENDER_KEY);
    expect(selfRumor.content).toBe("Are you going to the party tonight?");
  });

  it("normalizes uppercase hex recipient keys to lowercase", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "message",
        message: "UPPER",
        recipientPubkey: RECIPIENT_PUBKEY.toUpperCase(),
      },
      { nostrApi: { privateKey: SENDER_HEX, relays: RELAY_URL } },
    );

    const [[result]] = await node.execute.call(ctx);
    expect(result.json).toMatchObject({
      success: true,
      recipientPubkey: RECIPIENT_PUBKEY, // lowercase
    });

    // p-tag in the wrap is lowercase so the recipient's filter matches
    const pTag = receivedEvents[0].tags.find((t) => t[0] === "p");
    expect(pTag?.[1]).toBe(RECIPIENT_PUBKEY);
  });

  it("accepts npub-encoded recipient keys", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "message",
        message: "hello npub",
        recipientPubkey: npubEncode(RECIPIENT_PUBKEY),
      },
      {
        nostrApi: {
          privateKey: SENDER_HEX,
          relays: RELAY_URL,
        },
      },
    );

    const [[result]] = await node.execute.call(ctx);
    expect(result.json).toMatchObject({ success: true });

    expect(receivedEvents).toHaveLength(2);
    const rumor = unwrapEvent(receivedEvents[0], RECIPIENT_KEY);
    expect(rumor.content).toBe("hello npub");
  });

  it("retries when relay is initially down, then comes up", async () => {
    const saved = { ...retryConfig };
    retryConfig.baseDelayMs = 10;

    try {
      // Start with the relay closed
      server.close();

      const node = new Nostr();
      const ctx = createMockExecuteFunctions(
        {
          resource: "message",
          message: "retry me",
          recipientPubkey: RECIPIENT_PUBKEY,
        },
        {
          nostrApi: {
            privateKey: SENDER_HEX,
            relays: RELAY_URL,
          },
        },
      );

      // Bring the relay back up after a short delay
      setTimeout(() => {
        server = setupMockRelay(RELAY_URL, receivedEvents);
      }, 5);

      const [[result]] = await node.execute.call(ctx);

      expect(result.json).toMatchObject({ success: true });
      expect(receivedEvents).toHaveLength(2);

      const rumor = unwrapEvent(receivedEvents[0], RECIPIENT_KEY);
      expect(rumor.content).toBe("retry me");
    } finally {
      Object.assign(retryConfig, saved);
    }
  });

  it("trips breaker so later items skip dead relay", async () => {
    const saved = { ...retryConfig };
    retryConfig.maxRetries = 1;
    retryConfig.baseDelayMs = 1;
    retryConfig.publishTimeoutMs = 50;

    try {
      server.close(); // relay dead for the whole test

      const node = new Nostr();
      const ctx = createMockExecuteFunctions(
        {
          resource: "message",
          message: "msg",
          recipientPubkey: RECIPIENT_PUBKEY,
        },
        { nostrApi: { privateKey: SENDER_HEX, relays: RELAY_URL } },
        {
          continueOnFail: true,
          inputItems: [{ json: {} }, { json: {} }, { json: {} }],
        },
      );

      const start = Date.now();
      const [results] = await node.execute.call(ctx);
      const elapsed = Date.now() - start;

      expect(results).toHaveLength(3);
      // First item exhausts the retry budget
      expect(results[0].json.error).toMatch(/Failed to publish/);
      // Remaining items short-circuit via the breaker
      expect(results[1].json.error).toMatch(/All relays marked dead/);
      expect(results[2].json.error).toMatch(/All relays marked dead/);

      // 3 items should not take 3× the retry budget. First item:
      // 2 attempts × 50ms timeout + 1ms backoff ≈ 100ms. Items 2+3
      // must be near-instant. Allow generous slack for CI jitter.
      expect(elapsed).toBeLessThan(500);
    } finally {
      Object.assign(retryConfig, saved);
    }
  });
});

describe("Nostr node – Profile resource", () => {
  const RELAY_URL = "wss://mock.relay.nostr-node/2";
  let server: Server;
  let receivedEvents: NostrEvent[];

  beforeEach(() => {
    receivedEvents = [];
    server = setupMockRelay(RELAY_URL, receivedEvents);
  });

  afterEach(() => {
    server.close();
  });

  it("publishes a kind 0 profile with all fields", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "profile",
        profileName: "testbot",
        profileDisplayName: "Test Bot",
        profileAbout: "A test bot for n8n",
        profilePicture: "https://example.com/avatar.png",
      },
      {
        nostrApi: {
          privateKey: SENDER_HEX,
          relays: RELAY_URL,
        },
      },
    );

    const [[result]] = await node.execute.call(ctx);

    expect(result.json).toMatchObject({
      success: true,
      pubkey: SENDER_PUBKEY,
      profile: {
        name: "testbot",
        displayName: "Test Bot",
        about: "A test bot for n8n",
        picture: "https://example.com/avatar.png",
      },
    });
    expect(result.json).toHaveProperty("eventId");

    // Relay received exactly one kind 0 event
    expect(receivedEvents).toHaveLength(1);
    const event = receivedEvents[0];
    expect(event.kind).toBe(0);
    expect(event.pubkey).toBe(SENDER_PUBKEY);
    expect(verifyEvent(event)).toBe(true);

    const meta = JSON.parse(event.content);
    expect(meta).toEqual({
      name: "testbot",
      display_name: "Test Bot",
      about: "A test bot for n8n",
      picture: "https://example.com/avatar.png",
    });
  });

  it("omits empty fields from the metadata JSON", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "profile",
        profileName: "minimalbot",
        profileDisplayName: "",
        profileAbout: "",
        profilePicture: "",
      },
      {
        nostrApi: {
          privateKey: SENDER_HEX,
          relays: RELAY_URL,
        },
      },
    );

    const [[result]] = await node.execute.call(ctx);
    expect(result.json).toMatchObject({ success: true });

    const meta = JSON.parse(receivedEvents[0].content);
    expect(meta).toEqual({ name: "minimalbot" });
    expect(meta).not.toHaveProperty("display_name");
    expect(meta).not.toHaveProperty("about");
    expect(meta).not.toHaveProperty("picture");
  });

  it("rejects when all profile fields are empty", async () => {
    const node = new Nostr();
    const ctx = createMockExecuteFunctions(
      {
        resource: "profile",
        profileName: "",
        profileDisplayName: "",
        profileAbout: "",
        profilePicture: "",
      },
      {
        nostrApi: {
          privateKey: SENDER_HEX,
          relays: RELAY_URL,
        },
      },
    );

    await expect(node.execute.call(ctx)).rejects.toThrow(
      "At least one profile field must be set",
    );
  });
});
