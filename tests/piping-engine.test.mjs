import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalPipeId, emptyPipeVisualState, resolvePiping, topology } from '../src/state/pipingEngine.ts'
import { pipingTopology, MEDIA } from '../src/data/piping.ts'

const MEDIUM_IDS = new Set(['empty', 'air', 'methanol', 'nitrogen', 'cold-water', 'hot-water',
  'water-glycol', 'cold-water-glycol', 'hot-water-glycol'])

test('自由手动模式无开启设备时不填充或启动流程', () => {
  const result = resolvePiping({}, { flowId: '__manual__', running: true })
  assert.equal(result.summary.filledCount, 0)
  assert.equal(result.summary.flowingCount, 0)
})

function valve(id, value = 100, extra = {}) {
  return { id, kind: 'valve', value, working: value > 0, error: false, enabled: true, ...extra }
}
function pump(id, working = true) {
  return { id, kind: 'pump', value: 0, working, error: false, enabled: true }
}
function hose(id, value = 100, extra = {}) {
  return { id, kind: 'hose', value, working: value > 0, error: false, enabled: true, ...extra }
}
function junction(id) {
  return { id, kind: 'junction' }
}
function waterDevices() {
  const devices = {}
  for (const id of ['V1401', 'V1402', 'V1403', 'V1404', 'H1401', 'H1402', 'H1403', 'H1404', 'H1405', 'H1406']) devices[id] = valve(id)
  devices.C1401 = valve('C1401', 75)
  devices.P401 = pump('P401')
  devices.P402 = pump('P402')
  return devices
}
function seg(pipe, forward = true) {
  return { pipe, forward }
}

function makeTopology({ routes, sources, activePipes = [], pumps = [], virtualSources = ['S'], sinkTanks = [], canonicalPipes = {} }) {
  return {
    schemaVersion: 1, media: [], substanceType: {}, routes,
    aliases: {}, canonicalPipes, virtualSources, sinkTanks,
    flowProfiles: {
      test: { id: 'test', name: 'test', medium: sources[0]?.medium ?? 'empty', sources, pumps, activePipes, animationGroups: [], notes: '' },
    },
    extraProfiles: {}, sourceNotes: [], audit: {},
  }
}

test('纯源→阀A→分支阀B/C：全开时沿线填充且介质不混合', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [
      { from: 'S', to: 'A', segments: [seg('p0')] },
      { from: 'A', to: 'B', segments: [seg('p1')] },
      { from: 'A', to: 'C', segments: [seg('p2')] },
      { from: 'B', to: 'Outdoor@B', segments: [seg('p3')] },
      { from: 'C', to: 'Outdoor@C', segments: [seg('p4')] },
    ],
  })
  const devices = { A: valve('A'), B: valve('B'), C: valve('C') }
  const result = resolvePiping(devices, { flowId: 'test', running: false }, t)
  for (const id of ['p0', 'p1', 'p2', 'p3', 'p4']) {
    assert.equal(result.pipes[id].medium, 'methanol', `${id} medium`)
    assert.equal(result.pipes[id].filled, true, `${id} filled`)
  }
  assert.equal(result.pipes.p0.forward, true)
})

test('关闭A只填上游那条 route，不能越过阀门', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [
      { from: 'S', to: 'A', segments: [seg('p0')] },
      { from: 'A', to: 'B', segments: [seg('p1')] },
      { from: 'A', to: 'C', segments: [seg('p2')] },
      { from: 'B', to: 'Outdoor@B', segments: [seg('p3')] },
      { from: 'C', to: 'Outdoor@C', segments: [seg('p4')] },
    ],
  })
  const devices = { A: valve('A', 0), B: valve('B'), C: valve('C') }
  const result = resolvePiping(devices, { flowId: 'test', running: false }, t)
  assert.equal(result.pipes.p0.filled, true)
  assert.equal(result.pipes.p1.filled, false)
  assert.equal(result.pipes.p2.filled, false)
  assert.equal(result.pipes.p1.blockedBy, 'A')
  assert.equal(result.pipes.p2.blockedBy, 'A')
})

test('关闭B只填B上游，C支路不受影响', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [
      { from: 'S', to: 'A', segments: [seg('p0')] },
      { from: 'A', to: 'B', segments: [seg('p1')] },
      { from: 'A', to: 'C', segments: [seg('p2')] },
      { from: 'B', to: 'Outdoor@B', segments: [seg('p3')] },
      { from: 'C', to: 'Outdoor@C', segments: [seg('p4')] },
    ],
  })
  const devices = { A: valve('A'), B: valve('B', 0), C: valve('C') }
  const result = resolvePiping(devices, { flowId: 'test', running: false }, t)
  assert.equal(result.pipes.p0.filled, true)
  assert.equal(result.pipes.p1.filled, true) // A→B 是 B 的上游 route
  assert.equal(result.pipes.p2.filled, true)
  assert.equal(result.pipes.p3.blockedBy, 'B')
  assert.equal(result.pipes.p3.filled, false)
  assert.equal(result.pipes.p4.filled, true) // C 支路畅通
})

test('不同介质不混合，源冲突先按距离、同距离按声明顺序解析并可报告', () => {
  const t = makeTopology({
    sources: [
      { kind: 'root', node: 'S1', medium: 'methanol' },
      { kind: 'root', node: 'S2', medium: 'nitrogen' },
    ],
    virtualSources: ['S1', 'S2'],
    routes: [
      { from: 'S1', to: 'J', segments: [seg('pA')] },
      { from: 'S2', to: 'J', segments: [seg('pB')] },
      { from: 'J', to: 'Outdoor@J', segments: [seg('pShared')] },
    ],
  })
  const result = resolvePiping({ J: junction('J') }, { flowId: 'test', running: false }, t)
  assert.equal(result.pipes.pA.medium, 'methanol')
  assert.equal(result.pipes.pB.medium, 'nitrogen')
  // 两条入口保留各自介质；pShared 与两源等距，声明在前的 methanol 胜出。
  assert.equal(result.pipes.pShared.medium, 'methanol')
  const conflict = result.summary.conflicts.find(c => c.pipe === 'pShared')
  assert.ok(conflict, 'conflict reported')
  assert.deepEqual([...conflict.media].sort(), ['methanol', 'nitrogen'])
  assert.equal(conflict.winner, 'methanol')
  t.flowProfiles.test.sources.reverse()
  const reversed = resolvePiping({ J: junction('J') }, { flowId: 'test', running: false }, t)
  assert.equal(reversed.pipes.pA.medium, 'methanol')
  assert.equal(reversed.pipes.pB.medium, 'nitrogen')
  assert.equal(reversed.pipes.pShared.medium, 'nitrogen', '只改变等距公共段的胜者')
})

test('停止/暂停仍填充但无流动；running=true 才流动', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    activePipes: [{ pipe: 'p0', medium: 'methanol', flowForward: true }],
    routes: [
      { from: 'S', to: 'A', segments: [seg('p0')] },
      { from: 'A', to: 'Outdoor@A', segments: [seg('p1')] },
    ],
  })
  const devices = { A: valve('A') }
  const stopped = resolvePiping(devices, { flowId: 'test', running: false }, t)
  assert.equal(stopped.pipes.p0.filled, true)
  assert.equal(stopped.pipes.p0.flowing, false)
  const running = resolvePiping(devices, { flowId: 'test', running: true }, t)
  assert.equal(running.pipes.p0.flowing, true)
  assert.equal(running.pipes.p1.flowing, false) // p1 不在 activePipes，禁止全场景一起流动
  assert.equal(running.pipes.p1.filled, true)
})

test('泵停/故障保留填充但无循环流动', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'T', medium: 'methanol', via: 'P' }],
    activePipes: [{ pipe: 'p0', medium: 'methanol', flowForward: true }],
    pumps: ['P'],
    virtualSources: ['T'],
    routes: [{ from: 'T', to: 'P', segments: [seg('p0')] }, { from: 'P', to: 'Outdoor@P', segments: [seg('p1')] }],
  })
  const stopped = resolvePiping({ P: pump('P', false) }, { flowId: 'test', running: true }, t)
  assert.equal(stopped.pipes.p0.filled, true)
  assert.equal(stopped.pipes.p0.flowing, false)
  assert.equal(stopped.summary.pumpsOk, false)
  const running = resolvePiping({ P: pump('P', true) }, { flowId: 'test', running: true }, t)
  assert.equal(running.pipes.p0.flowing, true)
})

test('软管 value/working/connected=false 三态门控', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [
      { from: 'S', to: 'Rg', segments: [seg('p0')] },
      { from: 'Rg', to: 'Outdoor@Rg', segments: [seg('p1')] },
    ],
  })
  const connected = resolvePiping({ Rg: hose('Rg', 100) }, { flowId: 'test', running: false }, t)
  assert.equal(connected.pipes.p1.filled, true)
  const disconnected = resolvePiping({ Rg: hose('Rg', 100, { connected: false }) }, { flowId: 'test', running: false }, t)
  assert.equal(disconnected.pipes.p1.filled, false)
  assert.equal(disconnected.pipes.p1.blockedBy, 'Rg')
  const off = resolvePiping({ Rg: hose('Rg', 0) }, { flowId: 'test', running: false }, t)
  assert.equal(off.pipes.p1.filled, false)
})

test('cycles bounded：环形拓扑不会死循环', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [
      { from: 'S', to: 'A', segments: [seg('p0')] },
      { from: 'A', to: 'B', segments: [seg('p1')] },
      { from: 'B', to: 'A', segments: [seg('p2')] },
    ],
  })
  const result = resolvePiping({ A: valve('A'), B: valve('B') }, { flowId: 'test', running: false }, t)
  assert.equal(result.pipes.p0.filled, true)
  assert.equal(result.pipes.p1.filled, true)
  assert.equal(result.pipes.p2.filled, true)
})

test('resolvePiping 不修改 devices（快照/评分不受影响）', () => {
  const t = makeTopology({
    sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [{ from: 'S', to: 'A', segments: [seg('p0')] }],
  })
  const devices = Object.freeze({ A: Object.freeze(valve('A')) })
  const result = resolvePiping(devices, { flowId: 'test', running: true }, t)
  assert.equal(result.pipes.p0.flowing, false) // 无 activePipes 也不报错
  assert.deepEqual(devices.A, valve('A'))
})

test('canonicalPipeId：Pipe 前缀与传递别名一致（真实数据）', () => {
  assert.equal(canonicalPipeId('Pipe1754907654432'), '1755764967347')
  assert.equal(canonicalPipeId('1754907654432'), '1755764967347')
  assert.equal(canonicalPipeId('Pipe1756445628569'), '1756445628569')
  assert.equal(canonicalPipeId('1705854637'), '52')
  assert.equal(canonicalPipeId('1754907660434'), '272432')
})

test('未映射 visual pipe 保持 empty，不随机涂色', () => {
  const result = resolvePiping({}, { flowId: '', running: false })
  assert.equal(result.pipes['999999999'], undefined)
  assert.equal(result.summary.filledCount, 0)
  assert.equal(emptyPipeVisualState('999999999').medium, 'empty')
  assert.equal(emptyPipeVisualState('999999999').flowing, false)
})

test('heating/cooling：主循环与副循环介质正确、不混', () => {
  const devices = waterDevices()

  const heating = resolvePiping(devices, { flowId: 'heating', running: false })
  assert.equal(heating.pipes['229'].medium, 'hot-water-glycol', '主循环热乙二醇')
  assert.equal(heating.pipes['220'].medium, 'hot-water', '副循环热水')
  assert.notEqual(heating.pipes['229'].medium, 'hot-water', '主循环不得混成副循环介质')
  const heatingRun = resolvePiping(devices, { flowId: 'heating', running: true })
  assert.ok(heatingRun.summary.flowingCount > 0, '加热有流动')

  const cooling = resolvePiping(devices, { flowId: 'cooling', running: false })
  assert.equal(cooling.pipes['229'].medium, 'cold-water-glycol', '主循环冷乙二醇')
  assert.equal(cooling.pipes['214'].medium, 'cold-water', '副循环冷水')
})

test('import 数据可校核：路由/别名/来源/介质全部有效', () => {
  assert.equal(pipingTopology.schemaVersion, 1)
  assert.ok(pipingTopology.audit.routeCount > 100)
  assert.ok(pipingTopology.audit.pipeCount > 200)
  assert.equal(pipingTopology.audit.aliasCycleCount, 0)
  for (const media of MEDIA) {
    assert.ok(MEDIUM_IDS.has(media.id), media.id)
    assert.ok(media.color && media.flowColor, `${media.id} colors`)
  }
  for (const route of pipingTopology.routes) {
    assert.ok(route.from && route.to)
    for (const s of route.segments) assert.equal(typeof s.pipe, 'string')
  }
  const flowIds = Object.keys(pipingTopology.flowProfiles)
  assert.equal(flowIds.length, 21, '原 21 个 flowId 全部有 profile')
  for (const [id, profile] of Object.entries(pipingTopology.flowProfiles)) {
    if (id === 'stop') { assert.equal(profile.sources.length, 0); continue }
    assert.ok(profile.sources.length > 0, `${id} 有来源`)
    for (const s of profile.sources) assert.ok(MEDIUM_IDS.has(s.medium), `${id} source medium`)
    for (const ap of profile.activePipes) assert.ok(MEDIUM_IDS.has(ap.medium), `${id} active medium`)
  }
  // 显式外部加注边界存在
  assert.ok(pipingTopology.routes.some(r => r.from === 'V1001' && r.to === 'Outdoor@V1001'))
  // T401 水乙二醇边界
  assert.ok(pipingTopology.routes.some(r => r.from === 'T401' && r.to === 'V1404'))
  // 别名孤儿数量被审计（可校核）
  assert.ok(Array.isArray(pipingTopology.audit.aliasOrphans))
  assert.ok(topology === pipingTopology)
})

test('bunkering 从 V1002 液相边界注入甲醇，主路径填充而非误灌 V1001 出气管', () => {
  const devices = {}
  for (const id of ['V1002', 'M1004', 'M1003', 'M1002', 'Rg002', 'M1602', 'V1602', 'M1102']) {
    devices[id] = id.startsWith('Rg') ? hose(id, 100) : valve(id, 100)
  }
  const result = resolvePiping(devices, { flowId: 'bunkering', running: false })
  assert.equal(result.pipes['1755764815355'].medium, 'methanol', 'V1002 外侧液相源')
  assert.equal(result.pipes['40'].medium, 'methanol', '入罐液路')
  assert.equal(result.pipes['1755764967347'].filled, false, '未接通排气路，不得从 V1001 注入甲醇')
  assert.ok(result.summary.filledCount > 5)
})

test('未初始化空快照与全关的真实设备不同：真实源侧仍能静态填充', () => {
  const t = makeTopology({ sources: [{ kind: 'root', node: 'S', medium: 'methanol' }],
    routes: [{ from: 'S', to: 'A', segments: [seg('in')] }, { from: 'A', to: 'Outdoor@A', segments: [seg('out')] }],
    activePipes: [{ pipe: 'in', medium: 'methanol', flowForward: true }, { pipe: 'out', medium: 'methanol', flowForward: true }] })
  const empty = resolvePiping({}, { flowId: '__manual__', manualFlowId: 'test', running: true }, t)
  assert.equal(empty.summary.filledCount, 0)
  const closed = resolvePiping({ A: valve('A', 0) }, { flowId: '__manual__', manualFlowId: 'test', running: true }, t)
  assert.equal(closed.pipes.in.filled, true)
  assert.equal(closed.pipes.in.flowing, false)
  assert.equal(closed.pipes.out.filled, false)
})

test('显式泵节点只驱动当前正向贯通路径：停泵、反向入泵和反向出泵都不流动', () => {
  const routes = [{ from: 'S', to: 'P', segments: [seg('in')] }, { from: 'P', to: 'A', segments: [seg('after')] }, { from: 'A', to: 'Outdoor@A', segments: [seg('out')] }]
  const t = makeTopology({ sources: [{ kind: 'root', node: 'S', medium: 'methanol' }], pumps: ['P'], routes,
    activePipes: ['in', 'after', 'out'].map(pipe => ({ pipe, medium: 'methanol', flowForward: true })) })
  const devices = { P: pump('P'), A: valve('A') }
  assert.ok(Object.values(resolvePiping(devices, { flowId: 'test', running: true }, t).pipes).every(pipe => pipe.flowing))
  for (const stopped of [{ ...devices, P: pump('P', false) }, { ...devices, P: { ...pump('P'), error: true } }]) {
    const result = resolvePiping(stopped, { flowId: 'test', running: true }, t)
    assert.equal(result.pipes.in.filled, true)
    assert.equal(result.summary.flowingCount, 0)
  }
  for (const index of [0, 1]) {
    const reverse = structuredClone(t)
    const route = reverse.routes[index]; [route.from, route.to] = [route.to, route.from]
    const result = resolvePiping(devices, { flowId: 'test', running: true }, reverse)
    assert.equal(result.summary.flowingCount, 0)
    assert.equal(result.pipes.in.filled, true, '逆向动画禁用不应清空源侧静态填充')
  }
})

test('显式泵闭环必须由环内运行泵驱动，入口路径上的另一台泵不能冒充环内驱动', () => {
  const t = makeTopology({ sources: [{ kind: 'root', node: 'S', medium: 'methanol' }], pumps: ['P'],
    routes: [{ from: 'S', to: 'A', segments: [seg('entry')] }, { from: 'A', to: 'P', segments: [seg('in')] },
      { from: 'P', to: 'B', segments: [seg('after')] }, { from: 'B', to: 'A', segments: [seg('return')] }],
    activePipes: ['entry', 'in', 'after', 'return'].map(pipe => ({ pipe, medium: 'methanol', flowForward: true })) })
  const devices = { A: valve('A'), B: valve('B'), P: pump('P') }
  const driven = resolvePiping(devices, { flowId: 'test', running: true }, t)
  for (const pipe of ['in', 'after', 'return']) assert.equal(driven.pipes[pipe].flowing, true)
  devices.P.working = false
  assert.equal(resolvePiping(devices, { flowId: 'test', running: true }, t).summary.flowingCount, 0)
  const upstreamOnly = makeTopology({ sources: [{ kind: 'root', node: 'S', medium: 'methanol' }], pumps: ['P'],
    routes: [{ from: 'S', to: 'P', segments: [seg('entry')] }, { from: 'P', to: 'A', segments: [seg('approach')] },
      { from: 'A', to: 'B', segments: [seg('one')] }, { from: 'B', to: 'C', segments: [seg('two')] }, { from: 'C', to: 'A', segments: [seg('three')] }],
    activePipes: ['entry', 'approach', 'one', 'two', 'three'].map(pipe => ({ pipe, medium: 'methanol', flowForward: true })) })
  const result = resolvePiping({ A: valve('A'), B: valve('B'), C: valve('C'), P: pump('P') }, { flowId: 'test', running: true }, upstreamOnly)
  assert.equal(result.summary.flowingCount, 0)
})

test('真实介质源冲突保留静态填充与提示，不清空管道，也不播放冲突段动画', () => {
  const t = makeTopology({ sources: [{ kind: 'root', node: 'S1', medium: 'methanol' }, { kind: 'root', node: 'S2', medium: 'nitrogen' }], virtualSources: ['S1', 'S2'],
    routes: [{ from: 'S1', to: 'J', segments: [seg('a')] }, { from: 'S2', to: 'J', segments: [seg('b')] }, { from: 'J', to: 'Outdoor@J', segments: [seg('shared')] }],
    activePipes: [{ pipe: 'a', medium: 'methanol', flowForward: true }, { pipe: 'b', medium: 'nitrogen', flowForward: true }, { pipe: 'shared', medium: 'methanol', flowForward: true }] })
  const result = resolvePiping({ J: junction('J') }, { flowId: '__manual__', manualFlowId: 'test', running: true }, t)
  assert.equal(result.pipes.shared.filled, true)
  assert.equal(result.pipes.shared.medium, 'methanol')
  assert.equal(result.pipes.shared.flowing, false)
  assert.ok(result.summary.conflicts.some(conflict => conflict.pipe === 'shared'))
  assert.ok(result.summary.warnings.some(warning => warning.includes('shared') && warning.includes('冲突')))
})
