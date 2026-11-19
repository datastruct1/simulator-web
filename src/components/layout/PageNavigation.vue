<script setup lang="ts">
import { computed } from 'vue'
import { pages } from '../../data/catalog'
import { useSimulator } from '../../state/simulator'
import { useWorkspace } from '../../state/workspace'
import UiIcon from '../common/UiIcon.vue'

const { state, navigate, openModal, startFlow } = useSimulator()
const workspace = useWorkspace()
const activeTitle = computed(() => pages.find(page => page.id === state.page)?.title || ({ teacher: '教师主页', student: '学生主页', exam: '练习与考试', editor: '操作题场景编辑', safety: '加注作业安全检查' } as Record<string, string>)[state.page])
function resumeTraining() {
  if (workspace.data.pendingLaunch) { workspace.resumePendingOperation(); return }
  const flowId = state.workspaces.pendingFlowId
  if (typeof flowId === 'string' && startFlow(flowId, false)) state.workspaces.pendingFlowId = ''
}
</script>

<template>
  <nav class="page-navigation" aria-label="工艺页面导航">
    <div class="nav-pages"><button v-for="page in pages" :key="page.id" :class="{ active: state.page === page.id }" :data-page="page.id" :title="page.title" @click="navigate(page.id)"><UiIcon :name="page.icon" :size="15" /><span>{{ page.short }}</span></button></div>
    <div class="nav-utilities">
      <button v-if="state.workspaces.pendingFlowId && state.safetyComplete" class="active" @click="resumeTraining"><UiIcon name="Play" :size="15" /><span>继续训练</span></button>
      <button v-if="state.workspaces.activeAssessment" class="active" @click="workspace.returnToAssessment"><UiIcon name="ArrowLeft" :size="15" /><span>返回考核</span></button>
      <button :class="{ active: state.page === 'exam' }" @click="navigate('exam')"><UiIcon name="BookOpen" :size="15" /><span>练习 / 考试</span></button>
      <button title="设备监测" @click="openModal('monitor', '设备监测')"><UiIcon name="Activity" :size="17" /></button><button title="系统设置" @click="openModal('settings', '系统设置')"><UiIcon name="Settings" :size="17" /></button>
    </div>
  </nav>
  <div class="view-caption"><div><span>工艺仿真</span><UiIcon name="ChevronRight" :size="12" /><strong>{{ activeTitle }}</strong></div><span class="local-mode"><i class="status-dot" />本地前端模式<span class="caption-divider">·</span>点击设备进行操作，右键查看详情</span></div>
</template>

<style scoped>.page-navigation{display:flex;align-items:center;justify-content:space-between;gap:8px;height:43px;flex-shrink:0;background:#edf5fd;border-bottom:1px solid #bbd1e6;padding:0 15px;z-index:20}.nav-pages{display:flex;align-items:center;gap:2px;overflow-x:auto;scrollbar-width:none;height:100%;min-width:0}.nav-pages::-webkit-scrollbar{display:none}.page-navigation button{border:0;border-bottom:3px solid transparent;background:none;color:#54718e;padding:10px 11px 9px;display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap;height:100%}.page-navigation button:hover{color:var(--primary);background:#e0edfa}.page-navigation button.active{color:#004ea0;background:#d8eaff;border-bottom-color:#004ea0;font-weight:600}.nav-utilities{display:flex;align-items:center;height:100%;flex-shrink:0;border-left:1px solid #c8d9e9;padding-left:7px}.view-caption{height:29px;flex-shrink:0;background:#dbeaf7;border-bottom:1px solid #c1d6e9;display:flex;align-items:center;justify-content:space-between;padding:0 19px;color:#7390aa;font-size:10px}.view-caption>div{display:flex;align-items:center;gap:7px}.view-caption strong{font-weight:500;color:#315978}.local-mode{display:flex;align-items:center;gap:7px}.local-mode .status-dot{width:5px;height:5px}.caption-divider{color:#9db1c5;margin:0 3px}
@media(max-width:1500px){.page-navigation{padding:0 10px}.page-navigation button{font-size:11px;padding:11px 9px 8px}.nav-pages button svg{display:none}}
@media(max-width:900px){.view-caption .local-mode{display:none}.nav-utilities button span{display:none}.page-navigation{padding:0 7px}.page-navigation button{padding:11px 9px 8px}}
</style>
