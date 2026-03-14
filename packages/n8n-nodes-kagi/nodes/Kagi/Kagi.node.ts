import { NodeOperationError } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

import { KagiClient } from "./KagiClient";

export class Kagi implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Kagi",
    name: "kagi",
    icon: "fa:search",
    group: ["output"],
    version: 1,
    subtitle:
      '={{$parameter["operation"] === "quickAnswer" ? "Quick Answer" : "Search"}}',
    description:
      "Search the web with Kagi and get AI-powered Quick Answer summaries",
    defaults: {
      name: "Kagi",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "kagiApi",
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
            name: "Search",
            value: "search",
            description: "Search the web and return result links",
          },
          {
            name: "Quick Answer",
            value: "quickAnswer",
            description: "Get an AI-powered summary answer with references",
          },
        ],
        default: "quickAnswer",
      },
      {
        displayName: "Query",
        name: "query",
        type: "string",
        default: "",
        required: true,
        description: "The search query",
      },
      {
        displayName: "Max Results",
        name: "maxResults",
        type: "number",
        default: 5,
        typeOptions: {
          minValue: 1,
          maxValue: 20,
        },
        displayOptions: {
          show: {
            operation: ["search"],
          },
        },
        description: "Maximum number of search results to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("kagiApi");

    const sessionToken = credentials.sessionToken as string;
    if (!sessionToken) {
      throw new NodeOperationError(
        this.getNode(),
        "Kagi session token is required",
      );
    }

    const client = new KagiClient(sessionToken);
    await client.authenticate();

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter("operation", i) as string;
        const query = this.getNodeParameter("query", i) as string;

        if (!query.trim()) {
          throw new NodeOperationError(
            this.getNode(),
            "Query cannot be empty",
            { itemIndex: i },
          );
        }

        if (operation === "search") {
          const maxResults = this.getNodeParameter("maxResults", i) as number;
          const results = await client.search(query, maxResults);
          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({ query, results }),
              { itemData: { item: i } },
            ),
          );
        } else {
          const quickAnswer = await client.getQuickAnswer(query);
          returnData.push(
            ...this.helpers.constructExecutionMetaData(
              this.helpers.returnJsonArray({ query, quickAnswer }),
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
