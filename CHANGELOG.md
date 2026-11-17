# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-17

### Fixed

- Synced shared core from `dsh-control-surfbird-for-kitesurf` 0.6.0:
  `surfbird_extract` no longer crashes on ESM (`require` → `createRequire`),
  config hot-updates apply on an existing session's next (re)connect,
  `unreachable` errors are `retryable:false`, and the network/console
  counters report real values.
- `not_configured`/`unreachable` failures now attach a hint pointing the
  user at the surfbird settings instead of inviting model retry loops.

### Security

- `surfbird_navigate`/`surfbird_new_tab` accept only `http`/`https`/`about`
  URLs — `data:` was dropped (prompt-injection surface), and
  `surfbird_new_tab` previously applied no scheme check at all.

## [0.5.1] - 2026-11-23

### Fixed

- `skills/surfbird-control`: agents must quote tool-returned screenshot/PDF
  paths verbatim — models tended to abbreviate long `$TMPDIR` paths to
  `/var/folders/.../x.png`, which is unusable.

## [0.5.0] - 2026-11-23

### Added

- **Desktop settings page** via `./gui-experimental` (Settings → Surfbird):
  endpoint, token file with paste/import (machine-bound `surfbird-v1:`
  encryption, plaintext never touches opencode.json), session limits,
  timeouts, screenshot dir, debug log, and live `/json/version` probe —
  writes back through jsonc-parser comment-preserving patches with
  atomic tmp/rename writes.
- **TUI settings dialog** via `./tui` entry — `/surfbird-settings` slash
  command (also in command palette): same fields as desktop, draft +
  "Save changes" flow that survives prompt-dialog replacement, bilingual
  parity for field semantics.

### Fixed

- `surfbird_screenshot`/`surfbird_pdf` no longer emit `file://` content parts —
  OpenCode stores tool-result file parts verbatim and its LLM compiler rejects
  `file:` URIs, so one screenshot made every later turn of the session fail
  (anomalyco/opencode#62870). Screenshots now inline as `data:` URIs (≤8 MiB,
  larger captures return the path only); PDFs return the saved path only.
- TUI settings dialog froze (arrows/mouse unresponsive): `lib/tui.js` was
  emitted by tsc `react-jsx` which evaluates JSX expressions eagerly and
  breaks Solid signal subscriptions — now built with
  `esbuild-plugin-solid` universal transform (`build.tui.mjs`).
- `build.tui.mjs` `packages: 'external'` left `jsonc-parser` (devDep) as a
  bare external import in `lib/tui.js` — the TUI entry crashed on
  npm-installed plugins; npm deps are now inlined (host modules stay external).
- TUI paste/import token could write the token file at the old path while a
  pending `tokenFile` draft pointed config elsewhere — draft now wins.
- `setOptions` GUI IPC accepted arbitrary option keys — whitelisted to the
  `ResolvedConfig` surface.
- Tool JSON Schemas dropped nested `required` (e.g. screenshot `clip`
  x/y/width/height looked optional to the model).
- Numeric options (`maxSessions`/`idleEvictMs`/timeouts) clamped to DSH
  minimums — opencode.json has no schema validation.
- TUI: unhandled rejection on config discovery failure, silent Save before
  config file resolution; debug log path now honors `OPENCODE_CONFIG_DIR`/
  `XDG_CONFIG_HOME`.

### Changed

- Shared config/token layer extracted (`src/config-file.ts`,
  `src/config-patch.ts`, `src/token-store.ts`) — server, GUI main and TUI
  settings all read/write the same opencode.json plugin options.

## [0.1.0] - 2026-11-15

### Added

- Initial OpenCode (V2 `Plugin.define`) port of the surfbird browser-control
  plugin — 28 `surfbird_*` tools: tabs, navigation, semantic snapshot/ax,
  click/double_click/fill/type/press_key/scroll, wait (incl. networkidle/stable),
  evaluate, extract, find, links (dedupe=url|base), screenshot (viewport/clip/
  element/fullPage), pdf, console, network, webmcp, raw CDP, status+capabilities.
- Per-session browser isolation keyed on `context.sessionID`; `session.deleted`
  releases the browser (engine-side tabs destroyed).
- Screenshots/PDFs returned as `file://` content parts + saved under
  `screenshotDir`/`$TMPDIR/surfbird`.
- Bundled `surfbird-control` skill registered via `ctx.skill` (model-facing
  usage guide).
- Config via plugin `options` (opencode.json) with env fallbacks
  (`SURFBIRD_URL`/`SURFBIRD_ENDPOINT`/`KITESURF_URL`/`KITESURF_ENDPOINT`,
  `SURFBIRD_TOKEN`/`KITESURF_TOKEN`) and machine-bound `tokenFile` support
  (`surfbird-token` CLI).
- Shared host-independent `src/cdp/` core + `find.ts`/`links.ts`/`tokenfile.ts`
  kept byte-identical with `dsh-control-surfbird-for-kitesurf`.
