import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getScene, sceneStats } from '../src/components/scene/scenes.ts'
import { buildPipingGeometry } from '../src/components/scene/pipingGeometry.ts'

const removed = new Set(['nitrogen-pipe-13', 'nitrogen-pipe-14', 'nitrogen-pipe-15', 'nitrogen-pipe-23', 'nitrogen-pipe-24', 'nitrogen-text-2', 'nitrogen-valve-9', 'nitrogen-valve-10', 'nitrogen-valve-11'])

test('氮气页移除截图中画布左侧的冗余阀门、排气标签和5段管线，绘图几何也不再包含它们', () => {
  const scene = getScene('nitrogen')
  assert.ok(scene.nodes.every(node => !removed.has(node.id)))
  assert.ok(!scene.nodes.some(node => node.x < 0))
  const drawing = buildPipingGeometry(scene.nodes)
  assert.ok(drawing.pipes.every(pipe => !removed.has(pipe.id)))
  assert.deepEqual({ nodes: scene.stats.nodes, devices: scene.stats.devices, interactive: scene.stats.interactive, pipes: scene.stats.pipes, valves: scene.stats.valves }, { nodes: 80, devices: 18, interactive: 51, pipes: 23, valves: 9 })
  assert.equal(sceneStats('nitrogen').pipes, 23)
})

test('只移除氮气页重复图元，原始导入资源、其他页面和现有控制按钮保持完整', () => {
  const archive = JSON.parse(readFileSync(new URL('../src/data/scenes.generated.json', import.meta.url), 'utf8'))
  assert.equal(archive.scenes.nitrogen.nodes.filter(node => removed.has(node.id)).length, 9)
  for (const page of ['overview', 'lfss', 'control']) {
    assert.ok(getScene(page).nodes.some(node => node.deviceId === 'H1243'), `${page}: H1243 still present`)
    assert.deepEqual(getScene(page), archive.scenes[page])
  }
  for (const id of ['H1241', 'H1242']) assert.ok(getScene('nitrogen').nodes.some(node => node.kind === 'control-button' && node.deviceId === id))
  assert.ok(getScene('nitrogen').nodes.some(node => node.label === '燃料准备间' && node.kind === 'button'))
})
