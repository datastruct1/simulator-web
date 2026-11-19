<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
import { createSeedQuestions, questionTypes } from '../../data/workspace'
import type { WorkspaceQuestion } from '../../data/workspace'
import { clone, downloadText, makeCsv, matches, newId, questionsFromFile, usePagination } from './lib/domain'
import QuestionEditor from './QuestionEditor.vue'
import WorkspacePager from './WorkspacePager.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
const workspace = useWorkspace(), simulator = useSimulator(), query = ref(''), tag = ref(''), type = ref(''), selectedId = ref(workspace.data.questions[0]?.id || ''), fileInput = ref<HTMLInputElement>(), tutorial = ref(false)
const filtered = computed(() => workspace.data.questions.filter(question => (!tag.value || question.tags.includes(tag.value)) && (!type.value || question.type === type.value) && matches(`${question.content} ${question.tags.join(' ')}`, query.value)))
const { page, pageSize, rows } = usePagination(filtered, 10)
const original = computed(() => workspace.data.questions.find(question => question.id === selectedId.value))
function emptyQuestion(): WorkspaceQuestion { const id = newId('question'); return { id, type: '单选题', content: '', options: ['A', 'B', 'C'].map((_, index) => ({ id: `${id}-${index}`, text: '', correct: index === 0 })), explanation: '', tags: tag.value ? [tag.value] : [], points: 1, locked: false, source: '教师编辑（本地）', updatedAt: '' } }
const draft = ref<WorkspaceQuestion>(original.value ? clone(original.value) : emptyQuestion())
const removing = ref<string[] | null>(null), importPreview = ref<{ questions: WorkspaceQuestion[]; errors: string[] } | null>(null), importMode = ref<'skip' | 'replace' | 'copy'>('skip')
watch([query, tag, type], () => { page.value = 1 })
function select(question: WorkspaceQuestion) { selectedId.value = question.id; draft.value = clone(question) }
function create() { selectedId.value = ''; draft.value = emptyQuestion() }
function save() { if (workspace.saveQuestion(draft.value)) { selectedId.value = draft.value.id; draft.value = clone(workspace.data.questions.find(question => question.id === selectedId.value)!) } }
function cancel() { draft.value = original.value ? clone(original.value) : emptyQuestion() }
function remove() { if (removing.value) workspace.deleteQuestions(removing.value); removing.value = null; if (!original.value) { selectedId.value = workspace.data.questions[0]?.id || ''; draft.value = original.value ? clone(original.value) : emptyQuestion() } }
function lock() { if (original.value) { original.value.locked = !original.value.locked; draft.value.locked = original.value.locked; workspace.persist(); simulator.notify(original.value.locked ? '题目已本地锁定。' : '题目已解锁，可继续编辑。') } }
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  try { if (file.size > 12 * 1024 * 1024) throw new Error('题库文件最大 12 MB。'); importPreview.value = questionsFromFile(await file.text(), file.name) }
  catch (error) { simulator.notify(error instanceof Error ? error.message : '题库文件读取失败。', 'warning') }
  input.value = ''
}
function confirmImport() { if (importPreview.value) workspace.importQuestions(importPreview.value.questions, importMode.value); importPreview.value = null; if (!original.value && workspace.data.questions[0]) select(workspace.data.questions[0]) }
function exportQuestions() { simulator.downloadJson('题库导出.json', { schemaVersion: 3, questions: filtered.value, note: '本地题库，原题答案及解析须校核' }) }
function template() { downloadText('题目导入模板.csv', makeCsv([['题目内容', '选项1', '选项2', '选项3', '选项4', '选项5', '标签'], ['这是一个单选题示例', '选项A[正确]', '选项B', '选项C', '选项D', '', 'T11,示例'], ['这是一个判断题示例', '对[正确]', '错', '', '', '', 'T12,判断题']]), 'text/csv;charset=utf-8') }
function deleteKey(event: KeyboardEvent) { if ((event.target as HTMLElement).matches('input,textarea,select')) return; if (original.value && !original.value.locked) removing.value = [original.value.id] }
</script>
<template>
  <section @keydown.delete="deleteKey">
    <div class="toolbar"><div class="search-input"><UiIcon name="Search" :size="16" /><input v-model="query" class="field" placeholder="搜索题目关键词 / 标签" /></div><select v-model="tag" class="field" style="width:150px" aria-label="题库标签"><option value="">全部标签</option><option v-for="item in workspace.tags.value" :key="item">{{ item }}</option></select><select v-model="type" class="field" style="width:125px" aria-label="题目类型"><option value="">全部题型</option><option v-for="item in questionTypes" :key="item">{{ item }}</option></select><button class="btn" @click="query = ''; tag = ''; type = ''; simulator.notify('已刷新本地题库筛选。')"><UiIcon name="RefreshCw" :size="15" />刷新</button><span class="spacer" /><button class="btn" @click="tutorial = true">查看教程</button><button class="btn" @click="template">导出模板</button><button class="btn" @click="fileInput?.click()">导入题目</button><button class="btn" @click="exportQuestions">导出题库</button><input ref="fileInput" type="file" accept=".csv,.json" hidden @change="importFile" /></div>
    <div class="ws-split wide-list">
      <aside class="ws-panel"><header class="ws-panel-header"><h3>题目列表</h3><span class="badge">{{ filtered.length }} 题</span></header><div class="ws-panel-body"><div class="ws-list"><button v-for="(question, index) in rows" :key="question.id" class="ws-list-row" :class="{ active: selectedId === question.id }" @click="select(question)"><span class="ws-list-number">{{ (page - 1) * pageSize + index + 1 }}</span><div><strong class="ws-line-clamp">{{ question.content }}</strong><small>{{ question.type }} · {{ question.tags.join(' / ') || '无标签' }} {{ question.locked ? '· 已锁定' : '' }}</small></div></button><div v-if="!filtered.length" class="empty-state">没有匹配题目</div></div><WorkspacePager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /><div class="ws-inline" style="margin-top:15px"><button class="btn btn-primary" @click="create"><UiIcon name="Plus" :size="15" />新增题目</button><button class="btn btn-danger" :disabled="!filtered.length" @click="removing = filtered.map(question => question.id)">清空筛选结果</button></div><button class="btn btn-sm" style="margin-top:12px" @click="workspace.importQuestions(createSeedQuestions(), 'skip')">一键导入原 T11 / T12 题库</button></div></aside>
      <section class="ws-panel"><header class="ws-panel-header"><h3>题目详情 · {{ original ? '编辑题目' : '新增题目' }}</h3><button v-if="original" class="btn btn-sm" @click="lock"><UiIcon :name="original.locked ? 'LockOpen' : 'Lock'" :size="14" />{{ original.locked ? '解锁' : '锁定' }}</button></header><div class="ws-panel-body"><QuestionEditor :key="draft.id" v-model="draft" :available-tags="workspace.tags.value" @save="save" @remove="removing = [draft.id]" @cancel="cancel" /></div></section>
    </div>
    <ConfirmDialog v-if="removing" title="删除本地题目" :message="`确定删除 ${removing.length} 道题目？锁定题目不会删除。草稿试卷会移除这些题；已发布任务和历史成绩的快照不受影响。`" danger confirm-text="删除" @confirm="remove" @close="removing = null" />
    <BaseModal v-if="tutorial" title="题目导入导出使用说明" :width="720" @close="tutorial = false"><div class="ws-modal-content"><h3>CSV 模板（原 WPF 格式）</h3><ol style="line-height:2.2"><li>导出模板后，用 Excel 或文本编辑器编辑 CSV。文件编码采用 UTF-8。</li><li>第一列为题目内容，第 2～6 列为最多 5 个选项，最后一列为标签。</li><li>正确选项内容后添加 <code>[正确]</code> 标记；标签用逗号分隔，整个标签字段用引号包围。</li><li>至少 2 个选项且至少有一个正确答案；多个正确选项自动识别为多选题。</li><li>导入前展示预览和错误列表，只有点击“确认导入”才修改本地题库。</li></ol><div class="ws-note">JSON 同时支持本工作台 questions 导出、原 T11Exam / T12Exam 数组，以及 WPF Timu 的 Content / Options / IsAnswer 结构。完整 8 选项、解析、题型和权重请用 JSON 导出保存。</div><p class="ws-subtext">本地导入不会上传到任何服务器。原始题目中存在答案与解析不一致的内容，请教师自行校核。</p></div><template #footer><button class="btn btn-primary" @click="tutorial = false">我知道了</button></template></BaseModal>
    <BaseModal v-if="importPreview" title="确认题目导入" :width="850" @close="importPreview = null"><div class="ws-modal-content ws-stack"><div class="ws-note">可导入 {{ importPreview.questions.length }} 题，格式错误 {{ importPreview.errors.length }} 题。仅当前浏览器保存。</div><div class="ws-inline"><label class="checkbox-label"><input v-model="importMode" type="radio" value="skip" />跳过重复</label><label class="checkbox-label"><input v-model="importMode" type="radio" value="replace" />替换未锁定重复题</label><label class="checkbox-label"><input v-model="importMode" type="radio" value="copy" />复制为新题</label></div><div class="ws-import-list"><div v-for="(question, index) in importPreview.questions" :key="index" class="ws-check-row"><span class="ws-option-letter">{{ index + 1 }}</span><span>{{ question.content }}</span><span class="badge">{{ question.type }}</span></div></div><div v-if="importPreview.errors.length" class="ws-note warning"><strong>格式错误（不会导入）</strong><p v-for="error in importPreview.errors.slice(0, 30)" :key="error" style="margin:5px 0">{{ error }}</p></div></div><template #footer><button class="btn" @click="importPreview = null">取消</button><button class="btn btn-primary" :disabled="!importPreview.questions.length" @click="confirmImport">确认导入</button></template></BaseModal>
  </section>
</template>
