# Kamo

Screen recorder that zooms in on every click, smooths the cursor and exports a video that looks edited. Free, open source (MIT), 100% local. Desktop app (Mac + Windows) and Chrome extension, same engine.

> Work in progress. See [AGENTS.md](AGENTS.md) and [docs/plan.md](docs/plan.md).

## Development

Requires Node 24+ and pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm test
pnpm --filter design-tokens build   # regenerate tokens from DESIGN.md
pnpm i18n:check                     # every locale has every key
```

## License

MIT. Third-party notices in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
