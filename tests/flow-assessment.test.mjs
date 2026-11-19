import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import imported from '../src/data/workflows.generated.json'
import { createFlowAssessment, feedFlowAssessment, flowAssessmentDetails } from '../src/components/workspace/lib/flowAssessment.ts'

const flow = id => imported.workflows.find(item => item.id === id)
const definition = id => flow(id).assessment
const total = runtime => flowAssessmentDetails(runtime).reduce((sum, detail) => sum + detail.score, 0)
const possible = runtime => flowAssessmentDetails(runtime).reduce((sum, detail) => sum + detail.maxScore, 0)
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const valve = (id, value = 0, kind = 'valve') => ({ id, kind, value, working: value > 0 })
const pump = (id, working = false, value = 0) => ({ id, kind: 'pump', value, working })
const sensor = (id, value) => ({ id, kind: 'sensor', value, working: false })
const stage = (conditions = [], triggers = [], name = '测试阶段') => ({ name, watch: [], conditions, triggers })
const fixture = stages => ({ schemaVersion: 1, name: '评估测试', source: 'test/playbook.json', score: 100, stages })
const single = rule => fixture([stage([], [rule])])
const weighted = weights => fixture([stage([], weights.map((weight, index) => ({
  name: `V${index}`, type: 'ValveOpen', ...(weight === undefined ? {} : { weight }),
})))])
function initialDevices(id) {
  const devices = structuredClone(imported.devices)
  for (const [key, patch] of Object.entries(flow(id).initial)) Object.assign(devices[key] ??= { id: key }, patch)
  return devices
}
function pumpDevices() {
  return { P102: pump('P102', true, 100), V1202: valve('V1202', 100), D1202: valve('D1202', 100),
    P101: pump('P101'), V1201: valve('V1201'), D1201: valve('D1201') }
}
const closeFailure = [(devices) => { devices.P102.working = false }, (devices) => { devices.V1202.value = 0 }, (devices) => { devices.D1202.value = 0 }]
const openBackup = [(devices) => { devices.P101.working = true }, (devices) => { devices.V1201.value = 100 }, (devices) => { devices.D1201.value = 100 }]
const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function finiteJSON(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value))
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteJSON)
}

// WPF originals are optional on a standalone clone; committed resources are always tested.
const originalRoots = [
  process.env.WPF_SOURCE_ROOT,
  fileURLToPath(new URL('../../Simulator/src/', import.meta.url)),
  fileURLToPath(new URL('../../', import.meta.url)),
  fileURLToPath(new URL('../../../', import.meta.url)),
].filter(Boolean)
const assessedFlows = imported.workflows.filter(item => item.assessment)
const originalRoot = originalRoots.find(root => assessedFlows.every(item => existsSync(join(root, item.source))))

test('仅10个原playbook新增完整assessment；21flows/308演示steps/设备工况保留', () => {
  assert.equal(imported.workflows.length, 21)
  assert.equal(imported.workflows.reduce((sum, item) => sum + item.steps.length, 0), 308)
  assert.equal(Object.keys(imported.devices).length, 240)
  assert.equal(Object.keys(imported.presets).length, 20)
  const assessed = imported.workflows.filter(item => item.assessment)
  assert.equal(assessed.length, 10)
  assert.equal(assessed.reduce((sum, item) => sum + item.assessment.stages.length, 0), 20)
  assert.equal(assessed.reduce((sum, item) => sum + item.assessment.stages.reduce((n, set) => n + set.conditions.length + set.triggers.length, 0), 0), 139)
  for (const item of assessed) {
    assert.equal(item.assessment.schemaVersion, 1)
    assert.equal(item.assessment.source, item.source)
    for (const [index, set] of item.assessment.stages.entries()) {
      assert.equal(set.source, `${item.source}#/steps/${index}`)
      assert.ok(Array.isArray(set.watch))
      for (const rule of [...set.conditions, ...set.triggers]) {
        assert.ok(rule.source.startsWith(`${item.source}#/steps/${index}/`))
        assert.ok(Object.hasOwn(rule, 'rawWeight'))
        if (rule.sourceValue !== undefined) {
          assert.equal(rule.name, 'C1401')
          assert.equal(rule.value, rule.sourceValue * 100)
        }
      }
    }
  }
  assert.equal(definition('cooling').stages[0].triggers.filter(rule => rule.name === 'H1403').length, 2)
  assert.equal(definition('supply').stages[2].conditions.length, 3) // Preserve the singular condition field too.
  for (const item of imported.workflows.filter(item => !item.assessment)) assert.ok(item.source.includes('/Resources/Jsons/'))
})

test('可用WPF原件与已提交assessment逐字段一致', { skip: originalRoot ? false : '未安装WPF原件；已提交资源结构和所有评分规则仍正常测试' }, () => {
  for (const item of assessedFlows) {
    const raw = JSON.parse(readFileSync(join(originalRoot, item.source), 'utf8').replace(/^\uFEFF/, ''))
    assert.equal(item.assessment.score, raw.score)
    assert.equal(item.assessment.name, raw.name)
    assert.equal(item.assessment.stages.length, raw.steps.length)
    for (const [index, set] of item.assessment.stages.entries()) {
      assert.equal(set.name, raw.steps[index].name)
      assert.deepEqual(set.watch, raw.steps[index].watch)
      for (const key of ['conditions', 'triggers']) {
        const originalKey = key === 'conditions' && !Object.hasOwn(raw.steps[index], key) ? 'condition' : key
        const originals = raw.steps[index][originalKey] || []
        assert.equal(set[key].length, originals.length)
        for (const [ruleIndex, rule] of set[key].entries()) {
          const { rawWeight, source, sourceValue, ...preserved } = rule
          const original = { ...originals[ruleIndex] }
          assert.equal(rawWeight, original.weight ?? null)
          assert.equal(source, `${item.source}#/steps/${index}/${originalKey}/${ruleIndex}`)
          if (sourceValue !== undefined) { assert.equal(original.name, 'C1401'); assert.equal(sourceValue, original.value); original.value *= 100 }
          assert.deepEqual(preserved, original)
        }
      }
    }
  }
})

test('原泵失效两阶段各3触发器；全部36种阶段内操作顺序均可结算', () => {
  assert.deepEqual(definition('pump-failure').stages.map(set => [set.conditions.length, set.triggers.length]), [[0, 3], [0, 3]])
  for (const first of orders) for (const second of orders) {
    const devices = pumpDevices()
    let runtime = createFlowAssessment(definition('pump-failure'), 100)
    for (const [offset, index] of first.entries()) {
      closeFailure[index](devices)
      const result = feedFlowAssessment(runtime, devices, 100 + offset)
      assert.equal(result.advanced, offset === 2)
      assert.equal(result.completed, false)
      runtime = result.runtime
      near(total(runtime), offset === 2 ? 50 : 0)
    }
    assert.equal(runtime.nextStageIndex, 1)
    assert.deepEqual(runtime.rules.slice(0, 3).map(rule => rule.completedAt), [102, 102, 102])
    assert.deepEqual(runtime.rules.slice(3).map(rule => rule.passed), [null, null, null])
    for (const [offset, index] of second.entries()) {
      openBackup[index](devices)
      const result = feedFlowAssessment(runtime, devices, 200 + offset)
      assert.equal(result.advanced, offset === 2)
      assert.equal(result.completed, offset === 2)
      runtime = result.runtime
      near(total(runtime), offset === 2 ? 100 : 50)
    }
    const before = flowAssessmentDetails(runtime)
    const again = feedFlowAssessment(runtime, devices, 999)
    assert.equal(again.runtime, runtime)
    assert.equal(again.advanced, false)
    assert.deepEqual(flowAssessmentDetails(again.runtime), before)
  }
})

test('触发器必须在同一快照同时满足，不能跨帧锁存；每feed最多推进一阶段', () => {
  const devices = pumpDevices()
  let runtime = createFlowAssessment(definition('pump-failure'))
  closeFailure[0](devices)
  runtime = feedFlowAssessment(runtime, devices, 1).runtime
  devices.P102.working = true // Undo the first trigger before the other two pass.
  closeFailure[1](devices); closeFailure[2](devices)
  const blocked = feedFlowAssessment(runtime, devices, 2)
  assert.equal(blocked.advanced, false)
  assert.equal(blocked.runtime.nextStageIndex, 0)
  assert.equal(total(blocked.runtime), 0)
  closeFailure[0](devices)
  openBackup.forEach(action => action(devices)) // Both stages' full snapshots are now satisfied.
  const one = feedFlowAssessment(blocked.runtime, devices, 3)
  assert.equal(one.runtime.nextStageIndex, 1)
  assert.equal(one.completed, false)
  near(total(one.runtime), 50)
  near(total(feedFlowAssessment(one.runtime, devices, 4).runtime), 100)
})

test('原加注条件失败不阻塞阶段，逐条部分分；失败条件不能在后续阶段补分', () => {
  const devices = initialDevices('bunkering')
  for (const rule of definition('bunkering').stages[0].triggers) devices[rule.name].value = 100
  devices.Do101.value = .21
  devices.Rg001.value = 100; devices.Rg002.value = 0; devices.Rg003.value = 100
  devices.Lit101.value = 0
  const before = createFlowAssessment(definition('bunkering'), 200)
  const settled = feedFlowAssessment(before, devices, 100)
  assert.equal(settled.advanced, true)
  assert.equal(settled.completed, false)
  assert.equal(total(before), 0)
  near(possible(settled.runtime), 200)
  near(total(settled.runtime), 166)
  const failed = settled.runtime.rules.filter(rule => rule.passed === false)
  assert.equal(failed.length, 2)
  assert.ok(failed.every(rule => rule.evaluatedAt === 100 && rule.completedAt === null && rule.score === 0))
  assert.equal(flowAssessmentDetails(settled.runtime).find(detail => detail.deviceId === 'Do101').message, '惰化未完成')
  devices.Do101.value = .01; devices.Rg002.value = 100; devices.Lit101.value = 1800
  const resumed = JSON.parse(JSON.stringify(settled.runtime))
  const finished = feedFlowAssessment(resumed, devices, 200)
  assert.equal(finished.completed, true)
  near(total(finished.runtime), 180)
  assert.deepEqual(finished.runtime.rules.filter(rule => rule.passed === false), failed)
  assert.equal(flowAssessmentDetails(finished.runtime).find(detail => detail.deviceId === 'Do101').response, 'Do101=0.21')
})

test('全局原权重折算而非阶段均分；原甲醇供应sum=1.2修正并保留rawWeight/notes', () => {
  const runtime = createFlowAssessment(definition('supply'), 240)
  assert.equal(runtime.rules.length, 19)
  assert.equal(runtime.weightConfiguration.strategy, 'normalized')
  assert.ok(runtime.notes.some(note => /1\.2.*归一化/.test(note)))
  assert.ok(runtime.notes.some(note => /零分母/.test(note)))
  near(possible(runtime), 240)
  runtime.rules.forEach(rule => near(rule.weight, rule.rawWeight / 1.2))
  const first = feedFlowAssessment(runtime, { Lit101: sensor('Lit101', 1800) }, 1)
  assert.equal(first.runtime.nextStageIndex, 1)
  near(total(first.runtime), 20) // 0.1 / 1.2 * 240, not 1/3 of the flow.
  assert.ok(flowAssessmentDetails(first.runtime).slice(1).every(detail => !detail.passed && detail.score === 0 && detail.evaluatedAt === null))
})

test('null/省略权重共享剩余份额，显式0不被赋分；外部maxScore缩放', () => {
  const runtime = createFlowAssessment(weighted([.2, null, undefined, 0]), 80)
  assert.equal(runtime.weightConfiguration.strategy, 'residual')
  near(runtime.weightConfiguration.defaultWeight, .4)
  assert.deepEqual(runtime.rules.map(rule => rule.weightSpecified), [true, true, false, true])
  runtime.rules.forEach((rule, index) => near(rule.maxScore, [16, 32, 32, 0][index]))
  near(possible(runtime), 80)
  assert.equal(total(runtime), 0)
  assert.deepEqual(JSON.parse(JSON.stringify(runtime)), runtime)
  const devices = Object.fromEntries(runtime.rules.map((_, index) => [`V${index}`, valve(`V${index}`, 100)]))
  const completed = feedFlowAssessment(runtime, devices, 0).runtime
  near(total(completed), 80)
  assert.equal(completed.rules[3].passed, true)
  assert.equal(completed.rules[3].score, 0)
  assert.equal(completed.rules[3].completedAt, 0)
  const zeroResidual = createFlowAssessment(weighted([1, null]))
  assert.deepEqual(zeroResidual.rules.map(rule => rule.weight), [1, 0])
})

test('非法剩余权重用正权重均值补齐再归一化；负数/非有限/全零/溢出均无NaN', () => {
  const oversubscribed = createFlowAssessment(weighted([.8, .4, null, undefined]), 60)
  assert.equal(oversubscribed.weightConfiguration.strategy, 'mean-fallback')
  oversubscribed.rules.forEach((rule, index) => near(rule.maxScore, [20, 10, 15, 15][index]))
  assert.ok(oversubscribed.notes.some(note => /不能分配负/.test(note)))
  const invalid = createFlowAssessment(weighted([-.2, NaN, Infinity, undefined, .6]))
  assert.deepEqual(invalid.rules.map(rule => rule.rawWeight), [-.2, 'NaN', 'Infinity', null, .6])
  assert.equal(invalid.weightConfiguration.missingCount, 4)
  near(possible(invalid), 100)
  assert.ok(invalid.notes.some(note => /NaN.*修正/.test(note)))
  const zero = createFlowAssessment(weighted([0, 0]))
  assert.equal(zero.weightConfiguration.strategy, 'equal-fallback')
  assert.deepEqual(zero.rules.map(rule => rule.weight), [.5, .5])
  const overflow = createFlowAssessment(weighted([1e308, 1e308, null]))
  assert.equal(overflow.weightConfiguration.rawExplicitSum, null)
  assert.equal(overflow.weightConfiguration.strategy, 'mean-fallback')
  near(possible(overflow), 100)
  assert.ok(overflow.notes.some(note => /溢出/.test(note)))
  for (const runtime of [oversubscribed, invalid, zero, overflow]) {
    finiteJSON(JSON.parse(JSON.stringify(runtime)))
    assert.equal(total(runtime), 0)
    assert.ok(runtime.rules.every(rule => rule.weight >= 0 && rule.maxScore >= 0))
    const devices = Object.fromEntries(runtime.rules.map((_, index) => [`V${index}`, valve(`V${index}`, 100)]))
    const completed = feedFlowAssessment(JSON.parse(JSON.stringify(runtime)), devices, 1)
    assert.equal(completed.completed, true)
    near(total(completed.runtime), runtime.maxScore)
    finiteJSON(JSON.parse(JSON.stringify(completed.runtime)))
  }
})

test('设备大小写和空格多设备名字逐个验证；未知成员不会给满分', () => {
  const raw = fixture([stage([{ name: 'DI41 DI41A', type: 'GreaterThan', value: .4, weight: .1, message: '同时达到40%自动切断阀门' }],
    [{ name: 'p101', type: 'DeviceClose', weight: .9 }])])
  for (const [second, score] of [[undefined, 90], [.4, 90], [.5, 100]]) {
    const devices = { P101: pump('P101', false, 100), di41: sensor('di41', .5) }
    if (second !== undefined) devices.di41a = sensor('di41a', second)
    const result = feedFlowAssessment(createFlowAssessment(raw), devices, 1)
    assert.equal(result.completed, true)
    near(total(result.runtime), score)
    assert.equal(result.runtime.rules[0].readings.length, 2)
  }
  const aliased = { V1: valve('V1', 100), v1: valve('v1', 0) }
  assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'V1', type: 'ValveOpen' })), aliased, 1).advanced, true)
  assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'v1', type: 'ValveOpen' })), aliased, 1).advanced, false)
  const sharedSensor = sensor('Tit42', 30), shared = { Tit42: sharedSensor, TIT42: sharedSensor }
  for (const name of ['Tit42', 'TIT42', 'tIt42']) {
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name, type: 'GreaterThan', value: 20 })), shared, 1).advanced, true)
  }
  shared.TIT42.value = 20
  assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'Tit42', type: 'GreaterThan', value: 20 })), shared, 2).advanced, false)
  const hose = valve('Rg001', 100, 'hose')
  assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'rg001', type: 'ValveOpen' })), { Rg001: hose, RG001: hose }, 1).advanced, true)
})

test('缺失/空白/原型设备与未知规则类型不通过；缺少比较目标不得默认满足', () => {
  for (const name of ['Missing', '', ' ', '__proto__', 'constructor']) {
    for (const type of ['ValveOpen', 'ValveClose', 'DeviceOpen', 'DeviceClose', 'EqualsTo', 'LessThan', 'GreaterThan']) {
      const runtime = createFlowAssessment(single({ name, type, value: 0 }))
      assert.equal(feedFlowAssessment(runtime, {}, 1).advanced, false)
      assert.equal(total(runtime), 0)
    }
  }
  const inherited = Object.create({ V1: valve('V1', 100) })
  assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'V1', type: 'ValveOpen' })), inherited, 1).advanced, false)
  for (const type of ['LessThan', 'GreaterThan', 'EqualsTo', 'SensorGreater', 'Unknown']) {
    const result = feedFlowAssessment(createFlowAssessment(single({ name: 'Tit42', type })), { Tit42: sensor('Tit42', 25) }, 1)
    assert.equal(result.advanced, false)
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'V1', type: 'ValveClose' })), { V1: valve('V1', value) }, 1).advanced, false)
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'Tit42', type: 'EqualsTo', value })), { Tit42: sensor('Tit42', 25) }, 1).advanced, false)
  }
})

test('原船载惰化缺value的条件永久失分，完成触发阶段也不虚给100分', () => {
  const raw = definition('ship-inerting'), devices = initialDevices('ship-inerting')
  for (const rule of raw.stages[0].triggers) devices[rule.name].value = 100
  devices.Do101.value = .01
  const first = feedFlowAssessment(createFlowAssessment(raw), devices, 1)
  assert.equal(first.advanced, true)
  assert.equal(first.runtime.rules[0].passed, false)
  const finished = feedFlowAssessment(first.runtime, devices, 2)
  assert.equal(finished.completed, true)
  near(total(finished.runtime), 90)
  assert.ok(finished.runtime.notes.some(note => /value 未定义/.test(note)))
})

test('阀门/软管开关采用原0.01状态阈值（Web严格1%）；泵使用working而非遗留value', () => {
  for (const value of [0, .01, .999999, 1, 1.000001, 100]) for (const kind of ['valve', 'hose']) {
    for (const [type, expected] of [['ValveOpen', value > 1], ['ValveClose', value < 1]]) {
      const result = feedFlowAssessment(createFlowAssessment(single({ name: 'V1', type })), { V1: valve('V1', value, kind) }, 1)
      assert.equal(result.advanced, expected, `${kind} ${type} ${value}`)
    }
  }
  for (const type of ['ValveOpen', 'DeviceOpen']) {
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'P101', type })), { P101: pump('P101', false, 100) }, 1).advanced, false)
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'P101', type })), { P101: pump('P101', true, 0) }, 1).advanced, true)
  }
  for (const type of ['ValveClose', 'DeviceClose']) {
    const stopped = { ...pump('P102', false, 100), error: true, enabled: false }
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'P102', type })), { P102: stopped }, 1).advanced, true)
    assert.equal(feedFlowAssessment(createFlowAssessment(single({ name: 'P102', type })), { P102: { id: 'P102', kind: 'pump', value: 0 } }, 1).advanced, false)
  }
})

test('原数值比较为严格边界与double.Epsilon，不能用演示的宽松近似', () => {
  for (const [type, value, target, expected] of [
    ['EqualsTo', 25, 25, true], ['EqualsTo', 25 + 1e-8, 25, false], ['EqualsTo', Number.MIN_VALUE, 0, false],
    ['LessThan', 25, 25, false], ['LessThan', 25 - 1e-8, 25, true],
    ['GreaterThan', 25, 25, false], ['GreaterThan', 25 + 1e-8, 25, true],
    ['GreaterThan', Number.MIN_VALUE, 0, false], ['GreaterThan', Number.MIN_VALUE * 2, 0, true],
  ]) {
    const result = feedFlowAssessment(createFlowAssessment(single({ name: 'Tit42', type, value: target })), { Tit42: sensor('Tit42', value) }, 1)
    assert.equal(result.advanced, expected, `${type} ${value} ${target}`)
  }
})

test('C1401=0.25→25保留sourceValue，温度上下限同阶段同时满足；显式0仍保留', () => {
  const raw = definition('heating'), devices = initialDevices('heating')
  const cRules = raw.stages.flatMap(set => set.triggers).filter(rule => rule.name === 'C1401')
  assert.ok(cRules.every(rule => rule.value === 25 && rule.sourceValue === .25))
  for (const rule of raw.stages[0].triggers) {
    devices[rule.name].value = 100
    if (devices[rule.name].kind === 'pump') devices[rule.name].working = true
  }
  devices.C1401.value = 25 + 1e-8
  let runtime = createFlowAssessment(raw)
  assert.equal(feedFlowAssessment(runtime, devices, 1).advanced, false)
  devices.C1401.value = 25
  runtime = feedFlowAssessment(runtime, devices, 2).runtime
  near(total(runtime), 80)
  devices.Tit42.value = 20; devices.TIT42.value = 30
  assert.equal(feedFlowAssessment(runtime, devices, 3).advanced, false) // Exact original ID wins over an alias.
  devices.Tit42.value = 40
  assert.equal(feedFlowAssessment(runtime, devices, 4).advanced, false)
  devices.Tit42.value = 30; devices.TIT42.value = 99
  const final = feedFlowAssessment(runtime, devices, 5)
  assert.equal(final.completed, true)
  near(total(final.runtime), 100)
  const zero = final.runtime.rules.find(rule => rule.rawWeight === 0)
  assert.equal(zero.passed, true)
  assert.equal(zero.maxScore, 0)
  assert.equal(zero.completedAt, 5)
})

test('调用方提供手动影子快照时，自动演示/外部控制/工况变化不会借后续手动操作补分', () => {
  const actualDevices = pumpDevices(), manualDevices = structuredClone(actualDevices)
  let runtime = createFlowAssessment(definition('pump-failure'))
  const observe = (source, at, actions = []) => {
    actions.forEach(action => action(actualDevices))
    if (source === 'manual') {
      actions.forEach(action => action(manualDevices))
      runtime = feedFlowAssessment(runtime, manualDevices, at).runtime
    }
  }
  observe('manual', 1)
  observe('auto-demo', 2, [...closeFailure, ...openBackup])
  for (const source of ['external-control', 'workload', 'system']) observe(source, 2)
  assert.equal(runtime.nextStageIndex, 0)
  assert.equal(total(runtime), 0) // Collect cannot see the now-perfect actual devices.
  observe('manual', 3, [closeFailure[0]])
  assert.equal(total(runtime), 0) // The other two automatic closures must not leak into this feed.
  observe('manual', 4, [closeFailure[1]])
  observe('manual', 5, [closeFailure[2]])
  assert.equal(runtime.nextStageIndex, 1)
  near(total(runtime), 50)
  observe('auto-demo', 6, openBackup)
  observe('manual', 7) // A later manual observation cannot inherit automatic backup-pump startup.
  assert.equal(runtime.nextStageIndex, 1)
  near(total(runtime), 50)
})

test('JSON运行态可恢复条件失败/完成时间/原定义与权重；纯函数不改变输入', () => {
  const raw = fixture([stage([{ name: 'Tit42', type: 'GreaterThan', value: 40, weight: .4 }], [{ name: 'V1', type: 'ValveOpen', weight: .3 }]),
    stage([], [{ name: 'V2', type: 'ValveOpen', weight: .3 }])])
  const runtime = createFlowAssessment(raw)
  raw.stages[0].conditions[0].weight = 1
  raw.stages[0].conditions[0].value = 0
  assert.equal(runtime.definition.stages[0].conditions[0].value, 40)
  near(runtime.rules[0].weight, .4)
  const devices = freeze({ V1: valve('V1', 100), V2: valve('V2'), Tit42: sensor('Tit42', 20) })
  const before = JSON.stringify(runtime)
  const first = feedFlowAssessment(freeze(runtime), devices, 123).runtime
  assert.equal(JSON.stringify(runtime), before)
  const restored = JSON.parse(JSON.stringify(first))
  assert.deepEqual(restored, first)
  const final = feedFlowAssessment(freeze(restored), freeze({ ...devices, V2: valve('V2', 100), Tit42: sensor('Tit42', 50) }), 456).runtime
  near(total(final), 60)
  assert.deepEqual(final.stageCompletedAt, [123, 456])
  assert.equal(final.rules[0].passed, false)
  assert.equal(final.rules[0].evaluatedAt, 123)
  assert.equal(final.rules[0].completedAt, null)
  const details = flowAssessmentDetails(final)
  details[0].score = 999
  near(total(final), 60)
  finiteJSON(JSON.parse(JSON.stringify(final)))
})

test('空规则/空流程不虚给满分，空触发阶段每帧最多推进一个；时间/总分拒绝NaN', () => {
  const empty = createFlowAssessment(fixture([]))
  assert.deepEqual(flowAssessmentDetails(empty), [])
  assert.equal(total(empty), 0)
  assert.equal(feedFlowAssessment(empty, {}, 0).completed, true)
  const two = createFlowAssessment(fixture([stage(), stage()]))
  const first = feedFlowAssessment(two, {}, 0)
  assert.equal(first.runtime.nextStageIndex, 1)
  assert.equal(first.completed, false)
  assert.equal(total(first.runtime), 0)
  assert.equal(feedFlowAssessment(first.runtime, {}, 1).completed, true)
  for (const max of [NaN, Infinity, -1, '100']) assert.throws(() => createFlowAssessment(weighted([1]), max), RangeError)
  for (const at of [NaN, Infinity, -1]) assert.throws(() => feedFlowAssessment(two, {}, at), RangeError)
  const noPoints = createFlowAssessment(weighted([1]), 0)
  assert.equal(total(feedFlowAssessment(noPoints, { V0: valve('V0', 100) }, 0).runtime), 0)
})
