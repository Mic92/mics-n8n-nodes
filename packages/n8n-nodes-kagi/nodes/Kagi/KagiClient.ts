import * as https from "https";
import * as http from "http";
import * as zlib from "zlib";
import { URL } from "url";
import { parse as parseHtml } from "node-html-parser";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface QuickAnswerReference {
  title: string;
  url: string;
  contribution: string;
}

export interface QuickAnswer {
  markdown: string;
  references: QuickAnswerReference[];
}

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  finalUrl: string;
}

/**
 * Kagi search client using session token authentication.
 * Scrapes the HTML search interface to avoid API credits.
 */
export class KagiClient {
  private baseUrl = "https://kagi.com";
  private userAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  private cookies: Map<string, string> = new Map();

  constructor(private sessionToken: string) {}

  /**
   * Authenticate with Kagi using the session token.
   * Sets session cookies for subsequent requests.
   */
  async authenticate(): Promise<void> {
    const tokenUrl = `${this.baseUrl}/html/search?token=${encodeURIComponent(this.sessionToken)}`;
    const response = await this.httpGet(tokenUrl, { followRedirects: true });

    if (
      response.finalUrl.includes("/signin") ||
      response.finalUrl.includes("/welcome")
    ) {
      throw new Error(
        `Authentication failed - redirected to ${response.finalUrl}`,
      );
    }
  }

  /**
   * Search Kagi and return results.
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const searchUrl = `${this.baseUrl}/html/search?q=${encodeURIComponent(query)}`;

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await this.httpGet(searchUrl, { followRedirects: true });

      if (
        response.finalUrl.includes("/signin") ||
        response.finalUrl.includes("/welcome")
      ) {
        throw new Error(
          `Authentication failed - redirected to ${response.finalUrl}`,
        );
      }

      const results = this.parseSearchResults(response.body, limit);
      if (results.length > 0) {
        return results;
      }

      if (attempt < maxRetries - 1) {
        await sleep(1000);
      }
    }

    return [];
  }

  /**
   * Get Kagi Quick Answer (AI summary) for a query.
   */
  async getQuickAnswer(query: string): Promise<QuickAnswer | null> {
    const params = new URLSearchParams({ q: query });
    const quickAnswerUrl = `${this.baseUrl}/mother/context?${params.toString()}`;

    const sessionCookie = this.cookies.get("kagi_session") ?? "";

    const response = await this.httpPost(quickAnswerUrl, {
      headers: {
        Accept: "application/vnd.kagi.stream",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Referer: `${this.baseUrl}/search?${params.toString()}`,
        Origin: this.baseUrl,
        Connection: "close",
        "Content-Length": "0",
        ...(sessionCookie
          ? { "X-Kagi-Authorization": sessionCookie }
          : {}),
      },
      followRedirects: true,
    });

    if (
      response.finalUrl.includes("/signin") ||
      response.finalUrl.includes("/welcome")
    ) {
      throw new Error(
        `Authentication failed - redirected to ${response.finalUrl}`,
      );
    }

    return this.parseQuickAnswer(response.body);
  }

  /**
   * Parse search results from Kagi HTML response using a proper DOM parser.
   * Mirrors the Python kagi_search.py BeautifulSoup approach.
   */
  private parseSearchResults(html: string, limit: number): SearchResult[] {
    const doc = parseHtml(html);
    const results: SearchResult[] = [];

    const resultsBox = doc.querySelector(".results-box");
    if (!resultsBox) {
      return [];
    }

    const searchResults = resultsBox.querySelectorAll(".search-result");

    for (const result of searchResults.slice(0, limit)) {
      // Extract title from __sri-title
      const titleElem = result.querySelector(".__sri-title");
      let title = "";
      if (titleElem) {
        title = titleElem.text
          .replace(/More results from.*/i, "")
          .replace(/Remove results from.*/i, "")
          .replace(/Open page in.*/i, "")
          .trim();
      }

      // Extract URL from __sri-url-box
      const urlBox = result.querySelector(".__sri-url-box");
      let url = "";
      if (urlBox) {
        const link = urlBox.querySelector("a[href]");
        if (link) {
          url = link.getAttribute("href") ?? "";
        }
      }

      // Extract snippet from __sri-desc
      const descElem = result.querySelector(".__sri-desc");
      const snippet = descElem ? descElem.text.trim() : "";

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  }

  /**
   * Parse Quick Answer from Kagi streaming response.
   */
  private parseQuickAnswer(body: string): QuickAnswer | null {
    const lines = body.trim().split("\n");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalData: any = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("new_message.json:")) {
        const jsonStr = line.slice("new_message.json:".length);
        try {
          // Parse only the first JSON object (there may be trailing data)
          finalData = parseFirstJson(jsonStr);
        } catch {
          // Ignore parse errors, continue to next line
        }
      }
    }

    if (!finalData) {
      return null;
    }

    const markdown: string = finalData.md ?? "";
    const referencesMd: string = finalData.references_md ?? "";

    if (!markdown) {
      return null;
    }

    // Parse references from references_md
    // Format: [^1]: [Title](URL) (22%)
    const references: QuickAnswerReference[] = [];
    const refPattern = /\[\^\d+\]:\s*\[([^\]]+)\]\((.+?)\)\s*\((\d+)%\)/g;
    let refMatch;
    while ((refMatch = refPattern.exec(referencesMd)) !== null) {
      references.push({
        title: refMatch[1],
        url: refMatch[2],
        contribution: `${refMatch[3]}%`,
      });
    }

    return { markdown, references };
  }

  /**
   * Perform an HTTP GET request, handling cookies and redirects.
   */
  private async httpGet(
    url: string,
    opts?: { followRedirects?: boolean },
  ): Promise<HttpResponse> {
    return this.httpRequest("GET", url, undefined, {}, opts);
  }

  /**
   * Perform an HTTP POST request, handling cookies and redirects.
   */
  private async httpPost(
    url: string,
    opts?: {
      headers?: Record<string, string>;
      followRedirects?: boolean;
    },
  ): Promise<HttpResponse> {
    return this.httpRequest("POST", url, "", opts?.headers ?? {}, {
      followRedirects: opts?.followRedirects,
    });
  }

  private async httpRequest(
    method: string,
    urlStr: string,
    body: string | undefined,
    extraHeaders: Record<string, string>,
    opts?: { followRedirects?: boolean },
    redirectCount: number = 0,
  ): Promise<HttpResponse> {
    if (redirectCount > 10) {
      throw new Error("Too many redirects");
    }

    const url = new URL(urlStr);

    const cookieHeader = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip",
      DNT: "1",
      Connection: "close",
      "Upgrade-Insecure-Requests": "1",
      ...extraHeaders,
    };

    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    const requestOpts: https.RequestOptions = {
      hostname: url.hostname,
      ...(url.port ? { port: Number(url.port) } : {}),
      path: url.pathname + url.search,
      method,
      headers,
    };

    return new Promise((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(requestOpts, (res) => {
        // Collect Set-Cookie headers
        const setCookies = res.headers["set-cookie"];
        if (setCookies) {
          for (const c of setCookies) {
            const parts = c.split(";")[0].split("=");
            if (parts.length >= 2) {
              this.cookies.set(parts[0].trim(), parts.slice(1).join("=").trim());
            }
          }
        }

        // Handle redirects
        if (
          opts?.followRedirects &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith("/")) {
            redirectUrl = `${url.protocol}//${url.host}${redirectUrl}`;
          }
          // Drain response body
          res.resume();
          // Drop extra headers on redirect - they're request-specific
          // (e.g. POST Content-Length, X-Kagi-Authorization)
          this.httpRequest(
            "GET",
            redirectUrl,
            undefined,
            {},
            opts,
            redirectCount + 1,
          ).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          let rawBody = Buffer.concat(chunks);

          // Decompress gzip if needed
          if (res.headers["content-encoding"] === "gzip") {
            try {
              rawBody = zlib.gunzipSync(rawBody);
            } catch {
              // Use raw body if decompression fails
            }
          }

          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: rawBody.toString("utf-8"),
            finalUrl: urlStr,
          });
        });
        res.on("error", reject);
      });

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error("Request timed out"));
      });

      if (body !== undefined) {
        req.write(body);
      }
      req.end();
    });
  }
}

/**
 * Parse the first JSON object from a string (ignoring trailing data).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFirstJson(str: string): any {
  // Try direct parse first
  try {
    return JSON.parse(str);
  } catch {
    // Fall through to bracket-matching approach
  }

  // Find matching closing brace for the first opening brace
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(str.slice(0, i + 1));
      }
    }
  }

  throw new Error("No valid JSON object found");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
