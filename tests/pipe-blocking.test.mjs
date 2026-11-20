import test from 'node:test'
import assert from 'node:assert/strict'
import { initialDevices } from '../src/data/catalog.ts'
import { pipingTopology } from '../src/data/piping.ts'
import { canonicalPipeId, resolvePiping } from '../src/state/pipingEngine.ts'

function ready(flowId = '') {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) {
    if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: device.id === 'C1401' ? 75 : 100, working: true, enabled: true, error: false })
    if (device.kind === 'hose') device.connected = true
  }
  if (flowId === 'bunkering') close(devices, ['M1005', 'V1004', 'V1603', 'V1604', 'V1609'])
  return devices
}
function close(devices, ids) { for (const id of ids) Object.assign(devices[id], { value: 0, working: false }) }
const resolve = (devices, flowId, manual = true) => resolvePiping(devices, { flowId: manual ? '__manual__' : flowId, manualFlowId: flowId, running: true })

// 117/125 are verified mid-route inner-tube junctions. A closed return valve
// governs the return half, not the inlet half that has another real outlet.
const physicalRoutes = pipingTopology.routes.flatMap(route => {
  const pair = [['M1302', 'Engine02', '117'], ['D1421', 'H1302', '117'], ['M1301', 'Engine01', '125'], ['D1411', 'H1301', '125']].find(([from, to]) => route.from === from && route.to === to)
  if (!pair) return [route]
  const index = route.segments.findIndex(segment => canonicalPipeId(segment.pipe) === pair[2])
  return [{ from: route.from, to: `InnerTube@${pair[2]}`, segments: route.segments.slice(0, index + 1) }, { from: `InnerTube@${pair[2]}`, to: route.to, segments: route.segments.slice(index) }]
})
const byPipe = new Map()
for (const route of physicalRoutes) for (const segment of route.segments) {
  const id = canonicalPipeId(segment.pipe)
  const entries = byPipe.get(id) || []
  entries.push(route); byPipe.set(id, entries)
}
const valves = [...new Set(pipingTopology.routes.flatMap(route => [route.from, route.to]).filter(id => initialDevices[id]?.kind === 'valve'))]

for (const id of Object.keys(pipingTopology.flowProfiles)) {
  test(`${id}：逐个关闭所有拓扑阀门，专属阀前/阀后管段不能继续流动，填充不能来自虚构阀门源`, () => {
    const sources = new Set(pipingTopology.flowProfiles[id].sources.map(source => source.terminal || source.node))
    if (id === 'bunkering' || id === 'bunkering-purge') sources.add('T101') // tank outlet, enabled for purge only when nitrogen reaches the tank
    for (const valve of valves) {
      const devices = ready(id)
      close(devices, [valve])
      const before = JSON.stringify(devices), result = resolve(devices, id)
      for (const [pipe, routes] of byPipe) {
        if (routes.every(route => route.from === valve || route.to === valve)) assert.equal(result.pipes[pipe]?.flowing, false, `${id}: closed ${valve}, pipe ${pipe}`)
      }
      for (const pipe of Object.values(result.pipes)) if (pipe.filled) assert.ok(sources.has(pipe.sourceId), `${id}: ${pipe.pipeId} must use a declared physical source, not ${pipe.sourceId}`)
      assert.equal(JSON.stringify(devices), before)
    }
  })
}

test('pic3：H1422关闭、D1421打开且M1302关闭，不得凭D1421开度制造下游氮气', () => {
  const devices = ready('supply-purge')
  close(devices, ['H1422', 'H1412', 'M1302', 'M1301', 'Engine01', 'Engine02'])
  assert.equal(devices.D1421.value, 100)
  for (const manual of [true, false]) {
    const result = resolve(devices, 'supply-purge', manual)
    assert.equal(result.pipes['158'].filled, true, 'real header pressure may fill up to H1422')
    assert.equal(result.pipes['158'].flowing, false)
    for (const id of ['157', '156', '155', '117', '89']) {
      assert.equal(result.pipes[id].filled, false, `${id}: isolated downstream`)
      assert.equal(result.pipes[id].flowing, false)
    }
  }
})

test('双壁内管从真实甲醇主管反向填充至D1421，仍不能倒穿止回阀或关闭的H1422', () => {
  const devices = ready('supply')
  close(devices, ['H1422'])
  const result = resolve(devices, 'supply')
  assert.equal(result.pipes['117'].medium, 'methanol')
  assert.equal(result.pipes['156'].filled, true, 'downstream of the check valve may backfill statically from the main')
  assert.equal(result.pipes['156'].flowing, false)
  assert.equal(result.pipes['157'].filled, false)
})

test('所有供给/回收泵逐个停止，其他泵不能让停泵的专属支路继续动画', () => {
  for (const flow of Object.keys(pipingTopology.flowProfiles)) {
    for (const [pump, pipe] of [['P101', '91'], ['P102', '92'], ['P201', '165'], ['P202', '164']]) {
      const devices = ready(flow)
      close(devices, [pump])
      assert.equal(resolve(devices, flow).pipes[pipe].flowing, false, `${flow}: ${pump} stopped, ${pipe}`)
    }
  }
})

test('冷热水主副泵及闭口回路：停泵/关闭所有出口只保留填充，不出现死端持续流动', () => {
  for (const [flow, main, secondary] of [['heating', 'hot-water-glycol', 'hot-water'], ['cooling', 'cold-water-glycol', 'cold-water']]) {
    const devices = ready(flow)
    close(devices, ['P401'])
    assert.ok(Object.values(resolve(devices, flow).pipes).every(pipe => pipe.medium !== main || !pipe.flowing))
    Object.assign(devices.P401, { value: 100, working: true })
    close(devices, ['P402'])
    assert.ok(Object.values(resolve(devices, flow).pipes).every(pipe => pipe.medium !== secondary || !pipe.flowing))
    Object.assign(devices.P402, { value: 100, working: true })
    close(devices, flow === 'heating' ? ['H1405', 'H1406'] : ['H1402'])
    assert.ok(Object.values(resolve(devices, flow).pipes).every(pipe => pipe.medium !== secondary || !pipe.flowing))
  }
})

test('已核对WPF活动别名：42554属于P202支路162，不可借用P201；停用别名不参与显示', () => {
  assert.equal(canonicalPipeId('42554'), '162')
  assert.equal(canonicalPipeId('19875226841'), '1')
  assert.equal(canonicalPipeId('250'), '250')
  assert.equal(canonicalPipeId('252'), '252')
  const devices = ready('shore-discharge')
  close(devices, ['P202'])
  assert.equal(resolve(devices, 'shore-discharge').pipes[canonicalPipeId('42554')].flowing, false)
})

test('关闭双壁内管回管且主阀关闭：入口虽开但支路成为死端，静态填充不能伪装成流动', () => {
  const devices = ready('supply-purge')
  close(devices, ['H1302', 'M1301', 'M1302'])
  const result = resolve(devices, 'supply-purge')
  for (const id of ['156', '155', '117', '121', '119', '123']) {
    assert.equal(result.pipes[id].filled, true, 'may fill up to the closed return valve')
    assert.equal(result.pipes[id].flowing, false, 'no complete outlet in this branch')
  }
  assert.equal(result.pipes['125'].flowing, true, 'the independently open other purge branch still works')
})
