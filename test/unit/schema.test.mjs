// schema.ts 投影测试：28 个工具的 parameters spec → JSON Schema。
// 重点：嵌套对象 required 透出（screenshot clip x/y/width/height）、
// 顶层 required 收集、enum/oneOf 保留。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapToJsonSchema } from '../../src/schema.ts'
import { registerSurfbirdTools } from '../../src/tools.ts'

async function collectTools() {
  const added = []
  const ctx = {
    tool: {
      transform: async (fn) => {
        fn({
          add: (tool) => added.push(tool),
          list: () => [],
          get: () => undefined,
          namespace: () => {},
          update: () => {},
          remove: () => {},
        })
        return { dispose: async () => {} }
      },
    },
  }
  const deps = {
    registry: { get: () => { throw new Error('no engine in unit test') } },
    sessionOpts: () => ({}),
    get requestTimeoutMs() { return 1000 },
    get outputDir() { return '/tmp' },
    configInfo: () => ({}),
  }
  await registerSurfbirdTools(ctx, deps)
  return added
}

test('registers exactly 28 surfbird_* tools with codemode:false', async () => {
  const tools = await collectTools()
  assert.equal(tools.length, 28)
  for (const t of tools) {
    assert.ok(t.name.startsWith('surfbird_'), t.name)
    assert.equal(t.options?.codemode, false, t.name)
  }
})

test('every tool input is a closed object schema', async () => {
  const tools = await collectTools()
  for (const t of tools) {
    const schema = t.input
    assert.equal(schema.type, 'object', t.name)
    assert.equal(schema.additionalProperties, false, t.name)
    assert.ok(Array.isArray(schema.required), t.name)
    assert.equal(typeof schema.properties, 'object', t.name)
  }
})

test('nested object required is propagated (screenshot clip)', async () => {
  const tools = await collectTools()
  const shot = tools.find((t) => t.name === 'surfbird_screenshot')
  const clip = shot.input.properties.clip
  assert.equal(clip.type, 'object')
  assert.deepEqual(clip.required.sort(), ['height', 'width', 'x', 'y'])
  assert.equal(clip.additionalProperties, false)
})

test('required top-level params are collected', async () => {
  const tools = await collectTools()
  const nav = tools.find((t) => t.name === 'surfbird_navigate')
  assert.ok(nav.input.required.includes('url'), JSON.stringify(nav.input.required))
  const fill = tools.find((t) => t.name === 'surfbird_fill')
  assert.ok(fill.input.required.includes('target'), JSON.stringify(fill.input.required))
  assert.ok(fill.input.required.includes('value'), JSON.stringify(fill.input.required))
})

test('enum and json-type params survive projection', async () => {
  const tools = await collectTools()
  const wait = tools.find((t) => t.name === 'surfbird_wait')
  assert.deepEqual([...wait.input.properties.state.enum].sort(), ['domcontentloaded', 'enabled', 'hidden', 'load', 'networkidle', 'stable', 'text', 'text_gone', 'url', 'visible'])
  const cdp = tools.find((t) => t.name === 'surfbird_cdp')
  assert.equal(cdp.input.properties.params.type, undefined) // type:'json' → 无约束
  assert.ok(cdp.input.properties.params.description)
})

test('mapToJsonSchema: oneOf union projects branches', () => {
  const schema = mapToJsonSchema({
    v: { oneOf: [{ type: 'string' }, { type: 'number' }], description: 'x' },
  })
  assert.equal(schema.properties.v.oneOf.length, 2)
  assert.equal(schema.properties.v.oneOf[0].type, 'string')
})
