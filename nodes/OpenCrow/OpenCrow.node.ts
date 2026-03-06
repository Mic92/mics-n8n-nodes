import * as fs from "fs";

import { NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

const TRIGGER_PIPE_PATH = "/var/lib/opencrow/sessions/trigger.pipe";

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
    inputs: ["main"],
    outputs: ["main"],
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
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const message = this.getNodeParameter("message", i) as string;

        if (!message.trim()) {
          throw new NodeOperationError(
            this.getNode(),
            "Message cannot be empty",
            { itemIndex: i },
          );
        }

        // Each line in the pipe is a separate trigger, so collapse to one line
        const singleLine = message.replace(/\n/g, " ").trim();

        await writeToFifo(TRIGGER_PIPE_PATH, singleLine + "\n");

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
export function writeToFifo(pipePath: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let fd: number;
    try {
      fd = fs.openSync(
        pipePath,
        fs.constants.O_WRONLY | fs.constants.O_NONBLOCK,
      );
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENXIO") {
        reject(new Error(`OpenCrow is not running (no reader on ${pipePath})`));
      } else if (code === "ENOENT") {
        reject(new Error(`Trigger pipe not found at ${pipePath}`));
      } else {
        reject(err);
      }
      return;
    }

    fs.write(fd, data, (writeErr) => {
      fs.close(fd, () => {
        // ignore close error
      });
      if (writeErr) {
        reject(writeErr);
      } else {
        resolve();
      }
    });
  });
}
