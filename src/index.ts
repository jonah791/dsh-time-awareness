/**
 * dsh-time-awareness — 时间感知。
 *
 * **唯一作用**：在每个模型请求的末尾附加一行本地时间戳。不夹带任何其他注入。
 *
 * 落位机制（2026-09-23 读安装版实现确认，`@deepseek-ai/dsh-agent-loop@0.1.7-alpha.1`
 * 的 `RuntimeContextProjection`）：`ctx.systemPrompt.context()` 注册的动态上下文由 agent-loop
 * 在**保留的历史之后**物化为一条框架自有的 `user/message` 快照，**仅当文本变化时**才重新记录
 * ——即请求的末尾，且不变则不产生噪音。
 *
 * 反定位：不做闹钟/提醒/定时任务（归任务板）；不做睡眠调度（归生命核心）；不改系统提示词
 * （`ctx.systemPrompt.section` 是请求前部，与「末尾」要求不符）。
 *
 * @module dsh-time-awareness
 */

import type { Context } from '@deepseek-ai/cordis'
// 声明合并：`ctx.systemPrompt` 由 `@deepseek-ai/dsh-system-prompt` 的
// `declare module '@deepseek-ai/cordis'` 提供，该包必须进入编译单元——本件不依赖
// `dsh-tools`，拿不到它的传递导入，故显式引入（纯类型，不产生运行时代码）。
import type {} from '@deepseek-ai/dsh-system-prompt'
import z from '@deepseek-ai/schemastery'
import { processTimeZone, resolvePrecision, resolveTimeZone, timestampText } from './time.js'

/** 插件名（与 `cordis.patch.yml` 的 id `time-awareness` 对齐）。 */
export const name = 'time-awareness'

/** 只依赖系统提示词装配服务。 */
export const inject = ['systemPrompt'] as const

export interface Config {
  enabled: boolean
  /** 动态上下文的排序位（越大越靠后） */
  order: number
  /** `second` 或 `minute` */
  precision: string
  /** 时区覆盖；留空 ⇒ 用进程本地时区 */
  timeZone: string
  /** 时间戳前缀标签 */
  label: string
}

export const Config = z.object({
  enabled: z.boolean().default(true),
  order: z.number().default(900),
  precision: z.string().default('second'),
  timeZone: z.string().default(''),
  label: z.string().default('本地时间'),
})

export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return

  const timeZone = resolveTimeZone(config.timeZone, processTimeZone())
  const precision = resolvePrecision(config.precision)

  const dispose = ctx.systemPrompt.context({
    name: 'time-awareness',
    order: config.order,
    text: () => timestampText(new Date(), { timeZone, precision, label: config.label }),
  })

  ctx.effect(() => dispose, 'time-awareness.context')
}
