/**
 * opencode-control-surfbird-for-kitesurf — GUI 插件的 main 进程入口。
 *
 * 桌面 main 进程持有 Node fs/net 权限；这里负责：
 * - 把设置页的 options 补丁写回 opencode.json(c)（jsonc 保注释 + tmp/rename 原子写，
 *   与 `opencode plugin add` 同款；config watcher 自动重载 server 与 GUI 插件）
 * - status：解析生效配置（含 tokenFile 解密）并探活引擎 /json/version
 * - importToken/importTokenFile：token 明文或 surfbird-v1: 密文 → 加密落盘 tokenFile
 *
 * 文件读写逻辑在 src/config-file.ts / src/token-store.ts，与 TUI 设置页共用。
 */
import type { Plugin } from '@opencode/plugin/gui'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ConfigIpc } from './contract.ts'
import { configDirectory, findPluginConfig, writePluginOptions } from '../config-file.ts'
import { endpointHttpBase, resolveConfig } from '../config.ts'
import { storeToken } from '../token-store.ts'

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** tokenFile 缺省路径：~/.config/opencode/surfbird-token。 */
function defaultTokenFile(): string {
  return path.join(configDirectory(), 'surfbird-token')
}

/** IPC setOptions 允许写回的 options 键——与 src/config.ts 的 ResolvedConfig 字段一一对应。 */
const OPTION_KEYS = new Set([
  'endpoint',
  'token',
  'tokenFile',
  'requestTimeoutMs',
  'keepaliveMs',
  'maxSessions',
  'idleEvictMs',
  'screenshotDir',
  'debugLog',
])

const main: Plugin.MainSetup = (ctx) => {
  ctx.provide(ConfigIpc, {
    configPath: async () => (await findPluginConfig()).file,
    getOptions: async () => (await findPluginConfig()).options,
    setOptions: async (patch) => {
      for (const key of Object.keys(patch)) {
        if (!OPTION_KEYS.has(key)) throw new Error(`unknown option key: ${key}`)
      }
      const loc = await findPluginConfig()
      await writePluginOptions(loc.file, patch)
      ctx.log.write('info', 'surfbird options updated', { file: loc.file })
    },
    status: async () => {
      const c = resolveConfig((await findPluginConfig()).options)
      const out = {
        configSource: c.configSource,
        endpoint: c.endpoint,
        tokenSet: !!c.token,
        tokenFile: c.tokenFile ?? '',
        tokenFileEncrypted: c.tokenFileEncrypted === true,
        tokenFileError: c.tokenFileError ?? '',
        reachable: false,
        product: '',
        protocolVersion: '',
        probeStatus: 0,
        probeError: '',
      }
      const base = endpointHttpBase(c.endpoint)
      if (!base) {
        out.probeError = 'endpoint is not a valid URL'
        return out
      }
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5000)
        const headers: Record<string, string> = {}
        if (c.token) headers.authorization = `Bearer ${c.token}`
        const res = await fetch(`${base}/json/version`, { signal: ctrl.signal, headers })
        clearTimeout(timer)
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
      }
      return out
    },
    importToken: async ({ value }) => {
      const options = (await findPluginConfig()).options
      const target = str(options.tokenFile) ?? defaultTokenFile()
      return storeToken(value, target)
    },
    importTokenFile: async ({ path: file }) => {
      const options = (await findPluginConfig()).options
      const target = str(options.tokenFile) ?? defaultTokenFile()
      let content: string
      try {
        content = await readFile(file, 'utf8')
      } catch (e) {
        throw new Error(`cannot read file: ${e instanceof Error ? e.message : String(e)}`)
      }
      return storeToken(content, target)
    },
  })
}

export default main
