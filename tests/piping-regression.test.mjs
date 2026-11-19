import test from 'node:test'
import assert from 'node:assert/strict'
import { initialDevices } from '../src/data/catalog.ts'
import { pipingTopology } from '../src/data/piping.ts'
import { canonicalPipeId, resolvePiping } from '../src/state/pipingEngine.ts'

const valve = (id, value = 100, extra = {}) => ({ id, kind: 'valve', value, working: value > 0, enabled: true, error: false, ...extra })
const hose = (id, extra = {}) => ({ id, kind: 'hose', value: 100, working: true, enabled: true, error: false, ...extra })
const junction = id => ({ id, kind: 'junction' })
const segment = (pipe, forward = true) => ({ pipe, forward })
const route = (from, to, pipe) => ({ from, to, segments: [segment(pipe)] })
const resolve = (devices, flowId, running = true, topology = pipingTopology) => resolvePiping(devices, { flowId, running }, topology)

function smallTopology(routes, sources, activePipes = [], canonicalPipes = {}) {
  return {
    schemaVersion: 1, routes, canonicalPipes, aliases: {}, media: [], substanceType: {},
    virtualSources: sources.filter(source => source.kind === 'root').map(source => source.node), sinkTanks: [],
    flowProfiles: { test: { id: 'test', name: 'test', medium: sources[0]?.medium ?? 'empty', sources, pumps: [], activePipes, animationGroups: [] } },
    extraProfiles: {}, sourceNotes: [], audit: {},
  }
}

function readyPlant() {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) {
    if (device.kind === 'valve' || device.kind === 'hose') Object.assign(device, { value: 100, working: true, enabled: true, error: false })
  }
  devices.C1401.value = 75
  for (const id of ['P101', 'P102', 'P201', 'P202', 'P401', 'P402', 'Engine01', 'Engine02']) Object.assign(devices[id], { working: true, enabled: true, error: false })
  return devices
}

function assertStaticMedium(result, medium) {
  const rows = Object.values(result.pipes).filter(pipe => pipe.medium === medium)
  assert.ok(rows.length > 0, `${medium} still filled`)
  assert.ok(rows.every(pipe => pipe.filled && !pipe.flowing), `${medium} must not animate`)
}

function assertFlowingMedium(result, medium) {
  assert.ok(Object.values(result.pipes).some(pipe => pipe.medium === medium && pipe.flowing), `${medium} has an active path`)
}

test('未知节点不被自动当作开阀；显式汇合节点才允许介质继续传播', () => {
  const t = smallTopology([route('S', 'J', 'in'), route('J', 'Outdoor@J', 'out')], [{ kind: 'root', node: 'S', medium: 'methanol' }])
  assert.equal(resolve({}, 'test', false, t).pipes.out.filled, false)
  assert.equal(resolve({ J: junction('J') }, 'test', false, t).pipes.out.medium, 'methanol')
})

test('自定义拓扑别名同样用于填充、阻断及动画，不偷偷使用生产别名表', () => {
  const t = smallTopology([route('S', 'A', 'in'), route('A', 'B', 'branch'), route('B', 'Outdoor@B', 'out')], [{ kind: 'root', node: 'S', medium: 'nitrogen' }],
    [{ pipe: 'branch', medium: 'nitrogen', flowForward: false }], { branch: 'main' })
  assert.equal(canonicalPipeId('Pipebranch', t), 'main')
  const closed = resolve({ A: valve('A', 0), B: valve('B') }, 'test', true, t)
  assert.equal(closed.pipes.main.filled, false)
  assert.equal(closed.pipes.main.blockedBy, 'A')
  const opened = resolve({ A: valve('A'), B: valve('B') }, 'test', true, t)
  assert.equal(opened.pipes.main.medium, 'nitrogen')
  assert.equal(opened.pipes.main.flowing, true)
  assert.equal(opened.pipes.main.forward, false, '动画使用原 authored direction')
  assert.equal(opened.pipes.branch, undefined)
})

test('故障、禁用或未工作的软管均阻断下游，不能仅凭旧开度着色', () => {
  const t = smallTopology([route('S', 'Rg', 'in'), route('Rg', 'Outdoor@Rg', 'out')], [{ kind: 'root', node: 'S', medium: 'methanol' }])
  for (const extra of [{ connected: false }, { error: true }, { enabled: false }, { working: false }, { value: 0 }]) {
    const result = resolve({ Rg: hose('Rg', extra) }, 'test', true, t)
    assert.equal(result.pipes.in.filled, true)
    assert.equal(result.pipes.out.filled, false, JSON.stringify(extra))
    assert.equal(result.pipes.out.blockedBy, 'Rg')
  }
})

test('止回阀只允许正向穿透；反向只能填到出口，不串入上游', () => {
  const routes = [route('S', 'A', 'in'), route('A', 'D1201', 'before'), route('D1201', 'B', 'after'), route('B', 'Outdoor@B', 'out')]
  const devices = { A: valve('A'), D1201: valve('D1201'), B: valve('B') }
  const forward = smallTopology(routes, [{ kind: 'root', node: 'S', medium: 'methanol' }])
  assert.ok(Object.values(resolve(devices, 'test', false, forward).pipes).every(pipe => pipe.filled))
  const reverse = smallTopology(routes, [{ kind: 'boundary', node: 'B', terminal: 'Outdoor@B', medium: 'methanol' }])
  const result = resolve(devices, 'test', false, reverse)
  assert.equal(result.pipes.after.filled, true)
  assert.equal(result.pipes.before.filled, false)
  assert.equal(result.pipes.in.filled, false)
})

test('C1401 未选入口只能填到阀前，25/50/75 与无效100不可等同普通开度', () => {
  const t = smallTopology([
    route('S', 'V1403', 'feed'), route('V1403', 'C1401', 'bypass-in'),
    route('V1402', 'C1401', 'exchanger-in'), route('C1401', 'R', 'return'), route('R', 'Outdoor@R', 'out'),
  ], [{ kind: 'root', node: 'S', medium: 'water-glycol' }])
  const devices = { V1403: valve('V1403'), V1402: valve('V1402'), C1401: valve('C1401', 25), R: junction('R') }
  const exchangerOnly = resolve(devices, 'test', false, t)
  assert.equal(exchangerOnly.pipes['bypass-in'].filled, true)
  assert.equal(exchangerOnly.pipes.return.filled, false, '右口未选，不得进入上口')
  devices.C1401.value = 50
  const bypassOnly = resolve(devices, 'test', false, t)
  assert.equal(bypassOnly.pipes.return.filled, true)
  assert.equal(bypassOnly.pipes['exchanger-in'].filled, false, '关闭的下口不得被反向穿透')
  devices.C1401.value = 75
  assert.equal(resolve(devices, 'test', false, t).pipes['exchanger-in'].filled, true)
  for (const value of [0, 20, 30, 45, 55, 70, 80, 100]) {
    devices.C1401.value = value
    assert.equal(resolve(devices, 'test', false, t).pipes.return.filled, false, `${value} is not a valid three-way port state`)
  }
})

test('WPF 门控表存在时缺失的组必须停止动画，不能退回整场 activePipes', () => {
  const t = smallTopology([route('S', 'A', 'p')], [{ kind: 'root', node: 'S', medium: 'methanol' }], [{ pipe: 'p', medium: 'methanol', flowForward: true }])
  t.flowProfiles.test.animationGroups = ['missing']
  t.flowGroups = {}
  const result = resolve({ A: valve('A') }, 'test', true, t)
  assert.equal(result.pipes.p.filled, true)
  assert.equal(result.pipes.p.flowing, false)
})

test('真实冷热水图 P401/P402 分别控制主副回路，停机/故障/禁用不互相借泵', () => {
  for (const flowId of ['heating', 'cooling']) {
    const main = flowId === 'heating' ? 'hot-water-glycol' : 'cold-water-glycol'
    const secondary = flowId === 'heating' ? 'hot-water' : 'cold-water'
    for (const patch of [{ working: false }, { error: true }, { enabled: false }]) {
      const devices = readyPlant()
      Object.assign(devices.P402, patch)
      const mainOnly = resolve(devices, flowId)
      assertStaticMedium(mainOnly, secondary)
      assertFlowingMedium(mainOnly, main)
      Object.assign(devices.P402, { working: true, enabled: true, error: false })
      Object.assign(devices.P401, patch)
      const secondaryOnly = resolve(devices, flowId)
      assertStaticMedium(secondaryOnly, main)
      assertFlowingMedium(secondaryOnly, secondary)
    }
  }
})

test('真实冷热水图 C1401 只让被选中的换热/旁通支路流动，填充仍保留', () => {
  const devices = readyPlant()
  for (const [value, exchanger, bypass] of [[25, true, false], [50, false, true], [75, true, true]]) {
    devices.C1401.value = value
    const result = resolve(devices, 'heating')
    assert.equal(result.pipes['208'].filled, true)
    assert.equal(result.pipes['201'].filled, true)
    assert.equal(result.pipes['208'].flowing, exchanger, `${value}: heat exchanger`)
    assert.equal(result.pipes['201'].flowing, bypass, `${value}: bypass`)
    assertFlowingMedium(result, 'hot-water')
  }
  for (const value of [0, 100]) {
    devices.C1401.value = value
    assertStaticMedium(resolve(devices, 'heating'), 'hot-water-glycol')
  }
  devices.C1401.value = 25
  devices.V1401.value = 0
  const closedLoop = resolve(devices, 'heating')
  assert.equal(closedLoop.pipes['229'].filled, true)
  assertStaticMedium(closedLoop, 'hot-water-glycol')
})

test('真实副水回路出口全关时，不能把死端填充伪装成持续流动', () => {
  const devices = readyPlant()
  devices.H1405.value = 0
  devices.H1406.value = 0
  const hotDeadEnd = resolve(devices, 'heating')
  assert.equal(hotDeadEnd.pipes['220'].medium, 'hot-water')
  assertStaticMedium(hotDeadEnd, 'hot-water')
  assertFlowingMedium(hotDeadEnd, 'hot-water-glycol')
  devices.H1402.value = 0
  const coldDeadEnd = resolve(devices, 'cooling')
  assertStaticMedium(coldDeadEnd, 'cold-water')
  assertFlowingMedium(coldDeadEnd, 'cold-water-glycol')
})

test('真实供应图停泵支路与停机发动机不流动，另一条通路不受影响', () => {
  const devices = readyPlant()
  devices.P102.working = false
  const p101Only = resolve(devices, 'supply')
  assert.equal(p101Only.pipes['91'].flowing, true)
  assert.equal(p101Only.pipes['92'].filled, true)
  assert.equal(p101Only.pipes['92'].flowing, false)
  devices.P101.working = false
  devices.P102.working = true
  const p102Only = resolve(devices, 'supply')
  assert.equal(p102Only.pipes['91'].flowing, false)
  assert.equal(p102Only.pipes['92'].flowing, true)
  assert.equal(p102Only.pipes['63'].forward, false)
  devices.Engine01.working = false
  const engine02Only = resolve(devices, 'supply')
  assert.equal(engine02Only.pipes['82'].filled, true)
  assert.equal(engine02Only.pipes['82'].flowing, false)
  assert.equal(engine02Only.pipes['89'].flowing, true)
  devices.Engine01.working = true
  devices.V1231.value = 0
  const closedBranch = resolve(devices, 'supply')
  assert.equal(closedBranch.pipes['80'].filled, true)
  assert.equal(closedBranch.pipes['80'].flowing, false, '关闭支路不得继续在阀前流动')
  assert.equal(closedBranch.pipes['81'].filled, false)
  assert.equal(closedBranch.pipes['89'].flowing, true)
})

test('真实加注入液从 V1002，罐顶排气从 M1101：液路甲醇、出气氮气不串色', () => {
  const devices = readyPlant()
  // Inerting/sweep cross-links must remain closed in the actual bunkering circuit.
  for (const id of ['M1005', 'V1004', 'V1603', 'V1604', 'V1609']) devices[id].value = 0
  const result = resolve(devices, 'bunkering')
  for (const id of ['1755764815355', '34', '40', '36', '1754630791']) {
    assert.equal(result.pipes[id].medium, 'methanol', `${id}: liquid inlet`)
    assert.equal(result.pipes[id].flowing, true, `${id}: liquid animation`)
  }
  for (const id of ['1756451755', '41', '31', '1756445628569', '1755764967347']) {
    assert.equal(result.pipes[id].medium, 'nitrogen', `${id}: gas outlet`)
    assert.equal(result.pipes[id].flowing, true, `${id}: vent animation`)
  }
  devices.V1002.value = 0
  const closedInlet = resolve(devices, 'bunkering')
  assert.equal(closedInlet.pipes['1755764815355'].medium, 'methanol', '阀门外侧依然填充')
  assert.equal(closedInlet.pipes['1756445796569'].filled, false, '入液阀下游为空')
  assert.equal(closedInlet.summary.flowingCount, 0, '完整加注通路未满足时不流动')
})

test('导入采用有效路由/别名，分组数据和旧版平铺数据均有可靠动画定义', () => {
  assert.equal(canonicalPipeId('19875226841'), '1', '有尾部空格的氮气源别名不能漏掉')
  assert.equal(canonicalPipeId('42554'), '162', '注释别名不能抢占有效别名')
  assert.ok(!pipingTopology.routes.some(route => route.from === 'C1401' && route.to === 'V1402'))
  const actualRoute = pipingTopology.routes.find(route => route.from === 'D1604' && route.to === 'M1602')
  assert.ok(actualRoute.segments.some(segment => segment.pipe === '1756445276570'))
  const groups = pipingTopology.flowGroups
  for (const profile of Object.values(pipingTopology.flowProfiles)) {
    assert.ok(Array.isArray(profile.activePipes), `${profile.id}: has an authored flat animation fallback`)
    for (const pipe of profile.activePipes) assert.equal(typeof pipe.flowForward, 'boolean')
    for (const name of profile.animationGroups) {
      if (!groups) continue // The committed legacy archive has names and flat pipes, but no group gate table.
      const group = groups[name]
      assert.ok(group, `${profile.id}: ${name} has a gate`)
      assert.ok(group.valves.length + group.runningDevices.length > 0, `${name}: never ungated`)
      for (const pipe of group.activePipes) assert.equal(typeof pipe.flowForward, 'boolean')
    }
  }
  if (groups) {
    assert.ok(Object.keys(groups).length > 30)
    for (const [name, group] of Object.entries(groups)) {
      if (name.startsWith('水乙二醇副路循环_热水_')) assert.ok(group.activePipes.every(pipe => pipe.medium === 'hot-water'), `${name}: 不把副热水错标为主乙二醇`)
    }
  }
})
