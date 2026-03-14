import type { IDataObject } from "n8n-workflow";

import { createMockExecuteFunctions } from "../../../../../test/helpers";
import { GitHubNotifications } from "../GitHubNotifications.node";

const node = new GitHubNotifications();

function createMockHttpAuth(responses: IDataObject[][]) {
  let callIndex = 0;
  return jest.fn(async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return resp;
  });
}

function createCtx(
  params: Record<string, unknown>,
  httpResponse: IDataObject[] | IDataObject[][] = [],
) {
  const responses = Array.isArray(httpResponse[0])
    ? (httpResponse as IDataObject[][])
    : [httpResponse as IDataObject[]];

  const mockHttp = createMockHttpAuth(responses);

  const ctx = createMockExecuteFunctions(
    { authentication: "accessToken", ...params },
    undefined,
    {
      helpers: { httpRequestWithAuthentication: mockHttp },
    },
  );

  return { ctx, mockHttp };
}

function urlOf(mockHttp: jest.Mock, callIndex = 0): string {
  // jest.Mock types calls as unknown[][], access is safe after assertion
  return (mockHttp.mock.calls as Record<string, unknown>[][])[callIndex][1]
    .url as string;
}

describe("GitHubNotifications node", () => {
  it("lists unread notifications with access token auth", async () => {
    const { ctx, mockHttp } = createCtx(
      { returnAll: false, maxResults: 50, filters: {} },
      [
        { id: "1", reason: "mention" },
        { id: "2", reason: "assign" },
      ],
    );

    const [[first, second]] = await node.execute.call(ctx);

    expect(first.json).toMatchObject({ id: "1", reason: "mention" });
    expect(second.json).toMatchObject({ id: "2", reason: "assign" });
    expect(mockHttp).toHaveBeenCalledTimes(1);
    expect(mockHttp).toHaveBeenCalledWith(
      "githubApi",
      expect.objectContaining({
        url: expect.stringContaining("per_page=50"),
      }),
    );
  });

  it("uses OAuth2 credential when selected", async () => {
    const { ctx, mockHttp } = createCtx(
      {
        authentication: "oAuth2",
        returnAll: false,
        maxResults: 50,
        filters: {},
      },
      [{ id: "1" }],
    );

    await node.execute.call(ctx);

    expect(mockHttp).toHaveBeenCalledWith("githubOAuth2Api", expect.anything());
  });

  it("passes filter query parameters", async () => {
    const { ctx, mockHttp } = createCtx(
      {
        returnAll: false,
        maxResults: 50,
        filters: {
          all: true,
          participating: true,
          since: "2024-01-01T00:00:00Z",
        },
      },
      [],
    );

    await node.execute.call(ctx);

    const url = urlOf(mockHttp);
    expect(url).toContain("all=true");
    expect(url).toContain("participating=true");
    expect(url).toContain("since=2024-01-01T00%3A00%3A00Z");
  });

  it("paginates when returnAll is true", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
    const page2 = [{ id: "100" }, { id: "101" }];

    const { ctx, mockHttp } = createCtx({ returnAll: true, filters: {} }, [
      page1,
      page2,
    ]);

    const [results] = await node.execute.call(ctx);

    expect(results).toHaveLength(102);
    expect(mockHttp).toHaveBeenCalledTimes(2);
  });

  it("respects maxResults limit", async () => {
    const { ctx } = createCtx(
      { returnAll: false, maxResults: 3, filters: {} },
      Array.from({ length: 5 }, (_, i) => ({ id: String(i) })),
    );

    const [results] = await node.execute.call(ctx);

    expect(results).toHaveLength(3);
  });

  it("computes since from timePeriod filter", async () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);

    const { ctx, mockHttp } = createCtx(
      { returnAll: false, maxResults: 50, filters: { timePeriod: "7" } },
      [],
    );

    await node.execute.call(ctx);

    const expected = new Date(now - 7 * 86_400_000).toISOString();
    expect(urlOf(mockHttp)).toContain(`since=${encodeURIComponent(expected)}`);

    jest.restoreAllMocks();
  });

  it("since filter overrides timePeriod", async () => {
    const { ctx, mockHttp } = createCtx(
      {
        returnAll: false,
        maxResults: 50,
        filters: { timePeriod: "7", since: "2024-06-01T00:00:00Z" },
      },
      [],
    );

    await node.execute.call(ctx);

    expect(urlOf(mockHttp)).toContain("since=2024-06-01T00%3A00%3A00Z");
  });
});
