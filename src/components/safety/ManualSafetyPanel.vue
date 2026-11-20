<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSimulator } from '../../state/simulator'
import { MEDIA, pipingTopology } from '../../data/piping'
import UiIcon from '../common/UiIcon.vue'

const { state, isFreeManual, navigate, manualFlow, setManualFlow } = useSimulator()
const active = computed(isFreeManual)
const collapsed = ref(false)
const handbookFlows = [
  { label: '船载惰化', id: 'ship-inerting' },
  { label: '岸载惰化', id: 'shore-inerting' },
  { label: '甲醇加注', id: 'bunkering' },
  { label: '加注扫气', id: 'bunkering-purge' },
  { label: '甲醇供应（备机）', id: 'supply-aux' },
  { label: '甲醇供应（主机）', id: 'supply-main' },
  { label: '供应后扫气', id: 'supply-purge' },
  { label: '废液回收', id: 'recovery-waste' },
  { label: '废液排岸', id: 'shore-discharge' },
  { label: '水乙二醇升温', id: 'heating' },
  { label: '水乙二醇降温', id: 'cooling' },
]
const showCurrentFlow = computed(() => !handbookFlows.some(flow => flow.id === state.manualFlowId))
const media = computed(() => [...new Set(pipingTopology.flowProfiles[state.manualFlowId]?.activePipes.map(pipe => pipe.medium) || [])].map(id => MEDIA.find(medium => medium.id === id)?.label || id).join(' / ') || '无流动介质')
const pageNames: Record<string, string> = { overview: '系统总览', nitrogen: '氮气供应', 'bunkering-front': '加注前端', bunkering: '甲醇加注', 'fuel-tank': '燃料舱', lfss: '燃料准备间', engine: '发动机舱', water: '冷热水', recovery: '回收撬块' }
const flowPages = computed(() => {
  const id = state.manualFlowId
  const related = ['bunkering', 'bunkering-purge', 'shore-inerting'].includes(id) ? ['bunkering-front', 'bunkering', 'fuel-tank', 'nitrogen']
    : id === 'ship-inerting' ? ['nitrogen', 'bunkering', 'fuel-tank']
    : ['heating', 'cooling'].includes(id) ? ['water', 'lfss']
    : /recovery|discharge|leak/.test(id) ? ['recovery', 'bunkering-front', 'lfss', 'engine', 'fuel-tank']
    : ['fuel-tank', 'lfss', 'engine', 'nitrogen']
  return [...new Set([manualFlow.value?.page || 'overview', ...related])].map(page => ({ id: page, name: pageNames[page] || page }))
})
</script>

<template>
  <aside v-if="active" class="manual-safety" :class="{ collapsed }" data-testid="manual-safety-panel" aria-label="自由操作工艺与安全提示">
    <button class="panel-heading" type="button" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <UiIcon name="TriangleAlert" :size="17" /><strong>{{ manualFlow?.name || '手动工艺' }} · 安全提示</strong><span class="count">{{ state.manualWarnings.length }}</span><UiIcon :name="collapsed ? 'ChevronDown' : 'ChevronUp'" :size="15" />
    </button>
    <div class="process-picker">
      <label for="manual-flow-select">手动工艺（方向与介质）</label>
      <select id="manual-flow-select" :value="state.manualFlowId" data-testid="manual-flow-select" @change="setManualFlow(($event.target as HTMLSelectElement).value)">
        <option v-for="flow in handbookFlows" :key="flow.id" :value="flow.id">{{ flow.label }}</option>
        <option v-if="showCurrentFlow" :value="state.manualFlowId">{{ manualFlow?.name || '当前工艺' }}</option>
      </select>
      <small data-testid="manual-medium-label">{{ media }}</small>
    </div>
    <template v-if="!collapsed">
      <p class="sandbox-note">手动操作不会自动处置安全异常。</p>
      <nav class="test-pages" aria-label="当前工艺页面"><button v-for="page in flowPages" :key="page.id" type="button" @click="navigate(page.id)">{{ page.name }}</button></nav>
      <div class="warnings" aria-live="polite" aria-relevant="additions removals">
        <article v-for="warning in state.manualWarnings" :key="warning.id" :data-manual-warning="warning.id">
          <h4>{{ warning.title }}</h4><p>{{ warning.message }}</p>
        </article>
        <p v-if="!state.manualWarnings.length" class="no-warnings">当前已建模检查未发现风险；不等于符合全部真实作业规范。</p>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.manual-safety{position:absolute;right:16px;top:82px;z-index:35;width:min(345px,calc(100% - 32px));border:1px solid #dfc28c;border-radius:8px;background:#fffdf7f5;box-shadow:0 4px 18px #183c5e1c;color:#71552d;overflow:hidden}.panel-heading{width:100%;display:flex;align-items:center;gap:8px;padding:11px 12px;border:0;background:#fff2d8;color:#805716;text-align:left;font-size:12px}.panel-heading strong{flex:1}.count{background:#b98328;color:white;border-radius:12px;padding:1px 7px;font-size:11px}.process-picker{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-bottom:1px solid #ead9b9}.process-picker label{font-size:11px;font-weight:600}.process-picker select{width:100%;padding:7px;border:1px solid #dfcba8;background:white;border-radius:4px;color:#604c2d;font-size:12px}.process-picker small{font-size:10px;line-height:1.5;color:#8a7757}.sandbox-note{font-size:11px;line-height:1.7;margin:0;padding:10px 12px;color:#766848}.test-pages{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px}.test-pages button{background:#fff;border:1px solid #dfcba8;border-radius:4px;color:#735627;padding:5px 8px;font-size:11px}.warnings{max-height:min(260px,30vh);overflow:auto;padding:0 12px 12px}.warnings article{border-top:1px solid #ead9b9;padding:9px 0}.warnings h4{font-size:12px;margin:0 0 5px;color:#956228}.warnings p{font-size:11px;line-height:1.7;margin:0}.no-warnings{padding-top:8px}.collapsed{width:280px}
@media(max-width:700px){.manual-safety{right:8px;top:85px;width:270px}.warnings{max-height:22vh}.sandbox-note{font-size:10px}}
@supports (appearance: base-select){
  .process-picker select,.process-picker select::picker(select){appearance:base-select}
  .process-picker select::picker(select){border:1px solid #dfcba8;border-radius:6px;background:#fff;color:#604c2d;padding:4px;max-height:min(360px,55dvh);overflow:auto}
  .process-picker option{min-height:36px;padding:8px 12px;border-radius:4px}
  .process-picker option + option{margin-top:3px}
  .process-picker option:hover,.process-picker option:focus-visible{background:#fff2d8}
}
</style>
