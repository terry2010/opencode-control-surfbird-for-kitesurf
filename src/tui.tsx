/** @jsxImportSource @opentui/solid */
/**
 * src/tui.tsx — TUI 插件入口：Surfbird 设置对话框。
 *
 * TUI 没有 SettingsPage 挂载点（内置 Settings 写死且只管 cli.json），
 * 按 OpenCode TUI 插件规范自带入口：命令面板 /surfbird-settings 打开
 * 自定义 dialog。数据源与桌面 GUI 一致——写回 opencode.json(c) 的插件
 * options（config watcher 触发插件热更），token 经 storeToken 加密落盘，
 * 绝不写入配置文件。
 *
 * 关键约束（对照宿主源码核实）：
 * - 字段编辑只改本地 draft，"Save changes" 才落盘——每次写配置都会触发
 *   插件代际重建（deactivate→setup），旧 context 的 keymap layer 随即
 *   注销，已打开的 dialog 会变成"能看不能按"的死界面。因此写盘成功后
 *   一律 toast + 关 dialog，由用户重开；prompt 取消等未写盘路径才重开。
 * - dialog.show 内部 replace 会重置 size/centered——必须 show 之后 set。
 * - prompt 同样是 replace 语义，会顶掉本 dialog，故编辑流程结束后重开。
 * - 本文件必须经 esbuild-plugin-solid（build.tui.mjs）产出 lib/tui.js，
 *   不能走 tsc 的 react-jsx emit——后者把 JSX 内表达式求值为静态值，
 *   信号更新不重绘（见 build.tui.mjs 注释）。
 */
import { Plugin } from '@opencode/plugin/tui'
import type { Context } from '@opencode/plugin/tui/context'
import { For, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { SetStoreFunction, Store } from 'solid-js/store'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configDirectory, findPluginConfig, writePluginOptions, type PluginConfigLocation } from './config-file.ts'
import { endpointHttpBase, resolveConfig } from './config.ts'
import { storeToken } from './token-store.ts'

type Options = Record<string, unknown>

/** 待保存补丁：key → 写入值（null 表示删除该 option 回退 env/默认）。 */
type Draft = Record<string, unknown>
type DraftState = [Store<Draft>, SetStoreFunction<Draft>]

type Row =
  | { kind: 'section'; title: string }
  | { kind: 'text'; key: 'endpoint' | 'tokenFile' | 'screenshotDir'; title: string; desc: string; placeholder: string }
  | { kind: 'number'; key: 'maxSessions' | 'idleEvictMs' | 'requestTimeoutMs' | 'keepaliveMs'; title: string; desc: string; min: number }
  | { kind: 'toggle'; key: 'debugLog'; title: string; desc: string }
  | { kind: 'action'; id: 'save' | 'pasteToken' | 'importTokenFile' | 'testConnection'; title: string; desc: string }

const DEFAULTS = {
  endpoint: 'http://127.0.0.1:8080',
  requestTimeoutMs: 120000,
  keepaliveMs: 300000,
  maxSessions: 8,
  idleEvictMs: 300000,
} as const

const ROWS: Row[] = [
  { kind: 'section', title: 'Connection' },
  { kind: 'text', key: 'endpoint', title: 'Endpoint', desc: 'Kitesurf CDP endpoint: http(s):// base or full ws(s):// URL', placeholder: DEFAULTS.endpoint },
  { kind: 'action', id: 'testConnection', title: 'Test connection', desc: 'Probe /json/version on the configured endpoint' },
  { kind: 'section', title: 'Authentication' },
  { kind: 'text', key: 'tokenFile', title: 'Token file', desc: 'Path to a token file (plaintext or surfbird-v1: encrypted). Empty falls back to SURFBIRD_TOKEN env', placeholder: '~/.config/opencode/surfbird-token' },
  { kind: 'action', id: 'pasteToken', title: 'Paste token…', desc: 'Encrypt and store a Bearer token in the token file (never in opencode.json)' },
  { kind: 'action', id: 'importTokenFile', title: 'Import token file…', desc: 'Read a token file and store it encrypted in the token file path' },
  { kind: 'section', title: 'Session limits' },
  { kind: 'number', key: 'maxSessions', title: 'Max sessions', desc: 'Concurrent session browsers; excess evicts idle sessions only', min: 1 },
  { kind: 'number', key: 'idleEvictMs', title: 'Idle evict (ms)', desc: 'A session must be idle this long before maxSessions may evict it', min: 60000 },
  { kind: 'section', title: 'Timeouts' },
  { kind: 'number', key: 'requestTimeoutMs', title: 'Request timeout (ms)', desc: 'Per-CDP-call timeout', min: 1000 },
  { kind: 'number', key: 'keepaliveMs', title: 'Keepalive (ms)', desc: 'WS keepalive interval; must stay under the engine 10-min idle limit', min: 30000 },
  { kind: 'section', title: 'Output' },
  { kind: 'text', key: 'screenshotDir', title: 'Screenshot dir', desc: 'Directory for screenshot/PDF output; empty uses $TMPDIR/surfbird', placeholder: '$TMPDIR/surfbird' },
  { kind: 'toggle', key: 'debugLog', title: 'Debug log', desc: 'Append diagnostics to ~/.config/opencode/surfbird-debug.log' },
  { kind: 'action', id: 'save', title: 'Save changes', desc: 'Write pending edits to opencode.json — the plugin reloads to apply them' },
]

const EDITABLE = ROWS.filter((r): r is Exclude<Row, { kind: 'section' }> => r.kind !== 'section')
const EDITABLE_INDEX = new Map<Row, number>(EDITABLE.map((r, i) => [r, i]))
type EditableRow = Exclude<Row, { kind: 'section' }>
type FieldRow = Exclude<EditableRow, { kind: 'action' | 'toggle' }>

function strOpt(options: Options, key: string): string | undefined {
  const v = options[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function numOpt(options: Options, key: keyof typeof DEFAULTS, d: number): number {
  const v = options[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

type ProbeStatus = {
  reachable: boolean
  product: string
  protocolVersion: string
  probeStatus: number
  probeError: string
  configSource: string
  tokenSet: boolean
  tokenFile: string
  tokenFileEncrypted: boolean
  tokenFileError: string
}

function SurfbirdSettings(props: {
  context: Context
  initialCursor: number
  draftState: DraftState
  onReopen: (cursor: number, draftState: DraftState) => void
}) {
  const context = props.context
  const theme = context.theme
  const [loc, setLoc] = createSignal<PluginConfigLocation>({ file: '', options: {} })
  const [cursor, setCursor] = createSignal(Math.min(props.initialCursor, EDITABLE.length - 1))
  const [status, setStatus] = createSignal<ProbeStatus | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [draft, setDraft] = props.draftState

  const options = () => loc().options
  const editable = () => EDITABLE[cursor()]!
  const dirtyCount = () => Object.keys(draft).length

  const probe = async () => {
    setBusy(true)
    try {
      const c = resolveConfig(options())
      const out: ProbeStatus = {
        reachable: false, product: '', protocolVersion: '', probeStatus: 0, probeError: '',
        configSource: c.configSource, tokenSet: !!c.token, tokenFile: c.tokenFile ?? '',
        tokenFileEncrypted: c.tokenFileEncrypted === true, tokenFileError: c.tokenFileError ?? '',
      }
      const base = endpointHttpBase(c.endpoint)
      if (!base) {
        out.probeError = 'endpoint is not a valid URL'
      } else {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 4000)
        try {
          const headers: Record<string, string> = {}
          if (c.token) headers.authorization = `Bearer ${c.token}`
          const res = await fetch(`${base}/json/version`, { signal: ctrl.signal, headers })
          out.probeStatus = res.status
          if (res.ok) {
            const v = (await res.json()) as Record<string, unknown>
            out.reachable = true
            out.product = String(v.Browser ?? v.product ?? '')
            out.protocolVersion = String(v['Protocol-Version'] ?? v.protocolVersion ?? '')
          } else {
            out.probeError = `HTTP ${res.status}`
          }
        } catch (e) {
          out.probeError = e instanceof Error ? e.message : String(e)
        } finally {
          clearTimeout(timer)
        }
      }
      setStatus(out)
    } finally {
      setBusy(false)
    }
  }

  // 首次打开：定位 entry 所在配置文件（项目级优先）并探活
  void findPluginConfig(context.location?.directory)
    .then(async (l) => {
      setLoc(l)
      await probe()
    })
    .catch((e) => {
      setStatus({
        reachable: false, product: '', protocolVersion: '', probeStatus: 0,
        probeError: `config discovery failed: ${e instanceof Error ? e.message : String(e)}`,
        configSource: '', tokenSet: false, tokenFile: '', tokenFileEncrypted: false, tokenFileError: '',
      })
    })

  const toast = (message: string, variant: 'info' | 'success' | 'warning' | 'error' = 'info') =>
    context.ui.toast.show({ message, variant })

  /** 写盘成功 = 插件代际重建在即——toast 提示后关 dialog，避免死界面。 */
  const commit = async (patch: Options, message: string, variant: 'success' | 'warning' = 'success') => {
    const file = loc().file
    if (!file) {
      toast('Config file not resolved yet — try again', 'warning')
      return
    }
    try {
      await writePluginOptions(file, patch)
      toast(`${message} — reopen with /surfbird-settings`, variant)
      context.ui.dialog.clear()
    } catch (e) {
      toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const reopen = () => props.onReopen(cursor(), props.draftState)

  /** 文本/数字行：prompt 顶掉本 dialog（未写盘、不触发重载），结束后带 draft 重开。 */
  const editRow = async (row: FieldRow) => {
    const current = editableValue(row)
    const input = await context.ui.dialog.prompt({
      title: row.title,
      description: row.desc,
      placeholder: row.kind === 'text' ? row.placeholder : String(numOpt(options(), row.key, DEFAULTS[row.key])),
      value: current || undefined,
    })
    reopen()
    if (input === undefined) return
    const trimmed = input.trim()
    if (row.kind === 'number') {
      if (!trimmed) {
        setDraft(row.key, null)
        return
      }
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < row.min) {
        toast(`Invalid number (min ${row.min})`, 'error')
        return
      }
      setDraft(row.key, n)
      return
    }
    setDraft(row.key, trimmed === '' ? null : trimmed)
  }

  /** 字段当前生效值（draft 优先），供 prompt 预填与右列展示。 */
  const fieldValue = (row: Exclude<EditableRow, { kind: 'action' }>): string => {
    if (row.kind === 'toggle') {
      const d = draft.debugLog
      if (typeof d === 'boolean') return d ? 'ON' : 'OFF'
      return options().debugLog === true ? 'ON' : 'OFF'
    }
    return editableValue(row)
  }

  const editableValue = (row: FieldRow): string => {
    if (row.kind === 'number') {
      const d = draft[row.key]
      if (d === null) return ''
      if (typeof d === 'number') return String(d)
      return String(numOpt(options(), row.key, DEFAULTS[row.key]))
    }
    const d = draft[row.key]
    if (d === null) return ''
    if (typeof d === 'string') return d
    if (row.key === 'endpoint') return strOpt(options(), row.key) ?? DEFAULTS.endpoint
    return strOpt(options(), row.key) ?? ''
  }

  // draft 里待保存的 tokenFile 优先——否则 token 写进旧文件而补丁指向新路径。
  const tokenTarget = () => {
    const d = draft.tokenFile
    if (typeof d === 'string' && d.trim()) return d.trim()
    if (d === null) return join(configDirectory(), 'surfbird-token')
    return strOpt(options(), 'tokenFile') ?? join(configDirectory(), 'surfbird-token')
  }

  /** token 落盘 + （必要时）把 tokenFile 写进同一笔 options 补丁，合并 pending draft 一次写。 */
  const afterTokenImport = (result: { path: string; encrypted: boolean }) => {
    const patch: Options = { ...draft }
    if (!strOpt(options(), 'tokenFile') && !('tokenFile' in draft)) patch.tokenFile = result.path
    const needsWrite = Object.keys(patch).length > 0
    if (!needsWrite) {
      toast(
        result.encrypted ? `Token saved → ${result.path}` : `Token saved UNENCRYPTED (no machine id) → ${result.path}`,
        result.encrypted ? 'success' : 'warning',
      )
      return
    }
    void commit(
      patch,
      result.encrypted ? `Token saved → ${result.path}` : `Token saved UNENCRYPTED → ${result.path}`,
      result.encrypted ? 'success' : 'warning',
    )
  }

  const pasteToken = async () => {
    const value = await context.ui.dialog.prompt({
      title: 'Paste surfbird token',
      description: 'Bearer token or surfbird-v1: blob — encrypted with this machine\'s UUID into the token file. Visible while typing (TUI prompt has no masking).',
      placeholder: 'token or surfbird-v1:…',
    })
    reopen()
    if (!value) return
    try {
      afterTokenImport(storeToken(value, tokenTarget()))
    } catch (e) {
      toast(`Token save failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const importTokenFile = async () => {
    const file = await context.ui.dialog.prompt({
      title: 'Import token from file',
      description: 'Path to a file containing the Bearer token or a surfbird-v1: blob.',
      placeholder: '/path/to/token.txt',
    })
    reopen()
    if (!file) return
    try {
      const content = await readFile(file.trim(), 'utf8')
      afterTokenImport(storeToken(content, tokenTarget()))
    } catch (e) {
      toast(`Cannot read token file: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const save = () => {
    if (dirtyCount() === 0) {
      toast('No changes to save', 'info')
      return
    }
    void commit({ ...draft }, `Saved ${dirtyCount()} change${dirtyCount() === 1 ? '' : 's'}`)
  }

  const activate = (row: EditableRow) => {
    if (row.kind === 'toggle') {
      const current = typeof draft.debugLog === 'boolean' ? draft.debugLog : options().debugLog === true
      setDraft('debugLog', !current)
      return
    }
    if (row.kind === 'action') {
      if (row.id === 'save') save()
      if (row.id === 'testConnection') void probe()
      if (row.id === 'pasteToken') void pasteToken()
      if (row.id === 'importTokenFile') void importTokenFile()
      return
    }
    void editRow(row)
  }

  // dialog 打开期间宿主推入 modal 输入模式——组件内注册 mode:'modal'
  // keymap layer 处理导航（组件卸载自动注销）。market 插件验证过的
  // 派发路径；useKeyboard 在 2.3.0 实测收不到 keypress（事件被 keymap
  // 拦截派发，raw 订阅无回调），故不混用。
  const up = () => setCursor((c) => (c + EDITABLE.length - 1) % EDITABLE.length)
  const down = () => setCursor((c) => (c + 1) % EDITABLE.length)
  const activateCurrent = () => activate(editable())
  context.keymap.layer(() => ({
    mode: 'modal',
    commands: [
      { bind: 'up', run: up },
      { bind: 'k', run: up },
      { bind: 'down', run: down },
      { bind: 'j', run: down },
      { bind: 'return', run: activateCurrent },
      { bind: 'space', run: activateCurrent },
    ],
  }))

  const value = (row: EditableRow): string => {
    if (row.kind === 'action') {
      if (row.id === 'save') return dirtyCount() > 0 ? `${dirtyCount()} pending` : ''
      if (row.id === 'testConnection') return busy() ? '…' : ''
      return ''
    }
    return fieldValue(row)
  }

  const statusLines = () => {
    const s = status()
    if (!s) return busy() ? ['checking…'] : []
    const reach = s.reachable
      ? `connected — ${s.product || 'engine'}${s.protocolVersion ? ` (CDP ${s.protocolVersion})` : ''}`
      : `unreachable${s.probeStatus ? ` — HTTP ${s.probeStatus}` : ''}${s.probeError ? ` — ${s.probeError}` : ''}`
    return [
      reach,
      [
        s.configSource ? `config: ${s.configSource}` : '',
        s.tokenSet ? 'token: set' : 'token: none',
        s.tokenFile ? `tokenFile: ${s.tokenFile}${s.tokenFileEncrypted ? ' (encrypted)' : ''}` : '',
        s.tokenFileError ? `tokenFile error: ${s.tokenFileError}` : '',
      ].filter(Boolean).join(' · '),
      loc().file ? `file: ${loc().file}` : '',
    ].filter(Boolean)
  }

  return (
    <box flexDirection="column">
      <box paddingLeft={2} paddingRight={2} paddingTop={1} flexDirection="column">
        <text fg={theme.text.base}>Surfbird settings{dirtyCount() > 0 ? ` — ${dirtyCount()} unsaved` : ''}</text>
        <For each={statusLines()}>{(line) => <text fg={theme.text.muted}>{line}</text>}</For>
      </box>
      <box paddingLeft={2} paddingRight={2} flexDirection="column">
        <For each={ROWS}>
          {(row) =>
            row.kind === 'section' ? (
              <text fg={theme.text.muted}>{'  '}{row.title}</text>
            ) : (
              <box
                flexDirection="row"
                justifyContent="space-between"
                backgroundColor={EDITABLE_INDEX.get(row) === cursor() ? theme.background.raised.base : undefined}
                onMouseOver={() => setCursor(EDITABLE_INDEX.get(row)!)}
                onMouseDown={(ev: { stopPropagation(): void }) => {
                  ev.stopPropagation()
                  activate(row)
                }}
              >
                <text fg={EDITABLE_INDEX.get(row) === cursor() ? theme.text.base : theme.text.muted}>
                  {EDITABLE_INDEX.get(row) === cursor() ? '▌ ' : '  '}{row.title}
                </text>
                <text fg={theme.text.muted}>{value(row)}</text>
              </box>
            )
          }
        </For>
      </box>
      <box paddingLeft={2} paddingTop={1}>
        <text fg={theme.text.muted}>↑↓ select · enter edit/toggle · esc close</text>
      </box>
    </box>
  )
}

function openSettings(context: Context, cursor = 0, draftState?: DraftState) {
  const state = draftState ?? createStore<Draft>({})
  context.ui.dialog.show(
    () => (
      <SurfbirdSettings
        context={context}
        initialCursor={cursor}
        draftState={state}
        onReopen={(c, d) => openSettings(context, c, d)}
      />
    ),
    () => {},
  )
  // dialog.show 内部 replace 会把 size/centered 重置——必须在 show 之后 set
  context.ui.dialog.set({ size: 'large', centered: true })
}

export default Plugin.define({
  id: 'surfbird',
  setup(context) {
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'surfbird.settings',
          title: 'Surfbird settings',
          description: 'Endpoint, token file, session limits and timeouts for the surfbird_* tools',
          group: 'Plugin',
          palette: true,
          slash: { name: 'surfbird-settings' },
          suggested: true,
          run: () => openSettings(context),
        },
      ],
    }))
  },
})
