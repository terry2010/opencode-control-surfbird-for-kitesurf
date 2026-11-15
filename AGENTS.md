# opencode-control-surfbird-for-kitesurf 开发规范

OpenCode 插件（V2 `Plugin.define` API）：通过 Kitesurf CDP 协议控制浏览器引擎
（surfbird raw/auth、上游 kitesurf 均可）。工具前缀 `surfbird_*`，与 DSH 版一致。

姊妹项目：`dsh-control-surfbird-for-kitesurf`（DSH 版，同工具集）。

## 推送/发布规则（用户明确要求）

- **git push 和 npm publish 只在用户明确说"推"/"发版"时才执行**
- 平时所有改动只做本地 commit（不 push）
- 版本号 bump 也只在发布前做

## 开发流程

- `npm run build`（tsc → lib/）+ `npm test`（unit）+ `npm run check`（插件形态）全绿才能提交
- `test/live/` 需要真实引擎：`SURFBIRD_URL`+`SURFBIRD_TOKEN`（或 `KITESURF_ENDPOINT`+`KITESURF_TOKEN`）环境变量，
  或 `ssh -L 18080:127.0.0.1:8080 user@surfbird-host` 隧道到 surfbird 容器
- `npm run check` 只验证插件形态（default export 有 id+setup）；真实 CDP 行为靠 live 测试和 opencode 手动验证

## 共享代码约定（与 dsh-control-surfbird-for-kitesurf）

- `src/cdp/` 是两仓库共享的 host 无关核心——**整目录保持一致**，改动需人工同步到对面仓库（commit message 注明）
- `src/cdp/` 内**禁止** import `@opencode/*`、`@deepseek-ai/*`、pi 等 host 框架包；
  只依赖通用 npm 包（`ws`、`@mozilla/readability`、`turndown`）+ node builtins
- `src/find.ts`/`src/links.ts`/`src/tokenfile.ts` 同样是两边逐字共享的文件，改动要同步
- `src/tools.ts`/`src/index.ts`/`src/config.ts`/`src/skill.ts`/`src/schema.ts` 是各自 host 的薄壳，不共享

## 引擎边界（不要假设）

- `src/` 只用可擦除 TS 语法（Node type stripping：禁 enum/namespace/参数属性）；
  相对 import 写 `.ts` 扩展名（tsconfig 已配 allowImportingTsExtensions + rewriteRelativeImportExtensions）
- 每 WS 连接 = 一台独立浏览器（per-connection BrowserState），断线=所有 tab 蒸发
- 单 WS 60 分钟硬上限、10 分钟 idle 超时（keepalive 必须 <10min）
- Kitesurf 是 Boa + DOM shim 不是 V8/Chromium：无 JS dialog、无文件上传/下载、
  无剪贴板、无 drag/touch、KeyboardEvent 不完整、hit-testing partial
- 详见姊妹仓库 docs/design.md §8 能力边界清单——新工具先对照清单再承诺

## OpenCode 侧注意

- 工具注册走 `ctx.tool.transform` + `editor.add`；`input` 是标准 JSON Schema
  （`src/schema.ts` 把 DSH 风格 spec 投影过去）
- **插件工具默认 `codemode:true`——只在 `execute` 沙箱里以 `tools.*` 可见，
  模型按名直调会报 "No tool named …"。必须显式 `options:{codemode:false}`
  才是原生工具**（已在 registerSurfbirdTools 里设置，勿删）
- session 隔离键 = `context.sessionID`；`session.deleted` 事件触发浏览器断开
- 截图 ≤8MiB 返回 `data:` URI file part（`file://` 会炸会话历史回放，勿改回）；
  更大截图/PDF 只回落盘路径
- 配置 = plugin `options`（opencode.json）> env > 默认
- **设置 UI 有两处入口**：desktop `./gui-experimental`（Settings → Surfbird，
  Electron main IPC 写回 opencode.json(c)）；TUI `./tui`（`/surfbird-settings`
  命令 + 自定义 dialog，draft 本地暂存、Save 才写盘）
- **TUI 关键约束（对照 opencode 源码核实）**：写 opencode.json 会触发插件
  代际重建，旧 context 的 keymap layer 注销 → 已开 dialog 变死界面。
  因此 tui.tsx 里所有写盘路径都必须 toast + `dialog.clear()`，禁止在写盘后
  用旧 context 重开 dialog；未写盘的 prompt 流程才允许 reopen（draft 用
  solid-js/store 跨实例传递）
- `src/config-file.ts`/`src/config-patch.ts`/`src/token-store.ts` 是
  GUI main 与 TUI 共用的配置读写层，改动两边同时生效
- E2E 已验证：opencode.json plugins 本地路径 + options{endpoint,tokenFile}
  → surfbird_status/navigate/snapshot 真机全通（2026-11-15）
