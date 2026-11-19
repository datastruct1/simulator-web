<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js'

const props = defineProps<{ url: string; name: string; format?: string }>()
const host = ref<HTMLDivElement>()
const loading = ref(false)
const problem = ref('')
const warning = ref('')
const rotating = ref(false)
const wireframe = ref(false)
const gridVisible = ref(true)
const triangles = ref(0)
let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let model: THREE.Group | undefined
let grid: THREE.GridHelper | undefined
let frame = 0
let observer: ResizeObserver | undefined
let request = 0
let abort: AbortController | undefined
let mounted = false
function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
  })
}
function resize() {
  if (!host.value || !renderer || !camera) return
  const width = Math.max(100, host.value.clientWidth), height = Math.max(100, host.value.clientHeight)
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
function resetView() {
  if (!camera || !controls) return
  camera.position.set(3.2, 2, 3.8)
  controls.target.set(0, 0, 0)
  controls.update()
}
function view(direction: 'front' | 'side' | 'top') {
  if (!camera || !controls) return
  camera.position.copy(direction === 'front' ? new THREE.Vector3(0,.2,4.7) : direction === 'side' ? new THREE.Vector3(4.7,.2,0) : new THREE.Vector3(0,4.7,.001))
  controls.target.set(0,0,0)
  controls.update()
}
function applyWireframe() {
  model?.traverse(child => { if (child instanceof THREE.Mesh) for (const material of Array.isArray(child.material) ? child.material : [child.material]) if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = wireframe.value })
}
watch(wireframe, applyWireframe)
watch(gridVisible, value => { if (grid) grid.visible = value })
watch(rotating, value => { if (controls) controls.autoRotate = value })
async function loadModel() {
  if (!scene) return
  const generation = ++request
  abort?.abort()
  abort = new AbortController()
  problem.value = ''; warning.value = ''; triangles.value = 0
  if (model) { scene.remove(model); disposeObject(model); model = undefined }
  if (!props.url.startsWith('/simulator-web/assets/models/')) { problem.value = '该整体模型没有包含在轻量前端资源包中。请选择柜内单体设备查看真实三维模型。'; return }
  loading.value = true
  try {
    const response = await fetch(props.url, { signal: abort.signal })
    if (!response.ok) throw new Error('本地模型资源无法读取（HTTP ' + response.status + '）。')
    const base = props.url.substring(0, props.url.lastIndexOf('/') + 1)
    const manager = new THREE.LoadingManager()
    manager.setURLModifier(url => {
      if (url.startsWith('data:')) return url
      const normalized = url.replace(/\\/g, '/')
      const resolved = new URL(normalized, window.location.origin + base)
      if (resolved.origin !== window.location.origin || !resolved.pathname.startsWith('/simulator-web/assets/models/')) {
        const filename = normalized.split('/').pop() || ''
        return new URL(base + filename, window.location.origin).href
      }
      return resolved.href
    })
    manager.onError = () => { if (generation === request) warning.value = '部分原材质 / 纹理未能读取，已保留真实几何形状。' }
    let loaded: THREE.Group
    if ((props.format || props.url.split('.').pop()?.toLowerCase()) === '3ds') {
      const loader = new TDSLoader(manager)
      loaded = loader.parse(await response.arrayBuffer(), base)
    } else {
      const text = await response.text()
      const loader = new OBJLoader(manager)
      const materialFile = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim()
      if (materialFile) {
        try {
          const materialUrl = new URL(materialFile.replace(/\\/g, '/'), window.location.origin + base)
          if (materialUrl.origin !== window.location.origin || !materialUrl.pathname.startsWith('/simulator-web/assets/models/')) throw new Error('原材质引用不是本地资源。')
          const materialResponse = await fetch(materialUrl, { signal: abort.signal })
          if (materialResponse.ok) {
            const materials = new MTLLoader(manager).parse(await materialResponse.text(), base)
            materials.preload()
            loader.setMaterials(materials)
          } else warning.value = '原 MTL 材质文件未包含，使用中性材质显示真实模型。'
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error
          warning.value = '原材质未完整读取，使用中性材质显示真实模型。'
        }
      }
      loaded = loader.parse(text)
    }
    if (generation !== request || !mounted) { disposeObject(loaded); return }
    const box = new THREE.Box3().setFromObject(loaded)
    if (box.isEmpty()) { disposeObject(loaded); throw new Error('原模型中没有可显示的三角网格。') }
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    loaded.position.sub(center)
    const wrapper = new THREE.Group()
    wrapper.add(loaded)
    wrapper.scale.setScalar(2.3 / Math.max(size.x, size.y, size.z, .001))
    loaded.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      const positions = child.geometry.getAttribute('position')
      triangles.value += Math.round((child.geometry.index?.count || positions?.count || 0) / 3)
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        material.side = THREE.DoubleSide
        if ('color' in material && !(material as THREE.MeshPhongMaterial).map) (material as THREE.MeshPhongMaterial).color.set('#a6b6c1')
      }
    })
    scene.add(wrapper)
    model = wrapper
    applyWireframe()
    resetView()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (generation === request) problem.value = error instanceof Error ? error.message : '原模型解析失败，请查看设备说明或选择其它单体模型。'
  } finally { if (generation === request) loading.value = false }
}
watch(() => props.url, () => { if (mounted) void loadModel() })
function downloadImage() {
  if (!renderer || !scene || !camera || !model) return
  renderer.render(scene, camera)
  const link = document.createElement('a')
  link.href = renderer.domElement.toDataURL('image/png')
  link.download = `${props.name}-模型视图.png`
  link.click()
}
onMounted(() => {
  mounted = true
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene = new THREE.Scene()
    scene.background = new THREE.Color('#f2f6fa')
    camera = new THREE.PerspectiveCamera(42, 1, .01, 100)
    scene.add(new THREE.HemisphereLight('#ffffff', '#7891a6', 2.2))
    const key = new THREE.DirectionalLight('#ffffff', 3)
    key.position.set(3,5,4); scene.add(key)
    const fill = new THREE.DirectionalLight('#d0e7ff', 1.5)
    fill.position.set(-3,1,-3); scene.add(fill)
    grid = new THREE.GridHelper(8, 24, '#c0cfdb', '#dce6ed')
    grid.position.y = -1.25
    scene.add(grid)
    host.value?.appendChild(renderer.domElement)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = .08
    controls.minDistance = 1.2
    controls.maxDistance = 12
    controls.autoRotateSpeed = 1.2
    resize(); resetView()
    observer = new ResizeObserver(resize)
    if (host.value) observer.observe(host.value)
    const animate = () => { frame = requestAnimationFrame(animate); controls?.update(); if (renderer && scene && camera) renderer.render(scene,camera) }
    animate()
    void loadModel()
  } catch {
    problem.value = '当前浏览器未能启用 WebGL。设备介绍仍可阅读；请使用支持硬件加速的浏览器查看本地三维模型。'
  }
})
onUnmounted(() => {
  mounted = false; request++; abort?.abort(); cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose()
  if (model) disposeObject(model)
  grid?.geometry.dispose()
  if (grid) for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) material.dispose()
  renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove()
})
</script>

<template>
  <div class="model-viewer"><div ref="host" class="model-canvas" :aria-label="`${name} 三维模型。拖动旋转，滚轮缩放，右键平移。`"><div v-if="loading" class="model-overlay"><span class="loader"/>正在读取本地原模型…</div><div v-if="problem" class="model-overlay model-error"><strong>模型显示说明</strong><p>{{ problem }}</p><button class="btn" type="button" @click="loadModel">重新读取</button></div><span v-if="!loading && !problem" class="model-instruction">拖动旋转 · 滚轮缩放 · 右键平移</span></div><div class="viewer-toolbar"><button class="btn" type="button" :disabled="!!problem" @click="resetView">复位视角</button><button class="btn" type="button" :disabled="!!problem" @click="view('front')">正视</button><button class="btn" type="button" :disabled="!!problem" @click="view('side')">侧视</button><button class="btn" type="button" :disabled="!!problem" @click="view('top')">俯视</button><label><input v-model="rotating" type="checkbox">旋转</label><label><input v-model="wireframe" type="checkbox">线框</label><label><input v-model="gridVisible" type="checkbox">网格</label><button class="btn" type="button" :disabled="!triangles" @click="downloadImage">保存视图</button></div><p v-if="warning" class="model-warning">{{ warning }}</p><p v-if="triangles" class="model-stats">原 {{ (format || 'OBJ').toUpperCase() }} 几何 · {{ triangles.toLocaleString('zh-CN') }} 个三角面 · 无网络模型依赖</p></div>
</template>

<style scoped>
.model-viewer { min-width: 0; }.model-canvas { height: 320px; min-height: 220px; position: relative; overflow: hidden; border: 1px solid #dce6ee; border-radius: 10px; background: #f2f6fa; }.model-canvas :deep(canvas) { display: block; width: 100%; height: 100%; outline: none; touch-action: none; }.model-overlay { position: absolute; inset: 0; z-index: 1; background: #f3f8fbec; display: flex; justify-content: center; align-items: center; gap: 12px; font-size: 12px; color: #7691a6; }.loader { height: 18px; width: 18px; border: 2px solid #d6e5ef; border-top-color: #4587b1; border-radius: 50%; animation: spin 1s linear infinite; }.model-error { flex-direction: column; gap: 8px; padding: 25px; text-align: center; }.model-error strong { color: #55768e; }.model-error p { max-width: 420px; line-height: 1.9; margin: 0 0 8px; }.model-instruction { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; pointer-events: none; color: #8ea4b4; font-size: 10px; }.viewer-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 12px; }.viewer-toolbar .btn { font-size: 10px; padding: 5px 7px; }.viewer-toolbar label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #7d94a6; }.viewer-toolbar input { accent-color: #3e8ab7; }.model-warning { font-size: 10px; color: #b38b4f; margin-bottom: 0; }.model-stats { color: #96a9b8; font-size: 10px; margin-bottom: 0; }@keyframes spin { to { transform: rotate(360deg); } }
</style>
