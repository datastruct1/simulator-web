import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { initialDevices } from '../src/data/catalog.ts'
import { resolvePiping } from '../src/state/pipingEngine.ts'
import { evaluateManualSafety } from '../src/state/manualSafety.ts'

const stored = new Map()
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) }
const { useSimulator } = await import('../src/state/simulator.ts')
const { injectConfiguredFault } = await import('../src/components/dialogs/faultActions.ts')
const simulator = useSimulator()

function closedPlant() {
  const devices = structuredClone(initialDevices)
  for (const device of Object.values(devices)) {
    if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: 0, working: false })
    if (device.kind === 'hose') device.connected = false
  }
  return devices
}
const manual = (devices, running = true) => resolvePiping(devices, { flowId: '__manual__', running })
function openBunkeringPath(devices) {
  for (const id of ['V1002', 'M1004', 'M1003', 'M1002', 'M1602', 'V1602', 'M1102']) Object.assign(devices[id], { value: 100, working: true })
  Object.assign(devices.Rg002, { value: 100, working: true, connected: true })
}
// Explicit independent process gate; pre-existing real-plant import failures are out of scope.
const gatedTopology = {
  schemaVersion: 1, media: [], substanceType: {}, aliases: {}, canonicalPipes: {}, virtualSources: ['S'], sinkTanks: [], extraProfiles: {}, sourceNotes: [], audit: {},
  routes: [{ from: 'S', to: 'V1002', segments: [{ pipe: 'before', forward: true }] }, { from: 'V1002', to: 'Outdoor@V1002', segments: [{ pipe: 'after', forward: true }] }],
  flowProfiles: { bunkering: { id: 'bunkering', name: 'test', medium: 'methanol', sources: [{ kind: 'root', node: 'S', via: 'V1002', medium: 'methanol' }], pumps: [], activePipes: [{ pipe: 'after', medium: 'methanol', flowForward: true }], animationGroups: ['gate'] } },
  flowGroups: { gate: { id: 'gate', valves: ['V1002', 'M1602'], runningDevices: [], activePipes: [{ pipe: 'after', medium: 'methanol', flowForward: true }] } },
}

beforeEach(async () => {
  simulator.state.workspaces = {}
  simulator.reset()
  simulator.state.devices = closedPlant()
  simulator.login('teacher')
  for (const category of ['information', 'success', 'warning', 'error']) simulator.state.settings[`${category}AutoClose`] = false
  simulator.state.logs = []; simulator.state.toasts = []; simulator.state.alarms = []
  await nextTick()
})

test('自由操作不造源：单开 V1002 只能静态填充到关阀，真实通路打开后才流动', () => {
  const devices = closedPlant()
  assert.equal(manual(devices).summary.flowingCount, 0)
  Object.assign(devices.V1002, { value: 10, working: true })
  const before = JSON.stringify(devices), result = manual(devices)
  assert.equal(result.pipes['1755764815355'].medium, 'methanol')
  assert.equal(result.pipes['1756445796569'].filled, true)
  assert.equal(result.pipes['1755764815355'].flowing, false)
  assert.equal(result.pipes['1756445796569'].flowing, false)
  assert.equal(result.pipes['1754630791'].filled, false)
  assert.equal(JSON.stringify(devices), before)
  openBunkeringPath(devices)
  assert.equal(manual(devices).pipes['1755764815355'].flowing, true)
})

test('孤立开启 V1602 不再凭空填充或流动，不能绕过关闭的上游阀门', () => {
  const devices = closedPlant()
  devices.V1602.value = 100
  const result = manual(devices)
  assert.equal(result.pipes['40'].filled, false)
  assert.equal(result.pipes['36'].filled, false)
  assert.equal(result.summary.flowingCount, 0)
  assert.equal(result.pipes['1754630791'].filled, false)
})

test('自由模式暂停只停止动画，继续后恢复；不改正式流程的门控和填充规则', () => {
  const devices = closedPlant()
  openBunkeringPath(devices)
  const beforeFormal = resolvePiping(devices, { flowId: 'bunkering', running: true })
  const running = manual(devices), paused = manual(devices, false)
  assert.equal(paused.summary.flowingCount, 0)
  for (const [id, pipe] of Object.entries(running.pipes)) assert.deepEqual({ ...pipe, flowing: false }, paused.pipes[id])
  assert.equal(manual(devices).summary.flowingCount, running.summary.flowingCount)
  assert.deepEqual(resolvePiping(devices, { flowId: 'bunkering', running: true }), beforeFormal)
  Object.assign(devices.M1602, { value: 0, working: false })
  const formal = resolvePiping(devices, { flowId: 'bunkering', running: true }, gatedTopology)
  assert.equal(formal.pipes.after.filled, true)
  assert.equal(formal.pipes.after.flowing, false, '正式模式仍要求完整门控')
  assert.equal(resolvePiping(devices, { flowId: '__manual__', running: true }, gatedTopology).pipes.after.flowing, true)
})

test('自由模式允许故障/锁定阀门流动，但不能悄悄清除故障；非自由模式仍阻断', () => {
  const devices = closedPlant()
  openBunkeringPath(devices)
  Object.assign(devices.V1002, { value: 100, error: true, enabled: false })
  assert.equal(manual(devices).pipes['1756445796569'].flowing, true)
  assert.equal(devices.V1002.error, true)
  assert.equal(devices.V1002.enabled, false)
  assert.equal(resolvePiping(devices, { flowId: 'bunkering', running: true }, gatedTopology).pipes.after.filled, false)
})

test('手动会话允许错误顺序、故障和禁用操作；退出后立即恢复校验', async () => {
  assert.equal(simulator.startManual(), true)
  simulator.setDevice('V1602', { error: true, enabled: false }, false)
  assert.equal(simulator.setDevice('V1602', { value: 100, working: true }), true)
  await nextTick()
  assert.ok(simulator.state.manualWarnings.some(warning => warning.id === 'device:V1602'))
  assert.equal(simulator.state.devices.V1602.error, true)
  assert.equal(simulator.state.devices.V1602.enabled, false)
  assert.equal(simulator.state.safetyComplete, false)
  simulator.stopFlow()
  assert.equal(simulator.isFreeManual(), false)
  assert.equal(simulator.setDevice('V1602', { value: 100, working: true }), false)
  await nextTick()
  assert.deepEqual(simulator.state.manualWarnings, [])
})

test('自由模式不能进入活动考核，也不能在考核状态下绕过设备限制', () => {
  simulator.state.workspaces.activeAssessment = { kind: 'operation', mode: 'exam' }
  assert.equal(simulator.startManual(), false)
  Object.assign(simulator.state, { flowRunning: true, flowId: '', autoDemo: false })
  simulator.state.devices.V1602.error = true
  assert.equal(simulator.isFreeManual(), false)
  assert.equal(simulator.setDevice('V1602', { working: true, value: 100 }), false)
})

test('WPF 风险提示来自实际状态，完成对应条件后消失，不修改阀门或启动备用机', async () => {
  simulator.startManual()
  simulator.setDevice('V1002', { value: 100, working: true })
  await nextTick()
  assert.ok(simulator.state.manualWarnings.some(warning => warning.id === 'connection:Rg002'))
  simulator.setDevice('Rg002', { connected: true, value: 100, working: true, pressureTested: false })
  await nextTick()
  assert.ok(!simulator.state.manualWarnings.some(warning => warning.id === 'connection:Rg002'))
  assert.ok(simulator.state.manualWarnings.some(warning => warning.id === 'test:Rg002'))
  simulator.setDevice('Rg002', { pressureTested: true })
  await nextTick()
  assert.ok(!simulator.state.manualWarnings.some(warning => warning.id === 'test:Rg002'))
  simulator.setDevice('Pit101', { value: 17 })
  await nextTick()
  assert.ok(simulator.state.manualWarnings.some(warning => warning.id === 'pressure-relief'))
  assert.equal(simulator.state.devices.B11.value, 0)
  const warningLogs = simulator.state.logs.filter(log => log.action.includes('自由操作安全提示')).length
  simulator.tickSimulation(); simulator.tickSimulation()
  await nextTick()
  assert.equal(simulator.state.logs.filter(log => log.action.includes('自由操作安全提示')).length, warningLogs, '相同风险不刷屏')
  simulator.setDevice('B11', { value: 100 })
  await nextTick()
  assert.ok(!simulator.state.manualWarnings.some(warning => warning.id === 'pressure-relief'))
})

test('自由模式故障注入不自动切换主备机，离开自由模式后保持原自动切换', async () => {
  simulator.state.settings.autoFuelPump = true
  simulator.state.settings.autoNitrogenFan = true
  simulator.startManual()
  simulator.injectFault('P101')
  assert.equal(simulator.state.devices.P102.working, false)
  injectConfiguredFault('FanForPit7AMaster', 'failure')
  assert.equal(simulator.state.devices.FanForPit7ABackup.working, false)
  simulator.setDevice('M1201', { value: 100, working: true })
  simulator.injectFault('P102')
  await nextTick()
  assert.equal(simulator.state.devices.M1201.value, 100)
  assert.ok(simulator.state.manualWarnings.some(warning => warning.id === 'dual-pump'))
  simulator.stopFlow(); simulator.reset()
  simulator.injectFault('P101')
  assert.equal(simulator.state.devices.P102.working, true)
})

test('安全检查、接地、就位、泄漏和高液位风险只给提示；纯检查没有副作用', () => {
  const devices = closedPlant()
  Object.assign(devices.V1002, { value: 100 })
  devices.FuelStation = { id: 'FuelStation', kind: 'station', grounded: false, moored: false, emergencyStop: true, working: true }
  Object.assign(devices.T101, { currentCapacity: 97, maxCapacity: 100, value: 97 })
  devices.Rg001.leaking = true
  const before = JSON.stringify(devices), warnings = evaluateManualSafety(devices, false)
  for (const id of ['checklist', 'grounding', 'mooring', 'emergency-stop', 'overfill', 'leak:Rg001']) assert.ok(warnings.some(warning => warning.id === id), id)
  assert.equal(JSON.stringify(devices), before)
  assert.ok(warnings.every(warning => warning.source.startsWith('WPF')))
})

test('待机直接开阀即启动自由运行，无须先点击手动按钮，并显示甲醇加注试验名称', async () => {
  assert.equal(simulator.isFreeManual(), false)
  assert.equal(simulator.setDevice('V1002', { value: 0, working: false }), true)
  assert.equal(simulator.isFreeManual(), false)
  simulator.state.speed = 0
  assert.equal(simulator.setDevice('V1002', { value: 100, working: true }), true)
  await nextTick()
  assert.equal(simulator.isFreeManual(), true)
  assert.equal(simulator.manualActivity.value, '甲醇加注试验')
  assert.equal(simulator.state.speed, 1)
  assert.equal(manual(simulator.state.devices).summary.flowingCount, 0, '会话开始不等于通路已经贯通')
  openBunkeringPath(simulator.state.devices)
  assert.ok(manual(simulator.state.devices).summary.flowingCount > 0)
  assert.equal(simulator.state.safetyComplete, false)
})

test('内部初始化不自动启动；用户明确退出后保持停止，重新手动进入仍保留阀门', () => {
  simulator.setDevice('V1002', { value: 100, working: true }, false)
  assert.equal(simulator.isFreeManual(), false)
  simulator.setDevice('V1002', { value: 100, working: true })
  assert.equal(simulator.isFreeManual(), true)
  simulator.stopFlow()
  simulator.setDevice('V1602', { value: 100, working: true })
  assert.equal(simulator.isFreeManual(), false)
  simulator.startManual()
  assert.equal(simulator.isFreeManual(), true)
  assert.equal(simulator.state.devices.V1602.value, 100)
})

test('从演示切到手动保留该流程定义和设备快照，不载入初始工况、不自动操作', () => {
  simulator.state.flowId = 'cooling'
  simulator.state.flowRunning = true
  simulator.state.autoDemo = true
  simulator.state.devices.V1401.value = 37
  const before = JSON.stringify(simulator.state.devices)
  assert.equal(simulator.startManual(), true)
  assert.equal(simulator.state.manualFlowId, 'cooling')
  assert.equal(simulator.manualFlow.value.id, 'cooling')
  assert.equal(simulator.state.flowId, '')
  assert.equal(JSON.stringify(simulator.state.devices), before)
})

test('21个手动工艺均可显式切换，切页不改变选择，考核和非法工艺不能覆盖', () => {
  simulator.startManual()
  const before = JSON.stringify(simulator.state.devices)
  const ids = ['shore-inerting', 'ship-inerting', 'bunkering', 'bunkering-purge', 'supply', 'supply-purge', 'heating', 'cooling', 'methanol-leak', 'pump-failure', 'supply-aux', 'supply-main', 'recovery-bunkering', 'recovery-fuel', 'recovery-lfss', 'recovery-tray', 'recovery-all', 'recovery-waste', 'shore-discharge', 'load-balance', 'stop']
  for (const id of ids) {
    assert.equal(simulator.setManualFlow(id), true)
    simulator.navigate('overview')
    assert.equal(simulator.state.manualFlowId, id)
    assert.equal(JSON.stringify(simulator.state.devices), before)
    assert.equal(simulator.state.autoDemo, false)
    assert.equal(simulator.state.flowId, '')
  }
  assert.equal(simulator.setManualFlow('does-not-exist'), false)
  assert.equal(simulator.state.manualFlowId, 'stop')
  simulator.state.workspaces.activeAssessment = { kind: 'operation', mode: 'exam' }
  assert.equal(simulator.setManualFlow('bunkering'), false)
  assert.equal(simulator.state.manualFlowId, 'stop')
})

test('从不同页面直接开阀自动选对应手动工艺，显式选择优先于页面推断', () => {
  simulator.navigate('water')
  simulator.setDevice('V1401', { value: 100, working: true })
  assert.equal(simulator.state.manualFlowId, 'heating')
  simulator.reset()
  simulator.navigate('nitrogen')
  simulator.setDevice('V1701', { value: 100, working: true })
  assert.equal(simulator.state.manualFlowId, 'ship-inerting')
  simulator.reset()
  simulator.setManualFlow('cooling')
  simulator.navigate('overview')
  simulator.setDevice('V1401', { value: 100, working: true })
  assert.equal(simulator.state.manualFlowId, 'cooling')
})
