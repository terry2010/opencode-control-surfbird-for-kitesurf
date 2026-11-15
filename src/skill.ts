/**
 * src/skill.ts — 注册随插件分发的 surfbird-control skill（模型侧使用指南）。
 *
 * OpenCode 的 Skill.Info 需要结构化字段 + SKILL.md 路径与内容；
 * frontmatter 用 yaml 解析（name/description/whenToUse → description 合并，
 * whenToUse 是 DSH 方言，OpenCode 只有 description 驱动自动调用）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import type { Plugin } from '@opencode/plugin'

const SKILL_ID = 'surfbird-control'
const SKILL_PATH = fileURLToPath(new URL('../skills/surfbird-control/SKILL.md', import.meta.url))

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: content }
  try {
    const data = parseYaml(m[1]) as Record<string, unknown>
    return { data: data && typeof data === 'object' ? data : {}, body: content.slice(m[0].length) }
  } catch {
    return { data: {}, body: content }
  }
}

export async function registerSurfbirdSkill(ctx: Plugin.Context): Promise<() => Promise<void>> {
  const raw = readFileSync(SKILL_PATH, 'utf8')
  const { data } = parseFrontmatter(raw)
  const description = [data.description, data.whenToUse]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
  const registration = await ctx.skill.transform((editor) => {
    editor.add({
      id: SKILL_ID,
      name: SKILL_ID,
      description,
      path: SKILL_PATH,
      content: raw,
    } as never)
  })
  return async () => { await registration.dispose() }
}
