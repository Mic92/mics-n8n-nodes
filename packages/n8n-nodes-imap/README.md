# IMAP

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

## Operation: Append

Store a raw RFC 2822 email message in a mailbox folder via the IMAP `APPEND`
command. The message can come from a JSON field or binary data.

| Parameter       | Description                                               |
| --------------- | --------------------------------------------------------- |
| Folder          | Target mailbox folder (e.g. `INBOX`, `Archive`)           |
| Message Source  | `JSON Field` or `Binary Data`                             |
| Message Field   | JSON field name containing the raw email (source = field) |
| Binary Property | Binary property name (source = binary)                    |
| Flags           | Space-separated IMAP flags (e.g. `\Seen \Flagged`)        |

## Operation: Move

Move a message to another folder by UID. Uses the MOVE extension (RFC 6851)
when available, otherwise falls back to COPY + DELETE + EXPUNGE.

| Parameter          | Description                        |
| ------------------ | ---------------------------------- |
| Source Folder      | Folder the message is currently in |
| UID                | UID of the message to move         |
| Destination Folder | Folder to move the message to      |

## Operation: List

List mailbox folders matching a pattern.

| Parameter | Description                                           |
| --------- | ----------------------------------------------------- |
| Reference | IMAP LIST reference name (usually empty for the root) |
| Pattern   | Mailbox name pattern (`*` = all, `%` = top-level)     |

Returns one item per mailbox with `name`, `delimiter`, and `attributes`.
