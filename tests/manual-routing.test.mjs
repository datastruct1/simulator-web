import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initialDevices } from '../src/data/catalog.ts'
import { resolvePiping } from '../src/state/pipingEngine.ts'

// The demo is the accepted direction/medium oracle. Read its authored resource,
// not the manual resolver's computed palette, and also compare live demo output.
const archive = JSON.parse(readFileSync(new URL('../src/data/piping.generated.json', import.meta.url), 'utf8'))
function canonical(raw) {
  let id = String(raw).replace(/^pipe/i, '').trim(), guard = 0
  while (archive.canonicalPipes[id] && archive.canonicalPipes[id] !== id && guard++ < 1000) id = archive.canonicalPipes[id]
  return id
}
function readyPlant() {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) {
    if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: device.id === 'C1401' ? 75 : 100, working: true, enabled: true, error: false })
    if (device.kind === 'hose') device.connected = true
  }
  return devices
}
const manual = (devices, id, running = true) => resolvePiping(devices, { flowId: '__manual__', manualFlowId: id, running })
function authored(profile) { return new Map(profile.activePipes.map(pipe => [canonical(pipe.pipe), pipe])) }
function assertProfile(result, profile) {
  const expected = authored(profile)
  for (const [id, pipe] of Object.entries(result.pipes)) {
    if (!pipe.filled) { assert.equal(pipe.flowing, false); continue }
    const oracle = expected.get(id)
    assert.ok(oracle, `${profile.id}: ${id} cannot borrow a definition from another process`)
    assert.equal(pipe.medium, oracle.medium, `${profile.id}/${id}: medium`)
    assert.equal(pipe.forward, oracle.flowForward, `${profile.id}/${id}: authored demo direction`)
  }
}

for (const [id, profile] of Object.entries(archive.flowProfiles)) {
  test(`${profile.name}：手动每段方向/介质与演示一致，暂停和故障不改方向，其他工艺不串入`, () => {
    const devices = readyPlant(), before = JSON.stringify(devices)
    const demoBefore = resolvePiping(devices, { flowId: id, running: true })
    const result = manual(devices, id)
    assertProfile(result, profile)
    if (profile.activePipes.length) assert.ok(result.summary.flowingCount > 0)
    else assert.equal(result.summary.flowingCount, 0)
    for (const [pipeId, demo] of Object.entries(demoBefore.pipes)) {
      if (!demo.flowing) continue
      assert.equal(result.pipes[pipeId].filled, true, `${id}/${pipeId}: preserve visible demo segment`)
      assert.equal(result.pipes[pipeId].medium, demo.medium)
      assert.equal(result.pipes[pipeId].forward, demo.forward)
    }
    const paused = manual(devices, id, false)
    assert.equal(paused.summary.flowingCount, 0)
    for (const [pipeId, pipe] of Object.entries(result.pipes)) assert.deepEqual(paused.pipes[pipeId], { ...pipe, flowing: false })
    assert.equal(JSON.stringify(devices), before)
    assert.deepEqual(resolvePiping(devices, { flowId: id, running: true }), demoBefore, 'manual preview must not change demo behavior')
    for (const device of Object.values(devices)) { device.error = true; device.enabled = false }
    const faults = manual(devices, id)
    assertProfile(faults, profile)
    for (const [pipeId, pipe] of Object.entries(result.pipes)) assert.deepEqual(faults.pipes[pipeId], pipe)
  })
}

test('同一加注软管34：加注为甲醇、岸载惰化为氮气；不能沿用上一个工艺的颜色', () => {
  const devices = readyPlant()
  assert.equal(manual(devices, 'bunkering').pipes['34'].medium, 'methanol')
  assert.equal(manual(devices, 'shore-inerting').pipes['34'].medium, 'nitrogen')
  assert.equal(manual(devices, 'bunkering').pipes['34'].medium, 'methanol')
  assert.equal(manual(devices, 'bunkering').pipes['41'].medium, 'nitrogen', '加注液路与排气不能变成同一种介质')
})

test('发动机117/125：供应甲醇与供应扫气方向相同，介质必须分别是甲醇/氮气', () => {
  const devices = readyPlant()
  for (const id of ['117', '125']) {
    assert.equal(manual(devices, 'supply').pipes[id].medium, 'methanol')
    assert.equal(manual(devices, 'supply').pipes[id].forward, false)
    assert.equal(manual(devices, 'supply-purge').pipes[id].medium, 'nitrogen')
    assert.equal(manual(devices, 'supply-purge').pipes[id].forward, false)
  }
})

test('冷热水：主水乙二醇与副水介质区分，切换加热/降温后不保留旧介质', () => {
  const devices = readyPlant()
  for (const [id, glycol, water] of [['heating', 'hot-water-glycol', 'hot-water'], ['cooling', 'cold-water-glycol', 'cold-water']]) {
    const result = manual(devices, id)
    assert.equal(result.pipes['208'].medium, glycol)
    assert.ok(Object.values(result.pipes).some(pipe => pipe.flowing && pipe.medium === water))
    assert.ok(Object.values(result.pipes).every(pipe => !pipe.filled || [glycol, water].includes(pipe.medium)))
  }
})

test('局部先开下游阀不能逆转方向；供应63和排岸166/167必须保留演示的false方向', () => {
  const devices = readyPlant()
  for (const [flow, ids] of [['supply', ['63']], ['shore-discharge', ['166', '167']]]) {
    for (const id of ids) assert.equal(manual(devices, flow).pipes[id].forward, false)
  }
  for (const device of Object.values(devices)) if (['valve', 'hose', 'pump', 'engine'].includes(device.kind)) Object.assign(device, { value: 0, working: false, connected: false })
  devices.M1102.value = 100
  const downstreamFirst = manual(devices, 'bunkering')
  assert.equal(downstreamFirst.pipes['1754630791'].flowing, true)
  assert.equal(downstreamFirst.pipes['1754630791'].forward, false)
  devices.V1002.value = 100
  assert.equal(manual(devices, 'bunkering').pipes['1754630791'].forward, false)
})

test('未选有效工艺不推测方向/介质；不存在默认甲醇污染其他管路', () => {
  const result = manual(readyPlant(), 'not-a-process')
  assert.equal(result.summary.filledCount, 0)
  assert.equal(result.summary.flowingCount, 0)
  assert.ok(result.summary.warnings.length > 0)
  assert.ok(Object.values(result.pipes).every(pipe => pipe.medium === 'empty'))
})

test('自定义演示同一管段方向/介质冲突时不任意选一项，避免默默串色', () => {
  const topology = structuredClone(archive)
  topology.flowProfiles.bunkering.activePipes.push({ pipe: '34', medium: 'nitrogen', flowForward: false })
  const devices = readyPlant()
  for (const device of Object.values(devices)) Object.assign(device, { value: 0, working: false })
  devices.M1602.value = 100
  const result = resolvePiping(devices, { flowId: '__manual__', manualFlowId: 'bunkering', running: true }, topology)
  assert.equal(result.pipes['34'].filled, false)
  assert.ok(result.summary.warnings.some(warning => warning.includes('34')))
})

test('全部工艺随机局部开阀/闭阀/软管断开/三通切换：方向和介质始终只来自对应演示', () => {
  let seed = 73149
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (const [id, profile] of Object.entries(archive.flowProfiles)) {
    for (let sample = 0; sample < 12; sample++) {
      const devices = readyPlant()
      for (const device of Object.values(devices)) {
        if (device.kind === 'valve') device.value = device.id === 'C1401' ? [0, 25, 50, 75][Math.floor(random() * 4)] : random() > .5 ? 100 : 0
        if (device.kind === 'hose') { device.connected = random() > .5; device.working = device.connected; device.value = device.connected ? 100 : 0 }
        if (['pump', 'fan', 'engine', 'heater'].includes(device.kind)) device.working = random() > .5
        device.error = random() > .85; device.enabled = random() > .15
      }
      const before = JSON.stringify(devices)
      assertProfile(manual(devices, id), profile)
      assert.equal(JSON.stringify(devices), before)
    }
  }
})
