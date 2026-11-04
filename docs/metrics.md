# metrics.md

> The app has **no analytics**. That's a feature, not an oversight. Metrics come from outside the app: stores, GitHub, npm and, for those who use it, Kamo Cloud. Revenue goals and success criteria are in the private `kamo-cloud` repository.

## Allowed sources
| Source | What it measures | How |
|---|---|---|
| Landing page | visits, download clicks by platform and by page language | cookieless analytics (Vercel Analytics / Plausible) |
| GitHub Releases | downloads by version and OS | GitHub API |
| Chrome Web Store | installs, weekly active users, ratings | store dashboard (aggregated data from the store itself) |
| GitHub repo | stars, issues, forks | GitHub API |
| npm | weekly downloads of `@kamo/mcp` | public npm statistics (the local MCP reports nothing) |
| GitHub Releases (packages) | downloads of each optional package | public count of the release assets; shows how many users want transcription |

## Qualitative signals
- Videos made with the app posted on X/LinkedIn (search for mentions)
- Kamo links showing up in public places (issues, docs, changelogs of other products)
- Issues requesting a feature vs. reporting a bug
- Product Hunt comments

## What to NEVER track
- Content of recordings that were not sent to the cloud
- Typed keys
- Usage telemetry inside the app
- Identity, IP or cookie of whoever watches a shared video
- Content of the questions and answers exchanged with the MCP (local or cloud)
- Anyone's IP, beyond the short-lived technical logs that Supabase and Vercel keep by default (configured with the shortest possible retention)
