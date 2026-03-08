import { KagiClient } from "../KagiClient";

/**
 * Integration tests for KagiClient against real Kagi endpoints.
 * Validates that our HTML/streaming parsers work against Kagi's actual output.
 *
 * Requires KAGI_SESSION_TOKEN environment variable to be set.
 *
 * Run with: KAGI_SESSION_TOKEN=xxx npx jest --testPathPattern KagiClient.integration
 */

const token = process.env.KAGI_SESSION_TOKEN;

const describeIf = token ? describe : describe.skip;

describeIf("KagiClient integration", () => {
  let client: KagiClient;

  beforeAll(async () => {
    client = new KagiClient(token!);
    await client.authenticate();
  });

  it(
    "parses search results from real Kagi HTML",
    async () => {
      const results = await client.search("what is the capital of France", 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      for (const r of results) {
        expect(r.title).toBeTruthy();
        expect(r.url).toMatch(/^https?:\/\//);
      }
    },
    30000,
  );

  it(
    "parses quick answer from real Kagi streaming response",
    async () => {
      const answer = await client.getQuickAnswer(
        "what is the capital of France",
      );

      expect(answer).not.toBeNull();
      expect(answer!.markdown).toBeTruthy();
      expect(answer!.markdown.toLowerCase()).toContain("paris");
      expect(answer!.references.length).toBeGreaterThan(0);
      for (const ref of answer!.references) {
        expect(ref.title).toBeTruthy();
        expect(ref.url).toMatch(/^https?:\/\//);
        expect(ref.contribution).toMatch(/^\d+%$/);
      }
    },
    30000,
  );
});
