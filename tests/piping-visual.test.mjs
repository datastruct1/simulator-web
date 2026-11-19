import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePipeDrawing } from '../src/components/scene/pipeVisual.ts'

const shape = (id, pipeId, neighbours = [], extra = {}) => ({ id, pipeId, neighbours, node: { id, kind: 'pipe' }, soft: false, ...extra })
const filled = (pipeId, medium = 'methanol', flowing = true) => ({ pipeId, medium, filled: true, flowing, forward: true, sourceId: 'S' })
const drawing = pipes => ({ pipes, roundedJunctions: 0, teeJunctions: 0 })

test('静态填充与流动分层；绘图解析不修改引擎状态或设备', () => {
  const states = { '40': Object.freeze(filled('40')) }
  const devices = Object.freeze({})
  const before = JSON.stringify(states)
  const stopped = resolvePipeDrawing(drawing([shape('pipe', 'Pipe40')]), states, devices, false)
  assert.equal(stopped.pipe.medium, 'methanol')
  assert.equal(stopped.pipe.filled, true)
  assert.equal(stopped.pipe.flowing, false)
  assert.equal(resolvePipeDrawing(drawing([shape('pipe', '40')]), states, devices, true).pipe.flowing, true)
  assert.equal(JSON.stringify(states), before)
})

test('软管图形别名与原Rg002共用控制，working=false也不能靠value残留继续着色', () => {
  const geometry = drawing([shape('hose', '34', [], { soft: true, node: { id: 'hose', kind: 'hose', deviceId: 'Pipe34' } })])
  const states = { '34': filled('34') }
  const controller = { id: 'Rg002', kind: 'hose', value: 100, working: true, enabled: true, error: false }
  const devices = { Rg002: controller, Pipe34: controller }
  assert.equal(resolvePipeDrawing(geometry, states, devices, true).hose.filled, true)
  for (const patch of [{ working: false }, { value: 0 }, { enabled: false }, { error: true }, { connected: false }]) {
    const blocked = { ...controller, ...patch }
    const result = resolvePipeDrawing(geometry, states, { Rg002: blocked, Pipe34: blocked }, true).hose
    assert.equal(result.filled, false, JSON.stringify(patch))
    assert.equal(result.flowing, false)
    assert.equal(result.medium, 'empty')
    assert.equal(result.blockedBy, 'Rg002')
  }
  assert.equal(states['34'].medium, 'methanol', '只有显示状态被覆盖，不污染纯引擎/评分快照')
})

test('无编号弯头只在两侧已填相同介质时补色，不跨关闭阀门或混色', () => {
  const geometry = drawing([shape('left', '40'), shape('joint', undefined, ['left', 'right']), shape('right', '36')])
  let states = { '40': filled('40'), '36': { pipeId: '36', medium: 'empty', filled: false, flowing: false, forward: true } }
  assert.equal(resolvePipeDrawing(geometry, states, {}, true).joint.filled, false)
  states['36'] = filled('36', 'nitrogen')
  assert.equal(resolvePipeDrawing(geometry, states, {}, true).joint.filled, false)
  states['36'] = filled('36', 'methanol', false)
  const staticJoint = resolvePipeDrawing(geometry, states, {}, true).joint
  assert.equal(staticJoint.filled, true)
  assert.equal(staticJoint.flowing, false, '一侧静态时弯头也不流动')
  states['36'].flowing = true
  assert.equal(resolvePipeDrawing(geometry, states, {}, true).joint.flowing, true)
  assert.equal(resolvePipeDrawing(geometry, states, {}, false).joint.flowing, false)
})

test('有编号但未映射的管段保持空管，即使几何两侧都是相同介质', () => {
  const geometry = drawing([shape('left', '40'), shape('unknown', 'not-mapped', ['left', 'right']), shape('right', '36')])
  const result = resolvePipeDrawing(geometry, { '40': filled('40'), '36': filled('36') }, {}, true)
  assert.equal(result.unknown.medium, 'empty')
  assert.equal(result.unknown.filled, false)
  assert.equal(result.unknown.flowing, false)
})
