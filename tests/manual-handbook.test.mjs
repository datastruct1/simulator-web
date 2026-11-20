import test from 'node:test'
import assert from 'node:assert/strict'
import { initialDevices } from '../src/data/catalog.ts'
import { pipingTopology } from '../src/data/piping.ts'
import { resolvePiping, canonicalPipeId } from '../src/state/pipingEngine.ts'

// 2.1–2.7 handbook actions; these cases verify simulated paths, not real-world plant operation.
const cases = [
  ['ship-inerting', 'V1701 V1702 V1609 V1602 C1701 H1710 H1242 H1243 D1604 M1602 M1102 Rg001 Rg002 Rg003'],
  ['shore-inerting', 'V1004 V1603 V1604 M1005 M1001 M1002 Rg001 Rg002 Rg003'],
  ['bunkering', 'V1002 V1602 V1601 V1001 M1004 M1003 M1002 M1602 M1102 M1101 M1601 M1001 M1006 Rg001 Rg002 Rg003'],
  ['bunkering-purge', 'V1701 V1702 V1001 V1609 V1601 V1602 M1101 M1102 C1701 H1710 H1242 H1243 M1006 M1001 M1601 M1602 D1604 Rg001 Rg002 Rg003'],
  ['supply-purge', 'V1701 V1702 C1701 H1710 H1242 H1243 H1301 H1302 H1422 D1421 H1412 D1411'],
  ['recovery-waste', 'V1501 V1502 V1605 H1423 H1503 D1501 H1502 D1502 H1231 H1230 P201 P202'],
  ['shore-discharge', 'V1502 V1608 V1501 H1502 D1502 H1501 D1501 P201 P202 Rg003'],
  ['heating', 'V1401 V1402 V1403 H1403 H1404 H1405 H1406 P401 P402'],
  ['cooling', 'V1401 V1402 V1403 H1401 H1402 P401 P402'],
]
function plant(ids) {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: 0, working: false, connected: false })
  for (const id of ids.split(' ')) { assert.ok(devices[id], `missing ${id}`); Object.assign(devices[id], { value: 100, working: true, connected: true }) }
  return devices
}
for (const [flowId, ids] of cases) test(`${flowId} 手册设备组合：手动填充、流向和暂停`, () => {
  const devices = plant(ids), before = JSON.stringify(devices)
  const options = { flowId: '__manual__', manualFlowId: flowId, running: true }
  const result = resolvePiping(devices, options)
  const paused = resolvePiping(devices, { ...options, running: false })
  const profile = pipingTopology.flowProfiles[flowId]
  assert.ok(result.summary.filledCount > 0)
  assert.ok(result.summary.flowingCount > 0)
  for (const [id, pipe] of Object.entries(result.pipes)) {
    if (pipe.flowing) {
      const authored = profile.activePipes.filter(item => canonicalPipeId(item.pipe) === id)
      assert.ok(authored.some(item => item.medium === pipe.medium && item.flowForward === pipe.forward), `${flowId}/${id}`)
    }
    assert.deepEqual(paused.pipes[id], { ...pipe, flowing: false })
  }
  for (const conflict of result.summary.conflicts) assert.equal(result.pipes[conflict.pipe].flowing, false)
  assert.equal(JSON.stringify(devices), before)
})

test('手册主备机组合不能因缺少连通设备而伪造流动', () => {
  for (const [flowId, ids] of [
    ['supply-aux', 'V1102 V1202 V1201 V1203 V1206 V1207 V1231 V1232 D1202 D1201 P101'],
    ['supply-main', 'V1002 V1201 V1203 V1206 V1207 V1231 V1232 V1401 V1402 V1403 M1201 D1201 M1301 M1302 H1403 H1404 H1405 H1406 P101 P401 Engine01 Engine02'],
  ]) {
    const result = resolvePiping(plant(ids), { flowId: '__manual__', manualFlowId: flowId, running: true })
    assert.equal(result.summary.flowingCount, 0, `${flowId} 需要补充连通依据而不是猜测`)
  }
})

test('手动甲醇加注：M1001 气相线与 M1002 液相线按实际来源分离', () => {
  const devices = plant('V1002 V1602 V1601 V1001 M1004 M1003 M1002 M1602 M1102 M1101 M1601 M1001 M1006 Rg001 Rg002 Rg003')
  const options = { flowId: '__manual__', manualFlowId: 'bunkering', running: true }
  for (const opening of [0, 100]) {
    Object.assign(devices.M1005, { value: opening, working: opening > 0 })
    const result = resolvePiping(devices, options)
    for (const id of ['1756445628569', '1756445413574', '271432', '1756445531570']) {
      assert.equal(result.pipes[id].medium, 'nitrogen', id)
      assert.equal(result.pipes[id].sourceId, 'T101', id)
      assert.equal(result.pipes[id].flowing, true, id)
    }
    for (const id of ['34', '1756445944577']) { assert.equal(result.pipes[id].medium, 'methanol'); assert.equal(result.pipes[id].flowing, true) }
  }
  Object.assign(devices.M1001, { value: 0, working: false })
  const blocked = resolvePiping(devices, options)
  assert.equal(blocked.pipes['1756445413574'].flowing, false)
  assert.equal(blocked.pipes['1756445531570'].flowing, false)
})

test('手动加注扫气：氮气到达储罐后由罐顶进入回气支路', () => {
  const devices = plant('V1701 V1702 V1001 V1609 V1601 V1602 M1101 M1102 C1701 H1710 H1242 H1243 M1006 M1001 M1601 M1602 D1604 Rg001 Rg002 Rg003')
  const options = { flowId: '__manual__', manualFlowId: 'bunkering-purge', running: true }
  const result = resolvePiping(devices, options)
  for (const id of ['41', '32', '31', '30', '44', '29']) {
    assert.equal(result.pipes[id].medium, 'nitrogen', id)
    assert.equal(result.pipes[id].sourceId, 'T101', id)
    assert.equal(result.pipes[id].flowing, true, id)
  }
  for (const id of ['V1601', 'M1601', 'D1604', 'M1102', 'Rg001']) {
    const changed = structuredClone(devices)
    Object.assign(changed[id], { value: 0, working: false, connected: false })
    const blocked = resolvePiping(changed, options)
    assert.equal(blocked.pipes['30'].flowing, false, id)
    if (id === 'D1604' || id === 'M1102') assert.equal(blocked.pipes['41'].filled, false, id)
  }
  const paused = resolvePiping(devices, { ...options, running: false })
  for (const id of ['41', '32', '31', '30', '44', '29']) {
    assert.equal(paused.pipes[id].filled, true)
    assert.equal(paused.pipes[id].flowing, false)
  }
})
