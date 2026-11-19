import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createDevice, evaluateRule, inferDeviceKind, rulePatch, validateSnapshot } from '../src/state/engine.ts'

const imported = JSON.parse(readFileSync(new URL('../src/data/workflows.generated.json', import.meta.url), 'utf8'))
const archive = JSON.parse(readFileSync(new URL('../src/data/scenes.generated.json', import.meta.url), 'utf8'))

test('设备类别保持原 WPF 编号约定', () => {
  for (const [id, expected] of [['V1601', 'valve'], ['P101', 'pump'], ['Engine01', 'engine'], ['FanForPit7AMaster', 'fan'], ['Tit41', 'sensor'], ['Lit101', 'sensor'], ['Do101', 'sensor'], ['Rg001', 'hose'], ['T101', 'tank']]) assert.equal(inferDeviceKind(id), expected)
})
test('手动步骤只有实际设备满足规则才通过', () => {
  const devices = { V1601: createDevice('V1601'), P101: createDevice('P101') }
  assert.equal(evaluateRule({ name: 'V1601', type: 'ValveOpen' }, devices), false)
  devices.V1601.value = 100
  assert.equal(evaluateRule({ name: 'V1601', type: 'ValveOpen' }, devices), true)
  devices.P101.value = 100
  assert.equal(evaluateRule({ name: 'P101', type: 'DeviceOpen' }, devices), false)
  devices.P101.working = true
  assert.equal(evaluateRule({ name: 'P101', type: 'DeviceOpen' }, devices), true)
  devices.P101.error = true
  assert.equal(evaluateRule({ name: 'P101', type: 'DeviceOpen' }, devices), false)
})
test('故障或禁用的泵仍允许停机，故障处置不能要求先启动故障泵', () => {
  const device = createDevice('P102')
  device.error = true; device.enabled = false; device.working = true
  assert.equal(evaluateRule({ name: 'P102', type: 'DeviceClose' }, { P102: device }), false)
  Object.assign(device, rulePatch({ name: 'P102', type: 'DeviceClose' }, device))
  assert.equal(evaluateRule({ name: 'P102', type: 'DeviceClose' }, { P102: device }), true)
  assert.equal(evaluateRule({ name: 'P102', type: 'DeviceOpen' }, { P102: device }), false)
})
test('多设备条件必须全部满足，大小比较是严格边界', () => {
  const devices = { DI41: createDevice('DI41', 'sensor'), DI41A: createDevice('DI41A', 'sensor') }
  devices.DI41.value = .5; devices.DI41A.value = .4
  assert.equal(evaluateRule({ name: 'DI41 DI41A', type: 'GreaterThan', value: .4 }, devices), false)
  devices.DI41A.value = .5
  assert.equal(evaluateRule({ name: 'DI41 DI41A', type: 'GreaterThan', value: .4 }, devices), true)
  assert.equal(evaluateRule({ name: 'DI41', type: 'LessThan', value: .5 }, devices), false)
})
test('有效工况可加载；无穷数、数组、原型键和非法状态被拒绝', () => {
  const good = { schemaVersion: 1, name: '测试', elapsed: 6, devices: { V1601: createDevice('V1601') } }
  assert.equal(validateSnapshot(good).devices.V1601.value, 0)
  assert.throws(() => validateSnapshot(null))
  assert.throws(() => validateSnapshot({ ...good, schemaVersion: 2 }))
  assert.throws(() => validateSnapshot({ ...good, devices: [] }))
  assert.throws(() => validateSnapshot({ ...good, devices: { V1601: { ...good.devices.V1601, value: Infinity } } }))
  assert.throws(() => validateSnapshot({ ...good, devices: { V1601: { ...good.devices.V1601, working: 'yes' } } }))
  assert.throws(() => validateSnapshot(JSON.parse('{"schemaVersion":1,"devices":{"__proto__":{"value":0,"working":false,"enabled":true,"error":false}}}')))
})
test('工况保存并恢复传感器阈值、冻结和设备运行参数', () => {
  const sensor = { ...createDevice('Tit42'), frozen: true, alarmEnabled: true, low: 5, high: 40, lowLow: null, highHigh: 55 }
  const pump = { ...createDevice('P101'), powered: true, hasContent: false, duty: '备用' }
  const snapshot = validateSnapshot({ schemaVersion: 1, devices: { Tit42: sensor, P101: pump } })
  assert.equal(snapshot.devices.Tit42.frozen, true)
  assert.equal(snapshot.devices.Tit42.low, 5)
  assert.equal(snapshot.devices.Tit42.highHigh, 55)
  assert.equal(snapshot.devices.Tit42.lowLow, null)
  assert.equal(snapshot.devices.P101.hasContent, false)
  assert.equal(snapshot.devices.P101.duty, '备用')
  assert.throws(() => validateSnapshot({ schemaVersion: 1, devices: { Tit42: { ...sensor, high: 'NaN' } } }))
})
test('C1401原0.25归一化规则对应三通阀25%，保留原值', () => {
  const rule = imported.workflows.find(flow => flow.id === 'heating').steps.flatMap(step => step.rules).find(rule => rule.name === 'C1401')
  assert.equal(rule.value, 25)
  assert.equal(rule.sourceValue, .25)
})
test('完整导入 21 个流程、20 组工况及九类加注前安全门禁', () => {
  assert.equal(imported.workflows.length, 21)
  assert.equal(Object.keys(imported.presets).length, 20)
  assert.equal(new Set(imported.workflows.map(flow => flow.id)).size, 21)
  for (const id of ['shore-inerting', 'ship-inerting', 'bunkering', 'bunkering-purge']) assert.equal(imported.workflows.find(flow => flow.id === id).requiresSafety, true)
  assert.ok(imported.devices.Lit101.max >= 1750)
  assert.equal(imported.devices.Lit101.name, '甲醇燃料舱液位高高')
})
test('所有 308 个原规则操作都可被前端演示执行，且每个设备存在', () => {
  let total = 0
  for (const flow of imported.workflows) {
    const devices = structuredClone(imported.devices)
    for (const [id, patch] of Object.entries(flow.initial)) Object.assign(devices[id] ??= createDevice(id), patch)
    assert.ok(flow.source.startsWith('Simulator.Desktop/'))
    for (const step of flow.steps) {
      total++
      for (const rule of step.rules) {
        for (const id of rule.name.trim().split(/\s+/)) {
          assert.ok(devices[id], `${flow.id}: missing ${id}`)
          devices[id].error = false; devices[id].enabled = true
          Object.assign(devices[id], rulePatch(rule, devices[id]))
        }
        assert.ok(evaluateRule(rule, devices), `${flow.id}: ${step.name}`)
      }
    }
  }
  assert.equal(total, 308)
})
test('10 个工艺页面全部保留真实布局、管线、设备和导航节点', () => {
  const ids = ['overview', 'nitrogen', 'bunkering-front', 'bunkering', 'fuel-tank', 'lfss', 'engine', 'water', 'recovery', 'control']
  assert.deepEqual(Object.keys(archive.scenes).sort(), ids.sort())
  for (const scene of Object.values(archive.scenes)) {
    assert.equal(scene.width, 1920)
    assert.ok(scene.nodes.length > 20, `${scene.id} node count`)
    assert.equal(new Set(scene.nodes.map(node => node.id)).size, scene.nodes.length, `${scene.id} duplicate IDs`)
    for (const node of scene.nodes) {
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(node[key]), `${scene.id} ${node.id} ${key}`)
      assert.ok(!String(node.label).includes('{Binding'), `${scene.id} unresolved label`)
    }
  }
  assert.ok(archive.scenes.overview.nodes.length >= 600)
})
test('场景引用的本地图片存在，不依赖在线图标和图片', () => {
  function walk(value) {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    else if (typeof value === 'string' && value.startsWith('/assets/') && /\.(png|jpg|jpeg|svg)$/i.test(value)) {
      const url = new URL('../public' + value, import.meta.url)
      assert.ok(existsSync(url), `Missing asset: ${value}`)
    }
  }
  walk(archive)
})
