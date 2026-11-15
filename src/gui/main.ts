/**
 * opencode-control-surfbird-for-kitesurf — GUI 插件的 main 进程入口。
 *
 * 桌面 main 进程持有 Node fs/net 权限；这里负责：
 * - 把设置页的 options 补丁写回全局 opencode.json(c)（jsonc 保注释 + tmp/rename 原子写，
 *   与 `opencode plugin add` 同款；config watcher 自动重载 server 与 GUI 插件）
 * - status：解析生效配置（含 tokenFile 解密）并探活引擎 /json/version
 * - importToken/importTokenFile：token 明文或 surfbird-v1: 密文 → 加密落盘 tokenFile
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { Plugin } from '@opencode/plugin/gui'
import { ConfigIpc } from './contract.ts'
import { patchPluginOptions, readPluginOptions } from './config-patch.ts'
import { resolveConfig } from '../config.ts'
import { encryptToken, isEncryptedBlob } from '../tokenfile.ts'

/** 全局配置目录：与 @opencode/util/global 相同规则。 */
function configDirectory(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
  return path.join(xdg, 'opencode')
}

/** 与 CLI resolveConfigPath 相同的候选顺序；都不存在时返回第一个。 */
async function resolveConfigPath(): Promise<string> {
  const directory = configDirectory()
  const candidates = [
    path.join(directory, 'opencode.json'),
    path.join(directory, 'opencode.jsonc'),
    path.join(directory, '.opencode', 'opencode.json'),
    path.join(directory, '.opencode', 'opencode.jsonc'),
  ]
  for (const candidate of candidates) {
    const exists = await stat(candidate).then(
      (info) => info.isFile(),
      () => false,
    )
    if (exists) return candidate
  }
  return candidates[0]
}

const readConfigText = async (file: string): Promise<string> =>
  readFile(file, 'utf8').catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return '{}'
    throw error
  })

const readOptions = async (): Promise<Record<string, unknown>> =>
  readPluginOptions(await readConfigText(await resolveConfigPath()))

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** ws(s)://…/devtools/browser 或 http(s)://base → http(s)://host（探活 /json/version 用）。 */
function httpBase(endpoint: string): string | undefined {
  try {
    const u = new URL(endpoint)
    if (u.protocol === 'ws:') u.protocol = 'http:'
    else if (u.protocol === 'wss:') u.protocol = 'https:'
    else if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

/** tokenFile 缺省路径：~/.config/opencode/surfbird-token。 */
function defaultTokenFile(): string {
  return path.join(configDirectory(), 'surfbird-token')
}

/**
 * token 内容（明文 / surfbird-v1: 密文 / 其他文本）→ 落盘 tokenFile。
 * 明文用本机 UUID 加密；无 machine-id 时明文 0600 兜底（如实返回 encrypted:false）。
 */
function storeToken(content: string, target: string): { path: string; encrypted: boolean } {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('empty token')
  if (trimmed.length > 64 * 1024) throw new Error('token too large')
  mkdirSync(path.dirname(target), { recursive: true })
  if (isEncryptedBlob(trimmed)) {
    writeFileSync(target, trimmed + '\n', { mode: 0o600 })
    return { path: target, encrypted: true }
  }
  try {
    writeFileSync(target, encryptToken(trimmed) + '\n', { mode: 0o600 })
    return { path: target, encrypted: true }
  } catch {
    // 本机无 machine id → 明文落盘（0600），如实返回 encrypted:false
    writeFileSync(target, trimmed + '\n', { mode: 0o600 })
    return { path: target, encrypted: false }
  }
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
    configPath: () => resolveConfigPath(),
    getOptions: () => readOptions(),
    setOptions: async (patch) => {
      for (const key of Object.keys(patch)) {
        if (!OPTION_KEYS.has(key)) throw new Error(`unknown option key: ${key}`)
      }
      const file = await resolveConfigPath()
      const updated = patchPluginOptions(await readConfigText(file), patch)
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.tmp`
      await writeFile(temporary, updated, { mode: 0o600 })
      await rename(temporary, file)
      ctx.log.write('info', 'surfbird options updated', { file })
    },
    status: async () => {
      const c = resolveConfig(await readOptions())
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
      const base = httpBase(c.endpoint)
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
      const options = await readOptions()
      const target = str(options.tokenFile) ?? defaultTokenFile()
      return storeToken(value, target)
    },
    importTokenFile: async ({ path: file }) => {
      const options = await readOptions()
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
