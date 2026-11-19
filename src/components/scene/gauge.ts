import type { SceneDevice, SceneNode } from '../../types/scene'

/** A face is a visual choice, never a central-state device kind. */
export type GaugeVisualKind = 'gauge' | 'digital-gauge' | 'digital-screen'
export interface GaugeSource {
  kind?: string
  attributes?: Record<string, unknown>
}

export function gaugeVisualKind(source?: GaugeSource): GaugeVisualKind | undefined {
  const type = String(source?.attributes?.sourceType ?? '')
  if (type === 'DigitalScreen' || source?.kind === 'digital-screen') return 'digital-screen'
  if (source?.kind === 'digital-gauge' || type === 'DigitalGauge') return 'digital-gauge'
  if (source?.kind === 'gauge' || type === 'WpfGaugeRadial') return 'gauge'
  return undefined
}

export function finiteGaugeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string' && !value.trim()) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/** WPF converters are applied once, only to devices still in their base units. */
export function gaugeValueScale(node: Pick<SceneNode, 'attributes'>, device?: SceneDevice): number {
  const scale = finiteGaugeNumber(node.attributes?.valueScale, 1)
  if (!device || scale === 100 && device.max <= 1 || scale === 60000 && !/min|分钟/i.test(device.unit) || scale === 0.1 && /mm|毫米/i.test(device.unit)) return scale
  return 1
}

export function gaugeFraction(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || max <= min) return 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export function gaugePrecision(format: unknown, fallback = 2): number {
  const text = String(format ?? '')
  const standard = /\{0:[FP](\d+)\}/i.exec(text)
  const custom = /\{0:[0#]+(?:\.([0#]+))?\}/.exec(text)
  return Math.max(0, Math.min(6, standard ? Number(standard[1]) : custom ? custom[1]?.length ?? 0 : fallback))
}

export function formatGaugeReading(value: unknown, precision = 2): string {
  const number = finiteGaugeNumber(value)
  const decimals = Math.max(0, Math.min(6, Math.trunc(precision)))
  const result = Math.abs(number).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // A value rounded to zero must not acquire a misleading minus sign.
  return number < 0 && Number(result) !== 0 ? `-${result}` : result
}

/** WPF's 000.00 pattern pads the magnitude, not the sign (-050.00, not 0-50.00). */
export function formatDigitalReading(value: unknown): string {
  const text = formatGaugeReading(value)
  const negative = text.startsWith('-')
  const [integer, fraction] = (negative ? text.slice(1) : text).split('.')
  return `${negative ? '-' : ''}${integer!.padStart(3, '0')}.${fraction}`
}

export function fitGaugeFont(text: string, width: number, requested: number): number {
  const units = Array.from(text).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : /[.\s]/.test(char) ? 0.3 : 0.62), 0)
  return Math.max(0.1, Math.min(requested, Math.max(0.1, width) / Math.max(1, units)))
}

function niceInterval(span: number, count: number): number {
  const rough = span / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  return ([1, 2, 2.5, 5, 10].find(value => value >= fraction) ?? 10) * power
}

function intervalPrecision(interval: number): number {
  for (let precision = 0; precision < 6; precision++) if (Math.abs(Number(interval.toFixed(precision)) - interval) <= Math.abs(interval) * 1e-8) return precision
  return 6
}

export interface GaugeTick {
  value: number
  ratio: number
  major: boolean
  label?: string
}

/** Actual engineering intervals, bounded even for malformed imported ranges. */
export function gaugeTicks(min: number, max: number, attributes: Record<string, unknown> = {}): GaugeTick[] {
  if (![min, max].every(Number.isFinite) || max <= min) return []
  const span = max - min
  if (!Number.isFinite(span)) return []
  const validInterval = (value: unknown, fallback: number) => {
    const interval = finiteGaugeNumber(value, fallback)
    return interval > 0 && span / interval <= 200 ? interval : fallback
  }
  const major = validInterval(attributes.tickInterval, niceInterval(span, 5))
  const label = validInterval(attributes.labelInterval, span / major <= 10 ? major : niceInterval(span, 5))
  const minor = validInterval(attributes.minorTickInterval, major / 5)
  const precision = gaugePrecision(attributes.labelFormat ?? attributes.labelFormatString, intervalPrecision(label))
  const ticks = new Map<string, GaugeTick>()
  const add = (value: number, isMajor: boolean, labelled: boolean) => {
    const ratio = Math.max(0, Math.min(1, (value - min) / span))
    const key = ratio.toFixed(10)
    const tick = ticks.get(key) ?? { value, ratio, major: false }
    tick.major ||= isMajor
    if (labelled) tick.label = formatGaugeReading(value, Math.max(precision, intervalPrecision(value)))
    ticks.set(key, tick)
  }
  const addInterval = (interval: number, isMajor: boolean, labelled: boolean) => {
    const count = Math.min(200, Math.floor(span / interval + 1e-8))
    for (let index = 0; index <= count; index++) add(Number((min + index * interval).toPrecision(12)), isMajor, labelled)
  }
  addInterval(minor, false, false)
  addInterval(major, true, false)
  addInterval(label, true, true)
  add(min, true, true)
  add(max, true, true)
  // Do not draw a label immediately beside an endpoint (e.g. 15 and 16).
  return [...ticks.values()].sort((a, b) => a.ratio - b.ratio).map(tick => {
    if (tick.ratio > 0 && tick.ratio < 0.06 || tick.ratio < 1 && tick.ratio > 0.94) return { ...tick, label: undefined }
    return tick
  })
}

export const sevenSegmentPolygons = [
  '2,1 3,0 9,0 10,1 9,2 3,2',
  '10,2 11,3 11,9 10,10 9,9 9,3',
  '10,10 11,11 11,17 10,18 9,17 9,11',
  '2,19 3,18 9,18 10,19 9,20 3,20',
  '1,10 2,11 2,17 1,18 0,17 0,11',
  '1,2 2,3 2,9 1,10 0,9 0,3',
  '2,10 3,9 9,9 10,10 9,11 3,11',
]
const digitSegments: Record<string, number[]> = {
  '0': [0, 1, 2, 3, 4, 5], '1': [1, 2], '2': [0, 1, 3, 4, 6],
  '3': [0, 1, 2, 3, 6], '4': [1, 2, 5, 6], '5': [0, 2, 3, 5, 6],
  '6': [0, 2, 3, 4, 5, 6], '7': [0, 1, 2], '8': [0, 1, 2, 3, 4, 5, 6],
  '9': [0, 1, 2, 3, 5, 6], '-': [6], ' ': [],
}
export function sevenSegmentLayout(value: string) {
  let width = 0
  const digits = Array.from(value).map(char => {
    const digit = { char, x: width, lit: digitSegments[char] ?? [] }
    width += char === '.' ? 3 : 13
    return digit
  })
  // Keep the last decimal point inside the viewBox, including its radius.
  return { digits, width: Math.max(1, width) }
}
