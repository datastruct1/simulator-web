<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useHistoryRecorder } from '../dialogs/history'
import { useWorkspace } from '../../state/workspace'
import { useSimulator } from '../../state/simulator'
// Restore assessments and keep their real-time clock alive on every process page.
useWorkspace()
useHistoryRecorder()

const { state, activeAlarms } = useSimulator()
let alarmSound: HTMLAudioElement | undefined
function syncAlarmSound() {
  if (!alarmSound) return
  const enabled = state.loggedIn && state.settings.sound !== false && !state.muted && activeAlarms.value.length > 0
  if (!enabled) { alarmSound.pause(); alarmSound.currentTime = 0; return }
  if (alarmSound.paused) {
    // Some browsers require a user gesture; retry on the next interaction,
    // rather than claiming playback succeeded or surfacing a page error.
    void alarmSound.play().catch(() => {})
  }
}
watch(() => [state.loggedIn, state.settings.sound, state.muted, activeAlarms.value.length], syncAlarmSound)
onMounted(() => {
  alarmSound = new Audio('/simulator-web/assets/sounds/warning1.wav')
  alarmSound.loop = true; alarmSound.preload = 'none'; alarmSound.volume = 0.5
  document.addEventListener('pointerdown', syncAlarmSound)
  document.addEventListener('keydown', syncAlarmSound)
  syncAlarmSound()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', syncAlarmSound)
  document.removeEventListener('keydown', syncAlarmSound)
  alarmSound?.pause(); alarmSound = undefined
})
</script>

<template><span class="visually-hidden" aria-hidden="true" /></template>
