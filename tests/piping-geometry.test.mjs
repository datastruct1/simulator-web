import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPipingGeometry, samplePipe } from '../src/components/scene/pipingGeometry.ts'

const pipe = (id, x, y, width, height, extra = {}) => ({ id, kind: 'pipe', label: id, deviceId: `Pipe${id}`, x, y, width, height, attributes: { fluid: '氮气', orientation: height > width ? 'Vertical' : 'Horizontal', pipeId: id }, ...extra })
const close = (a, b, tolerance = 0.01) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('相邻直管以同一中心线端口连接，L型连接使用相切的圆滑二次曲线', () => {
  const nodes = [pipe('a', 0, 0, 100, 10), pipe('b', 90, 0, 10, 100)]
  const original = JSON.stringify(nodes)
  const drawing = buildPipingGeometry(nodes)
  assert.equal(drawing.roundedJunctions, 1)
  const [a, b] = drawing.pipes
  assert.match(a.path, /Q/)
  assert.match(b.path, /Q/)
  close(a.end.x, b.start.x); close(a.end.y, b.start.y)
  const before = samplePipe(a, 1), after = samplePipe(b, 0)
  close(before.tangentX, after.tangentX); close(before.tangentY, after.tangentY)
  assert.equal(JSON.stringify(nodes), original)
})

test('三通支路到达主干中心线，不把主干截断或误做成两端弯头', () => {
  const drawing = buildPipingGeometry([pipe('main', 0, 0, 200, 10), pipe('branch', 95, -60, 10, 60)])
  const main = drawing.pipes[0], branch = drawing.pipes[1]
  close(branch.end.x, 100); close(branch.end.y, 5)
  close(samplePipe(main, 0.5).x, branch.end.x); close(samplePipe(main, 0.5).y, branch.end.y)
  assert.ok(drawing.teeJunctions >= 1)
  assert.equal(drawing.roundedJunctions, 0)
})

test('无端点的交叉线不创建几何连接，间隔较大的阀门两侧也不被补线跨过', () => {
  let drawing = buildPipingGeometry([pipe('h', 0, 95, 200, 10), pipe('v', 95, 0, 10, 200)])
  assert.deepEqual(drawing.pipes.map(p => p.neighbours), [[], []])
  drawing = buildPipingGeometry([pipe('upstream', 0, 0, 80, 10), pipe('downstream', 110, 0, 80, 10)])
  assert.deepEqual(drawing.pipes.map(p => p.neighbours), [[], []])
  close(drawing.pipes[0].end.x, 80); close(drawing.pipes[1].start.x, 110)
})

test('管道旋转使用原WPF矩形中心，不改变管径，坐标支持负数', () => {
  const drawing = buildPipingGeometry([pipe('rotated', 0, 0, 100, 8, { rotate: 90 })])
  const shape = drawing.pipes[0]
  close(shape.start.x, 50); close(shape.start.y, -46)
  close(shape.end.x, 50); close(shape.end.y, 54)
  close(shape.diameter, 8)
})

test('软管两端平滑接入真实直管端口，旧绘图盒不裁掉连接处或U形弯曲', () => {
  const hose = { id: 'soft', kind: 'hose', label: '软管', deviceId: 'Pipe34', x: 90, y: 18, width: 100, height: 124, attributes: { fluid: '氮气', pipeId: '34', material: 'Soft', diameter: 10, endAngle: 1600 } }
  const drawing = buildPipingGeometry([pipe('left', 0, 45, 90, 10), pipe('right', 230, 45, 90, 10), hose])
  const shape = drawing.pipes.find(p => p.id === 'soft')
  close(shape.start.x, 90); close(shape.start.y, 50)
  close(shape.end.x, 230); close(shape.end.y, 50)
  assert.match(shape.path, /C/)
  assert.ok(shape.length > 140)
  const first = samplePipe(shape, 0), last = samplePipe(shape, 1)
  close(first.tangentY, 0); close(last.tangentY, 0)
})

test('主水乙二醇和副冷/热水图线不因接近而被几何拼接', () => {
  const a = pipe('a', 0, 0, 100, 10)
  const b = pipe('b', 90, 0, 10, 100)
  a.attributes.fluid = '水乙二醇'; b.attributes.fluid = '冷水'
  const drawing = buildPipingGeometry([a, b])
  assert.equal(drawing.roundedJunctions, 0)
  assert.deepEqual(drawing.pipes.map(p => p.neighbours), [[], []])
})

test('原10张工艺图每段管道和弯头都有有限、可采样的SVG路径，原坐标不被改写', () => {
  const archive = JSON.parse(readFileSync(new URL('../src/data/scenes.generated.json', import.meta.url), 'utf8'))
  let curved = 0
  for (const scene of Object.values(archive.scenes)) {
    const original = JSON.stringify(scene.nodes)
    const drawing = buildPipingGeometry(scene.nodes)
    const expected = scene.nodes.filter(node => ['pipe', 'hose'].includes(node.kind) && !(node.id.startsWith('recovery-') && node.kind === 'hose' && !node.deviceId) && !['overview-hose-2', 'overview-hose-18', 'overview-hose-19', 'overview-hose-20', 'overview-hose-21', 'overview-hose-22', 'overview-hose-33', 'overview-hose-34', 'water-hose-2', 'overview-pipe-102', 'overview-pipe-162', 'overview-pipe-165', 'engine-pipe-1', 'engine-pipe-21'].includes(node.id))
    const unique = new Set(expected.map(node => node.kind === 'hose' && node.attributes?.material !== 'Soft' ? JSON.stringify([node.x, node.y, node.width, node.height, node.rotate, node.deviceId, node.attributes]) : node.id))
    assert.equal(drawing.pipes.length, unique.size)
    for (const shape of drawing.pipes) {
      assert.ok(Number.isFinite(shape.length) && shape.length >= 0, `${scene.id}: ${shape.id}`)
      assert.ok(!/NaN|Infinity|undefined/.test(shape.path), `${scene.id}: ${shape.id}`)
      for (const value of Object.values(samplePipe(shape, 0.5))) assert.ok(Number.isFinite(value), `${scene.id}: ${shape.id}`)
    }
    curved += drawing.roundedJunctions
    assert.equal(JSON.stringify(scene.nodes), original)
  }
  assert.ok(curved > 10)
})

test('回收撬块移除未绑定的默认弯管，保留有编号弯管且不拉接远端', () => {
  const archive = JSON.parse(readFileSync(new URL('../src/data/scenes.generated.json', import.meta.url), 'utf8'))
  const drawing = buildPipingGeometry(archive.scenes.recovery.nodes)
  assert.ok(!drawing.pipes.some(p => p.node.kind === 'hose' && !p.pipeId))
  for (const shape of drawing.pipes.filter(p => p.node.kind === 'hose')) {
    assert.ok(shape.length < 120, shape.id)
    assert.equal(shape.neighbours.length, 2)
  }
})

test('pic6：H1421上方弯段拉长，只接上下竖管且直管同步收短', () => {
  const archive = JSON.parse(readFileSync(new URL('../src/data/scenes.generated.json', import.meta.url), 'utf8'))
  const nodes = archive.scenes.overview.nodes
  const shapes = new Map(buildPipingGeometry(nodes).pipes.map(shape => [shape.id, shape]))
  const bend = shapes.get('overview-hose-16')
  const upper = shapes.get('overview-pipe-199'), lower = shapes.get('overview-pipe-200')
  const upperNode = nodes.find(node => node.id === upper.id), lowerNode = nodes.find(node => node.id === lower.id)
  assert.deepEqual(bend.neighbours, [upper.id, lower.id])
  close(bend.start.x, upper.end.x); close(bend.start.y, upper.end.y)
  close(bend.end.x, lower.start.x); close(bend.end.y, lower.start.y)
  close(upper.end.y, upperNode.y + upperNode.height - 5)
  close(lower.start.y, lowerNode.y + 5)
  close(bend.diameter, upper.diameter); close(bend.diameter, lower.diameter)
  assert.match(bend.path, /^M [\d.,-]+ C /)
  assert.doesNotMatch(bend.path, / L /, '不生成接到横向主管的直线补段')
  assert.ok(samplePipe(bend, 0.5).x > upper.end.x + bend.diameter, '弯段中部向右绕开竖管中心线')
})
