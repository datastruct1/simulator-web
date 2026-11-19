<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { toolItems } from '../../data/catalog'
import { useSimulator } from '../../state/simulator'
import UiIcon from '../common/UiIcon.vue'

const { state, activeAlarms, currentFlow, openModal, navigate } = useSimulator()
const more = ref(false), area = ref<HTMLElement>()
const clock = computed(() => { const total = Math.floor(state.elapsed); return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(value => String(value).padStart(2, '0')).join(':') })
function outside(event: PointerEvent) { if (!area.value?.contains(event.target as Node)) more.value = false }
function tool(type: string, title: string) { more.value = false; openModal(type, title) }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <footer class="bottom-statusbar">
    <button class="alarm-status" :class="{ alarming: activeAlarms.length, 'alarm-flash': activeAlarms.length && !state.flashOff }" @click="openModal('alerts', '报警历史')"><UiIcon name="Bell" :size="17" /><span v-if="activeAlarms.length" class="alarm-count">{{ activeAlarms.length }}</span><strong>{{ activeAlarms.length ? activeAlarms[0]?.message : '系统正常 · 暂无活动报警' }}</strong><UiIcon name="ChevronUp" :size="12" /></button>
    <div ref="area" class="more-area"><button class="more-button" :class="{ active: more }" data-testid="more-tools" @click="more = !more"><UiIcon name="Menu" :size="16" />更多操作<UiIcon name="ChevronUp" :size="12" /></button><div v-if="more" class="more-popover"><header>系统操作与维护</header><div class="more-grid"><button v-for="item in toolItems" :key="item.type" :data-tool="item.type" @click="tool(item.type, item.title)"><UiIcon :name="item.icon" :size="17" /><span>{{ item.title }}</span></button><button @click="more = false; navigate('editor')"><UiIcon name="Workflow" :size="17" />场景编辑器</button></div></div></div>
    <div class="connection"><i class="status-dot" /><span>本地模拟</span><span class="connection-detail">下位机 / 后端未连接</span></div>
    <div class="status-spacer" />
    <span class="status-user"><UiIcon name="User" :size="13" />{{ state.userName }}</span>
    <div class="status-divider" />
    <button class="speed-status" @click="openModal('speed', '速度控制')"><UiIcon :name="state.paused ? 'Pause' : 'Play'" :size="14" /><span>运行倍速</span><strong>{{ state.paused ? '暂停' : `${state.speed.toFixed(1)}x` }}</strong><UiIcon name="ChevronUp" :size="11" /></button>
    <div class="status-divider" />
    <div class="process-status"><span>当前进程</span><strong>{{ state.flowRunning ? currentFlow?.name : state.flowId ? '流程已完成' : '就绪' }}</strong></div>
    <div class="time-status"><span>模拟时间</span><strong class="digital">{{ clock }}</strong></div>
  </footer>
</template>

<style scoped>.bottom-statusbar{height:42px;flex-shrink:0;background:#d0deee;border-top:1px solid #aec6df;display:flex;align-items:center;padding:0 13px;gap:12px;font-size:11px;color:#57728d;position:relative;z-index:80}.alarm-status{height:28px;border:1px solid #adc3d8;border-radius:5px;display:flex;align-items:center;gap:9px;background:#f3f8fe;color:#40627f;padding:4px 9px;min-width:280px;max-width:350px;flex-shrink:0}.alarm-status>svg:first-child{color:#389570}.alarm-status strong{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left;font-size:11px}.alarm-status.alarming{background:#fff0f1;border-color:#d8a0a6;color:#b33c48}.alarm-status.alarming>svg:first-child{color:#c73544}.alarm-count{border-radius:10px;background:#d6424f;padding:1px 5px;color:white;font-size:9px}.more-area{position:relative;flex-shrink:0}.more-button{height:28px;border:1px solid #a9bfd7;border-radius:4px;background:#edf5fe;color:#345c80;padding:4px 9px;display:flex;align-items:center;gap:6px;font-size:11px}.more-button:hover,.more-button.active{background:white;border-color:#6d9ac7}.more-popover{position:absolute;left:0;bottom:calc(100% + 10px);width:340px;max-width:calc(100vw - 24px);background:#f4f9ff;border:1px solid #9fbbd8;border-radius:8px;overflow:hidden;box-shadow:0 -9px 35px #173e6b33}.more-popover header{font-size:12px;font-weight:600;padding:12px 14px;background:#e7f1fc;border-bottom:1px solid var(--border);color:#2d587d}.more-grid{display:grid;grid-template-columns:1fr 1fr;padding:9px;gap:3px}.more-grid button{display:flex;gap:10px;align-items:center;border:0;border-radius:5px;background:none;color:#476882;padding:10px 11px;font-size:12px;text-align:left}.more-grid button:hover{background:#dbeaff;color:#004ea0}.connection{display:flex;gap:7px;align-items:center;white-space:nowrap}.connection-detail{color:#91a4b8;font-size:10px}.status-spacer{flex:1}.status-user{display:flex;align-items:center;gap:5px;white-space:nowrap;color:#59768f}.status-divider{width:1px;height:20px;background:#afc5dc;flex-shrink:0}.speed-status{display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#52718e;white-space:nowrap;font-size:10px;padding:4px}.speed-status strong{background:#edf5ff;padding:4px 7px;border:1px solid #afc7df;border-radius:4px;color:#0b559f;font-size:11px}.process-status,.time-status{display:flex;gap:9px;align-items:center;white-space:nowrap;font-size:10px}.process-status strong{color:#355d80;font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;font-weight:600}.time-status{margin-left:7px}.time-status strong{font-size:23px;color:#295573;letter-spacing:1px}
@media(max-width:1400px){.connection-detail{display:none}.bottom-statusbar{gap:9px}.alarm-status{min-width:230px;max-width:270px}.status-user{display:none}.process-status strong{max-width:120px}}
@media(max-width:1000px){.connection{display:none}.speed-status>span{display:none}.time-status>span{display:none}.bottom-statusbar{gap:7px}.alarm-status{min-width:180px;max-width:220px}.process-status>span{display:none}}
@media(max-width:720px){.alarm-status{min-width:120px;max-width:150px}.more-button{font-size:0;gap:0}.more-button svg:last-child{display:none}.speed-status>svg:last-child,.status-divider,.process-status{display:none}.time-status strong{font-size:19px}.bottom-statusbar{padding:0 7px}.more-popover{left:-145px}}
</style>
