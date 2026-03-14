import { NodeConnectionTypes } from "n8n-workflow";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from "n8n-workflow";

export class GitHubNotifications implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GitHub Notifications",
    name: "gitHubNotifications",
    icon: "fa:bell",
    group: ["output"],
    version: 1,
    subtitle: "List Notifications",
    description: "List notifications from GitHub",
    defaults: {
      name: "GitHub Notifications",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "githubApi",
        required: true,
        displayOptions: {
          show: {
            authentication: ["accessToken"],
          },
        },
      },
      {
        name: "githubOAuth2Api",
        required: true,
        displayOptions: {
          show: {
            authentication: ["oAuth2"],
          },
        },
      },
    ],
    properties: [
      {
        displayName: "Authentication",
        name: "authentication",
        type: "options",
        options: [
          {
            name: "Access Token",
            value: "accessToken",
          },
          {
            name: "OAuth2",
            value: "oAuth2",
          },
        ],
        default: "accessToken",
      },
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        default: false,
        description: "Whether to return all notifications or use pagination",
      },
      {
        displayName: "Max Results",
        name: "maxResults",
        type: "number",
        default: 50,
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        displayOptions: {
          show: {
            returnAll: [false],
          },
        },
        description: "Maximum number of notifications to return",
      },
      {
        displayName: "Filters",
        name: "filters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        options: [
          {
            displayName: "All",
            name: "all",
            type: "boolean",
            default: false,
            description:
              "Whether to show notifications marked as read (default: unread only)",
          },
          {
            displayName: "Participating",
            name: "participating",
            type: "boolean",
            default: false,
            description:
              "Whether to only show notifications the user is directly participating in or mentioned in",
          },
          {
            displayName: "Time Period",
            name: "timePeriod",
            type: "options",
            default: "any",
            description:
              "Shortcut to filter notifications by recent time period",
            options: [
              { name: "Any Time", value: "any" },
              { name: "Last 24 Hours", value: "1" },
              { name: "Last 7 Days", value: "7" },
              { name: "Last 30 Days", value: "30" },
            ],
          },
          {
            displayName: "Since",
            name: "since",
            type: "dateTime",
            default: "",
            description:
              "Only show notifications updated after this date (ISO 8601). Overrides Time Period.",
          },
          {
            displayName: "Before",
            name: "before",
            type: "dateTime",
            default: "",
            description:
              "Only show notifications updated before this date (ISO 8601)",
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const returnAll = this.getNodeParameter("returnAll", i) as boolean;
        const maxResults = returnAll
          ? Infinity
          : (this.getNodeParameter("maxResults", i) as number);
        const filters = this.getNodeParameter("filters", i) as IDataObject;

        const qs: Record<string, string> = {};
        if (filters.all) qs.all = "true";
        if (filters.participating) qs.participating = "true";
        if (filters.since) {
          qs.since = filters.since as string;
        } else if (filters.timePeriod && filters.timePeriod !== "any") {
          const days = Number(filters.timePeriod);
          qs.since = new Date(Date.now() - days * 86_400_000).toISOString();
        }
        if (filters.before) qs.before = filters.before as string;

        const authMethod = this.getNodeParameter("authentication", 0) as string;
        const credentialType =
          authMethod === "oAuth2" ? "githubOAuth2Api" : "githubApi";

        const notifications = await fetchNotifications(
          this,
          credentialType,
          qs,
          maxResults,
        );

        returnData.push(
          ...this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray(notifications),
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

async function fetchNotifications(
  ctx: IExecuteFunctions,
  credentialType: string,
  qs: Record<string, string>,
  maxResults: number,
): Promise<IDataObject[]> {
  const perPage = Math.min(maxResults, 100);
  const results: IDataObject[] = [];

  for (let page = 1; results.length < maxResults; page++) {
    const queryParams = new URLSearchParams({
      ...qs,
      per_page: String(perPage),
      page: String(page),
    });

    const response = (await ctx.helpers.httpRequestWithAuthentication.call(
      ctx,
      credentialType,
      {
        method: "GET",
        url: `https://api.github.com/notifications?${queryParams.toString()}`,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        json: true,
      },
    )) as IDataObject[];

    if (!Array.isArray(response) || response.length === 0) break;

    results.push(...response);

    if (response.length < perPage) break;
  }

  return results.slice(0, maxResults);
}
