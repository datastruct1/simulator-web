<script setup lang="ts">
import { computed } from 'vue'
import { useSimulator } from '../../state/simulator'
import UiIcon from '../common/UiIcon.vue'
import DeviceMonitor from './DeviceMonitor.vue'
import SensorSettings from './SensorSettings.vue'
import FaultSettings from './FaultSettings.vue'
import InventoryDialog from './InventoryDialog.vue'
import FanSettings from './FanSettings.vue'
import SystemSettings from './SystemSettings.vue'
import RecordTools from './RecordTools.vue'
import ConditionTools from './ConditionTools.vue'
import SystemTools from './SystemTools.vue'

const { state, closeModal } = useSimulator()
const type = computed(() => state.modal?.type || '')
</script>

<template>
  <DeviceMonitor v-if="type === 'monitor'" />
  <SensorSettings v-else-if="type === 'sensors'" />
  <FaultSettings v-else-if="type === 'faults'" />
  <InventoryDialog v-else-if="type === 'inventory'" />
  <FanSettings v-else-if="type === 'fans'" />
  <SystemSettings v-else-if="type === 'settings'" />
  <RecordTools v-else-if="type === 'logs' || type === 'operations' || type === 'alerts'" :type="type" />
  <ConditionTools v-else-if="type === 'load' || type === 'save'" :type="type" />
  <SystemTools v-else-if="['statistics', 'speed', 'hint', 'introduction', 'debug'].includes(type)" :mode="type" />
  <div v-else class="unknown-tool card">
    <UiIcon name="CircleHelp" :size="34" />
    <h3>{{ state.modal?.title || '未识别工具' }}</h3>
    <p>当前 Web 版本没有名为 <code>{{ type || '（空）' }}</code> 的二级工具窗口。可用的工具：设备监测、实时趋势、传感器设置、异常配置、通风系统、物品柜、系统日志、操作记录、加载 / 保存工况、系统设置、系统介绍、仿真调试、速度控制、报警历史与操作提示。</p>
    <button class="btn btn-primary" type="button" @click="closeModal">关闭窗口</button>
  </div>
</template>

<style scoped>
.unknown-tool { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 34px 26px; text-align: center; color: #48647b; }
.unknown-tool > svg { color: #5d93b9; }
.unknown-tool h3 { margin: 0; color: #2b6d99; }
.unknown-tool p { max-width: 640px; margin: 0; font-size: 13px; line-height: 1.8; color: #70899d; }
.unknown-tool code { padding: 1px 5px; border-radius: 4px; background: #eef4fa; color: #2f6e9c; }
</style>
