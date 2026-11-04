# Security Policy

Kamo records your screen, so we take its privacy and security promises seriously: the app works fully offline, sends nothing unless you ask, never captures the keyboard, and the local MCP server is read-only with no network access.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub: go to the repository's **Security** tab → **Report a vulnerability**. Include what you found, how to reproduce it, and the impact you expect.

You'll get an acknowledgement within a few days. We'll keep you updated, agree on a disclosure date with you, and credit you in the release notes unless you prefer otherwise.

## What's especially in scope

- Anything that makes data leave the machine without the user sending it.
- Any way the app, a native capture helper or a content script could read keystrokes.
- The `kamo-media://` protocol, IPC between the renderer and the main process, and the sandbox/CSP of the renderer.
- The local MCP server writing files or reaching the network.
- Downloaded optional packs being installed without their SHA-256 matching.

## Supported versions

Kamo is in early development. Security fixes go into the latest release.
