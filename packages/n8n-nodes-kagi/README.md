# Kagi

Search the web with [Kagi](https://kagi.com/) and get AI-powered Quick Answer
summaries. Uses the HTML search interface and streaming Quick Answer endpoint
instead of the paid API, so queries are covered by your Kagi subscription.

**Credential: Kagi**

| Field         | Description                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Session Token | Kagi session token — generate one at [Settings → Session Link](https://kagi.com/settings?p=api) |

## Operation: Search

Return web search result links scraped from Kagi's HTML search page.

| Parameter   | Description                                    |
| ----------- | ---------------------------------------------- |
| Query       | The search query                               |
| Max Results | Maximum number of results to return (1–20)     |

Each result contains `title`, `url`, and `snippet`.

## Operation: Quick Answer

Get an AI-generated summary answer with source references. This is the same
feature shown at the top of Kagi search results when the query is a question.

| Parameter | Description      |
| --------- | ---------------- |
| Query     | The search query |

Returns `markdown` (the answer text) and `references` (an array of
`{ title, url, contribution }` objects showing which sources contributed).

## Testing

Integration tests validate the HTML and streaming parsers against real Kagi
output. They require a session token:

```sh
KAGI_SESSION_TOKEN=xxx npx jest --testPathPattern KagiClient.integration
```

Tests skip automatically when the environment variable is unset.
