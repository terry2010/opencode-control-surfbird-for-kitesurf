// TUI 入口必须走 Solid 专用变换：tsc 的 react-jsx emit 会把 JSX 内
// 表达式（{cursor()}、Show/For 子节点）求值为普通值，信号更新不再
// 驱动重绘——dialog 变成只渲染一次的死界面（market build.ts 同款坑，
// 2.3.0 实测）。esbuild-plugin-solid 的 universal 变换把 props 编译
// 成 getter/effect，保住响应式。
import { build } from 'esbuild'
import { solidPlugin } from 'esbuild-plugin-solid'

await build({
  entryPoints: ['src/tui.tsx'],
  outfile: 'lib/tui.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'warning',
  // 宿主 runtime 会改写这些 specifier 到 host 实例——保持 external
  //（尤其 solid-js/@opentui，插件若带自己的副本会与宿主渲染图谱失联）。
  // 不能用 packages:'external'：jsonc-parser 等 npm devDep 也会外链，
  // npm 安装的插件运行时缺依赖直接崩（devDep 不随包安装）。
  external: [
    '@opencode/plugin',
    '@opencode/plugin/*',
    '@opentui/*',
    'solid-js',
    'solid-js/*',
    'effect',
    'effect/*',
    'node:*',
  ],
  plugins: [solidPlugin({ solid: { generate: 'universal', moduleName: '@opentui/solid' } })],
})
console.log('lib/tui.js (solid universal transform)')
