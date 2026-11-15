/**
 * opencode-control-surfbird-for-kitesurf — ./gui-experimental 入口。
 *
 * 同一个文件被桌面端两个进程各执行一遍：窗口跑 setup（设置页），
 * Electron main 跑 main（options 写回 opencode.json(c)、token 导入、引擎探活）。
 */
import { Plugin } from '@opencode/plugin/gui'
import setup from './gui/window.tsx'
import main from './gui/main.ts'
import { en, zh } from './gui/i18n.ts'

export default Plugin.define({
  i18n: { en, zh },
  setup,
  main,
})
