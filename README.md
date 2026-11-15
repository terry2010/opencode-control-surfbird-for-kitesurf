# opencode-control-surfbird-for-kitesurf

An [OpenCode](https://opencode.ai/) plugin that gives an AI agent full control of a [Kitesurf](https://github.com/cloudflare/kitesurf) browser engine over the Chrome DevTools Protocol (CDP) — like a human operating a browser. Works with the self-hosted [surfbird](https://github.com/terry2010/surfbird) distribution (raw or token-auth mode) and upstream Kitesurf deployments. Exposes **28 `surfbird_*` tools**: tab management, navigation, semantic accessibility snapshots, click/type/fill, waits, JavaScript evaluation, screenshots, PDF export, console/network inspection, WebMCP, and a raw CDP escape hatch — with one isolated browser per agent session.

Sibling project: [`dsh-control-surfbird-for-kitesurf`](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf) — same tools for DSH (DeepSeek Harness). Both share the host-independent `src/cdp/` core.

## Requirements

- OpenCode v2 (`@opencode/plugin` ^2.0)
- Node.js >= 22.18 (for the `surfbird-token` CLI; the plugin itself runs inside OpenCode's runtime)
- A Kitesurf-compatible CDP endpoint — e.g. a surfbird container (`auth` or `raw` mode) or upstream `kitesurf`

## Install

### From npm

```bash
opencode plugin add opencode-control-surfbird-for-kitesurf
```

### From a local checkout

```jsonc
// opencode.json(c)
{
  "plugins": ["/path/to/opencode-control-surfbird-for-kitesurf"]
}
```

Local plugin directories need `package.json` with `name` + `exports` — this repo has both; run `npm install && npm run build` first so `lib/` exists.

## Configure

Set the engine endpoint and token via plugin `options` in `opencode.json(c)`, or environment variables.

```jsonc
{
  "plugins": [
    {
      "package": "opencode-control-surfbird-for-kitesurf",
      "options": {
        "endpoint": "http://127.0.0.1:8080",
        "tokenFile": "/home/me/.config/surfbird/token"
      }
    }
  ]
}
```

| Option | Env fallback | Default | Description |
|---|---|---|---|
| `endpoint` | `SURFBIRD_URL` → `SURFBIRD_ENDPOINT` → `KITESURF_URL` → `KITESURF_ENDPOINT` | `http://127.0.0.1:8080` | CDP endpoint: `http(s)://` base (auto → `ws://…/devtools/browser`) or full `ws(s)://` URL |
| `token` | `SURFBIRD_TOKEN` → `KITESURF_TOKEN` | — | Bearer token for surfbird `auth` mode; empty = no auth |
| `tokenFile` | — | — | Token file path; plaintext or `surfbird-v1:` machine-bound ciphertext (see below). Takes precedence over `token` |
| `requestTimeoutMs` | — | `120000` | Per-CDP-call timeout |
| `keepaliveMs` | — | `300000` | WS keepalive interval (must stay under the engine's 10-min idle limit) |
| `maxSessions` | — | `8` | Concurrent session browsers; excess evicts idle sessions only |
| `idleEvictMs` | — | `300000` | A session must be idle this long before `maxSessions` may evict it |
| `screenshotDir` | — | `$TMPDIR/surfbird` | Directory for screenshot/PDF output |
| `debugLog` | — | `false` | Append diagnostics to `~/.config/opencode/surfbird-debug.log` |

**Token file encryption** — keep the token out of `opencode.json`:

```bash
surfbird-token encrypt -o ~/.config/surfbird/token   # reads token from stdin
```

The ciphertext is bound to this machine's UUID — copying it elsewhere fails to decrypt. Plaintext files also work (permissions `0600` recommended).

## Usage

Each OpenCode session gets its own isolated browser: tabs, cookies and page state never leak between sessions, and deleting the session destroys its tabs. The agent calls `surfbird_*` tools directly — a bundled skill (`surfbird-control`) teaches the observe → act → verify workflow.

Try prompts like:

```
打开 https://zhuikan.com，在搜索框输入 "GitHub Trending Rank Radar" 并回车提交，
等结果页加载完成后告诉我最终停在哪个页面 URL，
然后用 surfbird_find 确认 "GitHub Trending Rank Radar" 在页面上出现了几次，
最后只截图结果页里的仓库标题区域元素。
```

Or in English:

```
Open https://zhuikan.com, type "GitHub Trending Rank Radar" into the search box
and press Enter, wait for results, tell me the final URL,
count occurrences with surfbird_find, then screenshot just the repo title area.
```

## Tools (28)

| Group | Tools |
|---|---|
| Session/browser | `surfbird_status` (incl. capability matrix), `surfbird_tabs`, `surfbird_new_tab`, `surfbird_select_tab`, `surfbird_close_tab`, `surfbird_cdp` |
| Navigation | `surfbird_navigate`, `surfbird_back`, `surfbird_forward`, `surfbird_reload` |
| Content | `surfbird_snapshot`, `surfbird_ax`, `surfbird_extract`, `surfbird_find`, `surfbird_links`, `surfbird_webmcp` |
| Interaction | `surfbird_click`, `surfbird_double_click`, `surfbird_fill`, `surfbird_type`, `surfbird_press_key`, `surfbird_scroll` |
| Wait/eval | `surfbird_wait` (load/domcontentloaded/url/text/visible/networkidle/stable/…), `surfbird_evaluate` |
| Output | `surfbird_screenshot` (viewport/clip/element/fullPage), `surfbird_pdf` |
| Diagnostics | `surfbird_console`, `surfbird_network` |

Screenshots and PDFs are written to `screenshotDir` (or `$TMPDIR/surfbird`) and returned as file attachments (`file://` URI) alongside the path.

## Engine limits

Kitesurf is a Boa + DOM-shim engine, not Chromium/V8. There are no JS dialogs, file upload/download, clipboard, drag/touch, or complete keyboard events — `surfbird_status` reports the machine-readable `capabilities` matrix. See the DSH repo's `docs/design.md` §8 for the full boundary list.

## Development

```bash
npm install
npm run build     # tsc → lib/
npm test          # unit tests (no engine needed)
npm run check     # plugin shape check
npm run test:live # live smoke — needs SURFBIRD_URL/TOKEN or a tunnel to a real engine
```

`src/cdp/` is the shared host-independent core — it must not import OpenCode/DSH/host packages; changes here must be manually synced to `dsh-control-surfbird-for-kitesurf` (and vice versa).

## License

[Apache-2.0](LICENSE)
