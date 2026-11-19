import test from 'node:test'
import assert from 'node:assert/strict'
import { finiteGaugeNumber, formatDigitalReading, formatGaugeReading, gaugeFraction, gaugePrecision, gaugeTicks, gaugeValueScale, gaugeVisualKind, sevenSegmentLayout, sevenSegmentPolygons } from '../src/components/scene/gauge.ts'

test('数字表遵循000.00格式，零和负数不会丢失或把负号夹在数字中', () => {
  for (const [value, expected] of [[0, '000.00'], [-0, '000.00'], [-.004, '000.00'], [12.5, '012.50'], [-50, '-050.00'], [-999.99, '-999.99'], [1234.5, '1234.50']]) assert.equal(formatDigitalReading(value), expected)
  assert.equal(formatDigitalReading(Infinity), '000.00')
  assert.equal(formatDigitalReading(1e21), '1000000000000000000000.00')
  assert.equal(formatGaugeReading(-.25, 1), '-0.3')
})

test('WPF数字格式和真实单位精度保留', () => {
  assert.equal(gaugePrecision('{}{0:0}RPM'), 0)
  assert.equal(gaugePrecision('{}{0:0.0}MPa'), 1)
  assert.equal(gaugePrecision('{}{0:0.00}mm'), 2)
  assert.equal(gaugePrecision('{}{0:P2}'), 2)
  assert.equal(gaugePrecision(undefined, 1), 1)
})

test('七段字形直接画亮段：0有六段，负号有中段，小数点不越出viewBox', () => {
  const layout = sevenSegmentLayout('-050.00')
  assert.deepEqual(layout.digits[0].lit, [6])
  assert.equal(layout.digits[1].lit.length, 6)
  assert.equal(layout.digits.filter(digit => digit.char === '.').length, 1)
  assert.equal(layout.digits.filter(digit => digit.char === '0').length, 4)
  for (const polygon of sevenSegmentPolygons) for (const point of polygon.split(' ')) {
    const [x, y] = point.split(',').map(Number)
    assert.ok(x >= 0 && x <= 11 && y >= 0 && y <= 20)
  }
  const decimal = sevenSegmentLayout('0.')
  assert.ok(decimal.digits.at(-1).x + 2.2 <= decimal.width)
})

test('仪表视觉与sensor语义分离，数字屏不会被识别成指针', () => {
  assert.equal(gaugeVisualKind({ kind: 'gauge' }), 'gauge')
  assert.equal(gaugeVisualKind({ kind: 'digital-gauge' }), 'digital-gauge')
  assert.equal(gaugeVisualKind({ kind: 'digital-gauge', attributes: { sourceType: 'DigitalScreen' } }), 'digital-screen')
  assert.equal(gaugeVisualKind({ kind: 'sensor' }), undefined)
})

test('指针只限制位置而不截断读数，零点、负量程和小量程正确', () => {
  assert.equal(gaugeFraction(0, -100, 50), 2 / 3)
  assert.equal(gaugeFraction(-50, -100, 50), 1 / 3)
  assert.equal(gaugeFraction(.05, 0, .1), .5)
  assert.equal(gaugeFraction(-20, 0, 16), 0)
  assert.equal(gaugeFraction(20, 0, 16), 1)
  assert.equal(gaugeFraction(0, 1, 1), 0)
  assert.equal(gaugeFraction(NaN, 0, 1), 0)
})

test('刻度使用WPF工程间隔，2.5上限不能取整为3，发动机标注400而非333', () => {
  const labels = gaugeTicks(0, 2000, { tickInterval: 400, minorTickInterval: 100, labelInterval: 400 }).filter(tick => tick.label).map(tick => tick.label)
  assert.deepEqual(labels, ['0', '400', '800', '1200', '1600', '2000'])
  const small = gaugeTicks(0, 2.5, { tickInterval: .1 })
  assert.equal(small.at(-1).label, '2.5')
  assert.ok(small.some(tick => tick.label === '0.5'))
  assert.deepEqual(gaugeTicks(-20, 80, { tickInterval: 20 }).filter(tick => tick.label).map(tick => tick.label), ['-20', '0', '20', '40', '60', '80'])
  assert.deepEqual(gaugeTicks(1, 1), [])
  const excessive = gaugeTicks(-100, 100, { tickInterval: .00000001, minorTickInterval: .000000001 })
  assert.ok(excessive.length < 603)
  assert.ok(excessive.every(tick => Number.isFinite(tick.value) && Number.isFinite(tick.ratio)))
})

test('WPF百分比、液位和流量转换只作用一次；空属性不是0', () => {
  const node = scale => ({ attributes: { valueScale: scale } })
  assert.equal(gaugeValueScale(node(100), { max: 1, unit: '' }), 100)
  assert.equal(gaugeValueScale(node(100), { max: 100, unit: '%' }), 1)
  assert.equal(gaugeValueScale(node(.1), { max: 2000, unit: 'mm' }), .1)
  assert.equal(gaugeValueScale(node(.1), { max: 200, unit: 'cm' }), 1)
  assert.equal(gaugeValueScale(node(60000), { max: 2, unit: 'FlowSpeed' }), 60000)
  assert.equal(gaugeValueScale(node(60000), { max: 25, unit: 'L/min' }), 1)
  assert.equal(finiteGaugeNumber(null, 25), 25)
  assert.equal(finiteGaugeNumber('', 25), 25)
  assert.equal(finiteGaugeNumber(0, 25), 0)
})
