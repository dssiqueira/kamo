# Contributing to Kamo

Thanks for wanting to help. Kamo is a free, open-source (MIT) screen recorder that zooms in on every click. Bug reports, ideas, translations and pull requests are all welcome.

## Before you start

- **Read [AGENTS.md](AGENTS.md).** It is the entry point for humans and AI agents alike: what Kamo is, the non-negotiable rules, the repository layout and the build order. Then follow it into [docs/](docs/).
- **Look for an existing issue** before opening a new one. For anything larger than a small fix, open an issue first so we can agree on the approach.
- **Everything is in English**: code, comments, docs, commit messages, issues and pull requests.

## The rules that matter most

These come from AGENTS.md and are checked in review (some by CI):

1. `packages/core` and `packages/ui` don't know where they run: no Electron, Node or `chrome.*` inside them. Platform things come in through interfaces.
2. **Never capture the keyboard.** Mouse only. CI runs `pnpm guard:keyboard`.
3. Nothing leaves the user's machine unless they send it. No telemetry, no analytics.
4. The free app is complete: no recording, editing or exporting feature behind an account or payment.
5. No interface text in code: every visible string comes from `packages/i18n`, with an English key and a translation in every launch language (en, pt-BR, es, zh-CN, ja).
6. Animation uses the spring (stiffness 170, damping 26), never linear.
7. Preview and export share the same rendering code.
8. A new dependency needs a one-line justification. An architecture change gets an entry in [docs/decisions.md](docs/decisions.md).

## Development

Requires Node 24+ and pnpm (`npm i -g pnpm`). The native capture helpers need extra toolchains: Rust and the Visual Studio Build Tools (C++ workload) on Windows, Xcode on Mac (see `apps/desktop/native/*/README.md`).

```bash
pnpm install
pnpm --filter @kamo/desktop dev     # run the desktop app
pnpm check                          # lint, typecheck, tests, i18n and the keyboard guard
```

No recording hardware handy? `apps/desktop/scripts/sample-project` writes a realistic sample project you can open in the editor.

## Pull requests

- One feature or fix per pull request, with tests for what can be tested.
- `pnpm check` must pass. CI also builds the installers and enforces the size budget (desktop installer ≤ 130MB).
- UI changes: follow [DESIGN.md](DESIGN.md) and include a screenshot.
- New or changed strings: add them to all five locale files in `packages/i18n/src/locales/`. Machine translation is fine as a first pass; say so in the PR so a native speaker can review.
- Keep commits focused and write messages in the imperative ("Add …", "Fix …").

## Translations

Kamo launches in English, Portuguese (Brazil), Spanish, Simplified Chinese and Japanese. Native-speaker review of existing strings is one of the most useful contributions: open a PR against the locale file with your corrections.

## Reporting security issues

Please don't open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
