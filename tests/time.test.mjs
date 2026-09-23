/**
 * time.test.mjs — 时间戳格式化的离线测试（全部用固定时刻，结果确定可复现）。
 *
 * 尸体用例：时区不可识别、精度未知 —— 都必须**响亮抛错**，不得静默回退（错的时区会让
 * 「现在几点」这个判据本身失真，比没有时间戳更危险）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertTimeZone,
  formatLocalTimestamp,
  processTimeZone,
  resolvePrecision,
  resolveTimeZone,
  timestampText,
} from '../lib/time.js'

/** 固定时刻：2026-09-23T14:22:25Z ⇒ Asia/Shanghai 的 22:22:25 */
const T = new Date('2026-09-23T14:22:25Z')

test('formatLocalTimestamp：Asia/Shanghai 上 UTC 14:22:25 = 本地 22:22:25', () => {
  assert.equal(formatLocalTimestamp(T, { timeZone: 'Asia/Shanghai', precision: 'second' }), '2026-09-23 22:22:25')
})

test('formatLocalTimestamp：UTC 时区原样', () => {
  assert.equal(formatLocalTimestamp(T, { timeZone: 'UTC', precision: 'second' }), '2026-09-23 14:22:25')
})

test('precision=minute 去掉秒', () => {
  assert.equal(formatLocalTimestamp(T, { timeZone: 'Asia/Shanghai', precision: 'minute' }), '2026-09-23 22:22')
})

test('跨日边界：UTC 16:30 = 上海次日 00:30（hourCycle h23，不出现 24）', () => {
  const midnight = new Date('2026-09-23T16:30:00Z')
  const s = formatLocalTimestamp(midnight, { timeZone: 'Asia/Shanghai', precision: 'second' })
  assert.equal(s, '2026-09-24 00:30:00')
  assert.ok(!s.includes(' 24:'), '午夜被渲染成 24 时')
})

test('尸体：时区不可识别 ⇒ 抛错（不静默回退 UTC）', () => {
  assert.throws(() => assertTimeZone('Not/AZone'), /时区不可识别/)
  assert.throws(() => formatLocalTimestamp(T, { timeZone: 'Not/AZone', precision: 'second' }), /时区不可识别/)
})

test('尸体：精度未知 ⇒ 抛错（不静默降级）', () => {
  assert.throws(() => resolvePrecision('hour'), /未知的时间精度/)
  assert.equal(resolvePrecision(' second '), 'second')
  assert.equal(resolvePrecision('minute'), 'minute')
})

test('resolveTimeZone：配置优先，空则用显式回退（无隐式默认）', () => {
  assert.equal(resolveTimeZone('Asia/Tokyo', 'Asia/Shanghai'), 'Asia/Tokyo')
  assert.equal(resolveTimeZone('   ', 'Asia/Shanghai'), 'Asia/Shanghai')
  assert.equal(resolveTimeZone('', 'UTC'), 'UTC')
})

test('processTimeZone：返回非空时区名', () => {
  const tz = processTimeZone()
  assert.equal(typeof tz, 'string')
  assert.ok(tz.length > 0)
  assertTimeZone(tz)
})

test('timestampText：含标签、时间戳与时区（读数自带范围标注）', () => {
  const text = timestampText(T, { timeZone: 'Asia/Shanghai', precision: 'second', label: '本地时间' })
  assert.equal(text, '本地时间：2026-09-23 22:22:25 (Asia/Shanghai)')
})

test('timestampText：标签为空 ⇒ 回退「本地时间」；非空则原样', () => {
  assert.equal(
    timestampText(T, { timeZone: 'UTC', precision: 'minute', label: '   ' }),
    '本地时间：2026-09-23 14:22 (UTC)',
  )
  assert.equal(
    timestampText(T, { timeZone: 'UTC', precision: 'minute', label: ' now ' }),
    'now：2026-09-23 14:22 (UTC)',
  )
})

test('同一分钟内的两个时刻在 minute 精度下文本相同（⇒ 不触发重新注入）', () => {
  const a = timestampText(new Date('2026-09-23T14:22:01Z'), { timeZone: 'UTC', precision: 'minute', label: 't' })
  const b = timestampText(new Date('2026-09-23T14:22:59Z'), { timeZone: 'UTC', precision: 'minute', label: 't' })
  assert.equal(a, b)
})
