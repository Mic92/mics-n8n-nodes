# GitHub Notifications

List notifications from [GitHub](https://github.com/) via the
[Notifications API](https://docs.github.com/en/rest/activity/notifications).

Uses the built-in n8n GitHub credentials — no custom OAuth app or credential
setup required if you already have the GitHub node configured.

**Credentials** (choose one):

| Type         | n8n Credential    | Notes                                            |
| ------------ | ----------------- | ------------------------------------------------ |
| Access Token | GitHub API        | Personal access token with `notifications` scope |
| OAuth2       | GitHub OAuth2 API | Reuses the built-in GitHub OAuth2 credential     |

## Operation: List Notifications

Return notifications from the authenticated user's inbox.

| Parameter   | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| Return All  | Fetch every notification (auto-paginates)                      |
| Max Results | Maximum number of notifications to return (1–100, default: 50) |

### Filters

| Filter        | Description                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| All           | Include read notifications (default: unread only)                            |
| Participating | Only notifications the user is directly participating in or mentioned in     |
| Time Period   | Shortcut: last 24 hours, 7 days, or 30 days                                  |
| Since         | Only notifications updated after this date (ISO 8601, overrides Time Period) |
| Before        | Only notifications updated before this date (ISO 8601)                       |
