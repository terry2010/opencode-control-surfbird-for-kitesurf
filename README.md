# opencode-control-surfbird-for-kitesurf

[English](README.md) · [中文](i18n/README.zh-CN.md)

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

Paste prompts from the [Test prompts](#test-prompts) section to exercise every tool.

## Test prompts

Paste these into an OpenCode session to exercise every tool. All examples use [zhuikan.com](https://zhuikan.com) (a GitHub trending rank site with a search box and detail pages). Start with the first block.

**Session & browser**

| Prompt | Exercises |
|---|---|
| `Check the surfbird connection status` | `surfbird_status` (incl. `capabilities`) |
| `List all open tabs and tell me which is current` | `surfbird_tabs` |
| `Open https://zhuikan.com in a new tab` | `surfbird_new_tab` |
| `Open https://zhuikan.com but don't wait for it to load` | `surfbird_new_tab wait=none` |
| `Switch to the other tab, then close this one` | `surfbird_select_tab` + `surfbird_close_tab` |
| `Use raw CDP to get the current page's layout metrics` | `surfbird_cdp` |

**Navigation**

| Prompt | Exercises |
|---|---|
| `Navigate this tab to https://zhuikan.com` | `surfbird_navigate` |
| `Open https://zhuikan.com/repos/aws__aws-emulator, then go back and forward` | `surfbird_navigate` + `surfbird_back` + `surfbird_forward` |
| `Hard-reload zhuikan.com bypassing cache` | `surfbird_reload hard=true` |

**Content**

| Prompt | Exercises |
|---|---|
| `Give me a semantic snapshot of zhuikan.com` | `surfbird_snapshot` |
| `Show me zhuikan.com's accessibility tree instead` | `surfbird_ax` |
| `Open a repo detail page on zhuikan.com and extract the article as markdown` | `surfbird_extract` |
| `How many times does "GitHub" appear on zhuikan.com? Jump to the second match.` | `surfbird_find` |
| `List all the links on zhuikan.com` | `surfbird_links` |
| `Check whether zhuikan.com registered any WebMCP tools` | `surfbird_webmcp action=list` |

**Interaction** (zhuikan.com has a search box, board tabs and repo links)

| Prompt | Exercises |
|---|---|
| `On zhuikan.com, click the first repo link in the rankings and wait for the result` | `surfbird_click` + `surfbird_wait` |
| `Double-click the main heading on zhuikan.com` | `surfbird_double_click` |
| `On zhuikan.com, fill the search box with "GitHub Trending Rank Radar"` | `surfbird_fill` |
| `Type "rust" into zhuikan.com's search box` | `surfbird_type` |
| `On zhuikan.com, press Enter to submit the search` | `surfbird_press_key` |
| `Scroll down 1000 pixels on zhuikan.com to see more rankings` | `surfbird_scroll` |

**Wait & eval**

| Prompt | Exercises |
|---|---|
| `On zhuikan.com, wait until the page text contains "GitHub"` | `surfbird_wait state=text` |
| `Wait for zhuikan.com's network to go idle, then tell me the page title` | `surfbird_wait state=networkidle` + `surfbird_evaluate` |
| `Evaluate document.title and window.location.href on zhuikan.com` | `surfbird_evaluate` |

**Output**

| Prompt | Exercises |
|---|---|
| `Take a screenshot of zhuikan.com's viewport` | `surfbird_screenshot` |
| `Screenshot only the rankings area element` (grab its ref from snapshot first) | `surfbird_screenshot target={ref}` |
| `Take a full-page screenshot of zhuikan.com` | `surfbird_screenshot fullPage=true` |
| `Export zhuikan.com as a PDF` | `surfbird_pdf` |

**Diagnostics**

| Prompt | Exercises |
|---|---|
| `Show me console errors from zhuikan.com` | `surfbird_console only=errors` |
| `List the network requests zhuikan.com made` | `surfbird_network` |
| `Get the response body of zhuikan.com's first request` | `surfbird_network action=body` |

**Multi-step walkthrough** — one prompt that chains many tools (this is *not* a single-tool test; it exercises the whole observe → act → verify loop):

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

Expected chain: `navigate` → `snapshot`(find searchbox ref) → `fill` → `press_key enter` → `wait`(url/text/networkidle) → `evaluate`/`snapshot` → `find` → `screenshot target=…`. This is the real-world flow that exercises ref handling, controlled-input events, page-settle waits and element screenshots in one go.

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
