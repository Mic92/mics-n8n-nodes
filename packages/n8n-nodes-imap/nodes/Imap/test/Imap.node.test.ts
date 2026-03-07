import { createMockExecuteFunctions } from "../../../../../test/helpers";
import { Imap } from "../Imap.node";

import type {
  ImapAppendOptions,
  ImapMoveOptions,
  ImapListOptions,
} from "../imap";

jest.mock("../imap", () => ({
  imapAppend: jest.fn(),
  imapMove: jest.fn(),
  imapList: jest.fn(),
}));

import { imapAppend, imapMove, imapList } from "../imap";

const mockedAppend = jest.mocked(imapAppend);
const mockedMove = jest.mocked(imapMove);
const mockedList = jest.mocked(imapList);

const CREDS = {
  imapApi: {
    host: "mail.example.com",
    port: 993,
    user: "alice",
    password: "secret",
    tls: true,
    rejectUnauthorized: true,
  },
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe("Imap node – Append", () => {
  it("calls imapAppend with the right parameters", async () => {
    mockedAppend.mockResolvedValue();

    const rawEmail =
      "From: a@b.com\r\nTo: c@d.com\r\nSubject: Test\r\n\r\nHello!";

    const node = new Imap();
    const ctx = createMockExecuteFunctions(
      {
        operation: "append",
        folder: "INBOX.Archive",
        messageSource: "field",
        messageField: "raw",
        flags: "\\Seen \\Flagged",
      },
      CREDS,
      { inputItems: [{ json: { raw: rawEmail } }] },
    );

    const [[result]] = await node.execute.call(ctx);

    expect(result.json).toMatchObject({
      success: true,
      folder: "INBOX.Archive",
      messageSize: Buffer.byteLength(rawEmail),
    });

    expect(mockedAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "mail.example.com",
        folder: "INBOX.Archive",
        flags: ["\\Seen", "\\Flagged"],
        message: Buffer.from(rawEmail),
      } satisfies Partial<ImapAppendOptions>),
    );
  });

  it("reads message from binary data", async () => {
    mockedAppend.mockResolvedValue();

    const rawEmail = "Subject: bin\r\n\r\nbody";
    const b64 = Buffer.from(rawEmail).toString("base64");

    const node = new Imap();
    const ctx = createMockExecuteFunctions(
      {
        operation: "append",
        folder: "INBOX",
        messageSource: "binary",
        binaryProperty: "attachment",
        flags: "",
      },
      CREDS,
      {
        inputItems: [
          {
            json: {},
            binary: {
              attachment: {
                data: b64,
                mimeType: "message/rfc822",
                fileName: "email.eml",
              },
            },
          },
        ],
      },
    );

    const [[result]] = await node.execute.call(ctx);

    expect(result.json).toMatchObject({ success: true, folder: "INBOX" });
    expect(mockedAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: Buffer.from(rawEmail),
        flags: [],
      }),
    );
  });
});

describe("Imap node – Move", () => {
  it("calls imapMove with the right parameters", async () => {
    mockedMove.mockResolvedValue();

    const node = new Imap();
    const ctx = createMockExecuteFunctions(
      {
        operation: "move",
        sourceFolder: "INBOX",
        uid: 42,
        destinationFolder: "Archive",
      },
      CREDS,
    );

    const [[result]] = await node.execute.call(ctx);

    expect(result.json).toMatchObject({
      success: true,
      uid: 42,
      sourceFolder: "INBOX",
      destinationFolder: "Archive",
    });

    expect(mockedMove).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "mail.example.com",
        sourceFolder: "INBOX",
        uid: 42,
        destinationFolder: "Archive",
      } satisfies Partial<ImapMoveOptions>),
    );
  });
});

describe("Imap node – List", () => {
  it("returns one item per mailbox", async () => {
    mockedList.mockResolvedValue([
      { name: "INBOX", delimiter: ".", attributes: ["\\HasNoChildren"] },
      {
        name: "Archive",
        delimiter: ".",
        attributes: ["\\HasNoChildren", "\\Subscribed"],
      },
    ]);

    const node = new Imap();
    const ctx = createMockExecuteFunctions(
      {
        operation: "list",
        reference: "",
        pattern: "*",
      },
      CREDS,
    );

    const [results] = await node.execute.call(ctx);

    expect(results).toHaveLength(2);
    expect(results[0].json).toMatchObject({
      name: "INBOX",
      delimiter: ".",
      attributes: ["\\HasNoChildren"],
    });
    expect(results[1].json).toMatchObject({
      name: "Archive",
      delimiter: ".",
      attributes: ["\\HasNoChildren", "\\Subscribed"],
    });

    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "",
        pattern: "*",
      } satisfies Partial<ImapListOptions>),
    );
  });
});
