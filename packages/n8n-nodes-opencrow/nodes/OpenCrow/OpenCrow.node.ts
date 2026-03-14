import * as fs from "node:fs";
import * as fsp from "node:fs/promises";

import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

export const DEFAULT_PIPE_PATH = "/var/lib/opencrow/sessions/trigger.pipe";

export class OpenCrow implements INodeType {
  description: INodeTypeDescription = {
    displayName: "OpenCrow",
    name: "openCrow",
    icon: "fa:crow",
    group: ["output"],
    version: 1,
    subtitle: "Send trigger to OpenCrow",
    description: "Send a message to OpenCrow via its trigger pipe",
    defaults: {
      name: "OpenCrow",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: "Message",
        name: "message",
        type: "string",
        default: "",
        required: true,
        typeOptions: {
          rows: 4,
        },
        description: "The message to send to OpenCrow as a trigger",
      },
      {
        displayName: "Pipe Path",
        name: "pipePath",
        type: "string",
        default: DEFAULT_PIPE_PATH,
        description: "Path to the OpenCrow trigger pipe",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const message = this.getNodeParameter("message", i) as string;
        const pipePath = this.getNodeParameter(
          "pipePath",
          i,
          DEFAULT_PIPE_PATH,
        ) as string;

        if (!message.trim()) {
          throw new NodeOperationError(
            this.getNode(),
            "Message cannot be empty",
            { itemIndex: i },
          );
        }

        // Each line in the pipe is a separate trigger, so collapse to one line
        const singleLine = message.replace(/\n/g, " ").trim();

        await writeToFifo(pipePath, singleLine + "\n");

        returnData.push(
          ...this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray({
              success: true,
              message: singleLine,
            }),
            { itemData: { item: i } },
          ),
        );
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

/**
 * Write a string to a FIFO. Opens with O_WRONLY|O_NONBLOCK so the call
 * fails immediately if no reader has the pipe open (instead of hanging).
 */
async function writeToFifo(pipePath: string, data: string): Promise<void> {
  let handle: fsp.FileHandle;
  try {
    handle = await fsp.open(
      pipePath,
      fs.constants.O_WRONLY | fs.constants.O_NONBLOCK,
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENXIO") {
      throw new Error(`OpenCrow is not running (no reader on ${pipePath})`);
    } else if (code === "ENOENT") {
      throw new Error(`Trigger pipe not found at ${pipePath}`);
    }
    throw err;
  }
  try {
    await handle.write(data);
  } finally {
    await handle.close();
  }
}
