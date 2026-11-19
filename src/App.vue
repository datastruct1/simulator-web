<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, watch, type Component } from 'vue'
import LoginView from './components/LoginView.vue'
import HeaderToolbar from './components/layout/HeaderToolbar.vue'
import PageNavigation from './components/layout/PageNavigation.vue'
import BottomStatusbar from './components/layout/BottomStatusbar.vue'
import FlowProgress from './components/layout/FlowProgress.vue'
import SimulationRuntime from './components/layout/SimulationRuntime.vue'
import BaseModal from './components/common/BaseModal.vue'
import UiIcon from './components/common/UiIcon.vue'
import ManualSafetyPanel from './components/safety/ManualSafetyPanel.vue'
import { pageAliases, pages, workflows } from './data/catalog'
import { useSimulator } from './state/simulator'
import { useIlab } from './state/ilab'
import { useWorkspace } from './state/workspace'
import IlabConnection from './components/layout/IlabConnection.vue'
import type { SceneNode } from './types/scene'

// Explicit imports let typecheck/build catch missing pages instead of failing on click.
const WpfScene = defineAsyncComponent(() => import('./components/scene/WpfScene.vue'))
const SafetyChecklist = defineAsyncComponent(() => import('./components/safety/SafetyChecklist.vue'))
const TeacherWorkspace = defineAsyncComponent(() => import('./components/workspace/TeacherWorkspace.vue'))
const StudentWorkspace = defineAsyncComponent(() => import('./components/workspace/StudentWorkspace.vue'))
const ExamWorkspace = defineAsyncComponent(() => import('./components/workspace/ExamWorkspace.vue'))
const SceneEditor = defineAsyncComponent(() => import('./components/workspace/SceneEditor.vue'))
const ToolDialogs = defineAsyncComponent(() => import('./components/dialogs/ToolDialogs.vue'))
const DeviceDialog = defineAsyncComponent(() => import('./components/dialogs/DeviceDialog.vue'))
const { state, navigate, openModal, closeModal, ensureDevice, setDevice, record, notify, startFlow, stopFlow, startClock, login, clearFault, isFreeManual, manualActivity } = useSimulator()
const ilab = useIlab()
const manualActive = computed(isFreeManual)
const isScene = computed(() => pages.some(page => page.id === state.page))
const workspace = computed(() => ({ teacher: TeacherWorkspace, student: StudentWorkspace, exam: ExamWorkspace, editor: SceneEditor } as Record<string, Component>)[state.page])
const modalWidth = computed(() => state.modal?.type === 'device' ? 740 : state.modal?.type === 'confirm' ? 460 : state.modal?.type === 'speed' ? 420 : state.modal?.type === 'inventory' ? 1300 : 1150)
let stopClock: (() => void) | undefined

function operate(node: SceneNode) {
  const item = node as any
  if (item.command && !item.deviceId) { action(item.command, node); return }
  const deviceId = item.deviceId || item.id
  if (!deviceId) return
  const device = ensureDevice(deviceId, item.kind, item.label || deviceId)
  openModal('device', `${device.id} · 设备操作`, { id: device.id, node, kind: item.kind })
}
function action(raw: string, node?: SceneNode) {
  const item = node as any
  const attributes = item?.attributes || {}
  const command = String(raw).replace(/^\{Binding\s+/, '').replace(/Command\}?$/, '').replace(/\}$/, '')
  const parameter = item?.parameter ?? item?.commandParameter ?? attributes.CommandParameter ?? attributes.commandParameter ?? attributes.parameter ?? ''
  if (/Fan|通风|风机/.test(command)) { openModal('fans', '通风系统设置', { room: parameter }); return }
  if (/导航|Navigate/.test(command) && pageAliases[String(parameter)]) { navigate(pageAliases[String(parameter)]!); return }
  if (pageAliases[command]) { navigate(pageAliases[command]!); return }
  if (command === 'station-type') {
    ensureDevice('FuelStation', 'station')
    setDevice('FuelStation', { value: Number(parameter), mode: ['加注车', '加注船', '岸边加注站'][Number(parameter)] || '加注车' })
    return
  }
  if (/^SoftPipe(?:Dis)?Connect/.test(command)) {
    const deviceId = ['Rg001', 'Rg002', 'Rg003'][Number(parameter)]
    const connected = !command.includes('DisConnect')
    if (deviceId) setDevice(deviceId, { value: connected ? 100 : 0, working: connected, connected })
    return
  }
  const pumpBank = state.page === 'water' || /PumpStart|PumpStopCommamd|EmerGencyStop/.test(command) ? ['P401', 'P402'] : state.page === 'recovery' ? ['P201', 'P202'] : ['P101', 'P102']
  if (/^(?:StartPump|StopPump|PumpStart|PumpStop)/.test(command)) {
    if (!manualActive.value && pumpBank[0] === 'P401' && state.devices.WaterControlPanel?.enabled === false) { notify('冷热水控制面板已急停，请先复位。', 'warning'); return }
    const deviceId = item?.deviceId || pumpBank[Number(parameter) - 1]
    if (deviceId) setDevice(deviceId, { working: !command.includes('Stop'), value: command.includes('Stop') ? 0 : 100 })
    return
  }
  if (/^EmergencyStop|^EmerGencyStop/.test(command)) {
    for (const deviceId of pumpBank) setDevice(deviceId, { value: 0, working: false, powered: false, startRequested: false })
    if (pumpBank[0] === 'P401') {
      for (const deviceId of ['H1401', 'H1402', 'H1403', 'H1404', 'H1405', 'H1406']) setDevice(deviceId, { value: 0, working: false })
      ensureDevice('WaterControlPanel', 'panel', '冷热水控制面板')
      setDevice('WaterControlPanel', { enabled: false, emergencyStop: true }, false)
    }
    if (!manualActive.value) stopFlow()
    record('撬块紧急停止', pumpBank.join('、'), '警告')
    notify('紧急停止已执行，当前撬块泵已停止。', 'warning')
    return
  }
  if (command === 'Reset') {
    if (pumpBank[0] === 'P401') {
      ensureDevice('WaterControlPanel', 'panel', '冷热水控制面板')
      setDevice('WaterControlPanel', { enabled: true, emergencyStop: false }, false)
      for (const deviceId of ['H1401', 'H1402', 'H1403', 'H1404', 'H1405', 'H1406']) setDevice(deviceId, { enabled: true })
    }
    record('控制面板复位（不启动泵，不解除设备故障）', pumpBank.join('、'))
    notify('控制面板已复位；泵保持停止，设备故障须单独复位。', 'success')
    return
  }
  if (item?.deviceId && ['open', 'close', 'start', 'stop', 'set-value', 'adjust', 'reset'].includes(command)) {
    const deviceId = ensureDevice(item.deviceId, item.kind).id
    if (command === 'reset') clearFault(deviceId)
    else if (['set-value', 'adjust'].includes(command)) setDevice(deviceId, { value: Number(parameter), working: Number(parameter) > 0 })
    else {
      const opened = ['open', 'start'].includes(command)
      setDevice(deviceId, { value: opened ? deviceId.toUpperCase() === 'C1401' ? 75 : 100 : 0, working: opened })
    }
    return
  }
  if (item?.deviceId && /^(?:Open|Close|Start|Stop)$/.test(command)) {
    const deviceId = ensureDevice(item.deviceId, item.kind).id
    const opened = /Open|Start/.test(command)
    setDevice(deviceId, { value: opened ? deviceId.toUpperCase() === 'C1401' ? 75 : 100 : 0, working: opened })
    return
  }
  if (/物品|ItemCab/.test(command)) { openModal('inventory', '物品柜', { tab: parameter }); return }
  if (/设置|Setting/.test(command)) { openModal('settings', '系统设置'); return }
  if (/统计|Statistics/.test(command)) { openModal('statistics', '实时趋势'); return }
  if (/查看设备|DeviceList/.test(command)) { openModal('monitor', '设备监测'); return }
  const flowAliases: [RegExp, string][] = [
    [/船载.*惰化|惰化.*船载/, 'ship-inerting'], [/岸载.*惰化|惰化.*岸载/, 'shore-inerting'],
    [/甲醇供应.*备机/, 'supply-aux'], [/甲醇供应.*主/, 'supply-main'],
    [/加注扫气/, 'bunkering-purge'], [/供应扫气/, 'supply-purge'], [/加注流程/, 'bunkering'],
    [/整备间回收/, 'recovery-lfss'], [/燃料舱回收/, 'recovery-fuel'], [/积液盘回收/, 'recovery-tray'],
    [/加注站回收/, 'recovery-bunkering'], [/全回收/, 'recovery-all'], [/废液排岸|排岸回收/, 'shore-discharge'],
    [/废液回收/, 'recovery-waste'], [/负载均衡/, 'load-balance'], [/冷水|降温/, 'cooling'], [/热水|加热/, 'heating'], [/演示停止/, 'stop'],
  ]
  const flowId = flowAliases.find(([pattern]) => pattern.test(command))?.[1]
  if (flowId) { startFlow(flowId); return }
  if (/惰化/.test(command)) { startFlow('ship-inerting'); return }
  if (/供应/.test(command)) { startFlow('supply'); return }
  if (item?.deviceId) { operate({ ...item, command: undefined }); return }
  const label = String(item?.label || parameter || command)
  const page = pages.find(page => page.title.includes(label) || label.includes(page.title))
  if (page) { navigate(page.id); return }
  const flow = workflows.find(flow => label.includes(flow.name))
  if (flow) { startFlow(flow.id); return }
  record(`未支持的 WPF 命令：${command}`, '', '警告')
  notify(`“${label || command}”尚未支持，没有执行设备或网络操作。`, 'warning')
}
function confirm() {
  const callback = state.modal?.payload.action
  closeModal()
  if (typeof callback === 'function') callback()
}
function keyboard(event: KeyboardEvent) {
  if (event.defaultPrevented || !state.loggedIn || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return
  if (event.key === 'F1') { event.preventDefault(); openModal('hint', '操作提示') }
  if (event.code === 'Space' && state.flowRunning && !state.modal) { event.preventDefault(); state.paused = !state.paused }
}
async function authenticateIlab() {
  if (!await ilab.initialise()) return false
  const teaching = useWorkspace()
  const oldOperation = teaching.data.activeOperation
  if (teaching.data.activeTheory || (oldOperation && !ilab.ownsOperation(oldOperation.id)) || (teaching.data.pendingLaunch && !oldOperation)) {
    teaching.cancelAssessment()
    notify('已结束原本地会话；请以实验空间身份重新开始操作实验。', 'info')
  }
  login('student', ilab.platformLabel())
  record(`实验空间身份认证成功：${ilab.state.session?.username}（${ilab.state.session?.mode === 'test' ? '测试环境' : '正式环境'}）`)
  return true
}
watch(() => state.loggedIn, (loggedIn, previous) => {
  if (!loggedIn && previous && ilab.state.session) {
    const teaching = useWorkspace()
    if (teaching.data.activeOperation && ilab.ownsOperation(teaching.data.activeOperation.id)) teaching.cancelAssessment()
    void ilab.logout().catch(() => notify('本地已退出，但服务端注销失败；请关闭浏览器并稍后重试。', 'warning'))
  }
}, { flush: 'sync' })
onMounted(async () => {
  stopClock = startClock(); document.addEventListener('keydown', keyboard)
  const parameters = new URLSearchParams(location.search)
  const hadTicket = parameters.has('ticket')
  const authenticated = await authenticateIlab()
  if (!authenticated && !hadTicket && parameters.get('demo') === '1') login('teacher')
})
onBeforeUnmount(() => { stopClock?.(); document.removeEventListener('keydown', keyboard) })
</script>

<template>
  <div v-if="!state.loggedIn && ['authenticating', 'error'].includes(ilab.state.phase)" class="ilab-login-screen"><IlabConnection @authenticate="authenticateIlab" /><p>请从实验空间课程页点击“我要做实验”进入；认证成功后自动进入学员工作台。</p></div>
  <LoginView v-else-if="!state.loggedIn" />
  <div v-else class="simulator-shell">
    <SimulationRuntime />
    <IlabConnection @authenticate="authenticateIlab" />
    <HeaderToolbar /><PageNavigation />
    <main class="main-view" :class="{ 'workspace-view': !isScene }">
      <WpfScene v-if="isScene" :scene-id="state.page" :devices="state.devices" :flow-id="manualActive ? '__manual__' : state.flowId" :manual-flow-id="state.manualFlowId" :running="state.flowRunning && !state.paused" :highlight-id="state.autoDemo || state.workspaces.activeAssessment?.mode === 'exam' ? '' : state.highlightId" @navigate="navigate" @operate="operate" @action="action" />
      <SafetyChecklist v-else-if="state.page === 'safety'" />
      <component :is="workspace" v-else-if="workspace" />
      <div v-else class="empty-state">请选择工艺页面或训练模块。</div>
      <FlowProgress v-if="isScene && !state.autoDemo && state.workspaces.activeAssessment?.mode !== 'exam'" />
      <ManualSafetyPanel v-if="isScene" />
      <div v-if="isScene && manualActive" class="manual-status" role="status" data-testid="manual-status"><UiIcon name="Wrench" :size="16" /><strong>{{ manualActivity }}</strong><span>{{ state.paused ? '已暂停' : '手动运行中 · 安全只提示' }}</span><button class="btn btn-sm" @click="state.paused = !state.paused">{{ state.paused ? '继续' : '暂停' }}</button><button class="btn btn-sm" @click="stopFlow">退出手动操作</button></div>
    </main>
    <BottomStatusbar />
  </div>
  <BaseModal v-if="state.modal" :key="state.modal.type" :title="state.modal.title" :width="modalWidth" @close="closeModal">
    <DeviceDialog v-if="state.modal.type === 'device'" />
    <div v-else-if="state.modal.type === 'confirm'" class="confirmation"><UiIcon name="CircleHelp" :size="40" /><p>{{ state.modal.payload.message }}</p><div><button class="btn" @click="closeModal">取消</button><button class="btn btn-primary" @click="confirm">{{ state.modal.payload.confirmLabel || '确认' }}</button></div></div>
    <ToolDialogs v-else />
  </BaseModal>
  <div class="toast-stack" aria-live="polite" aria-atomic="false"><TransitionGroup name="toast"><div v-for="toast in state.toasts" :key="toast.id" class="toast" :class="`toast-${toast.tone}`"><UiIcon :name="toast.tone === 'success' ? 'CheckCircle2' : toast.tone === 'warning' || toast.tone === 'error' ? 'TriangleAlert' : 'Info'" :size="19" /><span>{{ toast.message }}</span><button title="关闭提示" @click="state.toasts = state.toasts.filter(item => item.id !== toast.id)"><UiIcon name="X" :size="15" /></button></div></TransitionGroup></div>
</template>

<style scoped>.simulator-shell{height:100dvh;min-height:480px;display:flex;flex-direction:column;overflow:hidden}.main-view{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--canvas)}.main-view.workspace-view{background:#edf3f9;overflow:auto}.confirmation{padding:10px 3px;color:#526c84;display:flex;flex-direction:column;align-items:center;gap:15px}.confirmation>svg{color:#2c7cbc}.confirmation p{font-size:14px;text-align:center;margin:0;line-height:1.8}.confirmation>div{display:flex;justify-content:center;gap:12px;width:100%;padding-top:9px}.confirmation .btn{min-width:110px}.toast-stack{position:fixed;right:22px;top:68px;z-index:3000;display:flex;flex-direction:column;gap:9px;max-width:min(440px,calc(100vw - 32px));pointer-events:none}.toast{background:#fff;border:1px solid #c5d8e9;border-left:4px solid #4b91c7;border-radius:7px;box-shadow:0 6px 24px #1c3f6633;color:#476178;display:flex;align-items:center;gap:10px;padding:12px 12px;font-size:12px;line-height:1.5;pointer-events:auto}.toast>svg{color:#4082b7}.toast>span{flex:1}.toast button{border:0;background:transparent;color:#93a6b6;padding:3px;display:grid;place-items:center}.toast-success{border-left-color:#299572}.toast-success>svg{color:#299572}.toast-warning{border-left-color:#dda535}.toast-warning>svg{color:#c78d26}.toast-error{border-left-color:#d34d5b}.toast-error>svg{color:#c84453}.toast-enter-active,.toast-leave-active{transition:.18s ease}.toast-enter-from,.toast-leave-to{opacity:0;transform:translateX(20px)}.toast-move{transition:transform .18s ease}
.manual-status{position:absolute;right:16px;bottom:14px;z-index:30;display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid #a9bdca;border-radius:6px;color:#294660;box-shadow:0 3px 12px #17437326}.manual-status span{font-size:12px;color:#417b60}
@media(max-width:700px){.toast-stack{top:60px;right:12px}}
.ilab-login-screen{min-height:100dvh;background:#edf3f9;display:flex;flex-direction:column;justify-content:center;padding:24px}.ilab-login-screen p{text-align:center;color:#526f85;line-height:1.8;font-size:14px}
</style>
