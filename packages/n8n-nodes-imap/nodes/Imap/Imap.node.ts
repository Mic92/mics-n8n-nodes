import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from "n8n-workflow";

import { imapAppend, imapMove, imapList } from "./imap";

interface ImapCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  rejectUnauthorized: boolean;
}

export class Imap implements INodeType {
  description: INodeTypeDescription = {
    displayName: "IMAP",
    name: "imap",
    icon: "fa:envelope",
    group: ["output"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Interact with an IMAP mailbox",
    defaults: {
      name: "IMAP",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "imapApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Append",
            value: "append",
            description: "Store an email message in a mailbox folder",
          },
          {
            name: "List",
            value: "list",
            description: "List mailbox folders",
          },
          {
            name: "Move",
            value: "move",
            description: "Move a message to another folder by UID",
          },
        ],
        default: "append",
      },
      // --- Append fields ---
      {
        displayName: "Folder",
        name: "folder",
        type: "string",
        default: "INBOX",
        required: true,
        displayOptions: {
          show: {
            operation: ["append"],
          },
        },
        description: "Target IMAP mailbox folder (e.g. INBOX, Archive)",
      },
      {
        displayName: "Message Source",
        name: "messageSource",
        type: "options",
        options: [
          {
            name: "JSON Field",
            value: "field",
            description: "Read the raw RFC 2822 message from a JSON field",
          },
          {
            name: "Binary Data",
            value: "binary",
            description: "Read the message from a binary attachment",
          },
        ],
        default: "field",
        displayOptions: {
          show: {
            operation: ["append"],
          },
        },
        description: "Where the raw RFC 2822 email message comes from",
      },
      {
        displayName: "Message Field",
        name: "messageField",
        type: "string",
        default: "raw",
        required: true,
        displayOptions: {
          show: {
            operation: ["append"],
            messageSource: ["field"],
          },
        },
        description: "Name of the JSON field containing the raw RFC 2822 email",
      },
      {
        displayName: "Binary Property",
        name: "binaryProperty",
        type: "string",
        default: "data",
        required: true,
        displayOptions: {
          show: {
            operation: ["append"],
            messageSource: ["binary"],
          },
        },
        description: "Name of the binary property containing the email",
      },
      {
        displayName: "Flags",
        name: "flags",
        type: "string",
        default: "\\Seen",
        displayOptions: {
          show: {
            operation: ["append"],
          },
        },
        description:
          "Space-separated IMAP flags to set on the message (e.g. \\Seen \\Flagged)",
      },
      // --- Move fields ---
      {
        displayName: "Source Folder",
        name: "sourceFolder",
        type: "string",
        default: "INBOX",
        required: true,
        displayOptions: {
          show: {
            operation: ["move"],
          },
        },
        description: "Folder the message is currently in",
      },
      {
        displayName: "UID",
        name: "uid",
        type: "number",
        default: 0,
        required: true,
        displayOptions: {
          show: {
            operation: ["move"],
          },
        },
        description: "UID of the message to move",
      },
      {
        displayName: "Destination Folder",
        name: "destinationFolder",
        type: "string",
        default: "",
        required: true,
        displayOptions: {
          show: {
            operation: ["move"],
          },
        },
        description: "Folder to move the message to",
      },
      // --- List fields ---
      {
        displayName: "Reference",
        name: "reference",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["list"],
          },
        },
        description: "IMAP LIST reference name (usually empty for the root)",
      },
      {
        displayName: "Pattern",
        name: "pattern",
        type: "string",
        default: "*",
        displayOptions: {
          show: {
            operation: ["list"],
          },
        },
        description: "Mailbox name pattern (* = all, % = top-level only)",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("imapApi");

    const creds: ImapCredentials = {
      host: credentials.host as string,
      port: credentials.port as number,
      user: credentials.user as string,
      password: credentials.password as string,
      tls: credentials.tls as boolean,
      rejectUnauthorized: credentials.rejectUnauthorized as boolean,
    };

    if (!creds.host) {
      throw new NodeOperationError(
        this.getNode(),
        "IMAP host must be configured in credentials",
      );
    }

    const operation = this.getNodeParameter("operation", 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let results: IDataObject[];

        if (operation === "append") {
          results = [await executeAppend(this, i, items, creds)];
        } else if (operation === "move") {
          results = [await executeMove(this, i, creds)];
        } else if (operation === "list") {
          results = await executeList(this, i, creds);
        } else {
          throw new NodeOperationError(
            this.getNode(),
            `Unknown operation: ${operation}`,
            { itemIndex: i },
          );
        }

        for (const result of results) {
          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray(result),
              { itemData: { item: i } },
            ),
          );
        }
      } catch (error) {
        if (this.continueOnFail()) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({ error: errorMessage }),
              { itemData: { item: i } },
            ),
          );
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}

async function executeAppend(
  ctx: IExecuteFunctions,
  itemIndex: number,
  items: INodeExecutionData[],
  creds: ImapCredentials,
): Promise<IDataObject> {
  const folder = ctx.getNodeParameter("folder", itemIndex) as string;
  const messageSource = ctx.getNodeParameter(
    "messageSource",
    itemIndex,
  ) as string;
  const flagsRaw = ctx.getNodeParameter("flags", itemIndex, "") as string;

  const flags = flagsRaw.split(/\s+/).filter((f) => f.length > 0);

  let message: Buffer;

  if (messageSource === "binary") {
    const binaryProperty = ctx.getNodeParameter(
      "binaryProperty",
      itemIndex,
    ) as string;
    const binaryData = items[itemIndex].binary?.[binaryProperty];
    if (!binaryData) {
      throw new NodeOperationError(
        ctx.getNode(),
        `No binary data found in property "${binaryProperty}"`,
        { itemIndex },
      );
    }
    message = Buffer.from(binaryData.data, "base64");
  } else {
    const messageField = ctx.getNodeParameter(
      "messageField",
      itemIndex,
    ) as string;
    const raw = items[itemIndex].json[messageField];
    if (typeof raw !== "string" || !raw) {
      throw new NodeOperationError(
        ctx.getNode(),
        `JSON field "${messageField}" is empty or not a string`,
        { itemIndex },
      );
    }
    message = Buffer.from(raw, "utf-8");
  }

  await imapAppend({
    ...creds,
    folder,
    flags,
    message,
  });

  return { success: true, folder, messageSize: message.length };
}

async function executeMove(
  ctx: IExecuteFunctions,
  itemIndex: number,
  creds: ImapCredentials,
): Promise<IDataObject> {
  const sourceFolder = ctx.getNodeParameter(
    "sourceFolder",
    itemIndex,
  ) as string;
  const uid = ctx.getNodeParameter("uid", itemIndex) as number;
  const destinationFolder = ctx.getNodeParameter(
    "destinationFolder",
    itemIndex,
  ) as string;

  await imapMove({
    ...creds,
    sourceFolder,
    uid,
    destinationFolder,
  });

  return { success: true, uid, sourceFolder, destinationFolder };
}

async function executeList(
  ctx: IExecuteFunctions,
  itemIndex: number,
  creds: ImapCredentials,
): Promise<IDataObject[]> {
  const reference = ctx.getNodeParameter("reference", itemIndex, "") as string;
  const pattern = ctx.getNodeParameter("pattern", itemIndex, "*") as string;

  const mailboxes = await imapList({
    ...creds,
    reference,
    pattern,
  });

  return mailboxes.map((m) => ({
    name: m.name,
    delimiter: m.delimiter,
    attributes: m.attributes,
  }));
}
