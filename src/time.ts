/**
 * time.ts — 时间戳格式化（纯函数，可离线单测）。
 *
 * 设计要点：
 * - **本地时区是显式的**：时区由调用方解析后传入，本模块不做隐式回退。时区不可识别时**抛错**——
 *   错的时区比没有时区更危险（会让「现在几点」这个判据本身失真）。
 * - **格式用 `formatToParts` 拼**，不依赖 locale 的输出顺序；小时用 `hourCycle: 'h23'`
 *   避开 `hour12: false` 在某些 ICU 版本上把午夜渲染成 `24` 的行为。
 * - 输出形如 `2026-09-23 22:22:25`，时区名由调用方附在文本里（读数自带范围标注）。
 */

export type Precision = 'second' | 'minute'

export interface TimeFormatOptions {
  readonly timeZone: string
  readonly precision: Precision
}

/** 进程本地时区名（形如 `Asia/Shanghai`） */
export function processTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** 解析时区：配置非空则用配置，否则用给定的回退值（回退由调用方显式提供） */
export function resolveTimeZone(configured: string, fallback: string): string {
  const trimmed = configured.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

/** 解析精度：只接受两个已知值，其余**响亮抛错**（不静默降级成别的精度） */
export function resolvePrecision(raw: string): Precision {
  const trimmed = raw.trim()
  if (trimmed === 'second' || trimmed === 'minute') return trimmed
  throw new Error(`未知的时间精度：${raw}（只接受 second / minute）`)
}

/** 校验时区被运行时认可；不认可 ⇒ 抛错（**不静默回退 UTC**） */
export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch (err) {
    throw new Error(`时区不可识别：${timeZone}（${(err as Error).message}）`)
  }
}

/** 把某一时刻按给定时区格式化为 `YYYY-MM-DD HH:mm[:ss]` */
export function formatLocalTimestamp(now: Date, opts: TimeFormatOptions): string {
  assertTimeZone(opts.timeZone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: opts.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = opts.precision === 'minute'
    ? `${get('hour')}:${get('minute')}`
    : `${get('hour')}:${get('minute')}:${get('second')}`
  return `${date} ${time}`
}

/** 注入文本：`<标签>：<时间戳> (<时区>)`；标签为空则用「本地时间」 */
export function timestampText(now: Date, opts: TimeFormatOptions & { readonly label: string }): string {
  const label = opts.label.trim().length > 0 ? opts.label.trim() : '本地时间'
  return `${label}：${formatLocalTimestamp(now, opts)} (${opts.timeZone})`
}
