<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from '../common/UiIcon.vue'
import FlowLauncher from './FlowLauncher.vue'
import { useSimulator } from '../../state/simulator'
import { useWorkspace } from '../../state/workspace'

const { state, navigate, openModal, logout, currentFlow, stopFlow, startManual, reset, record } = useSimulator()
const workspace = useWorkspace()
const showFlows = ref(false)
const flowArea = ref<HTMLElement>()
function outside(event: PointerEvent) { if (!flowArea.value?.contains(event.target as Node)) showFlows.value = false }
function exit() { openModal('confirm', '退出系统', { message: '确认退出当前会话并返回登录界面？本地工况和教学数据不会被删除。', confirmLabel: '退出系统', action: logout }) }
function resetState() { openModal('confirm', '恢复初始工况', { message: '恢复初始设备状态，并清除当前安全检查及活动报警？', confirmLabel: '恢复初始', action: reset }) }
function stop() {
  const session = workspace.data.activeOperation
  openModal('confirm', session ? '提交操作考核' : '结束演示', {
    message: session ? `确认提交“${session.title}”？将按本次实际操作保存本地成绩，未完成项目不得分。` : `确认结束“${currentFlow.value?.name || '当前操作'}”？`,
    confirmLabel: session ? '交卷' : '结束操作',
    action: () => { if (workspace.data.activeOperation) workspace.submitOperation(); else stopFlow() },
  })
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <header class="header-toolbar">
    <div class="header-actions">
      <div v-if="!(state.workspaces.activeAssessment?.kind === 'operation' && state.workspaces.activeAssessment?.mode === 'exam')" ref="flowArea" class="flow-area"><button class="header-button flow-button" :class="{ selected: showFlows }" data-testid="flow-launcher" :disabled="['operation', 'recording'].includes(state.workspaces.activeAssessment?.kind)" title="请先结束当前操作训练或录制，再开始其他流程" @click="showFlows = !showFlows"><UiIcon name="Workflow" :size="17" />流程演示<UiIcon name="ChevronDown" :size="13" /></button><div v-if="showFlows" class="flow-popover"><FlowLauncher @close="showFlows = false" /></div></div>
      <button class="header-button" :class="{ selected: state.flowRunning && !state.autoDemo && !state.flowId }" :disabled="!!state.workspaces.activeAssessment" title="自由手动操作：沿用当前演示方向和介质，安全只提示不拦截" data-testid="start-manual" @click="startManual()"><UiIcon name="Wrench" :size="17" /><span>手动操作</span></button>
      <button class="header-button" title="恢复初始工况" @click="resetState"><UiIcon name="RotateCcw" :size="17" /><span>恢复初始</span></button>
      <button class="header-button safety-button" :class="{ checked: state.safetyComplete }" @click="navigate('safety')"><UiIcon :name="state.safetyComplete ? 'ShieldCheck' : 'ClipboardCheck'" :size="17" /><span>加注作业安全检查</span><span v-if="state.safetyComplete" class="check-mark">✓</span></button>
      <button v-if="!(state.workspaces.activeAssessment?.kind === 'operation' && state.workspaces.activeAssessment?.mode === 'exam')" class="header-button compact" title="查看当前流程操作提示（F1）" @click="openModal('hint', '操作提示')"><UiIcon name="CircleHelp" :size="17" /><span>操作提示</span></button>
      <button v-if="state.flowRunning || workspace.data.activeOperation" class="header-button stop-button" data-testid="finish-operation" @click="stop"><UiIcon name="Square" :size="14" /><span>{{ workspace.data.activeOperation ? '提交操作考核' : '结束操作' }}</span></button>
    </div>
    <button class="header-brand" title="返回系统总览" @click="navigate('overview')"><span>甲醇燃料模拟器软件</span><small>SIMULATOR WEB</small></button>
    <div class="header-right">
      <button class="header-button icon-only" title="返回首页" @click="navigate('overview')"><UiIcon name="Home" /></button>
      <button v-if="state.role !== 'student' && state.workspaces.activeAssessment?.mode !== 'exam'" class="header-button compact" aria-label="教师主页" :class="{ selected: state.page === 'teacher' }" @click="navigate('teacher')"><UiIcon name="Users" :size="17" /><span>教师主页</span></button>
      <button class="header-button compact" :class="{ selected: state.page === 'student' }" @click="navigate('student')"><UiIcon name="GraduationCap" :size="17" /><span>学生主页</span></button>
      <div class="header-divider" />
      <button class="header-button icon-only" :class="{ selected: state.muted }" :title="state.muted ? '取消消音' : '消音'" @click="state.muted = !state.muted; record(state.muted ? '报警消音' : '恢复报警声音')"><UiIcon :name="state.muted ? 'VolumeX' : 'Volume2'" /></button>
      <button class="header-button icon-only" :class="{ selected: state.flashOff }" :title="state.flashOff ? '恢复闪烁' : '消闪'" @click="state.flashOff = !state.flashOff; record(state.flashOff ? '报警消闪' : '恢复报警闪烁')"><UiIcon :name="state.flashOff ? 'BellOff' : 'Bell'" /></button>
      <button class="header-close" title="退出系统" @click="exit"><UiIcon name="X" :size="22" /></button>
    </div>
  </header>
</template>

<style scoped>.header-toolbar{height:52px;flex-shrink:0;background:linear-gradient(105deg,#0b4d92,#004ea0 65%,#005cad);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 12px;position:relative;z-index:100;box-shadow:0 2px 8px #123d661f}.header-actions,.header-right{display:flex;align-items:center;gap:5px;flex-shrink:0}.header-button{min-height:31px;padding:6px 9px;background:transparent;border:1px solid transparent;color:#deedff;border-radius:4px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;white-space:nowrap}.header-button:hover,.header-button.selected{background:#ffffff1a;border-color:#ffffff22;color:white}.flow-button{background:#f1f7ff;color:#0b4d92;border-color:#d6e7fa;font-weight:600}.flow-button:hover,.flow-button.selected{background:white;color:#004ea0}.safety-button{border-color:#ffffff30}.safety-button.checked{border-color:#74ccae55;background:#27a46b25}.check-mark{color:#9aedc8}.stop-button{background:#e041511f;border-color:#fc8c974d}.header-brand{border:0;background:none;color:white;text-align:center;display:flex;flex-direction:column;flex-shrink:1;min-width:180px;font-size:20px;letter-spacing:2px;white-space:nowrap;line-height:1.5}.header-brand small{font-size:7px;letter-spacing:4px;color:#8cb6df}.icon-only{width:31px;padding:5px}.header-divider{height:22px;width:1px;background:#ffffff30;margin:0 5px}.header-close{height:42px;width:34px;border:0;background:transparent;color:#e1efff;display:grid;place-items:center;border-radius:4px}.header-close:hover{background:#d43a4c}.flow-area{position:relative}.flow-popover{position:absolute;left:0;top:calc(100% + 11px)}
@media(max-width:1400px){.header-brand{font-size:17px;letter-spacing:1px}.header-right .compact span{display:none}.header-actions{gap:3px}.header-button{padding:6px 7px;font-size:11px}}
@media(max-width:1100px){.header-brand small{display:none}.header-brand{font-size:15px;min-width:150px}.header-actions .compact span{display:none}.header-toolbar{gap:5px;padding:0 8px}.header-right{gap:2px}.header-divider{margin:0 2px}}
@media(max-width:790px){.header-brand{display:none}.header-toolbar{justify-content:space-between}.safety-button span{display:none}.header-actions{flex-shrink:1}.header-actions .stop-button span{display:none}.header-divider{display:none}}
</style>
