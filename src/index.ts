/**
 * opencode-control-surfbird-for-kitesurf：通过 Kitesurf CDP 协议控制浏览器引擎。
 *
 * OpenCode 插件（V2 Plugin API）。连接目标是任意 Kitesurf CDP 端点：
 * surfbird raw 镜像（:8787）、surfbird auth 镜像（:8080 + Bearer token）、
 * 上游 kitesurf（wrangler dev）。每个 OpenCode session 独占一条 WS 连接
 * = 一台独立浏览器；session.deleted 时断开，引擎侧该 session 的所有
 * tab 随之销毁。
 *
 * 工具前缀 surfbird_*：与 DSH 版一致，互不占位。
 * src/cdp/ 与 dsh-control-surfbird-for-kitesurf 共享（host 无关核心）。
 *
 * @module opencode-control-surfbird-for-kitesurf
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Plugin } from '@opencode/plugin'
import { SessionRegistry } from './cdp/session.ts'
import type { SessionOptions } from './cdp/session.ts'
import { registerSurfbirdTools } from './tools.ts'
import { registerSurfbirdSkill } from './skill.ts'
import { resolveConfig, type ResolvedConfig } from './config.ts'

function envDebug(msg: string): void {
  try {
    // 与 config-file.ts 的 configDirectory() 同款解析；内联而非 import——
    // config-file 依赖 devDep jsonc-parser，拉进来会让 server 入口运行时缺依赖。
    const dir =
      process.env.OPENCODE_CONFIG_DIR ??
      join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'opencode')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'surfbird-debug.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* debug log 尽力而为 */ }
}

export default Plugin.define({
  id: 'surfbird',
  async setup(ctx) {
    // options 每次调用重读：opencode.json 改动 + plugin reload 后生效
    const options = (): Record<string, unknown> => (ctx.options ?? {}) as Record<string, unknown>
    const resolved = (): ResolvedConfig => resolveConfig(options())

    const registry = new SessionRegistry({
      get maxSessions() { return resolved().maxSessions },
      get idleEvictMs() { return resolved().idleEvictMs },
    })

    const sessionOpts = (): SessionOptions => {
      const c = resolved()
      return { endpoint: c.endpoint, token: c.token, requestTimeoutMs: c.requestTimeoutMs, keepaliveMs: c.keepaliveMs }
    }

    const disposeTools = await registerSurfbirdTools(ctx, {
      registry,
      sessionOpts,
      get requestTimeoutMs() { return resolved().requestTimeoutMs },
      get outputDir() { return resolved().screenshotDir ?? join(tmpdir(), 'surfbird') },
      configInfo: () => {
        const c = resolved()
        return { configSource: c.configSource, endpoint: c.endpoint, tokenSet: !!c.token, tokenFileError: c.tokenFileError, tokenFileEncrypted: c.tokenFileEncrypted }
      },
      onSessionError: (_key: string, err: unknown) => {
        if (resolved().debugLog) envDebug(`session error: ${err instanceof Error ? err.message : String(err)}`)
      },
    })

    let disposeSkill: (() => Promise<void>) | undefined
    try {
      disposeSkill = await registerSurfbirdSkill(ctx)
    } catch { /* skill 注册失败不阻塞工具 */ }

    // session 删除 → 断开该 session 的浏览器（引擎侧 tab 全灭）
    const eventAbort = new AbortController()
    void (async () => {
      for await (const ev of ctx.event.subscribe({ types: ['session.deleted'], signal: eventAbort.signal })) {
        const sid = (ev as { data?: { sessionID?: unknown } }).data?.sessionID
        if (typeof sid === 'string' && sid) void registry.release(sid).catch(() => undefined)
      }
    })().catch(() => undefined)

    return async () => {
      eventAbort.abort()
      await disposeTools()
      await disposeSkill?.()
      await registry.disposeAll()
    }
  },
})
