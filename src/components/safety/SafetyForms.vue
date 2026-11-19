<script setup lang="ts">
import { computed } from 'vue'
import { safetyForms } from './forms'
const props = defineProps<{ formId: string; modelValue: Record<string, string>; errors?: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, string>]; calculate: [] }>()
const form = computed(() => safetyForms[props.formId])
function change(key: string, event: Event) {
  emit('update:modelValue', { ...props.modelValue, [key]: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <div v-if="form" class="safety-form">
    <div class="document-heading"><span>甲醇燃料加注作业</span><h2>{{ form.title }}</h2><p v-if="form.introduction">{{ form.introduction }}</p></div>
    <div v-if="errors?.length" class="form-errors" role="status"><strong>请完成以下项目后确认：</strong><p v-for="error in errors" :key="error">{{ error }}</p></div>
    <section v-for="group in form.groups" :key="group.title" class="form-group card">
      <h3>{{ group.title }}</h3>
      <div class="form-grid">
        <label v-for="field in group.fields" :key="field.key" :class="{ wide: field.label.length > 22 }"><span>{{ field.label }}<small v-if="field.unit">（{{ field.unit }}）</small><i v-if="field.required">*</i></span>
          <select v-if="field.type === 'select'" class="field" :value="modelValue[field.key]" :aria-label="field.label" @change="change(field.key,$event)"><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
          <input v-else class="field" :type="field.type || 'text'" :value="modelValue[field.key]" :min="field.min" :max="field.max" :step="field.type === 'number' ? 'any' : undefined" :required="field.required" :aria-label="field.label" maxlength="180" @input="change(field.key,$event)">
        </label>
      </div>
      <button v-if="formId === 'receipt' && group.title === '加注数量'" class="btn" type="button" @click="emit('calculate')">由体积和密度计算总质量</button>
    </section>
    <div class="document-notes"><p v-for="note in form.notes" :key="note">{{ note }}</p></div>
  </div>
</template>

<style scoped>
.safety-form { color: #385870; }.document-heading { padding: 24px 28px 21px; background: linear-gradient(110deg,#eff7fd,#fff); border: 1px solid #dae8f3; border-radius: 12px; margin-bottom: 16px; }.document-heading > span { color: #769db7; font-size: 11px; letter-spacing: 2px; }.document-heading h2 { font-size: 24px; margin: 8px 0; color: #246b9b; }.document-heading p { color: #6d8598; font-size: 12px; line-height: 1.9; max-width: 1000px; }.form-group { border: 1px solid #dbe7f1; padding: 0 22px 21px; margin-bottom: 15px; border-radius: 10px; background: white; }.form-group h3 { margin: 0 -22px 20px; padding: 13px 22px; background: #f1f7fc; border-bottom: 1px solid #dfeaf3; font-size: 14px; color: #336b92; border-radius: 10px 10px 0 0; }.form-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 17px 22px; }.form-grid label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; }.form-grid label.wide { grid-column: span 2; }.form-grid small { color: #8ba1b2; font-size: 11px; }.form-grid i { color: #cb865a; margin-left: 5px; font-style: normal; }.field { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d5e1eb; border-radius: 6px; color: #395972; background: #fcfdff; font-size: 13px; }.field:focus { outline: 2px solid #86bce43b; border-color: #77a9ce; }.document-notes { padding: 10px 18px; color: #90a0ae; font-size: 11px; line-height: 1.8; }.document-notes p { margin: 4px 0; }.form-errors { background: #fff4ea; color: #b07549; border-radius: 8px; padding: 15px 20px; margin-bottom: 15px; font-size: 12px; }.form-errors p { margin: 5px 0; }.form-group .btn { margin-top: 16px; }
@media (max-width: 1050px) { .form-grid { grid-template-columns: 1fr 1fr; } }@media (max-width: 650px) { .form-grid { grid-template-columns: 1fr; }.form-grid label.wide { grid-column: auto; }.document-heading { padding: 18px; }.form-group { padding: 0 16px 16px; }.form-group h3 { margin: 0 -16px 16px; padding: 12px 16px; } }
</style>
