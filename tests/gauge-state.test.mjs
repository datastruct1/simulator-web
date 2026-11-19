import test from 'node:test'
import assert from 'node:assert/strict'
import { useSimulator } from '../src/state/simulator.ts'
import { deviceView, findDevice, openDevice, sensorDefinition } from '../src/components/dialogs/toolHelpers.ts'
import { nodeNumber, nodeRange, nodeUnit, nodeValue } from '../src/components/scene/scenes.ts'

const { state } = useSimulator()
const node = attributes => ({ id: 'gauge-fixture', kind: 'digital-gauge', label: '', x: 0, y: 0, width: 180, height: 180, attributes })

test('仪表读取中央状态，0覆盖原静态值，负数与单位不会按truthy回退', () => {
  const view = deviceView('Pit7A')
  assert.equal(nodeValue(node({ value: 18 }), { ...view, value: 0 }), 0)
  assert.equal(nodeValue(node({ value: 18 }), { ...view, value: -50 }), -50)
  assert.equal(nodeUnit(node({}), view), 'Pa')
  assert.equal(nodeNumber(node({ min: null }), 'min', -100), -100)
  assert.equal(nodeNumber(node({ min: '' }), 'min', -100), -100)
  assert.equal(nodeNumber(node({ min: 0 }), 'min', -100), 0)
})

test('主图和二级视图用相同液位/流量转换；静态量程优先于设备量程', () => {
  const level = { ...deviceView('Lit101'), value: 1250, unit: 'mm', min: 0, max: 2000 }
  const levelNode = node({ valueScale: .1, unit: 'cm' })
  assert.equal(nodeValue(levelNode, level), 125)
  assert.deepEqual(nodeRange(levelNode, level), { min: 0, max: 200 })
  assert.equal(nodeUnit(levelNode, level), 'cm')
  assert.equal(nodeValue(levelNode, { ...level, value: 125, unit: 'cm', max: 200 }), 125)
  const flowNode = node({ valueScale: 60000, unit: 'L/min', min: 0, max: 25 })
  assert.equal(nodeValue(flowNode, { ...deviceView('Ef101'), value: .0001, unit: 'FlowSpeed' }), 6)
  assert.equal(nodeValue(flowNode, { ...deviceView('Ef101'), value: 6, unit: 'L/min' }), 6)
  assert.deepEqual(nodeRange(node({ min: 0, max: 2000 }), deviceView('Er101')), { min: 0, max: 2000 })
})

test('sensor语义不被数字/指针视觉改写，设备定义不覆盖已应用单位与量程', () => {
  const sensor = state.devices.Pit7A
  const original = { ...sensor }
  try {
    Object.assign(sensor, { value: -25, unit: '测试Pa', min: -200, max: 75 })
    const view = deviceView('PIT7A', 'digital-gauge')
    assert.equal(view.id, sensor.id)
    assert.equal(view.kind, 'sensor')
    assert.equal(view.value, -25)
    assert.equal(view.unit, '测试Pa')
    assert.equal(view.min, -200)
    assert.equal(view.max, 75)
    assert.equal(sensor.kind, 'sensor')
    assert.strictEqual(state.devices.PIT7A, sensor)
    assert.strictEqual(findDevice('PIT-7A'), sensor)
    assert.equal(sensorDefinition('PIT-7A').id, 'Pit7A')
  } finally { Object.assign(sensor, original) }
})

test('工具入口传递视觉类型但不把sensor改成可控设备', () => {
  const oldModal = state.modal
  try {
    openDevice('PIT7A', 'digital-gauge')
    assert.equal(state.modal.payload.id, 'Pit7A')
    assert.equal(state.modal.payload.kind, 'digital-gauge')
    assert.equal(state.devices.Pit7A.kind, 'sensor')
    assert.strictEqual(state.devices.Pit7A, state.devices.PIT7A)
  } finally { state.modal = oldModal }
})
