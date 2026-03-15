import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import type {
  ICredentialTestFunctions,
  ICredentialsDecrypted,
  IExecuteFunctions,
  INodeCredentialTestResult,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";

import { KagiClient, extractSessionToken } from "./KagiClient";

export class Kagi implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Kagi",
    name: "kagi",
    icon: "file:kagi.svg",
    group: ["output"],
    version: 1,
    subtitle:
      '={{$parameter["operation"] === "quickAnswer" ? "Quick Answer" : "Search"}}',
    description:
      "Search the web with Kagi and get AI-powered Quick Answer summaries",
    defaults: {
      name: "Kagi",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "kagiApi",
        required: true,
        testedBy: "kagiApiTest",
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

  methods = {
    credentialTest: {
      async kagiApiTest(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted,
      ): Promise<INodeCredentialTestResult> {
        const raw = credential.data?.sessionToken as string;
        if (!raw) {
          return {
            status: "Error",
            message: "Session token is required",
          };
        }

        const token = extractSessionToken(raw);
        try {
          const response = (await this.helpers.request({
            method: "GET",
            uri: `https://kagi.com/html/search?token=${encodeURIComponent(token)}`,
            followRedirect: false,
            resolveWithFullResponse: true,
            simple: false,
          })) as { statusCode: number; headers: Record<string, string> };

          const location = response.headers?.location ?? "";
          if (location.includes("/signin") || location.includes("/welcome")) {
            return {
              status: "Error",
              message:
                "Invalid session token. Go to Kagi Settings → Account → Session Link to get a valid token.",
            };
          }

          return { status: "OK", message: "Connection successful" };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { status: "Error", message };
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials("kagiApi");

    const raw = credentials.sessionToken as string;
    if (!raw) {
      throw new NodeOperationError(
        this.getNode(),
        "Kagi session token is required",
      );
    }

    const client = new KagiClient(extractSessionToken(raw));
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
