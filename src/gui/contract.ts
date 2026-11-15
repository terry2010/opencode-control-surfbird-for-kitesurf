import { Schema } from 'effect'
import { Ipc } from '@opencode/plugin/gui'

/**
 * 设置页 ↔ main 进程的桥：窗口提交 options 补丁，main 写回全局 opencode.json(c)；
 * status/importToken 在 main 进程解析配置（可读 tokenFile、探活引擎）。
 * patch 语义见 config-patch.ts：null 删除该键回落默认。
 */
export const ConfigIpc = Ipc.define({
  id: 'surfbird.config',
  methods: {
    /** 合并一段 options 补丁到本插件的全局配置 entry，写盘成功后由宿主重载插件。 */
    setOptions: { input: Schema.Record(Schema.String, Schema.Unknown) },
    /** 读出本插件当前的全局 options（设置页以此渲染真值，不依赖插件重载刷新 ctx.options）。 */
    getOptions: { output: Schema.Record(Schema.String, Schema.Unknown) },
    /** 当前生效的全局配置文件绝对路径（设置页展示用）。 */
    configPath: { output: Schema.String },
    /** 解析生效配置并探活引擎 /json/version；tokenFile 在 main 进程解密。 */
    status: {
      output: Schema.Struct({
        configSource: Schema.String,
        endpoint: Schema.String,
        tokenSet: Schema.Boolean,
        tokenFile: Schema.String,
        tokenFileEncrypted: Schema.Boolean,
        tokenFileError: Schema.String,
        reachable: Schema.Boolean,
        product: Schema.String,
        protocolVersion: Schema.String,
        probeStatus: Schema.Number,
        probeError: Schema.String,
      }),
    },
    /** 粘贴的 token / surfbird-v1: 密文 → 加密（明文时）写入 tokenFile 路径。 */
    importToken: {
      input: Schema.Struct({ value: Schema.String }),
      output: Schema.Struct({ path: Schema.String, encrypted: Schema.Boolean }),
    },
    /** 从本地文件导入 token（明文或 surfbird-v1: 密文）→ 写入 tokenFile 路径。 */
    importTokenFile: {
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ path: Schema.String, encrypted: Schema.Boolean }),
    },
  },
})
