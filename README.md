# Mic's n8n Community Nodes

Custom [n8n](https://n8n.io/) community nodes.

## Nodes

### Nostr

Interact with the [Nostr](https://nostr.com/) protocol: send encrypted DMs or
publish profile metadata.

**Credential: Nostr**

| Field       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| Private Key | Your nsec1… bech32 or 64-char hex private key                                     |
| Relays      | Comma-separated relay WebSocket URLs (e.g. `wss://relay.damus.io, wss://nos.lol`) |

#### Resource: Message

Send encrypted direct messages using
[NIP-59 Gift Wrap](https://github.com/nostr-protocol/nips/blob/master/59.md).
Messages are wrapped in three layers of encryption (kind 14 rumor → kind 13
seal → kind 1059 gift wrap), hiding both content and metadata from relays and
third parties. Only the intended recipient can decrypt the message.

| Parameter            | Description                                          |
| -------------------- | ---------------------------------------------------- |
| Recipient Public Key | npub1… bech32 or 64-char hex public key of recipient |
| Message              | The plaintext message to send                        |

#### Resource: Profile

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

### IMAP

Interact with an IMAP mailbox. Zero external dependencies — uses only Node.js
built-in `tls` and `net` modules for the IMAP protocol.

**Credential: IMAP**

| Field               | Description                                              |
| ------------------- | -------------------------------------------------------- |
| Host                | IMAP server hostname                                     |
| Port                | IMAP port (993 for implicit TLS, 143 for STARTTLS)       |
| User                | Login username                                           |
| Password            | Login password                                           |
| TLS                 | Use implicit TLS (port 993) or plain+STARTTLS (port 143) |
| Reject Unauthorized | Verify the server TLS certificate                        |

#### Operation: Append

Store a raw RFC 2822 email message in a mailbox folder via the IMAP `APPEND`
command. The message can come from a JSON field or binary data.

| Parameter       | Description                                               |
| --------------- | --------------------------------------------------------- |
| Folder          | Target mailbox folder (e.g. `INBOX`, `Archive`)           |
| Message Source  | `JSON Field` or `Binary Data`                             |
| Message Field   | JSON field name containing the raw email (source = field) |
| Binary Property | Binary property name (source = binary)                    |
| Flags           | Space-separated IMAP flags (e.g. `\Seen \Flagged`)        |

#### Operation: Move

Move a message to another folder by UID. Uses the MOVE extension (RFC 6851)
when available, otherwise falls back to COPY + DELETE + EXPUNGE.

| Parameter          | Description                        |
| ------------------ | ---------------------------------- |
| Source Folder      | Folder the message is currently in |
| UID                | UID of the message to move         |
| Destination Folder | Folder to move the message to      |

#### Operation: List

List mailbox folders matching a pattern.

| Parameter | Description                                           |
| --------- | ----------------------------------------------------- |
| Reference | IMAP LIST reference name (usually empty for the root) |
| Pattern   | Mailbox name pattern (`*` = all, `%` = top-level)     |

Returns one item per mailbox with `name`, `delimiter`, and `attributes`.

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
