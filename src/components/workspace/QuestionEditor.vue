<script setup lang="ts">
import { ref } from 'vue'
import type { WorkspaceQuestion } from '../../data/workspace'
import { questionTypes } from '../../data/workspace'
import { newId, validateQuestion } from './lib/domain'
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
const model = defineModel<WorkspaceQuestion>({ required: true })
withDefaults(defineProps<{ availableTags?: string[] }>(), { availableTags: () => [] })
const emit = defineEmits<{ save: []; remove: []; cancel: [] }>()
const tagDialog = ref(false), tagInput = ref(''), error = ref('')
function addOption() { if (model.value.options.length < 8) model.value.options.push({ id: newId('option'), text: '', correct: false }) }
function checkOption(id: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  model.value.options.forEach(option => { if (option.id === id) option.correct = checked; else if (checked && model.value.type !== '多选题') option.correct = false })
}
function typeChanged() {
  if (model.value.type === '判断题') model.value.options = [{ id: newId('option'), text: '对', correct: true }, { id: newId('option'), text: '错', correct: false }]
  else if (model.value.type === '单选题') { let found = false; model.value.options.forEach(option => { if (option.correct && !found) found = true; else option.correct = false }) }
}
function addTag() { const tag = tagInput.value.trim(); if (tag && !model.value.tags.includes(tag)) model.value.tags.push(tag); tagInput.value = ''; tagDialog.value = false }
function save() { error.value = validateQuestion(model.value); if (!error.value) emit('save') }
</script>
<template>
  <form class="ws-modal-content" @submit.prevent="save">
    <div v-if="error" class="ws-form-error" role="alert">{{ error }}</div>
    <div v-if="model.locked" class="ws-note warning">该题目已锁定。请先在题目列表中解锁，才能编辑或删除。</div>
    <div class="form-grid">
      <label class="field-group"><span>题目类型</span><select v-model="model.type" class="field" :disabled="model.locked" @change="typeChanged"><option v-for="type in questionTypes" :key="type">{{ type }}</option></select></label>
      <label class="field-group"><span>分值权重</span><input v-model.number="model.points" class="field" type="number" min="0.1" max="1000" step="0.1" :disabled="model.locked" /></label>
      <label class="field-group full"><span>题目内容 *</span><textarea v-model="model.content" class="field" rows="4" maxlength="10000" :disabled="model.locked" placeholder="请输入题目内容" /></label>
      <div class="field-group full"><label>选项（勾选正确答案）</label><div class="ws-options"><div v-for="(option, index) in model.options" :key="option.id" class="ws-option-edit"><input type="checkbox" :checked="option.correct" :disabled="model.locked" :aria-label="String.fromCharCode(65 + index) + ' 是正确答案'" @change="checkOption(option.id, $event)" /><span class="ws-option-letter">{{ String.fromCharCode(65 + index) }}</span><input v-model="option.text" class="field" :disabled="model.locked" :placeholder="'选项 ' + String.fromCharCode(65 + index)" /><button type="button" class="btn btn-sm btn-danger" :disabled="model.locked || model.options.length <= 2 || model.type === '判断题'" @click="model.options.splice(index, 1)">删除</button></div></div><button type="button" class="btn" style="align-self:flex-start" :disabled="model.locked || model.options.length >= 8 || model.type === '判断题'" @click="addOption"><UiIcon name="Plus" :size="14" />添加选项</button></div>
      <div class="field-group full"><label>标签 / 考试大纲</label><div class="ws-tag-row"><span v-for="tag in model.tags" :key="tag" class="ws-tag">{{ tag }}<button type="button" :disabled="model.locked" :aria-label="'移除标签' + tag" @click="model.tags = model.tags.filter(item => item !== tag)">×</button></span><button type="button" class="btn btn-sm" :disabled="model.locked" @click="tagDialog = true">添加标签</button></div></div>
      <label class="field-group full"><span>答案解析</span><textarea v-model="model.explanation" class="field" rows="4" :disabled="model.locked" placeholder="查看答案或提交后显示的解析" /></label>
      <label class="field-group full"><span>题目来源 / 校核说明</span><input v-model="model.source" class="field" :disabled="model.locked" /></label>
    </div>
    <div class="ws-source">题目及答案请经教师校核后用于教学。</div>
    <div class="form-actions"><button type="button" class="btn" @click="emit('cancel')">取消</button><button type="button" class="btn btn-danger" :disabled="model.locked" @click="emit('remove')">删除</button><button type="submit" class="btn btn-primary" :disabled="model.locked"><UiIcon name="Save" :size="15" />保存</button></div>
  </form>
  <BaseModal v-if="tagDialog" title="选择或输入标签" :width="470" @close="tagDialog = false"><div class="ws-modal-content ws-stack"><div class="ws-tag-row"><button v-for="tag in availableTags" :key="tag" class="ws-chip" :class="{ active: tagInput === tag }" @click="tagInput = tag">{{ tag }}</button></div><label class="field-group"><span>新标签内容</span><input v-model="tagInput" class="field" maxlength="60" placeholder="例如 T11、加注安全" @keyup.enter="addTag" /></label></div><template #footer><button class="btn" @click="tagDialog = false">取消</button><button class="btn btn-primary" :disabled="!tagInput.trim()" @click="addTag">确定</button></template></BaseModal>
</template>
