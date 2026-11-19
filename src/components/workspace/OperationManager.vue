<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { workflows } from '../../data/catalog'
import { matches, sceneFromWorkflow, usePagination } from './lib/domain'
import OperationStartDialog from './OperationStartDialog.vue'
import WorkspacePager from './WorkspacePager.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from '../common/UiIcon.vue'
const workspace = useWorkspace(), simulator = useSimulator(), query = ref(''), category = ref(''), selectedId = ref(''), deleting = ref<{ id: string; name: string; custom: boolean } | null>(null)
const categories = computed(() => [...new Set(workspace.operationItems.value.map(item => item.category))])
const filtered = computed(() => workspace.operationItems.value.filter(item => (!category.value || item.category === category.value) && matches(`${item.name} ${item.source}`, query.value)))
const { page, pageSize, rows } = usePagination(filtered, 10)
watch([query, category], () => { page.value = 1 })
function exportItem(id: string) { const item = workspace.operationItems.value.find(item => item.id === id); if (!item) return; simulator.downloadJson('操作题-' + workspace.safeName(item.name) + '.json', { schemaVersion: 3, scene: item.scene || sceneFromWorkflow(item.flowId), note: 'Web 本地场景格式，非 WPF 引用图格式' }) }
function remove() { if (!deleting.value) return; if (deleting.value.custom) workspace.deleteScene(deleting.value.id.slice(6)); else { workspace.data.hiddenFlowIds.push(deleting.value.id); workspace.persist(); simulator.notify('已从本地列表隐藏此原始操作题；原 WPF 和已发布任务未修改。') }; deleting.value = null }
function assign(id: string) { simulator.state.workspaces.taskOperationId = id; workspace.data.teacherTab = 'tasks' }
</script>
<template>
  <div class="ws-note">原 WPF 操作题按工艺流程导入。编辑原题会创建本地场景副本，不修改原 WPF 源码。可编辑状态、初始 / 终止条件、分数事件、状态动作，也可录制旧版操作序列。</div>
  <div class="toolbar"><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索操作题 / 来源" /></div><select v-model="category" class="field" style="width:180px"><option value="">全部类别</option><option v-for="item in categories" :key="item">{{ item }}</option></select><button class="btn" @click="query = ''; category = ''">刷新筛选</button><button v-if="workspace.data.hiddenFlowIds.length" class="btn" @click="workspace.data.hiddenFlowIds = []; workspace.persist()">恢复隐藏的原题</button><span class="spacer" /><button class="btn btn-primary" @click="workspace.editScene()"><UiIcon name="Plus" :size="15" />新增操作题</button><button class="btn" @click="simulator.navigate('editor')">操作题编辑器</button></div>
  <section class="ws-panel"><header class="ws-panel-header"><h3>操作题管理</h3><span class="badge">{{ filtered.length }} 题</span></header><div class="ws-panel-body"><div class="ws-table-wrap"><table class="data-table"><thead><tr><th>操作题名称</th><th>类别</th><th>步骤 / 状态</th><th>安全要求</th><th>来源</th><th>操作</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td><strong>{{ item.name }}</strong></td><td>{{ item.category }}</td><td>{{ item.scene ? item.scene.mode === 'sequence' ? item.scene.legacyOps.length + ' 个操作' : item.scene.states.length + ' 个状态' : (workflows.find(flow => flow.id === item.flowId)?.steps.length || 0) + ' 个步骤' }}</td><td><span class="badge" :class="workflows.find(flow => flow.id === item.flowId)?.requiresSafety || item.scene?.requiresSafety ? 'badge-warning' : 'badge-muted'">{{ workflows.find(flow => flow.id === item.flowId)?.requiresSafety || item.scene?.requiresSafety ? '安全检查后开始' : '手动训练' }}</span></td><td style="max-width:180px;overflow-wrap:anywhere" class="ws-subtext">{{ item.source }}</td><td><div class="ws-inline"><button class="btn btn-sm" @click="selectedId = item.id">预览 / 试做</button><button class="btn btn-sm" @click="workspace.editScene(item.id)">{{ item.scene ? '编辑' : '复制编辑' }}</button><button class="btn btn-sm" @click="exportItem(item.id)">导出</button><button class="btn btn-sm" @click="assign(item.id)">指派任务</button><button class="btn btn-sm btn-danger" @click="deleting = { id: item.id, name: item.name, custom: !!item.scene }">{{ item.scene ? '删除' : '移除列表' }}</button></div></td></tr><tr v-if="!filtered.length"><td colspan="6" class="empty-state">暂无匹配操作题</td></tr></tbody></table></div><WorkspacePager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div></section>
  <OperationStartDialog v-if="selectedId" :operation-id="selectedId" return-page="exam" @close="selectedId = ''" />
  <ConfirmDialog v-if="deleting" :title="deleting.custom ? '删除操作题' : '移除原题列表'" :message="deleting.custom ? `确定删除本地操作题“${deleting.name}”？已发布任务和历史成绩快照保留。` : `确定隐藏原题“${deleting.name}”？不会改动原 WPF 文件，之后可点击“恢复隐藏的原题”。`" danger @confirm="remove" @close="deleting = null" />
</template>
