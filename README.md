# Mic's n8n Community Nodes

Custom [n8n](https://n8n.io/) community nodes.

## Nodes

### Nostr

Send encrypted direct messages via the [Nostr](https://nostr.com/) protocol
using [NIP-59 Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md).

Messages are wrapped in three layers of encryption (kind 14 rumor → kind 13
seal → kind 1059 gift wrap), hiding both content and metadata from relays and
third parties. Only the intended recipient can decrypt the message.

**Credential: Nostr**

| Field       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| Private Key | Your nsec1… bech32 or 64-char hex private key                                     |
| Relays      | Comma-separated relay WebSocket URLs (e.g. `wss://relay.damus.io, wss://nos.lol`) |

**Node parameters:**

| Parameter            | Description                                          |
| -------------------- | ---------------------------------------------------- |
| Recipient Public Key | npub1… bech32 or 64-char hex public key of recipient |
| Message              | The plaintext message to send                        |

Publishing is retried with exponential back-off (up to ~5 minutes) if all
relays are temporarily unreachable.

### OpenCrow

Send trigger messages to [OpenCrow](https://github.com/pinpox/opencrow) via its
named pipe (FIFO).

Multi-line messages are collapsed to a single line since each line in the pipe
is a separate trigger.

**Node parameters:**

| Parameter | Description                                                           |
| --------- | --------------------------------------------------------------------- |
| Message   | The trigger message to send                                           |
| Pipe Path | Path to the FIFO (default: `/var/lib/opencrow/sessions/trigger.pipe`) |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, building, and how to
add new nodes.

## License

MIT
