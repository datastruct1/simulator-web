<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import WorkspaceFrame from './WorkspaceFrame.vue'
import ActiveAssessmentBanner from './ActiveAssessmentBanner.vue'
import TeacherMonitor from './TeacherMonitor.vue'
import TeacherTasks from './TeacherTasks.vue'
import FileManager from './FileManager.vue'
import PaperManager from './PaperManager.vue'
import QuestionBank from './QuestionBank.vue'
import OperationManager from './OperationManager.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from '../common/UiIcon.vue'
const workspace = useWorkspace(), simulator = useSimulator(), input = ref<HTMLInputElement>(), importText = ref('')
const tabs = [
  { id: 'home', name: '教师主页', icon: 'Monitor' }, { id: 'tasks', name: '任务管理', icon: 'ClipboardList' },
  { id: 'files', name: '文件管理', icon: 'FolderOpen' }, { id: 'papers', name: '试卷管理', icon: 'Files' },
  { id: 'questions', name: '题库管理', icon: 'Library' }, { id: 'operations', name: '操作题', icon: 'Workflow' },
]
if (!tabs.some(tab => tab.id === workspace.data.teacherTab)) workspace.data.teacherTab = 'home'
async function loadBackup(event: Event) { const target = event.target as HTMLInputElement, file = target.files?.[0]; if (!file) return; try { if (file.size > 20 * 1024 * 1024) throw new Error('业务备份最大 20 MB，文件内容请单独管理。'); importText.value = await file.text() } catch (error) { simulator.notify(error instanceof Error ? error.message : '备份读取失败。', 'warning') }; target.value = '' }
function importBackup() { workspace.importWorkspace(importText.value); importText.value = '' }
</script>
<template>
  <WorkspaceFrame title="教师主页" subtitle="教学任务、题库与试卷" icon="GraduationCap">
    <template #navigation><div class="toolbar" style="margin-bottom:8px"><span class="ws-subtext">{{ simulator.state.userName }} · 本地教师控制台</span><span class="spacer" /><button class="btn btn-sm" @click="workspace.exportWorkspace"><UiIcon name="Download" :size="14" />导出业务备份</button><button class="btn btn-sm" @click="input?.click()"><UiIcon name="Upload" :size="14" />导入业务备份</button><button class="btn btn-sm" @click="simulator.navigate('editor')">操作题编辑器</button><input ref="input" type="file" accept=".json" hidden @change="loadBackup" /></div><nav class="tabs" aria-label="教师工作台模块"><button v-for="tab in tabs" :key="tab.id" :class="{ active: workspace.data.teacherTab === tab.id }" @click="workspace.data.teacherTab = tab.id"><UiIcon :name="tab.icon" :size="15" /> {{ tab.name }}</button></nav></template>
    <ActiveAssessmentBanner />
    <TeacherMonitor v-if="workspace.data.teacherTab === 'home'" />
    <TeacherTasks v-else-if="workspace.data.teacherTab === 'tasks'" />
    <FileManager v-else-if="workspace.data.teacherTab === 'files'" role="teacher" />
    <PaperManager v-else-if="workspace.data.teacherTab === 'papers'" />
    <QuestionBank v-else-if="workspace.data.teacherTab === 'questions'" />
    <OperationManager v-else-if="workspace.data.teacherTab === 'operations'" />
    <ConfirmDialog v-if="importText" title="导入业务备份" message="导入会替换当前本地题库、试卷、任务、名册、场景与历史记录。上传原文件内容不在业务备份中，需要保留原浏览器文件库或重新添加。建议先导出当前备份。确定继续？" danger confirm-text="导入并替换" @confirm="importBackup" @close="importText = ''" />
  </WorkspaceFrame>
</template>
