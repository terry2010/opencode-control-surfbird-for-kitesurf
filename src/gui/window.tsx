/**
 * opencode-control-surfbird-for-kitesurf — GUI 插件的窗口入口。
 *
 * 在 Settings > Surfbird 渲染设置页。页面挂载时通过 Ipc 从 main 进程读
 * 配置文件真值（不靠 ctx.options 快照：配置变更后宿主未必立刻重载 GUI 插件）。
 * 控件点击先乐观更新本地 store 再提交；提交失败回滚并 toast。
 * token 只经 secret prompt / 文件导入进入 main 进程加密落盘，不回显明文。
 */
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { JSX } from 'solid-js'
import { SettingsPage } from '@opencode/plugin/gui'
import type { Plugin } from '@opencode/plugin/gui'
import { ConfigIpc } from './contract.ts'

type Options = Record<string, unknown>
type StatusInfo = {
  configSource: string
  endpoint: string
  tokenSet: boolean
  tokenFile: string
  tokenFileEncrypted: boolean
  tokenFileError: string
  reachable: boolean
  product: string
  protocolVersion: string
  probeStatus: number
  probeError: string
}

const DEFAULTS = {
  endpoint: 'http://127.0.0.1:8080',
  requestTimeoutMs: 120000,
  keepaliveMs: 300000,
  maxSessions: 8,
  idleEvictMs: 300000,
} as const

const setup: Plugin.Setup = (ctx) => {
  const ipc = ctx.main(ConfigIpc)
  const [opts, setOpts] = createStore<Options>((ctx.options ?? {}) as Options)
  const [status, setStatus] = createSignal<StatusInfo | null>(null)
  const [statusBusy, setStatusBusy] = createSignal(false)

  const optStr = (key: string): string | undefined => {
    const v = opts[key]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  }
  const optNum = (key: string, d: number): number => {
    const v = opts[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }

  // 配置变更会重载 GUI 插件并重挂页面；ctx.options 此时已是新值，直接渲染，
  // getOptions 再后台校准（网关 Loader 会造成每次写入后的可见闪屏）。
  void ipc
    .getOptions({ signal: ctx.signal })
    .then((options) => {
      for (const k of Object.keys(opts)) delete opts[k]
      Object.assign(opts, options)
    })
    .catch(() => {})

  const refreshStatus = () => {
    setStatusBusy(true)
    void ipc
      .status({ signal: ctx.signal })
      .then(setStatus)
      .catch((cause: unknown) =>
        setStatus({
          configSource: '', endpoint: '', tokenSet: false, tokenFile: '', tokenFileEncrypted: false,
          tokenFileError: '', reachable: false, product: '', protocolVersion: '', probeStatus: 0,
          probeError: String(cause),
        }),
      )
      .finally(() => setStatusBusy(false))
  }
  refreshStatus()

  const commit = (patch: Options, undo?: () => void) => {
    void ipc.setOptions(patch, { signal: ctx.signal }).catch((cause: unknown) => {
      undo?.()
      ctx.toast.show({ title: ctx.t('settings.saveFailed'), description: String(cause), variant: 'error' })
    })
  }

  const Row = (props: { id: string; title: string; description?: string; children: JSX.Element }) => (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{props.title}</div>
        {props.description ? <div data-slot="settings-row-description">{props.description}</div> : null}
      </div>
      <div data-slot="settings-row-control">
        <div data-action={props.id}>{props.children}</div>
      </div>
    </div>
  )

  const Section = (props: { title: string; children: JSX.Element }) => (
    <section class="settings-section" aria-label={props.title}>
      <h3 class="settings-section-title">{props.title}</h3>
      {props.children}
    </section>
  )

  const TextField = (props: {
    id: string
    title: string
    description?: string
    value: () => string
    placeholder?: string
    patch: (text: string) => Options
  }) => {
    const [draft, setDraft] = createSignal(props.value())
    // 值没变就不写（Esc 取消后 blur 自然落空，也避免同值写盘触发无谓重载）。
    const commitIfChanged = (text: string) => {
      const trimmed = text.trim()
      if (trimmed === props.value()) return
      commit(props.patch(trimmed), () => setDraft(props.value()))
    }
    return (
      <Row id={props.id} title={props.title} description={`${props.description ?? ''} ${ctx.t('settings.apply.hint')}`.trim()}>
        <div onFocusOut={() => commitIfChanged(draft())} onKeyDown={(e) => e.key === 'Escape' && setDraft(props.value())}>
          <ctx.ui.TextInput
            label={props.title}
            value={draft()}
            placeholder={props.placeholder}
            onInput={setDraft}
            onSubmit={(text) => commitIfChanged(text)}
          />
        </div>
      </Row>
    )
  }

  const NumberField = (props: {
    id: string
    title: string
    description?: string
    value: () => number
    min?: number
    patch: (value: number) => Options
  }) => {
    const [draft, setDraft] = createSignal(String(props.value()))
    const apply = (text: string) => {
      const trimmed = text.trim()
      if (trimmed === String(props.value())) return
      const value = Number(trimmed)
      if (!Number.isFinite(value) || (props.min !== undefined && value < props.min)) {
        ctx.toast.show({ title: ctx.t('settings.invalidNumber'), description: text, variant: 'error' })
        setDraft(String(props.value()))
        return
      }
      commit(props.patch(value), () => setDraft(String(props.value())))
    }
    return (
      <Row id={props.id} title={props.title} description={`${props.description ?? ''} ${ctx.t('settings.apply.hint')}`.trim()}>
        <div onFocusOut={() => apply(draft())} onKeyDown={(e) => e.key === 'Escape' && setDraft(String(props.value()))}>
          <ctx.ui.TextInput label={props.title} value={draft()} placeholder={String(props.value())} onInput={setDraft} onSubmit={apply} />
        </div>
      </Row>
    )
  }

  const Toggle = (props: {
    id: string
    title: string
    description?: string
    checked: () => boolean
    apply: (checked: boolean) => void
    patch: (checked: boolean) => Options
  }) => (
    <Row id={props.id} title={props.title} description={props.description}>
      <ctx.ui.Switch
        hideLabel
        label={props.title}
        checked={props.checked()}
        onChange={(checked) => {
          props.apply(checked)
          commit(props.patch(checked), () => props.apply(!checked))
        }}
      />
    </Row>
  )

  const afterTokenImport = (result: { path: string; encrypted: boolean }) => {
    // tokenFile 未配置时把导入落点显式写回 options，让配置自解释
    if (!optStr('tokenFile')) commit({ tokenFile: result.path })
    ctx.toast.show({
      title: ctx.t(result.encrypted ? 'token.saved' : 'token.savedPlain'),
      description: result.path,
      variant: result.encrypted ? 'success' : 'default',
    })
    refreshStatus()
  }

  const pasteToken = async () => {
    const value = await ctx.dialogs.prompt({
      title: ctx.t('prompt.pasteToken.title'),
      description: ctx.t('prompt.pasteToken.desc'),
      placeholder: ctx.t('prompt.pasteToken.placeholder'),
      secret: true,
    })
    if (!value) return
    try {
      afterTokenImport(await ipc.importToken({ value }, { signal: ctx.signal }))
    } catch (cause) {
      ctx.toast.show({ title: ctx.t('settings.saveFailed'), description: String(cause), variant: 'error' })
    }
  }

  const importTokenFile = async () => {
    const file = await ctx.dialogs.prompt({
      title: ctx.t('prompt.importFile.title'),
      description: ctx.t('prompt.importFile.desc'),
      placeholder: ctx.t('prompt.importFile.placeholder'),
    })
    if (!file) return
    try {
      afterTokenImport(await ipc.importTokenFile({ path: file }, { signal: ctx.signal }))
    } catch (cause) {
      ctx.toast.show({ title: ctx.t('token.fileError'), description: String(cause), variant: 'error' })
    }
  }

  const statusLine = () => {
    const s = status()
    if (!s) return ctx.t('status.checking')
    if (statusBusy()) return ctx.t('status.checking')
    const reach = s.reachable
      ? `${ctx.t('status.ok')}${s.product ? ` — ${s.product}` : ''}${s.protocolVersion ? ` (CDP ${s.protocolVersion})` : ''}`
      : `${ctx.t('status.fail')}${s.probeStatus ? ` — HTTP ${s.probeStatus}` : ''}${s.probeError ? ` — ${s.probeError}` : ''}`
    const extras = [
      s.configSource ? `${ctx.t('status.source')}: ${s.configSource}` : '',
      s.tokenSet ? 'token: set' : 'token: none',
      s.tokenFile ? `tokenFile: ${s.tokenFile}${s.tokenFileEncrypted ? ' (encrypted)' : ''}` : '',
      s.tokenFileError ? `${ctx.t('status.tokenFileError')}: ${s.tokenFileError}` : '',
    ].filter(Boolean)
    return [reach, ...extras].join('\n')
  }

  ctx.add(SettingsPage, {
    id: 'surfbird',
    icon: 'globe',
    get title() {
      return ctx.t('settings.title')
    },
    get entries() {
      return [
        { id: 'field-endpoint', title: ctx.t('field.endpoint'), description: ctx.t('field.endpoint.desc') },
        { id: 'field-tokenfile', title: ctx.t('field.tokenFile'), description: ctx.t('field.tokenFile.desc') },
        { id: 'field-maxsessions', title: ctx.t('field.maxSessions'), description: ctx.t('field.maxSessions.desc') },
        { id: 'field-requesttimeoutms', title: ctx.t('field.requestTimeoutMs'), description: ctx.t('field.requestTimeoutMs.desc') },
        { id: 'section-connection', title: ctx.t('section.connection') },
        { id: 'section-auth', title: ctx.t('section.auth') },
        { id: 'section-limits', title: ctx.t('section.limits') },
        { id: 'section-timeouts', title: ctx.t('section.timeouts') },
        { id: 'section-output', title: ctx.t('section.output') },
      ]
    },
    render: () => (
      <div>
        <Section title={ctx.t('section.connection')}>
          <TextField
            id="field-endpoint"
            title={ctx.t('field.endpoint')}
            description={ctx.t('field.endpoint.desc')}
            value={() => optStr('endpoint') ?? DEFAULTS.endpoint}
            placeholder={DEFAULTS.endpoint}
            patch={(endpoint) => ({ endpoint: endpoint === '' ? null : endpoint })}
          />
          <Row id="status-probe" title={ctx.t('action.testConnection')}>
            <div data-slot="settings-row-control">
              <ctx.ui.Button size="small" variant="ghost" busy={statusBusy()} onClick={refreshStatus}>
                {ctx.t('action.testConnection')}
              </ctx.ui.Button>
            </div>
            <pre style={{ 'white-space': 'pre-wrap', margin: '4px 0 0', 'font-size': '12px', opacity: '0.8' }}>{statusLine()}</pre>
          </Row>
        </Section>

        <Section title={ctx.t('section.auth')}>
          <TextField
            id="field-tokenfile"
            title={ctx.t('field.tokenFile')}
            description={ctx.t('field.tokenFile.desc')}
            value={() => optStr('tokenFile') ?? ''}
            placeholder="~/.config/opencode/surfbird-token"
            patch={(tokenFile) => ({ tokenFile: tokenFile === '' ? null : tokenFile })}
          />
          <Row id="field-token-actions" title={ctx.t('field.tokenSet')} description={ctx.t('field.tokenSet.desc')}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <ctx.ui.Button size="small" variant="ghost" onClick={() => void pasteToken()}>
                {ctx.t('action.pasteToken')}
              </ctx.ui.Button>
              <ctx.ui.Button size="small" variant="ghost" onClick={() => void importTokenFile()}>
                {ctx.t('action.importTokenFile')}
              </ctx.ui.Button>
            </div>
          </Row>
        </Section>

        <Section title={ctx.t('section.limits')}>
          <NumberField
            id="field-maxsessions"
            title={ctx.t('field.maxSessions')}
            description={ctx.t('field.maxSessions.desc')}
            value={() => optNum('maxSessions', DEFAULTS.maxSessions)}
            min={1}
            patch={(maxSessions) => ({ maxSessions })}
          />
          <NumberField
            id="field-idleevictms"
            title={ctx.t('field.idleEvictMs')}
            description={ctx.t('field.idleEvictMs.desc')}
            value={() => optNum('idleEvictMs', DEFAULTS.idleEvictMs)}
            min={60000}
            patch={(idleEvictMs) => ({ idleEvictMs })}
          />
        </Section>

        <Section title={ctx.t('section.timeouts')}>
          <NumberField
            id="field-requesttimeoutms"
            title={ctx.t('field.requestTimeoutMs')}
            description={ctx.t('field.requestTimeoutMs.desc')}
            value={() => optNum('requestTimeoutMs', DEFAULTS.requestTimeoutMs)}
            min={1000}
            patch={(requestTimeoutMs) => ({ requestTimeoutMs })}
          />
          <NumberField
            id="field-keepalivems"
            title={ctx.t('field.keepaliveMs')}
            description={ctx.t('field.keepaliveMs.desc')}
            value={() => optNum('keepaliveMs', DEFAULTS.keepaliveMs)}
            min={30000}
            patch={(keepaliveMs) => ({ keepaliveMs })}
          />
        </Section>

        <Section title={ctx.t('section.output')}>
          <TextField
            id="field-screenshotdir"
            title={ctx.t('field.screenshotDir')}
            description={ctx.t('field.screenshotDir.desc')}
            value={() => optStr('screenshotDir') ?? ''}
            placeholder="$TMPDIR/surfbird"
            patch={(screenshotDir) => ({ screenshotDir: screenshotDir === '' ? null : screenshotDir })}
          />
          <Toggle
            id="field-debuglog"
            title={ctx.t('field.debugLog')}
            description={ctx.t('field.debugLog.desc')}
            checked={() => opts.debugLog === true}
            apply={(value) => setOpts('debugLog', value)}
            patch={(debugLog) => ({ debugLog })}
          />
        </Section>
      </div>
    ),
  })
}

export default setup
