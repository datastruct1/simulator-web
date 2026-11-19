import type { SceneNode } from '../../types/scene'
import { nodeAttribute, nodeNumber } from './scenes'

export function sides(value: string | number | undefined): [number, number, number, number] {
  const values = String(value ?? '0').trim().split(/[\s,]+/).map(Number).map(n => Number.isFinite(n) ? n : 0)
  if (values.length === 1) return [values[0] ?? 0, values[0] ?? 0, values[0] ?? 0, values[0] ?? 0]
  if (values.length === 2) return [values[0] ?? 0, values[1] ?? 0, values[0] ?? 0, values[1] ?? 0]
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0]
}

export function roundedRect(width: number, height: number, corners: string): string {
  const [tl, tr, br, bl] = sides(corners).map(n => Math.max(0, Math.min(n, width / 2, height / 2)))
  return `M ${tl},0 H ${width - (tr ?? 0)} Q ${width},0 ${width},${tr} V ${height - (br ?? 0)} Q ${width},${height} ${width - (br ?? 0)},${height} H ${bl} Q 0,${height} 0,${height - (bl ?? 0)} V ${tl} Q 0,0 ${tl},0 Z`
}

/** Canvas labels wrap as WPF TextBlock.TextWrapping, without moving neighbours. */
export function wrapLabel(text: string, width: number, fontSize: number): string[] {
  if (width <= 0) return text.split('\n')
  const lines: string[] = []
  for (const original of text.split('\n')) {
    let line = '', used = 0
    for (const char of original) {
      const advance = fontSize * ((char.codePointAt(0) ?? 0) > 255 ? 1 : /[ilI .,]/.test(char) ? 0.3 : 0.57)
      if (line && used + advance > width) {
        lines.push(line)
        line = ''
        used = 0
      }
      line += char
      used += advance
    }
    lines.push(line)
  }
  return lines
}

const TAU = Math.PI * 2
const radians = (degrees: number) => degrees * Math.PI / 180
const f = (value: number) => Math.round(value * 1000) / 1000

interface Point { x: number; y: number }

function arcBounds(start: Point, end: Point, radius: number, large: boolean, sweep: boolean): Point[] {
  const dx = end.x - start.x, dy = end.y - start.y
  const distance = Math.hypot(dx, dy)
  if (distance < 0.0001) return [start, end]
  const r = Math.max(radius, distance / 2)
  const offset = Math.sqrt(Math.max(0, r * r - distance * distance / 4))
  const centres = [1, -1].map(sign => ({ x: (start.x + end.x) / 2 - sign * dy / distance * offset, y: (start.y + end.y) / 2 + sign * dx / distance * offset }))
  let centre = centres[0]!, a = 0, span = 0
  for (const candidate of centres) {
    const from = Math.atan2(start.y - candidate.y, start.x - candidate.x)
    const to = Math.atan2(end.y - candidate.y, end.x - candidate.x)
    const delta = sweep ? (to - from + TAU) % TAU : -((from - to + TAU) % TAU)
    if ((Math.abs(delta) > Math.PI + 0.00001) === large || Math.abs(Math.abs(delta) - Math.PI) < 0.00001) {
      centre = candidate; a = from; span = delta; break
    }
  }
  return Array.from({ length: 65 }, (_, index) => {
    const angle = a + span * index / 64
    return { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) }
  })
}

/** Ports SoftPipe.GeneratePipePathData from the desktop control verbatim. */
export function wpfBend(node: SceneNode): { path: string; viewBox: string; scale: number } {
  const width = Math.max(node.width, 1), height = Math.max(node.height, 1)
  const size = Math.min(width, height)
  const radius = size * nodeNumber(node, 'bendRadius', 0.8) * 0.4
  const cx = width / 2, cy = height / 2, margin = size * 0.1
  const kind = nodeAttribute(node, 'bendType', 'Bend90')
  let start: Point, end: Point, large = false, sweep = false, path = '', points: Point[]
  if (kind === 'Custom' || kind === 'Bend45') {
    const startAngle = kind === 'Bend45' ? 0 : nodeNumber(node, 'startAngle', 0)
    const endAngle = kind === 'Bend45' ? 45 : nodeNumber(node, 'endAngle', 90)
    start = { x: cx + radius * Math.cos(radians(startAngle)), y: cy + radius * Math.sin(radians(startAngle)) }
    end = { x: cx + radius * Math.cos(radians(endAngle)), y: cy + radius * Math.sin(radians(endAngle)) }
    large = Math.abs(endAngle - startAngle) > 180
    sweep = true
  } else if (kind === 'UBend') {
    start = { x: margin, y: cy }; end = { x: width - margin, y: cy }
    large = sweep = true
  } else if (kind === 'SBend') {
    const r = radius / 2, middle = { x: cx, y: cy - r }
    start = { x: margin, y: cy }; end = { x: width - margin, y: cy }
    path = `M ${f(start.x)},${f(start.y)} A ${f(r)},${f(r)} 0 0 1 ${f(middle.x)},${f(middle.y)} A ${f(r)},${f(r)} 0 0 0 ${f(end.x)},${f(end.y)}`
    points = [...arcBounds(start, middle, r, false, true), ...arcBounds(middle, end, r, false, false)]
    return bendResult(node, path, points)
  } else {
    start = { x: width - margin, y: cy }; end = { x: cx, y: margin }
  }
  path = `M ${f(start.x)},${f(start.y)} A ${f(radius)},${f(radius)} 0 ${large ? 1 : 0} ${sweep ? 1 : 0} ${f(end.x)},${f(end.y)}`
  points = arcBounds(start, end, radius, large, sweep)
  return bendResult(node, path, points)
}

function bendResult(node: SceneNode, path: string, points: Point[]): { path: string; viewBox: string; scale: number } {
  const pad = nodeNumber(node, 'diameter', 5) / 2
  const minX = Math.min(...points.map(point => point.x)) - pad
  const minY = Math.min(...points.map(point => point.y)) - pad
  const width = Math.max(1, Math.max(...points.map(point => point.x)) - minX + pad)
  const height = Math.max(1, Math.max(...points.map(point => point.y)) - minY + pad)
  return { path, viewBox: `${f(minX)} ${f(minY)} ${f(width)} ${f(height)}`, scale: Math.min(node.width / width, node.height / height) || 1 }
}

export function dialPoint(size: number, fraction: number, radius = 0.4): Point {
  const angle = radians(135 + fraction * 270)
  return { x: size / 2 + Math.cos(angle) * size * radius, y: size / 2 + Math.sin(angle) * size * radius }
}
