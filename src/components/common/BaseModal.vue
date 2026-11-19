<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from './UiIcon.vue'

const props = withDefaults(defineProps<{ title: string; width?: number | string; closeOnBackdrop?: boolean; maximizable?: boolean }>(), {
  width: 1000, closeOnBackdrop: true, maximizable: true,
})
const emit = defineEmits<{ close: [] }>()
const backdrop = ref<HTMLElement>()
const windowRef = ref<HTMLElement>()
const maximized = ref(false)
const previousFocus = document.activeElement as HTMLElement | null
const x = ref(0)
const y = ref(0)
let dragging: { x: number; y: number; originX: number; originY: number } | null = null
const modalId = `modal-${Math.random().toString(36).slice(2)}`
function topmost() { return [...document.querySelectorAll('.modal-backdrop')].at(-1) === backdrop.value }
function keydown(event: KeyboardEvent) {
  if (!topmost()) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close') }
  if (event.key === 'Tab') {
    const focusable = [...(windowRef.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') || [])].filter(element => element.offsetParent !== null)
    const first = focusable[0], last = focusable.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}
function dragStart(event: PointerEvent) {
  if (maximized.value || (event.target as HTMLElement).closest('button')) return
  dragging = { x: event.clientX, y: event.clientY, originX: x.value, originY: y.value }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function dragMove(event: PointerEvent) {
  if (!dragging) return
  x.value = Math.max(-window.innerWidth / 3, Math.min(window.innerWidth / 3, dragging.originX + event.clientX - dragging.x))
  y.value = Math.max(-window.innerHeight / 3, Math.min(window.innerHeight / 3, dragging.originY + event.clientY - dragging.y))
}
onMounted(async () => { document.addEventListener('keydown', keydown, true); await nextTick(); windowRef.value?.focus() })
onBeforeUnmount(() => { document.removeEventListener('keydown', keydown, true); previousFocus?.focus() })
</script>

<template>
  <Teleport to="body">
    <div ref="backdrop" class="modal-backdrop" @pointerdown.self="props.closeOnBackdrop && emit('close')">
      <section ref="windowRef" class="modal-window" :class="{ maximized }" :style="{ width: typeof width === 'number' ? `${width}px` : width, transform: maximized ? '' : `translate(${x}px,${y}px)` }" role="dialog" aria-modal="true" :aria-labelledby="modalId" tabindex="-1">
        <header class="modal-titlebar" @pointerdown="dragStart" @pointermove="dragMove" @pointerup="dragging = null" @pointercancel="dragging = null">
          <div class="modal-title"><UiIcon name="LayoutDashboard" :size="17" /><h2 :id="modalId">{{ title }}</h2></div>
          <div class="modal-controls">
            <button v-if="maximizable" class="modal-control" :title="maximized ? '还原窗口' : '最大化窗口'" @click="maximized = !maximized"><UiIcon :name="maximized ? 'Minimize2' : 'Maximize2'" :size="16" /></button>
            <button class="modal-control close" title="关闭窗口" aria-label="关闭窗口" @click="emit('close')"><UiIcon name="X" :size="21" /></button>
          </div>
        </header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop{position:fixed;inset:0;z-index:1000;background:#09234380;backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:28px;animation:fade-in .15s ease}
.modal-window{max-width:calc(100vw - 56px);max-height:calc(100dvh - 56px);background:var(--surface);border:1px solid #87aaca;border-radius:10px;box-shadow:0 24px 80px #07192f66;display:flex;flex-direction:column;overflow:hidden;outline:none;animation:modal-in .18s ease}
.modal-window.maximized{width:calc(100vw - 32px)!important;max-width:unset;height:calc(100dvh - 32px);max-height:unset}
.modal-titlebar{height:44px;flex-shrink:0;background:linear-gradient(115deg,#0b4d92,#005eb6);color:white;display:flex;align-items:center;justify-content:space-between;padding-left:16px;cursor:move;touch-action:none;user-select:none}
.modal-title{display:flex;gap:9px;align-items:center}.modal-title h2{font-size:15px;font-weight:600;margin:0}
.modal-controls{display:flex;align-items:center;height:100%}.modal-control{height:44px;width:45px;background:transparent;border:0;color:#e8f2ff;display:grid;place-items:center;cursor:pointer}.modal-control:hover{background:#ffffff20}.modal-control.close:hover{background:#d83c48}
.modal-body{overflow:auto;min-height:0;padding:20px;background:#f5f8fc}.modal-footer{padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px}
@keyframes modal-in{from{opacity:0;scale:.985}to{opacity:1;scale:1}}@keyframes fade-in{from{opacity:0}to{opacity:1}}
@media(max-width:640px){.modal-backdrop{padding:8px}.modal-window{max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.modal-body{padding:12px}}
</style>
