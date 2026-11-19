<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AssessmentMode, ReturnPage } from '../../data/workspace'
import { workflows } from '../../data/catalog'
import { useWorkspace } from '../../state/workspace'
import { matches } from './lib/domain'
import OperationStartDialog from './OperationStartDialog.vue'
import UiIcon from '../common/UiIcon.vue'
const props = withDefaults(defineProps<{ returnPage?: ReturnPage; mode?: AssessmentMode }>(), { returnPage: 'student', mode: 'practice' })
const workspace = useWorkspace(), category = ref('main'), query = ref(''), selectedId = ref('')
const primary = ['shore-inerting', 'ship-inerting', 'bunkering', 'bunkering-purge', 'supply', 'supply-purge']
const items = computed(() => workspace.operationItems.value.filter(item => (category.value === 'main' ? primary.includes(item.id) : category.value === 'fault' ? item.category === '异常处置' : category.value === 'custom' ? !!item.scene : !primary.includes(item.id) && item.category !== '异常处置' && !item.scene) && matches(`${item.name} ${item.category}`, query.value)))
const image = (id: string) => id.includes('leak') ? '/simulator-web/assets/illustrations/甲醇泄露.png' : id.includes('bunkering') ? '/simulator-web/assets/illustrations/加注.jpg' : id.includes('inerting') ? '/simulator-web/assets/illustrations/供应.jpg' : '/simulator-web/assets/illustrations/漂亮的加注.png'
const title = (id: string, name: string) => id === 'supply' ? '甲醇供应' : name
</script>
<template>
  <div class="ws-title-line"><h2>操作题 / 故障模拟</h2><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索操作题" /></div></div>
  <div class="toolbar"><button class="ws-chip" :class="{ active: category === 'main' }" @click="category = 'main'">操作题</button><button class="ws-chip" :class="{ active: category === 'fault' }" @click="category = 'fault'">故障模拟</button><button class="ws-chip" :class="{ active: category === 'more' }" @click="category = 'more'">更多工艺操作</button><button class="ws-chip" :class="{ active: category === 'custom' }" @click="category = 'custom'">教师自编操作题</button><span class="spacer" /><span class="badge">本地手动训练</span></div>
  <div class="ws-training-grid"><article v-for="item in items" :key="item.id" class="ws-training-card"><img :src="image(item.id)" :alt="item.name" loading="lazy" /><div class="ws-training-card-body"><h3>{{ title(item.id, item.name) }}</h3><p>{{ item.category }} · 总分 {{ item.scene?.maxScore || 100 }} 分 · {{ item.scene ? item.scene.mode === 'sequence' ? item.scene.legacyOps.length + ' 个操作' : item.scene.states.length + ' 个状态' : (workflows.find(flow => flow.id === item.flowId)?.steps.length || 0) + ' 个步骤' }}</p><div class="ws-inline"><span v-if="workflows.find(flow => flow.id === item.flowId)?.requiresSafety || item.scene?.requiresSafety" class="badge badge-warning"><UiIcon name="ShieldCheck" :size="12" />需安全检查</span><span v-else class="badge badge-muted">本地操作考核</span><span class="spacer" /><button class="btn btn-primary" @click="selectedId = item.id">开始答题</button></div></div></article></div>
  <div v-if="!items.length" class="empty-state"><UiIcon name="Workflow" :size="48" class="ws-empty-icon" /><p>{{ category === 'custom' ? '教师尚未保存匹配的自编操作题。' : '没有匹配的操作题。' }}</p></div>
  <OperationStartDialog v-if="selectedId" :operation-id="selectedId" :mode="props.mode" :return-page="props.returnPage" @close="selectedId = ''" />
</template>
