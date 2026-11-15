// gui/config-patch.ts 单测：options 补丁写回 opencode.json(c) 的纯函数逻辑。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOwnSpec, mergeOptions, patchPluginOptions, readPluginOptions } from '../../src/gui/config-patch.ts'

test('isOwnSpec: bare name, versioned, file:// and local path basename', () => {
  assert.ok(isOwnSpec('opencode-control-surfbird-for-kitesurf'))
  assert.ok(isOwnSpec('opencode-control-surfbird-for-kitesurf@0.1.0'))
  assert.ok(isOwnSpec('file:///Volumes/2t/code/opencode-control-surfbird-for-kitesurf'))
  assert.ok(isOwnSpec('/Volumes/2t/code/opencode-control-surfbird-for-kitesurf'))
  assert.ok(!isOwnSpec('opencode-control-surfbird-for-kitesurf-extra'))
  assert.ok(!isOwnSpec('other-plugin'))
  assert.ok(!isOwnSpec(''))
  assert.ok(!isOwnSpec(undefined))
})

test('mergeOptions: null deletes, nested merges, empty nested pruned', () => {
  const out = mergeOptions(
    { endpoint: 'http://a', keep: 1, nested: { a: 1, b: 2 } },
    { endpoint: null, nested: { a: null }, extra: 'x' },
  )
  assert.equal(out.endpoint, undefined)
  assert.equal(out.keep, 1)
  assert.deepEqual(out.nested, { b: 2 })
  assert.equal(out.extra, 'x')
})

test('readPluginOptions: reads object entry options', () => {
  const text = `{
  "plugins": [
    "other-plugin",
    { "package": "opencode-control-surfbird-for-kitesurf", "options": { "endpoint": "http://x:1", "maxSessions": 3 } }
  ]
}`
  assert.deepEqual(readPluginOptions(text), { endpoint: 'http://x:1', maxSessions: 3 })
})

test('readPluginOptions: string entry → {}', () => {
  const text = '{ "plugins": ["opencode-control-surfbird-for-kitesurf"] }'
  assert.deepEqual(readPluginOptions(text), {})
})

test('readPluginOptions: invalid doc / no entry → {}', () => {
  assert.deepEqual(readPluginOptions('not json'), {})
  assert.deepEqual(readPluginOptions('{"plugins": []}'), {})
  assert.deepEqual(readPluginOptions('{}'), {})
})

test('patchPluginOptions: appends entry when missing', () => {
  const out = patchPluginOptions('{}', { endpoint: 'http://x:1' })
  const parsed = JSON.parse(out)
  assert.deepEqual(parsed.plugins, [{ package: 'opencode-control-surfbird-for-kitesurf', options: { endpoint: 'http://x:1' } }])
})

test('patchPluginOptions: upgrades string entry to object form', () => {
  const text = '{\n  // keep me\n  "plugins": ["opencode-control-surfbird-for-kitesurf"]\n}\n'
  const out = patchPluginOptions(text, { maxSessions: 4 })
  assert.ok(out.includes('// keep me'), 'comments preserved')
  // 输出是 JSONC（保留注释）——用 readPluginOptions 验证而非 JSON.parse
  assert.deepEqual(readPluginOptions(out), { maxSessions: 4 })
  assert.ok(out.includes('"package": "opencode-control-surfbird-for-kitesurf"'))
})

test('patchPluginOptions: merges into existing options + null deletes', () => {
  const text = '{ "plugins": [{ "package": "opencode-control-surfbird-for-kitesurf", "options": { "endpoint": "http://a", "debugLog": true } }] }'
  const out = patchPluginOptions(text, { endpoint: null, keepaliveMs: 60000 })
  const parsed = JSON.parse(out)
  assert.deepEqual(parsed.plugins[0].options, { debugLog: true, keepaliveMs: 60000 })
})

test('patchPluginOptions: throws on invalid doc / non-array plugins', () => {
  assert.throws(() => patchPluginOptions('not json', {}), /invalid config/)
  assert.throws(() => patchPluginOptions('{"plugins": {}}', {}), /invalid plugins/)
})

test('roundtrip: patch then read returns merged options', () => {
  let text = '{}'
  text = patchPluginOptions(text, { endpoint: 'http://x:1', maxSessions: 2 })
  text = patchPluginOptions(text, { maxSessions: null, debugLog: true })
  assert.deepEqual(readPluginOptions(text), { endpoint: 'http://x:1', debugLog: true })
})
