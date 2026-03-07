# Nostr

Interact with the [Nostr](https://nostr.com/) protocol: send encrypted DMs or
publish profile metadata.

**Credential: Nostr**

| Field       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| Private Key | Your nsec1… bech32 or 64-char hex private key                                     |
| Relays      | Comma-separated relay WebSocket URLs (e.g. `wss://relay.damus.io, wss://nos.lol`) |

## Resource: Message

Send encrypted direct messages using
[NIP-59 Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md).
Messages are wrapped in three layers of encryption (kind 14 rumor → kind 13
seal → kind 1059 gift wrap), hiding both content and metadata from relays and
third parties. Only the intended recipient can decrypt the message.

| Parameter            | Description                                          |
| -------------------- | ---------------------------------------------------- |
| Recipient Public Key | npub1… bech32 or 64-char hex public key of recipient |
| Message              | The plaintext message to send                        |

## Resource: Profile

Publish [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)
kind 0 profile metadata. At least one field must be set.

| Parameter    | Description                                  |
| ------------ | -------------------------------------------- |
| Name         | Username / handle (`name` field)             |
| Display Name | Human-readable display name (`display_name`) |
| About        | Bio / description (`about`)                  |
| Picture URL  | URL of the profile picture (`picture`)       |

Publishing is retried with exponential back-off (up to ~5 minutes) if all
relays are temporarily unreachable.
