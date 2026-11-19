<script setup lang="ts">
import UiIcon from '../common/UiIcon.vue'
import { useWorkspace } from '../../state/workspace'
import './workspace.css'
defineProps<{ title: string; subtitle: string; icon: string }>()
const workspace = useWorkspace()
</script>

<template>
  <section class="workspace-shell">
    <header class="ws-heading">
      <div class="ws-heading-title"><span class="ws-heading-icon"><UiIcon :name="icon" :size="26" /></span><div><h1>{{ title }}</h1><p>{{ subtitle }}</p></div></div>
      <div class="ws-local"><UiIcon name="HardDrive" :size="15" /><span>本地工作台 · {{ workspace.storage.persistent ? '浏览器保存' : '仅内存' }}</span></div>
    </header>
    <div v-if="workspace.storage.error" class="ws-note warning" role="status">
      {{ workspace.storage.error }}
      <button v-if="workspace.storage.recoveryData" class="btn btn-sm" @click="workspace.exportRecovery">导出原始数据</button>
      <button class="btn btn-sm" @click="workspace.persist">重试保存</button>
    </div>
    <slot name="navigation" />
    <slot />
  </section>
</template>
