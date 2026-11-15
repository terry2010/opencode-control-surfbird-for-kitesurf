# Contributing

Thanks for your interest. This plugin mirrors the DSH sibling
(`dsh-control-surfbird-for-kitesurf`); `src/cdp/` and the pure helpers
(`find.ts`, `links.ts`, `tokenfile.ts`) are shared verbatim — keep them
byte-identical across both repos.

## Setup

```bash
npm install
npm run build
```

## Verify before submitting

```bash
npm run build     # tsc → lib/ must be clean
npm test          # unit tests — no engine needed
npm run check     # plugin shape check (default export id + setup)
```

`npm run test:live` needs a real engine:

```bash
SURFBIRD_URL=http://127.0.0.1:18080 SURFBIRD_TOKEN=<token> npm run test:live
# or tunnel: ssh -L 18080:127.0.0.1:8080 user@surfbird-host
```

## Rules of the road

- `src/cdp/` must stay host-independent: no `@opencode/*`, `@deepseek-ai/*`,
  or other host framework imports — only `ws`, `@mozilla/readability`,
  `turndown`, and Node builtins.
- Erasable TypeScript only (Node type stripping): no `enum`, `namespace`, or
  parameter properties; relative imports keep the `.ts` extension.
- Engine boundary: Kitesurf is Boa + DOM shim, not Chromium — no dialogs,
  file upload/download, clipboard, drag/touch, or complete keyboard events.
  Check `surfbird_status` capabilities before promising a feature.
- Tool names keep the `surfbird_` prefix.

## Releasing

Releases are cut by the maintainer only, on explicit request: bump version,
update CHANGELOG, tag `vX.Y.Z`, push, GitHub Release, `npm publish`.
