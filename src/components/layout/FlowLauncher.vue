<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from '../common/UiIcon.vue'
import { workflows } from '../../data/catalog'
import { useSimulator } from '../../state/simulator'

const emit = defineEmits<{ close: [] }>()
const { state, startFlow } = useSimulator()
const manualActive = computed(() => state.flowRunning && !state.autoDemo && !state.flowId)
const demoIds = ['ship-inerting', 'shore-inerting', 'bunkering', 'bunkering-purge', 'supply-aux', 'supply-main', 'supply-purge', 'recovery-waste', 'shore-discharge', 'heating', 'cooling', 'stop']
const visibleFlows = computed(() => demoIds.map(id => workflows.find(flow => flow.id === id)).filter((flow): flow is typeof workflows[number] => !!flow))
const groups = computed(() => [...new Set(visibleFlows.value.map(flow => flow.category))])
function launch(id: string) { if (startFlow(id, true)) emit('close') }
</script>

<template>
  <div class="flow-launcher" role="region" aria-label="流程演示选择">
    <header><div><UiIcon name="Workflow" /><strong>选择仿真流程</strong></div><button class="btn btn-ghost btn-sm" aria-label="关闭流程选择" @click="emit('close')"><UiIcon name="X" :size="16" /></button></header>
    <div class="flow-groups"><section v-for="group in groups" :key="group"><h3>{{ group }}</h3><button v-for="flow in visibleFlows.filter(item => item.category === group)" :key="flow.id" class="flow-choice" :data-flow="flow.id" :disabled="manualActive" @click="launch(flow.id)"><span>{{ flow.name }}</span><small>{{ flow.steps.length }} 步</small><UiIcon name="ChevronRight" :size="14" /></button></section></div>
    <footer><UiIcon name="Info" :size="14" />{{ manualActive ? '请先退出手动操作，再启动流程演示。' : '所有流程仅在本地模拟。' }}</footer>
  </div>
</template>

<style scoped>.flow-launcher{width:490px;max-width:calc(100vw - 24px);background:#f7fbff;border:1px solid #9ebfdf;border-radius:9px;box-shadow:0 16px 45px #08254440;color:var(--text);overflow:hidden}.flow-launcher header{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;background:#e9f3ff;border-bottom:1px solid var(--border)}.flow-launcher header>div{display:flex;align-items:center;gap:9px;font-size:14px}.launch-mode{display:flex;margin:12px 15px;border:1px solid var(--border);border-radius:6px;overflow:hidden}.launch-mode button{flex:1;border:0;background:white;color:#61788e;padding:8px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:12px}.launch-mode button.active{background:var(--primary);color:white}.flow-groups{padding:0 15px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 15px;max-height:65dvh;overflow:auto}.flow-groups h3{font-size:11px;color:#6d859c;margin:9px 0 5px;padding-left:6px;font-weight:500;letter-spacing:.5px}.flow-choice{width:100%;display:flex;gap:6px;align-items:center;background:white;border:1px solid #dce6f1;border-radius:5px;margin-bottom:5px;padding:9px 9px;color:#294660;font-size:12px;text-align:left}.flow-choice span{flex:1}.flow-choice small{color:#93a4b5;font-size:10px}.flow-choice:hover{background:#e6f2ff;border-color:#7aabd9;color:#00519e}.flow-launcher footer{font-size:10px;color:#7c8fa1;background:#edf4fb;padding:10px 15px;display:flex;align-items:flex-start;gap:7px;line-height:1.5}.flow-launcher footer svg{flex-shrink:0}</style>
