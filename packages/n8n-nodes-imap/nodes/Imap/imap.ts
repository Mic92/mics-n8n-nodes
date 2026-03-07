import * as net from "net";
import * as tls from "tls";

export interface ImapConnectOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  rejectUnauthorized: boolean;
  timeoutMs?: number;
  /** Inject a pre-connected socket (for testing). */
  socket?: net.Socket | tls.TLSSocket;
}

export interface ImapAppendOptions extends ImapConnectOptions {
  folder: string;
  flags: string[];
  message: Buffer;
}

export interface ImapMoveOptions extends ImapConnectOptions {
  sourceFolder: string;
  uid: number;
  destinationFolder: string;
}

export interface ImapListOptions extends ImapConnectOptions {
  reference: string;
  pattern: string;
}

export interface ImapMailbox {
  name: string;
  delimiter: string;
  attributes: string[];
}

/** Default timeout for the whole IMAP session. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Connect, authenticate, APPEND a message to a folder, and log out.
 */
export async function imapAppend(options: ImapAppendOptions): Promise<void> {
  const conn = await imapConnect(options);

  try {
    const flagList =
      options.flags.length > 0 ? ` (${options.flags.join(" ")})` : "";
    const folderName = quoteString(options.folder);

    await conn.append(
      `APPEND ${folderName}${flagList} {${options.message.length}}`,
      options.message,
    );

    await conn.command("LOGOUT");
  } finally {
    conn.destroy();
  }
}

/**
 * Connect, authenticate, SELECT the source folder, UID MOVE a message
 * to the destination folder, and log out.
 *
 * Uses the MOVE extension (RFC 6851) when available, otherwise falls
 * back to UID COPY + UID STORE \Deleted + EXPUNGE.
 */
export async function imapMove(options: ImapMoveOptions): Promise<void> {
  const conn = await imapConnect(options);

  try {
    const capabilities = conn.getCapabilities();
    await conn.command(`SELECT ${quoteString(options.sourceFolder)}`);

    const dst = quoteString(options.destinationFolder);

    if (capabilities.has("MOVE")) {
      await conn.command(`UID MOVE ${options.uid} ${dst}`);
    } else {
      await conn.command(`UID COPY ${options.uid} ${dst}`);
      await conn.command(`UID STORE ${options.uid} +FLAGS (\\Deleted)`);
      await conn.command("EXPUNGE");
    }

    await conn.command("LOGOUT");
  } finally {
    conn.destroy();
  }
}

/**
 * Connect, authenticate, LIST mailboxes, and log out.
 */
export async function imapList(
  options: ImapListOptions,
): Promise<ImapMailbox[]> {
  const conn = await imapConnect(options);

  try {
    const ref = quoteString(options.reference);
    const pat = quoteString(options.pattern);
    const lines = await conn.command(`LIST ${ref} ${pat}`);

    const mailboxes: ImapMailbox[] = [];
    for (const line of lines) {
      const parsed = parseListLine(line);
      if (parsed) {
        mailboxes.push(parsed);
      }
    }

    await conn.command("LOGOUT");
    return mailboxes;
  } finally {
    conn.destroy();
  }
}

/**
 * Parse a single `* LIST` response line.
 * Format: `* LIST (\attr1 \attr2) "delimiter" "name"` or `* LIST (\attr) "/" name`
 *
 * Quoted strings may contain backslash-escaped characters (`\"`, `\\`)
 * per RFC 3501 §4.3.
 */
function parseListLine(line: string): ImapMailbox | null {
  // Match: * LIST (<attrs>) <delimiter> <name>
  // where delimiter and name can be quoted strings or atoms.
  const match = line.match(/^\* LIST \(([^)]*)\) /);
  if (!match) return null;

  let rest = line.slice(match[0].length);

  const attributes = match[1].split(/\s+/).filter((a) => a.length > 0);

  // Parse delimiter
  let delimiter: string;
  if (rest.startsWith("NIL")) {
    delimiter = "";
    rest = rest.slice(3);
  } else {
    const delim = parseQuotedString(rest);
    if (!delim) return null;
    delimiter = delim.value;
    rest = delim.rest;
  }

  // Skip space between delimiter and name
  rest = rest.replace(/^ /, "");

  // Parse name (quoted or atom)
  let name: string;
  if (rest.startsWith('"')) {
    const parsed = parseQuotedString(rest);
    if (!parsed) return null;
    name = parsed.value;
  } else {
    name = rest;
  }

  return { name, delimiter, attributes };
}

/**
 * Parse an IMAP quoted string at the start of `input`, handling
 * backslash escapes (`\"`, `\\`).  Returns the unescaped value and
 * the remaining input after the closing quote, or null on failure.
 */
function parseQuotedString(
  input: string,
): { value: string; rest: string } | null {
  if (!input.startsWith('"')) return null;

  let i = 1;
  let value = "";
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\") {
      i++;
      if (i >= input.length) return null;
      value += input[i];
    } else if (ch === '"') {
      return { value, rest: input.slice(i + 1) };
    } else {
      value += ch;
    }
    i++;
  }
  return null; // unterminated quote
}

/**
 * Establish an IMAP connection: open socket, read greeting, optionally
 * STARTTLS, then LOGIN.  Returns an authenticated ImapConnection ready
 * for commands.
 */
async function imapConnect(
  options: ImapConnectOptions,
): Promise<ImapConnection> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let socket: net.Socket | tls.TLSSocket;

  if (options.socket) {
    socket = options.socket;
  } else if (options.tls) {
    socket = tls.connect({
      host: options.host,
      port: options.port,
      rejectUnauthorized: options.rejectUnauthorized,
    });
  } else {
    socket = net.connect({ host: options.host, port: options.port });
  }

  const conn = new ImapConnection(socket, timeout);

  const greeting = await conn.readGreeting();

  // Parse capabilities from greeting if present
  // e.g. "* OK [CAPABILITY IMAP4rev1 MOVE LITERAL+] ready"
  const capMatch = greeting.match(/\[CAPABILITY ([^\]]+)\]/);
  if (capMatch) {
    for (const cap of capMatch[1].split(/\s+/)) {
      conn.addCapability(cap);
    }
  }

  if (!options.tls && !options.socket) {
    const caps = conn.getCapabilities();
    if (caps.size > 0 && !caps.has("STARTTLS")) {
      throw new Error(
        "Server does not advertise STARTTLS capability; " +
          "use implicit TLS (port 993) instead",
      );
    }
    await conn.command("STARTTLS");
    const tlsSocket = await upgradeToTls(socket as net.Socket, {
      host: options.host,
      rejectUnauthorized: options.rejectUnauthorized,
    });
    conn.replaceSocket(tlsSocket);
  }

  const loginLines = await conn.command(
    `LOGIN ${quoteString(options.user)} ${quoteString(options.password)}`,
  );

  // Some servers send capabilities in the LOGIN OK response or as
  // untagged CAPABILITY responses after LOGIN.
  for (const line of loginLines) {
    if (line.startsWith("* CAPABILITY ")) {
      conn.clearCapabilities();
      for (const cap of line.slice("* CAPABILITY ".length).split(/\s+/)) {
        conn.addCapability(cap);
      }
    }
  }

  return conn;
}

/**
 * Quote an IMAP string value.  Surrounds with double-quotes and
 * escapes backslashes and double-quotes inside.
 */
function quoteString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Upgrade a plain TCP socket to TLS (STARTTLS).
 */
function upgradeToTls(
  socket: net.Socket,
  opts: { host: string; rejectUnauthorized: boolean },
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect(
      {
        socket,
        host: opts.host,
        rejectUnauthorized: opts.rejectUnauthorized,
      },
      () => {
        if (opts.rejectUnauthorized && !tlsSocket.authorized) {
          reject(
            new Error(
              `TLS authorization failed: ${tlsSocket.authorizationError}`,
            ),
          );
          tlsSocket.destroy();
          return;
        }
        resolve(tlsSocket);
      },
    );
    tlsSocket.on("error", reject);
  });
}

/**
 * Thin wrapper around a socket that speaks tagged IMAP commands.
 */
class ImapConnection {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private tag = 0;
  private timeoutMs: number;
  private capabilities = new Set<string>();

  constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
  }

  addCapability(cap: string): void {
    this.capabilities.add(cap.toUpperCase());
  }

  clearCapabilities(): void {
    this.capabilities.clear();
  }

  getCapabilities(): ReadonlySet<string> {
    return this.capabilities;
  }

  /** Replace the underlying socket (after STARTTLS upgrade). */
  replaceSocket(socket: tls.TLSSocket): void {
    this.buffer = "";
    this.socket = socket;
  }

  /** Destroy the underlying socket. */
  destroy(): void {
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
  }

  /** Wait for the server greeting (* OK …). */
  async readGreeting(): Promise<string> {
    const line = await this.readLine();
    if (!line.startsWith("* OK") && !line.startsWith("* PREAUTH")) {
      throw new Error(`Unexpected IMAP greeting: ${line}`);
    }
    return line;
  }

  /**
   * Send a tagged command and wait for the tagged response.
   * Throws if the server returns NO or BAD.
   *
   * Capabilities embedded in the tagged OK response
   * (e.g. `A001 OK [CAPABILITY IMAP4rev1 MOVE] done`) are parsed
   * automatically.
   */
  async command(cmd: string): Promise<string[]> {
    const t = this.nextTag();
    this.writeLine(`${t} ${cmd}`);

    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(`${t} `)) {
        const rest = line.slice(t.length + 1);
        if (rest.startsWith("OK")) {
          const capMatch = rest.match(/\[CAPABILITY ([^\]]+)\]/);
          if (capMatch) {
            this.clearCapabilities();
            for (const cap of capMatch[1].split(/\s+/)) {
              this.addCapability(cap);
            }
          }
          return lines;
        }
        throw new Error(`IMAP command failed: ${line}`);
      }
      // Untagged response — collect
      lines.push(line);
    }
  }

  /**
   * Send an APPEND command that requires a continuation (`+`).
   * After the server sends `+`, we send the literal message data
   * followed by CRLF, then wait for the tagged OK.
   */
  async append(cmd: string, data: Buffer): Promise<string[]> {
    const t = this.nextTag();
    this.writeLine(`${t} ${cmd}`);

    // Wait for continuation
    const cont = await this.readLine();
    if (!cont.startsWith("+")) {
      throw new Error(`Expected continuation '+', got: ${cont}`);
    }

    // Send literal data followed by CRLF
    await this.writeRaw(Buffer.concat([data, Buffer.from("\r\n")]));

    // Wait for tagged response
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      if (line.startsWith(`${t} `)) {
        const rest = line.slice(t.length + 1);
        if (rest.startsWith("OK")) {
          return lines;
        }
        throw new Error(`IMAP APPEND failed: ${line}`);
      }
      lines.push(line);
    }
  }

  private nextTag(): string {
    this.tag++;
    return `A${String(this.tag).padStart(4, "0")}`;
  }

  private writeLine(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  private writeRaw(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Read one CRLF-terminated line from the socket.
   * Buffers partial reads and applies a timeout.
   */
  private readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check buffer first
      const idx = this.buffer.indexOf("\r\n");
      if (idx !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        resolve(line);
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("IMAP timeout"));
      }, this.timeoutMs);

      const onData = (chunk: Buffer): void => {
        this.buffer += chunk.toString("utf-8");
        const i = this.buffer.indexOf("\r\n");
        if (i !== -1) {
          const line = this.buffer.slice(0, i);
          this.buffer = this.buffer.slice(i + 2);
          cleanup();
          resolve(line);
        }
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      const onClose = (): void => {
        cleanup();
        reject(new Error("IMAP connection closed unexpectedly"));
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        this.socket.removeListener("data", onData);
        this.socket.removeListener("error", onError);
        this.socket.removeListener("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.on("error", onError);
      this.socket.on("close", onClose);
    });
  }
}
