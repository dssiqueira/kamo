# @kamo/mcp

A local [MCP](https://modelcontextprotocol.io) server for your [Kamo](https://github.com/dssiqueira/kamo) screen recordings. It lets your AI agent (Claude Code, or any other MCP client) read what you recorded on this computer: names and dates, what was said (transcripts), where you clicked, the zooms, and a screenshot every 5 seconds.

Free and open source (MIT), like the Kamo app.

## Privacy

- **Read-only.** It only reads your projects folder. No tool creates, changes or deletes a file. Your raw videos are never opened.
- **No network.** It never opens a socket or makes a request. It talks to your agent over stdio (the agent starts it as a local process) and nothing else. The tests check both things: they scan the source for file-write and network APIs, and they run every tool with network and file writes blocked.
- **No video decoding.** Screenshots come from the small reference frames the app saves while recording (`frames/`), so there is no FFmpeg and no native binary.
- What your agent does with the answers (for example, sending them to its model provider) is up to the agent you connected.

## Setup

You need Node.js 20 or newer. The Kamo desktop app shows the exact command, with your folder already filled in, under **Settings → Connect to an agent**.

### Claude Code

```bash
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"
```

`--dir` is optional. Without it, the server looks for the projects folder in this order:

1. `--dir <path>` (`~/Kamo` works too: it looks for `projects/` inside)
2. The folder set in the Kamo app, read from its `settings.json` (a local file):
   - Windows: `%APPDATA%\Kamo\settings.json`
   - macOS: `~/Library/Application Support/Kamo/settings.json`
   - Linux: `~/.config/Kamo/settings.json`
3. `~/Kamo/projects`

### Other MCP clients

Any client that can start a stdio server works. The usual JSON config:

```json
{
  "mcpServers": {
    "kamo": {
      "command": "npx",
      "args": ["-y", "@kamo/mcp", "--dir", "/Users/you/Kamo/projects"]
    }
  }
}
```

On Windows, some clients need `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@kamo/mcp", "--dir", "C:\\Users\\you\\Kamo\\projects"]`.

### CLI

```
kamo-mcp [--dir <projects folder>]
kamo-mcp --help
kamo-mcp --version
```

stdout carries the MCP protocol; logs go to stderr.

## Tools

All tools are read-only. Times come in milliseconds and as `hh:mm:ss`, on the raw recording timeline (`get_recording` tells you the trim). Positions are pixels of the recorded video, origin top-left. Lists are paginated: when `nextOffset` is not `null`, call again with `offset: nextOffset`.

| Tool | What it returns | Input |
|---|---|---|
| `list_recordings` | Recordings, newest first: id, name, date, duration, resolution, whether it has a transcript, export count, Kamo Cloud links | `from?`, `to?` (`YYYY-MM-DD` or ISO 8601), `offset?` (0), `limit?` (20, max 100) |
| `search_recordings` | Matches in names and transcripts: recording, snippet, instant | `query`, `offset?` (0), `limit?` (20, max 50) |
| `get_recording` | Full metadata: duration, source and resolution, trim, zooms, style, cursor, audio tracks, exports, cloud links, transcript state, frames | `recordingId` |
| `get_transcript` | Timed transcript segments, all or a time range | `recordingId`, `fromMs?`, `toMs?`, `offset?` (0), `limit?` (100, max 500) |
| `get_click_timeline` | Clicks and zooms (instant + position); scrolls and pointer moves only when asked | `recordingId`, `fromMs?`, `toMs?`, `includeZooms?` (true), `includeScrolls?` (false), `includeMoves?` (false), `offset?` (0), `limit?` (100, max 500) |
| `get_frame` | The reference screenshot closest to an instant (JPEG image) and its real time | `recordingId`, `atMs` |

`recordingId` is the id from `list_recordings` or `search_recordings` (the project id, or its folder name).

### Examples

Things you can ask your agent:

- "What did I record last week?" → `list_recordings { "from": "2026-10-26", "to": "2026-11-01" }`
- "Find the recording where I talked about billing settings" → `search_recordings { "query": "billing settings" }`
- "Write step-by-step docs from my onboarding demo" → `get_transcript`, `get_click_timeline` and a few `get_frame` calls
- "What was on screen at 1:05?" → `get_frame { "recordingId": "…", "atMs": 65000 }`

A `search_recordings` match looks like this:

```json
{
  "recordingId": "c7c1cbcb-fe32-4f5d-b3df-b8571d6a61f7",
  "recordingName": "Billing walkthrough",
  "createdAt": "2026-10-01T12:00:00.000Z",
  "match": "transcript",
  "snippet": "Here are the billing settings.",
  "atMs": 2400,
  "at": "00:00:02",
  "endMs": 6100,
  "end": "00:00:06"
}
```

A `get_click_timeline` item:

```json
{ "kind": "click", "atMs": 1800, "at": "00:00:01", "x": 150, "y": 330, "button": "left" }
```

Search ignores case and accents and needs every word of the query. It indexes in memory the first time and only rereads files that changed, so it stays under a second with hundreds of recordings.

### When something is missing

- **No recordings:** the answer says which folder was read ("No recordings found in …"). Check the folder in the Kamo app and pass it with `--dir`.
- **No transcript:** transcription is an optional pack in the Kamo desktop app (click **Transcribe** in the Editor, or **Settings → Packages**). Without it, clicks, zooms and frames still work, and search only looks at names.
- **Corrupted project:** it is skipped and listed under `warnings`; everything else keeps working.
- **Recordings from the Chrome extension** do not show up here: they live inside the browser. Upload them to Kamo Cloud and use the Kamo Cloud MCP, which reads your whole cloud library from any device.

## Development

From the repository root:

```bash
pnpm --filter @kamo/mcp dev --dir "<projects folder>"      # runs the TypeScript source with Node
pnpm --filter @kamo/mcp build                              # tsc → dist/
pnpm vitest run --project mcp                              # tests
```

To try it in the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (downloads the inspector with npx, then opens it in your browser):

```bash
pnpm --filter @kamo/mcp inspect
```

The server itself still makes no network calls; the inspector is a separate tool that talks to it over stdio.
