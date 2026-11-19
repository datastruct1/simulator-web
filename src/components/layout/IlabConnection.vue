<script setup lang="ts">
import { computed } from 'vue'
import { useIlab } from '../../state/ilab'
const emit = defineEmits<{ authenticate: [] }>()
const ilab = useIlab()
const latest = computed(() => ilab.state.jobs.find(job => job.username === ilab.state.session?.username && job.appid === ilab.state.config?.appid && job.mode === ilab.state.session?.mode))
const label = { pending: '待回传', uploading: '回传中', uploaded: '回传成功', failed: '回传失败', blocked: '未回传', uncertain: '待确认' }
</script>

<template>
  <section v-if="ilab.state.phase === 'authenticating' || ilab.state.phase === 'error' || ilab.state.session" class="ilab-connection" :class="{ 'ilab-error': ilab.state.phase === 'error' }" role="status" data-testid="ilab-connection">
    <div v-if="ilab.state.session" class="ilab-line">
      <strong>实验空间 · {{ ilab.state.session.mode === 'test' ? '测试环境' : '正式环境' }}</strong>
      <span>{{ ilab.state.session.displayName }}（{{ ilab.state.session.username }}）</span>
      <span class="ilab-subtext">操作实验交卷后回传；离线演示和理论题不回传</span>
    </div>
    <div v-else class="ilab-line"><strong>实验空间登录</strong><span>{{ ilab.state.message }}</span><button v-if="ilab.state.phase === 'error'" class="btn btn-sm" @click="emit('authenticate')">重试认证</button></div>
    <div v-if="latest" class="ilab-line ilab-subtext">
      <strong>{{ label[latest.status] }}</strong><span>{{ latest.message }}</span>
      <button v-if="['failed', 'uncertain'].includes(latest.status)" class="btn btn-sm" @click="ilab.retry(latest)">查询确认 / 重试</button>
    </div>
    <div v-if="ilab.state.storageError" class="ilab-line">{{ ilab.state.storageError }}</div>
  </section>
</template>

<style scoped>
.ilab-connection{flex-shrink:0;background:#e9f4ff;border-bottom:1px solid #bfd9ee;color:#174e78;padding:8px 18px;font-size:12px;line-height:1.6;z-index:40}.ilab-line{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.ilab-line+.ilab-line{margin-top:4px}.ilab-subtext{font-size:11px;color:#526f85}.ilab-error{background:#fff1ef;color:#973d34;border-color:#efc3bd}.ilab-connection .btn{background:#fff;font-size:11px;min-height:26px}
</style>
