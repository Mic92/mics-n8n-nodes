/* Type declarations for nostr-tools subpath imports (CJS compat) */

declare module "nostr-tools/pure" {
  export function generateSecretKey(): Uint8Array;
  export function getPublicKey(secretKey: Uint8Array): string;
  export function getEventHash(
    event: import("nostr-tools").UnsignedEvent,
  ): string;
  export function finalizeEvent(
    t: import("nostr-tools").EventTemplate,
    secretKey: Uint8Array,
  ): import("nostr-tools").VerifiedEvent;
  export function verifyEvent(
    event: import("nostr-tools").Event,
  ): event is import("nostr-tools").VerifiedEvent;
  export * from "nostr-tools";
}

declare module "nostr-tools/nip19" {
  type NSec = `nsec1${string}`;
  type NPub = `npub1${string}`;

  interface DecodedNsec {
    type: "nsec";
    data: Uint8Array;
  }
  interface DecodedNpub {
    type: "npub";
    data: string;
  }
  interface DecodedResult {
    type: string;
    data: unknown;
  }

  export function decode(nip19: NSec): DecodedNsec;
  export function decode(nip19: NPub): DecodedNpub;
  export function decode(code: string): DecodedResult;
  export function nsecEncode(key: Uint8Array): NSec;
  export function npubEncode(hex: string): NPub;
}

declare module "nostr-tools/nip59" {
  import type { UnsignedEvent, NostrEvent } from "nostr-tools";

  type Rumor = UnsignedEvent & { id: string };

  export function createRumor(
    event: Partial<UnsignedEvent>,
    privateKey: Uint8Array,
  ): Rumor;
  export function createSeal(
    rumor: Rumor,
    privateKey: Uint8Array,
    recipientPublicKey: string,
  ): NostrEvent;
  export function createWrap(
    seal: NostrEvent,
    recipientPublicKey: string,
  ): NostrEvent;
  export function wrapEvent(
    event: Partial<UnsignedEvent>,
    senderPrivateKey: Uint8Array,
    recipientPublicKey: string,
  ): NostrEvent;
  export function wrapManyEvents(
    event: Partial<UnsignedEvent>,
    senderPrivateKey: Uint8Array,
    recipientsPublicKeys: string[],
  ): NostrEvent[];
  export function unwrapEvent(
    wrap: NostrEvent,
    recipientPrivateKey: Uint8Array,
  ): Rumor;
  export function unwrapManyEvents(
    wrappedEvents: NostrEvent[],
    recipientPrivateKey: Uint8Array,
  ): Rumor[];
}

declare module "nostr-tools/pool" {
  import type { Event } from "nostr-tools";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useWebSocketImplementation(impl: any): void;

  export class SimplePool {
    publish(relays: string[], event: Event): Promise<string>[];
    close(relays: string[]): void;
  }
}
