import * as net from "net";

import { imapAppend, imapMove, imapList } from "../imap";

/**
 * Fake IMAP server (plain TCP).  Literal data is consumed by byte
 * count, matching the real IMAP protocol.
 */
function createMockImapServer(
  greeting: string,
  handler: (
    line: string,
    write: (data: string) => void,
    literal: string | undefined,
  ) => void,
): net.Server {
  const server = net.createServer((socket) => {
    socket.write(greeting);

    let buffer = Buffer.alloc(0);
    let expectLiteralBytes = 0;

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      for (;;) {
        if (expectLiteralBytes > 0) {
          const needed = expectLiteralBytes + 2;
          if (buffer.length < needed) return;

          const literal = buffer
            .subarray(0, expectLiteralBytes)
            .toString("utf-8");
          buffer = buffer.subarray(needed);
          expectLiteralBytes = 0;
          handler("__LITERAL__", (d) => socket.write(d), literal);
          continue;
        }

        const idx = buffer.indexOf("\r\n");
        if (idx === -1) return;

        const line = buffer.subarray(0, idx).toString("utf-8");
        buffer = buffer.subarray(idx + 2);

        const litMatch = line.match(/\{(\d+)\}$/);
        if (litMatch) {
          expectLiteralBytes = parseInt(litMatch[1], 10);
        }

        handler(line, (d) => socket.write(d), undefined);
      }
    });
  });

  server.listen(0, "127.0.0.1");
  return server;
}

function serverPort(server: net.Server): number {
  return (server.address() as net.AddressInfo).port;
}

function connectTo(server: net.Server): Promise<net.Socket> {
  return new Promise((resolve) => {
    const sock = net.connect(
      { host: "127.0.0.1", port: serverPort(server) },
      () => resolve(sock),
    );
  });
}

const TIMEOUT = 5000;

describe("imapAppend", () => {
  let server: net.Server;
  let clientSocket: net.Socket | undefined;

  afterEach(async () => {
    if (clientSocket && !clientSocket.destroyed) clientSocket.destroy();
    clientSocket = undefined;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it("performs LOGIN, APPEND, LOGOUT over the wire", async () => {
    let receivedLiteral = "";
    let appendFolder = "";
    let appendFlags = "";

    server = createMockImapServer(
      "* OK Mock IMAP ready\r\n",
      (line, write, literal) => {
        if (line === "__LITERAL__") {
          receivedLiteral = literal!;
          write("A0002 OK APPEND completed\r\n");
          return;
        }

        const tag = line.split(" ")[0];

        if (line.includes("LOGIN")) {
          write(`${tag} OK LOGIN completed\r\n`);
        } else if (line.includes("APPEND")) {
          const match = line.match(
            /APPEND "([^"]*)"(?: \(([^)]*)\))? \{(\d+)\}/,
          );
          if (match) {
            appendFolder = match[1];
            appendFlags = match[2] || "";
            write("+ go ahead\r\n");
          }
        } else if (line.includes("LOGOUT")) {
          write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
        }
      },
    );

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    const rawEmail =
      "From: a@b.com\r\nTo: c@d.com\r\nSubject: Test\r\n\r\nHello!";

    await imapAppend({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      folder: "INBOX.Archive",
      flags: ["\\Seen", "\\Flagged"],
      message: Buffer.from(rawEmail),
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(appendFolder).toBe("INBOX.Archive");
    expect(appendFlags).toBe("\\Seen \\Flagged");
    expect(receivedLiteral).toBe(rawEmail);
  });

  it("throws on authentication failure", async () => {
    server = createMockImapServer("* OK Mock IMAP ready\r\n", (line, write) => {
      const tag = line.split(" ")[0];
      if (line.includes("LOGIN")) {
        write(`${tag} NO bad credentials\r\n`);
      }
    });

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    await expect(
      imapAppend({
        host: "127.0.0.1",
        port: serverPort(server),
        user: "bad",
        password: "bad",
        tls: false,
        rejectUnauthorized: false,
        folder: "INBOX",
        flags: [],
        message: Buffer.from("Subject: x\r\n\r\n"),
        timeoutMs: TIMEOUT,
        socket: clientSocket,
      }),
    ).rejects.toThrow("IMAP command failed");
  });
});

describe("imapMove", () => {
  let server: net.Server;
  let clientSocket: net.Socket | undefined;

  afterEach(async () => {
    if (clientSocket && !clientSocket.destroyed) clientSocket.destroy();
    clientSocket = undefined;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it("uses UID MOVE when the server advertises MOVE capability", async () => {
    const commands: string[] = [];

    server = createMockImapServer(
      "* OK [CAPABILITY IMAP4rev1 MOVE] ready\r\n",
      (line, write) => {
        const tag = line.split(" ")[0];
        commands.push(line);

        if (line.includes("LOGIN")) {
          write(`${tag} OK LOGIN completed\r\n`);
        } else if (line.includes("SELECT")) {
          write(`* 5 EXISTS\r\n${tag} OK SELECT completed\r\n`);
        } else if (line.includes("UID MOVE")) {
          write(`${tag} OK MOVE completed\r\n`);
        } else if (line.includes("LOGOUT")) {
          write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
        }
      },
    );

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    await imapMove({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      sourceFolder: "INBOX",
      uid: 42,
      destinationFolder: "Archive",
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(commands.some((c) => c.includes('SELECT "INBOX"'))).toBe(true);
    expect(commands.some((c) => c.includes('UID MOVE 42 "Archive"'))).toBe(
      true,
    );
    expect(commands.some((c) => c.includes("UID COPY"))).toBe(false);
  });

  it("falls back to COPY+DELETE+EXPUNGE without MOVE capability", async () => {
    const commands: string[] = [];

    server = createMockImapServer(
      "* OK [CAPABILITY IMAP4rev1] ready\r\n",
      (line, write) => {
        const tag = line.split(" ")[0];
        commands.push(line);

        if (line.includes("LOGIN")) {
          write(`${tag} OK LOGIN completed\r\n`);
        } else if (line.includes("SELECT")) {
          write(`* 5 EXISTS\r\n${tag} OK SELECT completed\r\n`);
        } else if (line.includes("UID COPY")) {
          write(`${tag} OK COPY completed\r\n`);
        } else if (line.includes("UID STORE")) {
          write(`${tag} OK STORE completed\r\n`);
        } else if (line.includes("EXPUNGE")) {
          write(`${tag} OK EXPUNGE completed\r\n`);
        } else if (line.includes("LOGOUT")) {
          write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
        }
      },
    );

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    await imapMove({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      sourceFolder: "INBOX",
      uid: 7,
      destinationFolder: "Trash",
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(commands.some((c) => c.includes('UID COPY 7 "Trash"'))).toBe(true);
    expect(
      commands.some((c) => c.includes("UID STORE 7 +FLAGS (\\Deleted)")),
    ).toBe(true);
    expect(commands.some((c) => c.includes("EXPUNGE"))).toBe(true);
    expect(commands.some((c) => c.includes("UID MOVE"))).toBe(false);
  });

  it("detects MOVE capability from tagged LOGIN OK response", async () => {
    const commands: string[] = [];

    server = createMockImapServer("* OK ready\r\n", (line, write) => {
      const tag = line.split(" ")[0];
      commands.push(line);

      if (line.includes("LOGIN")) {
        write(`${tag} OK [CAPABILITY IMAP4rev1 MOVE] LOGIN completed\r\n`);
      } else if (line.includes("SELECT")) {
        write(`* 5 EXISTS\r\n${tag} OK SELECT completed\r\n`);
      } else if (line.includes("UID MOVE")) {
        write(`${tag} OK MOVE completed\r\n`);
      } else if (line.includes("LOGOUT")) {
        write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
      }
    });

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    await imapMove({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      sourceFolder: "INBOX",
      uid: 99,
      destinationFolder: "Done",
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(commands.some((c) => c.includes("UID MOVE 99"))).toBe(true);
    expect(commands.some((c) => c.includes("UID COPY"))).toBe(false);
  });
});

describe("imapList", () => {
  let server: net.Server;
  let clientSocket: net.Socket | undefined;

  afterEach(async () => {
    if (clientSocket && !clientSocket.destroyed) clientSocket.destroy();
    clientSocket = undefined;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it("parses LIST responses into mailbox objects", async () => {
    server = createMockImapServer("* OK Mock IMAP ready\r\n", (line, write) => {
      const tag = line.split(" ")[0];

      if (line.includes("LOGIN")) {
        write(`${tag} OK LOGIN completed\r\n`);
      } else if (line.includes("LIST")) {
        write(
          '* LIST (\\HasNoChildren) "." "INBOX"\r\n' +
            '* LIST (\\HasChildren \\Noselect) "." "Folders"\r\n' +
            '* LIST (\\HasNoChildren) "." "Folders.Archive"\r\n' +
            `${tag} OK LIST completed\r\n`,
        );
      } else if (line.includes("LOGOUT")) {
        write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
      }
    });

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    const mailboxes = await imapList({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      reference: "",
      pattern: "*",
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(mailboxes).toEqual([
      { name: "INBOX", delimiter: ".", attributes: ["\\HasNoChildren"] },
      {
        name: "Folders",
        delimiter: ".",
        attributes: ["\\HasChildren", "\\Noselect"],
      },
      {
        name: "Folders.Archive",
        delimiter: ".",
        attributes: ["\\HasNoChildren"],
      },
    ]);
  });

  it("handles escaped quotes and backslashes in mailbox names", async () => {
    server = createMockImapServer("* OK Mock IMAP ready\r\n", (line, write) => {
      const tag = line.split(" ")[0];

      if (line.includes("LOGIN")) {
        write(`${tag} OK LOGIN completed\r\n`);
      } else if (line.includes("LIST")) {
        write(
          '* LIST (\\HasNoChildren) "/" "has\\"quote"\r\n' +
            '* LIST (\\HasNoChildren) "/" "has\\\\backslash"\r\n' +
            `${tag} OK LIST completed\r\n`,
        );
      } else if (line.includes("LOGOUT")) {
        write(`* BYE bye\r\n${tag} OK LOGOUT completed\r\n`);
      }
    });

    await new Promise<void>((r) => server.once("listening", r));
    clientSocket = await connectTo(server);

    const mailboxes = await imapList({
      host: "127.0.0.1",
      port: serverPort(server),
      user: "alice",
      password: "secret",
      tls: false,
      rejectUnauthorized: false,
      reference: "",
      pattern: "*",
      timeoutMs: TIMEOUT,
      socket: clientSocket,
    });

    expect(mailboxes).toEqual([
      { name: 'has"quote', delimiter: "/", attributes: ["\\HasNoChildren"] },
      {
        name: "has\\backslash",
        delimiter: "/",
        attributes: ["\\HasNoChildren"],
      },
    ]);
  });
});
