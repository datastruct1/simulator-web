<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useWorkspace } from '../../state/workspace'
import type { WorkspaceStudent } from '../../data/workspace'
import { clone, downloadText, makeCsv, matches, newId, normaliseStudent, parseCsv } from './lib/domain'
const workspace = useWorkspace(), open = ref(false), query = ref(''), input = ref<HTMLInputElement>(), error = ref(''), removing = ref<WorkspaceStudent | null>(null)
const draft = ref<WorkspaceStudent>({ id: newId('student'), studentNo: '', name: '', group: '甲醇培训一班' })
const students = computed(() => workspace.data.students.filter(student => matches(`${student.name} ${student.studentNo} ${student.group}`, query.value)))
function create() { draft.value = { id: newId('student'), studentNo: '', name: '', group: '甲醇培训一班' }; error.value = '' }
function save() { if (!draft.value.name.trim() || !draft.value.studentNo.trim()) { error.value = '请填写学号和姓名。'; return }; if (workspace.saveStudent(draft.value)) create() }
function exportRoster() { downloadText('学生名册.csv', makeCsv([['学号', '姓名', '班级'], ...workspace.data.students.map(student => [student.studentNo, student.name, student.group])]), 'text/csv;charset=utf-8') }
async function importRoster(event: Event) {
  const target = event.target as HTMLInputElement, file = target.files?.[0]
  if (!file) return
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('名册文件最多 5 MB。')
    const text = await file.text(), raw: unknown = file.name.endsWith('.csv') ? parseCsv(text).slice(1).map(row => ({ studentNo: row[0], name: row[1], group: row[2] })) : JSON.parse(text)
    if (!Array.isArray(raw)) throw new Error('JSON 名册必须是学生数组。')
    const rows = raw.map(normaliseStudent), existing = new Set(workspace.data.students.map(student => student.studentNo))
    let count = 0
    for (const student of rows) if (!existing.has(student.studentNo)) { workspace.data.students.push(student); existing.add(student.studentNo); count++ }
    workspace.persist(); error.value = `已导入 ${count} 人，其余学号重复的记录已跳过。`
  } catch (caught) { error.value = caught instanceof Error ? caught.message : '无法读取名册。' }
  target.value = ''
}
function remove() { if (removing.value) workspace.removeStudent(removing.value.id); removing.value = null }
</script>
<template>
  <button class="btn" @click="open = true"><UiIcon name="Users" :size="15" />学生名册</button>
  <BaseModal v-if="open" title="学生列表 · 本地名册管理" :width="950" @close="open = false">
    <div class="ws-modal-content">
      <div class="ws-note">名册仅用于本浏览器的任务指派，不代表已连接或在线学生。可导入 CSV（学号、姓名、班级）或 JSON；浏览器版不处理 WPF 的 XLSX 格式。</div>
      <div class="toolbar"><input v-model="query" class="field" style="max-width:270px" placeholder="搜索学号、姓名、班级" /><button class="btn" @click="input?.click()">导入名册</button><button class="btn" @click="exportRoster">导出名册</button><button class="btn btn-primary" @click="create">新增学员</button><input ref="input" type="file" accept=".csv,.json" hidden @change="importRoster" /></div>
      <div class="ws-analysis-grid">
        <div class="ws-table-wrap"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>班级</th><th>操作</th></tr></thead><tbody><tr v-for="student in students" :key="student.id"><td>{{ student.studentNo }}</td><td>{{ student.name }}</td><td>{{ student.group }}</td><td><div class="ws-inline"><button class="btn btn-sm" @click="draft = clone(student)">编辑</button><button class="btn btn-sm btn-danger" @click="removing = student">移除</button></div></td></tr><tr v-if="!students.length"><td colspan="4" class="empty-state">没有匹配的学员</td></tr></tbody></table></div>
        <form class="card ws-small-stack" @submit.prevent="save"><h3>{{ workspace.data.students.some(student => student.id === draft.id) ? '编辑学员' : '新增学员' }}</h3><label class="field-group"><span>学号 *</span><input v-model="draft.studentNo" class="field" maxlength="40" required /></label><label class="field-group"><span>姓名 *</span><input v-model="draft.name" class="field" maxlength="40" required /></label><label class="field-group"><span>班级 / 分组</span><input v-model="draft.group" class="field" maxlength="80" /></label><div v-if="error" class="ws-note warning">{{ error }}</div><button class="btn btn-primary" type="submit">保存到本地名册</button></form>
      </div>
    </div>
    <template #footer><button class="btn" @click="open = false">关闭</button></template>
  </BaseModal>
  <ConfirmDialog v-if="removing" title="移除学员" :message="`确定移除 ${removing.name}？任务指派将移除该学员，历史成绩的姓名快照仍保留。`" danger @confirm="remove" @close="removing = null" />
</template>
