#!/usr/bin/env node
/**
 * surfbird-token — tokenFile 机器绑定加密工具。
 *
 *   surfbird-token encrypt              stdin 读 token → stdout 输出 surfbird-v1: 密文
 *   surfbird-token encrypt -o FILE      直接写入 FILE（权限 600）
 *   surfbird-token encrypt -t TOKEN     从参数读 token（会出现在进程列表，慎用）
 *   surfbird-token decrypt FILE         解密文件输出到 stdout（验证/迁移用）
 *   surfbird-token id                   显示本机 machine id 来源（解密失败排障）
 *
 * 密文绑定本机 UUID：拷到别的机器解不开；OS 重装换 UUID 后需重新 encrypt。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { encryptToken, machineId, readTokenFile } from './tokenfile.ts'

const USAGE = `surfbird-token — 机器绑定加密 tokenFile 工具

  surfbird-token encrypt [-o FILE] [-t TOKEN]   stdin/参数 → surfbird-v1: 密文
  surfbird-token decrypt FILE                   解密 tokenFile 到 stdout
  surfbird-token id                             显示本机 machine id（排障用）
`

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function fail(msg: string): never {
  process.stderr.write(`surfbird-token: ${msg}\n`)
  process.exit(1)
}

function readStdin(): string {
  if (process.stdin.isTTY) fail('no token on stdin — pipe it in or use -t')
  return readFileSync(0, 'utf8')
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'encrypt') {
    const out = arg(rest, '-o') ?? arg(rest, '--out')
    const tokArg = arg(rest, '-t') ?? arg(rest, '--token')
    const token = (tokArg ?? readStdin()).trim()
    if (!token) fail('empty token')
    const blob = encryptToken(token)
    if (out) {
      writeFileSync(out, blob + '\n', { mode: 0o600 })
      process.stderr.write(`surfbird-token: wrote encrypted tokenFile to ${out}\n`)
    } else {
      process.stdout.write(blob + '\n')
    }
    return
  }
  if (cmd === 'decrypt') {
    const file = rest.find((a) => !a.startsWith('-'))
    if (!file) fail('usage: surfbird-token decrypt FILE')
    const res = readTokenFile(file)
    if (res.error === 'unreadable') fail(`cannot read ${file}`)
    if (res.error === 'empty') fail(`${file} is empty`)
    if (res.encrypted) {
      if (res.error === 'no_machine_id') fail('no machine id on this platform')
      if (res.error === 'decrypt_failed') fail('decrypt failed — wrong machine or corrupted file')
    }
    if (!res.token) fail('no token resolved')
    process.stdout.write(res.token + '\n')
    return
  }
  if (cmd === 'id') {
    const m = machineId()
    if (!m) fail(`no machine id detectable on ${process.platform}`)
    process.stdout.write(`${m.source}: ${m.id}\n`)
    return
  }
  process.stderr.write(USAGE)
  process.exit(cmd ? 1 : 0)
}

main()
