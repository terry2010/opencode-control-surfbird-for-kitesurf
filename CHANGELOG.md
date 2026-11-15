# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `surfbird_screenshot`/`surfbird_pdf` no longer emit `file://` content parts —
  OpenCode stores tool-result file parts verbatim and its LLM compiler rejects
  `file:` URIs, so one screenshot made every later turn of the session fail
  (anomalyco/opencode#62870). Screenshots now inline as `data:` URIs (≤8 MiB,
  larger captures return the path only); PDFs return the saved path only.

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
