# dsh-time-awareness — 时间感知（语义文档）

## 1 · 元信息

| 项 | 值 |
|---|---|
| 能力名 | 时间感知（请求末尾的本地时间戳） |
| 插件 | `self-plugins/dsh-time-awareness` |
| 状态 | draft（未挂载；待真实请求取证后转 implemented） |
| 依赖 seam | `ctx.systemPrompt.context`（`@deepseek-ai/dsh-system-prompt`） |
| 落位机制依据 | `@deepseek-ai/dsh-agent-loop@0.1.7-alpha.1` 的 `RuntimeContextProjection`（`lib/index.js:298`） |
| 最近复核 | 2026-09-23 |

## 2 · 定位与反定位

**定位**：把「当前本地时间」放进**每个模型请求的末尾**，使「现在几点」不再依赖主体记得去读钟。

**反定位（不做）**：不做闹钟/提醒/定时任务（归任务板 `dsh-agent-taskboard`）；不做睡眠与感知圈调度（归生命核心）；不改系统提示词正文（`ctx.systemPrompt.section` 是请求前部）；不做时间换算/时区转换服务（只输出当前时刻）；不加任何行为指令或说教文案。

## 3 · 术语

| 术语 | 含义 |
|---|---|
| 动态上下文（PromptContext） | `ctx.systemPrompt.context` 注册的贡献：由 agent-loop 物化为**框架自有的 `user/message` 快照**，追加在保留历史之后 |
| 快照（snapshot） | 该动态上下文某次变化后被记录的那条消息；`source.kind` 标记为框架自有，与人类消息可区分 |
| 保留值（retained） | agent-loop 记住的上一个快照；文本与它相同则**不产生新消息** |
| 本地时间 | 进程所在时区的墙上时间（缺省取进程时区，可由 `timeZone` 覆盖） |
| 精度（precision） | `second` 或 `minute`；决定文本多久变化一次，从而决定注入频率 |

## 4 · 概念模型与不变量

概念：`TimeFormatOptions`（timeZone + precision）· `timestampText`（注入文本）· `PromptContext`（注册项）。

不变量：

- **I1 · 只做一件事**——本件唯一的模型可见输出是那行时间戳；不注册工具、不改系统提示词、不注入其他内容。
- **I2 · 末尾语义**——注入经 `ctx.systemPrompt.context`，落位是**保留历史之后**（请求末尾），不是系统提示词前部。
- **I3 · 变化才记**——文本不变则不产生新快照（由 agent-loop 的 `retained` 比对保证），因此精度选择直接决定注入频率。
- **I4 · 时区显式**——时区不可识别、精度未知一律**抛错**；不静默回退 UTC（错的时区会让判据本身失真）。
- **I5 · 读数自带范围标注**——注入文本附时区名，避免「这是哪个时区的时间」这类歧义。
- **I6 · 无副作用**——不读凭据、不联网、不写盘、无跨会话状态。

## 5 · 契约

### 5.1 注册（`src/index.ts:apply`）

```ts
ctx.systemPrompt.context({
  name: 'time-awareness',
  order: config.order,
  text: () => timestampText(new Date(), { timeZone, precision, label: config.label }),
})
ctx.effect(() => dispose, 'time-awareness.context')
```

`PromptContext` 的成员（安装版 `lib/types/index.d.ts:72`）：`name`（唯一，重复注册抛错）· `order`（升序拼接）· `text`（静态串或**每次装配求值**的函数）。

### 5.2 配置

| 字段 | 类型 | 缺省 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 关掉则完全不注册 |
| `order` | number | `900` | 排序位，越大越靠后 |
| `precision` | string | `second` | `second` / `minute`；未知值抛错 |
| `timeZone` | string | `''` | 留空 ⇒ 进程本地时区 |
| `label` | string | `本地时间` | 空则回退「本地时间」 |

### 5.3 调用点清单

| 调用方 | 调用点（文件:符号） | 时机 | 状态 |
|---|---|---|---|
| cordis 宿主 | `src/index.ts:name / inject / Config / apply` | 插件激活 | 已落地 |
| 本件 | `src/index.ts:apply` → `ctx.systemPrompt.context` | 激活时注册一次 | 已落地 |
| agent-loop | `RuntimeContextProjection.project()` 读取 `text()` | **每次装配**（每个模型步骤） | 已落地（框架侧） |
| agent-loop | 变化时 append 一条 `user/message` 快照 | 文本与 `retained` 不同时 | 已落地（框架侧） |
| **禁止** | 任何其他插件复用 `name: 'time-awareness'` | 由 `PromptContext.name` 唯一性约束 | 待验收 |

### 5.4 类型可见性

`ctx.systemPrompt` 由 `@deepseek-ai/dsh-system-prompt` 的 `declare module '@deepseek-ai/cordis'`（`lib/types/index.d.ts:10`）声明合并而来 ⇒ **该包必须进入编译单元**。本件不依赖 `dsh-tools`（拿不到它的传递导入），故在 `src/index.ts` 显式 `import type {} from '@deepseek-ai/dsh-system-prompt'`（纯类型，不产生运行时代码）。

## 6 · 边界与信任

- **错的时区比没有时间戳更危险**：`assertTimeZone` / `resolvePrecision` 对非法输入抛错，不做静默回退。
- **注入频率是成本**：`second` 精度下文本每步都变 ⇒ 每步一条快照消息；`minute` 精度把频率降到 1/60。缺省取 `second`（严格满足「每个请求的末尾」），需要省日志时改配置即可。
- **不解释、不提醒**：只给时间戳。加「记得读钟」这类指令会越界成提示词职责。
- **凭据/网络/落盘**：全无。

## 7 · 可证伪验收

| 可证伪命题 | 证据（一次测量） | 状态 |
|---|---|---|
| 上海时区上 UTC 14:22:25 = 本地 22:22:25 | `node --test tests/*.test.mjs` 的 `formatLocalTimestamp` 用例 | 已实测 |
| `minute` 精度去掉秒 | 同上 `precision=minute` 用例 | 已实测 |
| 午夜不渲染成 24 时（跨日边界） | 同上「跨日边界」用例 | 已实测 |
| 时区不可识别 ⇒ 抛错（不静默回退 UTC） | 同上「尸体：时区不可识别」用例 | 已实测 |
| 精度未知 ⇒ 抛错（不静默降级） | 同上「尸体：精度未知」用例 | 已实测 |
| 注入文本含标签、时间戳与时区 | 同上 `timestampText` 用例 | 已实测 |
| 同一分钟内 `minute` 精度文本相同（⇒ 不触发重新注入） | 同上「同一分钟内的两个时刻」用例 | 已实测 |
| 构建通过（含 `ctx.systemPrompt.context` 类型解析） | `tsc -p tsconfig.json` 退出码 0 | 待验收 |
| 插件挂载且真实组合可答 | `plugin_boot_status` 显示已加载、无「需重启」 | 待验收 |
| 请求末尾确实带时间戳 | 会话事件流中出现 `source.kind = 快照` 的 `user/message`，文本为本地时间戳 | 待线上验收 |
| 时间戳与本地时钟一致（同分钟） | 同分钟比对 `Get-Date` 与快照文本 | 待线上验收 |
| 只做这一件事（无其他注入） | 源码级断言：本件只有一处 `ctx.systemPrompt.*` 注册，且不注册工具 | 待验收 |

## 8 · 与实现的关系

**当前落点**：`src/time.ts`（纯格式化层）· `src/index.ts`（注册）· `tests/time.test.mjs`（11 用例，含 2 个尸体）。

**生效判据**：

1. **构建-进程先后**：`lib/index.js` 的 mtime 晚于 web 进程启动时间（mtime 新只证明构建过，不证明进程在跑它）。
2. **注册生效**：`system-prompt/change` 事件或快照事件出现。
3. **末尾可见**：会话事件流中该请求的最后一条内容含本地时间戳。

**回退**：`plugin_unmount` 或 `enabled: false`；无状态、不写盘 ⇒ 无损。

## 9 · 实践修订记录

| 日期 | 修订 |
|---|---|
| 2026-09-23 | 首版。落位机制经读安装版实现确认（`RuntimeContextProjection.project()`），而非只信文档——文档来自 checkout（alpha.2），进程跑 alpha.1。 |
| 2026-09-23 | 构建暴露类型可见性问题：`ctx.systemPrompt` 不存在于 `Context`（`TS2339`）。根因是声明合并在 `dsh-system-prompt` 内，而本件不依赖 `dsh-tools` 的传递导入 ⇒ 补显式 `import type {}`。 |

## 10 · 未决问题

1. **精度缺省**：`second` 严格满足「每个请求的末尾」，代价是每步一条快照消息；`minute` 省 60 倍日志但时间戳在历史里会陈旧至多一分钟。当前取 `second`，是否改缺省待主人裁。
2. **快照与人类消息的区分**：快照以 `user/message` 形式入历史，虽带 `source.kind` 标记，但人类阅读会话时是否会造成「我什么时候说过这句」的困惑，待真实使用后判断。
3. **是否该带日期**：当前输出含日期（`2026-09-23 22:22:25`）。若只关心时刻，日期部分是固定前缀成本，可考虑按需裁掉。
