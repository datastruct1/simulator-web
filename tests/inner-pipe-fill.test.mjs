import test from 'node:test'
import assert from 'node:assert/strict'
import { initialDevices } from '../src/data/catalog.ts'
import { resolvePiping, canonicalPipeId } from '../src/state/pipingEngine.ts'
import { getScene } from '../src/components/scene/scenes.ts'
import { buildPipingGeometry } from '../src/components/scene/pipingGeometry.ts'
import { resolvePipeDrawing } from '../src/components/scene/pipeVisual.ts'

function readyPlant() {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) {
    if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: device.id === 'C1401' ? 75 : 100, working: true, enabled: true, error: false })
    if (device.kind === 'hose') device.connected = true
  }
  close(devices, ['Engine01', 'Engine02']) // Filling cannot depend on a synthetic running-engine source.
  return devices
}
const close = (devices, ids) => { for (const id of ids) Object.assign(devices[id], { value: 0, working: false }) }
const modes = ['demo', 'manual']
const resolve = (devices, flow, mode) => resolvePiping(devices, { flowId: mode === 'manual' ? '__manual__' : flow, manualFlowId: flow, running: true })

for (const mode of modes) {
  test(`${mode}：吹扫内管117/125填充主管直到关闭的 M1302/M1301，不穿过关闭阀门`, () => {
    const devices = readyPlant()
    close(devices, ['M1301', 'M1302', 'V1231', 'V1232'])
    const before = JSON.stringify(devices), result = resolve(devices, 'supply-purge', mode)
    for (const id of ['117', '125', '89', '1754723051', '82', '83']) {
      assert.equal(result.pipes[id].filled, true, id)
      assert.equal(result.pipes[id].medium, 'nitrogen', id)
      assert.equal(result.pipes[id].sourceId, 'NitSource', 'actual inner purge supply, not the outer jacket')
    }
    for (const id of ['88', '81']) assert.equal(result.pipes[id].filled, false, `${id}: behind closed M valve`)
    for (const id of ['89', '1754723051', '82', '83']) assert.equal(result.pipes[id].flowing, false, 'extended dead leg fills statically; no guessed direction')
    assert.equal(result.pipes['117'].forward, false)
    assert.equal(result.pipes['125'].forward, false)
    assert.equal(JSON.stringify(devices), before)
  })

  test(`${mode}：甲醇主管连通双壁内管的弯头/竖管/回管，内管使用甲醇而非外管氮气`, () => {
    const devices = readyPlant()
    close(devices, ['D1411', 'D1421', 'H1301', 'H1302'])
    const result = resolve(devices, 'supply', mode)
    for (const id of ['117', '119', '121', '123', '125', '127', '129', '131']) {
      assert.equal(result.pipes[id].filled, true, id)
      assert.equal(result.pipes[id].medium, 'methanol', id)
      assert.equal(result.pipes[id].sourceId, 'T101', 'actual main fuel supply')
    }
    for (const id of ['117', '125']) assert.equal(result.pipes[id].forward, false, 'original demo direction')
    for (const id of ['119', '121', '123', '127', '129', '131']) assert.equal(result.pipes[id].flowing, false)
    for (const id of ['153', '157']) assert.equal(result.pipes[id].filled, false, 'check valve must not backfill the N2 supply header')
  })

  test(`${mode}：只有外管氮封通路打开，不会借外管把内管和主管染成氮气`, () => {
    const devices = readyPlant()
    for (const device of Object.values(devices)) if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: 0, working: false, connected: false })
    for (const id of ['V1701', 'C1701', 'V1702', 'H1710', 'H1242', 'H1243', 'H1432', 'D1412', 'H1442', 'D1422', 'V1301', 'V1302']) Object.assign(devices[id], { value: 100, working: true })
    const result = resolve(devices, 'supply-purge', mode)
    for (const id of ['117', '125', '89', '82', '83', '119', '121', '123', '127', '129', '131']) assert.equal(result.pipes[id].filled, false, `${id}: outer tube is not an inner source`)
    if (mode === 'demo') {
      assert.equal(result.pipes['116'].medium, 'nitrogen')
      assert.equal(result.pipes['124'].medium, 'nitrogen')
    }
  })
}

test('手动打开主阀继续填充到下一个关阀；主管与内管是真正共享节点，不只是同色涂绘', () => {
  const devices = readyPlant()
  close(devices, ['M1301', 'M1302', 'V1231', 'V1232'])
  let result = resolve(devices, 'supply-purge', 'manual')
  assert.equal(result.pipes['88'].filled, false)
  Object.assign(devices.M1302, { value: 100, working: true })
  result = resolve(devices, 'supply-purge', 'manual')
  assert.equal(result.pipes['88'].filled, true)
  assert.equal(result.pipes['88'].medium, 'nitrogen')
  assert.equal(result.pipes['75'].filled, false, 'closed V1232 still blocks the upstream main')
})

test('图中 LFSS 内管别名371/381与主管89/329共享填充，外管由独立显示层保持氮气', () => {
  const devices = readyPlant()
  close(devices, ['M1301', 'M1302', 'V1231', 'V1232'])
  const result = resolve(devices, 'supply-purge', 'manual')
  const drawing = buildPipingGeometry(getScene('lfss').nodes)
  const states = resolvePipeDrawing(drawing, result.pipes, devices, true, true)
  for (const id of ['lfss-pipe-101', 'lfss-pipe-108', 'lfss-pipe-54', 'lfss-pipe-48']) {
    assert.equal(states[id].filled, true, id)
    assert.equal(states[id].medium, 'nitrogen', id)
  }
  assert.equal(canonicalPipeId('371'), '117')
  assert.equal(canonicalPipeId('381'), '125')
  for (const id of ['116', '118', '120', '122', '124', '126', '128', '130', '370', '376', '378', '380', '386', '388']) assert.notEqual(result.pipes[id]?.fillOrigin, 'inner-connection', 'do not extend an inner fill to a decorative outer jacket')
})
