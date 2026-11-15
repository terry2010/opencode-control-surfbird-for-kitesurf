/**
 * src/config-file.ts — opencode.json(c) 插件 options 的文件级读写（host 无关）。
 *
 * GUI main 进程与 TUI 设置页共用：候选路径解析 → 找 own entry →
 * patchPluginOptions（jsonc 保注释）→ tmp+rename 原子写。
 * 写回后宿主 config watcher 自动重载 server/TUI/GUI 插件，ctx.options 保持单一数据源。
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { patchPluginOptions, pluginEntryPresent, readPluginOptions } from './config-patch.ts'

/** 全局配置目录：与 @opencode/util/global 相同规则。 */
export function configDirectory(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
  return path.join(xdg, 'opencode')
}

const CONFIG_NAMES = [
  'opencode.json',
  'opencode.jsonc',
  path.join('.opencode', 'opencode.json'),
  path.join('.opencode', 'opencode.jsonc'),
]

/** 项目级候选在前、全局候选在后（与 CLI resolveConfigPath 同序）。 */
export function configCandidates(projectDir?: string): string[] {
  const dirs = projectDir ? [projectDir, configDirectory()] : [configDirectory()]
  return dirs.flatMap((dir) => CONFIG_NAMES.map((name) => path.join(dir, name)))
}

export async function readConfigText(file: string): Promise<string> {
  return readFile(file, 'utf8').catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return '{}'
    throw error
  })
}

async function fileExists(file: string): Promise<boolean> {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  )
}

/** 全局配置文件：取第一个存在的候选，都没有时返回 opencode.json（写入时创建）。 */
export async function resolveGlobalConfigPath(): Promise<string> {
  for (const candidate of configCandidates().slice(0, CONFIG_NAMES.length)) {
    if (await fileExists(candidate)) return candidate
  }
  return configCandidates()[0]
}

export interface PluginConfigLocation {
  file: string
  options: Record<string, unknown>
}

/**
 * 找到声明了本插件的配置文件并读出其 options。
 * 项目级优先逐候选查 own entry（区分"文件存在但无 entry"与"entry options 为空"）；
 * 都没有 entry 时回落全局 opencode.json——patchPluginOptions 会在那里追加 entry。
 */
export async function findPluginConfig(projectDir?: string): Promise<PluginConfigLocation> {
  for (const file of configCandidates(projectDir)) {
    if (!(await fileExists(file))) continue
    const text = await readConfigText(file)
    if (!pluginEntryPresent(text)) continue
    return { file, options: readPluginOptions(text) }
  }
  return { file: configCandidates()[0], options: {} }
}

/** 在指定配置文件上应用 options 补丁并原子写回（tmp + rename，0600）。 */
export async function writePluginOptions(file: string, patch: Record<string, unknown>): Promise<void> {
  const updated = patchPluginOptions(await readConfigText(file), patch)
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await writeFile(temporary, updated, { mode: 0o600 })
  await rename(temporary, file)
}
