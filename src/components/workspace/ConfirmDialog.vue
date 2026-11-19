<script setup lang="ts">
import BaseModal from '../common/BaseModal.vue'
import UiIcon from '../common/UiIcon.vue'
withDefaults(defineProps<{ title: string; message: string; danger?: boolean; confirmText?: string }>(), { danger: false, confirmText: '确定' })
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>
<template>
  <BaseModal :title="title" :width="490" :close-on-backdrop="false" @close="emit('close')">
    <div class="ws-modal-content ws-inline" style="align-items:flex-start;gap:14px"><UiIcon :name="danger ? 'TriangleAlert' : 'CircleHelp'" :size="30" :style="{ color: danger ? '#ce6b50' : '#3685c3', flexShrink: 0 }" /><p style="white-space:pre-line;line-height:1.9;margin:0">{{ message }}</p></div>
    <template #footer><button class="btn" @click="emit('close')">取消</button><button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmText }}</button></template>
  </BaseModal>
</template>
