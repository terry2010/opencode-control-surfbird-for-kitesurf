# opencode-control-surfbird-for-kitesurf

[English](../README.md) · [中文](README.zh-CN.md)

[OpenCode](https://opencode.ai/) 插件：通过 Chrome DevTools Protocol（CDP）让 AI agent 像人一样完整操控 [Kitesurf](https://github.com/cloudflare/kitesurf) 浏览器引擎。兼容自托管 [surfbird](https://github.com/terry2010/surfbird) 发行版（raw 或 token-auth 模式）及上游 Kitesurf 部署。暴露 **28 个 `surfbird_*` 工具**：标签页管理、导航、语义化无障碍快照、点击/输入/填充、等待、JavaScript 执行、截图、PDF 导出、console/network 检查、WebMCP，以及原始 CDP 逃生舱——每个 agent 会话对应一个隔离浏览器。

姊妹项目：[`dsh-control-surfbird-for-kitesurf`](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf)——同一套工具的 DSH（DeepSeek Harness）版本。两者共享 host 无关的 `src/cdp/` 核心。

## 环境要求

- OpenCode v2（`@opencode/plugin` ^2.0）
- Node.js >= 22.18（用于 `surfbird-token` CLI；插件本身运行在 OpenCode 运行时内）
- 一个兼容 Kitesurf 的 CDP 端点——例如 surfbird 容器（`auth` 或 `raw` 模式）或上游 `kitesurf`

## 安装

### 从 npm

```bash
opencode plugin add opencode-control-surfbird-for-kitesurf
```

### 从本地检出

```jsonc
// opencode.json(c)
{
  "plugins": ["/path/to/opencode-control-surfbird-for-kitesurf"]
}
```

本地插件目录需要 `package.json` 含 `name` + `exports`——本仓库两者都有；先运行 `npm install && npm run build` 让 `lib/` 存在。

## 配置

**OpenCode 桌面端：** 打开 **Settings → Surfbird**——端点、token 文件（粘贴/导入会加密为机器绑定的 `surfbird-v1:` 文件，绝不写入 `opencode.json`）、会话上限、超时和 `/json/version` 实时探活都在这里。改动会写回全局 `opencode.json(c)` 并热重载插件。

**OpenCode TUI：** 运行 `/surfbird-settings`（或在命令面板找 *Surfbird settings*）——同样的字段加一个 Save 行；编辑先暂存在本地，保存时写入 `opencode.json(c)`，随后插件热重载。

**任意客户端（TUI/headless/CI）：** 通过 `opencode.json(c)` 中的插件 `options` 或环境变量设置。

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

| 选项 | 环境变量回退 | 默认值 | 说明 |
|---|---|---|---|
| `endpoint` | `SURFBIRD_URL` → `SURFBIRD_ENDPOINT` → `KITESURF_URL` → `KITESURF_ENDPOINT` | `http://127.0.0.1:8080` | CDP 端点：`http(s)://` 基址（自动 → `ws://…/devtools/browser`）或完整 `ws(s)://` URL |
| `token` | `SURFBIRD_TOKEN` → `KITESURF_TOKEN` | — | surfbird `auth` 模式的 Bearer token；留空 = 无认证 |
| `tokenFile` | — | — | Token 文件路径；明文或 `surfbird-v1:` 机器绑定密文（见下）。优先于 `token` |
| `requestTimeoutMs` | — | `120000` | 单次 CDP 调用超时 |
| `keepaliveMs` | — | `300000` | WS keepalive 间隔（必须低于引擎 10 分钟 idle 上限） |
| `maxSessions` | — | `8` | 并发会话浏览器数；超出时只驱逐空闲会话 |
| `idleEvictMs` | — | `300000` | 会话需空闲这么久才可能被 `maxSessions` 驱逐 |
| `screenshotDir` | — | `$TMPDIR/surfbird` | 截图/PDF 输出目录 |
| `debugLog` | — | `false` | 追加诊断日志到 `~/.config/opencode/surfbird-debug.log` |

**Token 文件加密**——把 token 留在 `opencode.json` 之外：

```bash
surfbird-token encrypt -o ~/.config/surfbird/token   # 从 stdin 读 token
```

密文绑定本机 UUID——拷到别的机器无法解密。明文文件同样可用（建议权限 `0600`）。

## 使用方式

每个 OpenCode 会话拥有独立隔离的浏览器：标签页、cookie 和页面状态绝不跨会话泄漏，删除会话即销毁其标签页。agent 直接调用 `surfbird_*` 工具——内置 skill（`surfbird-control`）教授 observe → act → verify 工作流。

用 [测试提示词](#测试提示词) 一节的 prompt 逐个工具验证。

## 测试提示词

把这些 prompt 粘到 OpenCode 会话里即可覆盖所有工具。示例统一使用 [zhuikan.com](https://zhuikan.com)（一个带搜索框和详情页的 GitHub 趋势榜站）。从第一组开始。

**会话与浏览器**

| Prompt | 覆盖工具 |
|---|---|
| `Check the surfbird connection status` | `surfbird_status`（含 `capabilities`） |
| `List all open tabs and tell me which is current` | `surfbird_tabs` |
| `Open https://zhuikan.com in a new tab` | `surfbird_new_tab` |
| `Open https://zhuikan.com but don't wait for it to load` | `surfbird_new_tab wait=none` |
| `Switch to the other tab, then close this one` | `surfbird_select_tab` + `surfbird_close_tab` |
| `Use raw CDP to get the current page's layout metrics` | `surfbird_cdp` |

**导航**

| Prompt | 覆盖工具 |
|---|---|
| `Navigate this tab to https://zhuikan.com` | `surfbird_navigate` |
| `Open https://zhuikan.com/repos/aws__aws-emulator, then go back and forward` | `surfbird_navigate` + `surfbird_back` + `surfbird_forward` |
| `Hard-reload zhuikan.com bypassing cache` | `surfbird_reload hard=true` |

**内容**

| Prompt | 覆盖工具 |
|---|---|
| `Give me a semantic snapshot of zhuikan.com` | `surfbird_snapshot` |
| `Show me zhuikan.com's accessibility tree instead` | `surfbird_ax` |
| `Open a repo detail page on zhuikan.com and extract the article as markdown` | `surfbird_extract` |
| `How many times does "GitHub" appear on zhuikan.com? Jump to the second match.` | `surfbird_find` |
| `List all the links on zhuikan.com` | `surfbird_links` |
| `Check whether zhuikan.com registered any WebMCP tools` | `surfbird_webmcp action=list` |

**交互**（zhuikan.com 有搜索框、榜单 tab 和仓库链接）

| Prompt | 覆盖工具 |
|---|---|
| `On zhuikan.com, click the first repo link in the rankings and wait for the result` | `surfbird_click` + `surfbird_wait` |
| `Double-click the main heading on zhuikan.com` | `surfbird_double_click` |
| `On zhuikan.com, fill the search box with "GitHub Trending Rank Radar"` | `surfbird_fill` |
| `Type "rust" into zhuikan.com's search box` | `surfbird_type` |
| `On zhuikan.com, press Enter to submit the search` | `surfbird_press_key` |
| `Scroll down 1000 pixels on zhuikan.com to see more rankings` | `surfbird_scroll` |

**等待与执行**

| Prompt | 覆盖工具 |
|---|---|
| `On zhuikan.com, wait until the page text contains "GitHub"` | `surfbird_wait state=text` |
| `Wait for zhuikan.com's network to go idle, then tell me the page title` | `surfbird_wait state=networkidle` + `surfbird_evaluate` |
| `Evaluate document.title and window.location.href on zhuikan.com` | `surfbird_evaluate` |

**输出**

| Prompt | 覆盖工具 |
|---|---|
| `Take a screenshot of zhuikan.com's viewport` | `surfbird_screenshot` |
| `Screenshot only the rankings area element`（先从 snapshot 拿它的 ref） | `surfbird_screenshot target={ref}` |
| `Take a full-page screenshot of zhuikan.com` | `surfbird_screenshot fullPage=true` |
| `Export zhuikan.com as a PDF` | `surfbird_pdf` |

**诊断**

| Prompt | 覆盖工具 |
|---|---|
| `Show me console errors from zhuikan.com` | `surfbird_console only=errors` |
| `List the network requests zhuikan.com made` | `surfbird_network` |
| `Get the response body of zhuikan.com's first request` | `surfbird_network action=body` |

**多步实战**——一条 prompt 串起多个工具（*不是*单工具测试，而是验证完整 observe → act → verify 闭环）：

```
打开 https://zhuikan.com，在搜索框输入 "GitHub Trending Rank Radar" 并回车提交，
等结果页加载完成后告诉我最终停在哪个页面 URL，
然后用 surfbird_find 确认 "GitHub Trending Rank Radar" 在页面上出现了几次，
最后只截图结果页里的仓库标题区域元素。
```

英文版：

```
Open https://zhuikan.com, type "GitHub Trending Rank Radar" into the search box
and press Enter, wait for results, tell me the final URL,
count occurrences with surfbird_find, then screenshot just the repo title area.
```

预期链路：`navigate` → `snapshot`（找搜索框 ref）→ `fill` → `press_key enter` → `wait`（url/text/networkidle）→ `evaluate`/`snapshot` → `find` → `screenshot target=…`。这是真实场景流程，一条 prompt 覆盖 ref 处理、受控输入事件、页面稳定等待和元素截图。

## 工具（28 个）

| 分组 | 工具 |
|---|---|
| 会话/浏览器 | `surfbird_status`（含能力矩阵）、`surfbird_tabs`、`surfbird_new_tab`、`surfbird_select_tab`、`surfbird_close_tab`、`surfbird_cdp` |
| 导航 | `surfbird_navigate`、`surfbird_back`、`surfbird_forward`、`surfbird_reload` |
| 内容 | `surfbird_snapshot`、`surfbird_ax`、`surfbird_extract`、`surfbird_find`、`surfbird_links`、`surfbird_webmcp` |
| 交互 | `surfbird_click`、`surfbird_double_click`、`surfbird_fill`、`surfbird_type`、`surfbird_press_key`、`surfbird_scroll` |
| 等待/执行 | `surfbird_wait`（load/domcontentloaded/url/text/visible/networkidle/stable/…）、`surfbird_evaluate` |
| 输出 | `surfbird_screenshot`（viewport/clip/element/fullPage）、`surfbird_pdf` |
| 诊断 | `surfbird_console`、`surfbird_network` |

截图写入 `screenshotDir`（或 `$TMPDIR/surfbird`）并以内联图片附件返回（data URI，≤8 MiB——更大的截图只回路径）；PDF 只返回保存路径。

## 引擎边界

Kitesurf 是 Boa + DOM shim 引擎，不是 Chromium/V8。没有 JS 弹窗、文件上传/下载、剪贴板、拖拽/触摸、完整键盘事件——`surfbird_status` 会返回机器可读的 `capabilities` 矩阵。完整边界清单见 DSH 仓库 `docs/design.md` §8。

## 开发

```bash
npm install
npm run build     # tsc → lib/
npm test          # 单元测试（无需引擎）
npm run check     # 插件形态检查
npm run test:live # live 冒烟——需要 SURFBIRD_URL/TOKEN 或到真实引擎的隧道
```

`src/cdp/` 是共享的 host 无关核心——禁止 import OpenCode/DSH/宿主框架包；此处的改动必须手动同步到 `dsh-control-surfbird-for-kitesurf`（反之亦然）。

## 许可证

[Apache-2.0](../LICENSE)

## 相关项目

- [dsh-control-surfbird-for-kitesurf](https://github.com/terry2010/dsh-control-surfbird-for-kitesurf) —— 姊妹插件：同一套 28 个 `surfbird_*` 工具的 [DSH](https://www.deepseek.com/)（DeepSeek Harness）版本；与本仓库共享 host 无关的 `src/cdp/` 核心
- [pi-control-surfbird-for-kitesurf](https://github.com/terry2010/pi-control-surfbird-for-kitesurf) —— 姊妹插件：同一套 28 个 `surfbird_*` 工具的 [Pi](https://pi.dev/) coding agent 版本；与本仓库共享 host 无关的 `src/cdp/` 核心
- [surfbird](https://github.com/terry2010/surfbird) —— Kitesurf 的自托管 Docker 发行版，含 token 认证、REST 代理和 MCP 服务
- [Kitesurf](https://github.com/cloudflare/kitesurf) —— Cloudflare 的实验性浏览器引擎，为 AI agent 而生；跑在 Workers 上，讲 CDP
- [OpenCode](https://opencode.ai/) —— 本插件所扩展的 agent 客户端
