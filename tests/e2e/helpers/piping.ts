import { expect, type Page } from '@playwright/test'

// Deliberately independent of the production palette and of resolvePiping.
export const expectedMedia = [
  { id: 'air', label: '空气', color: '#cbd5e1', flowColor: '#e2e8f0' },
  { id: 'methanol', label: '甲醇', color: '#16a34a', flowColor: '#4ade80' },
  { id: 'nitrogen', label: '氮气', color: '#0284c7', flowColor: '#38bdf8' },
  { id: 'cold-water', label: '冷水', color: '#0ea5e9', flowColor: '#7dd3fc' },
  { id: 'hot-water', label: '热水', color: '#ef4444', flowColor: '#fca5a5' },
  { id: 'water-glycol', label: '水乙二醇', color: '#8b5cf6', flowColor: '#c4b5fd' },
  { id: 'cold-water-glycol', label: '冷水乙二醇', color: '#06b6d4', flowColor: '#67e8f9' },
  { id: 'hot-water-glycol', label: '热水乙二醇', color: '#f97316', flowColor: '#fdba74' },
] as const

export type DevicePatch = Record<string, Record<string, unknown>>

const isolation: Record<string, string[]> = {
  bunkering: ['M1005', 'V1004', 'V1603', 'V1604', 'V1609'],
  'ship-inerting': ['V1703', 'A1701', 'H1711', 'H1712', 'H1241', 'V1004'],
  'recovery-bunkering': ['H1501', 'H1502', 'V1608', 'V1303', 'V1304', 'H1230', 'H1231', 'H1423'],
  'shore-discharge': ['H1503', 'D1207', 'V1605', 'V1303', 'V1304', 'H1230', 'H1231', 'H1423'],
}

async function updatePlant(page: Page, reset: boolean, flowId: string | undefined, patches: DevicePatch) {
  await page.evaluate(async ({ reset, flowId, patches }) => {
    const resources = performance.getEntriesByType('resource')
    const resource = [...resources].reverse().find(item => item.name.includes('/src/state/simulator.ts'))
    if (!resource) throw new Error('Shared simulator state module was not loaded')
    const { useSimulator } = await import(resource.name)
    const simulator = useSimulator()
    const { state } = simulator
    // Dispose the real app's existing interval, using its public lifecycle API.
    // Unlike faking all timers/rAF, this freezes JS simulation without freezing CSS motion.
    simulator.startClock()()
    if (reset) {
      for (const device of new Set<any>(Object.values(state.devices))) {
        if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) {
          Object.assign(device, { value: 100, working: true, enabled: true, error: false })
          if (device.kind === 'hose') device.connected = true
        }
      }
      if (!state.devices.C1401) throw new Error('Real three-way valve C1401 is missing')
      state.devices.C1401.value = 75
      for (const id of ['T101', 'T102']) {
        const tank = state.devices[id]
        if (!tank) throw new Error(`Real tank ${id} is missing`)
        Object.assign(tank, { value: 60, currentCapacity: 60, maxCapacity: 100, canSupply: true })
      }
      Object.assign(state, { elapsed: 0, stepIndex: 0, speed: 1, paused: false, autoDemo: true, highlightId: '', modal: null, toasts: [], alarms: [] })
    }
    if (flowId !== undefined) {
      if (flowId) {
        const pipingResource = [...resources].reverse().find(item => item.name.includes('/src/data/piping.ts'))
        if (!pipingResource) throw new Error('Real piping profiles module was not loaded')
        const { pipingTopology } = await import(pipingResource.name)
        if (!pipingTopology.flowProfiles[flowId]) throw new Error(`Real flow profile ${flowId} is missing`)
      }
      state.flowId = flowId
      state.flowRunning = Boolean(flowId)
      state.paused = false
    }
    for (const [id, patch] of Object.entries(patches)) {
      if (!state.devices[id]) throw new Error(`Fixture must not invent device ${id}`)
      Object.assign(state.devices[id], patch)
    }
  }, { reset, flowId, patches })
}

export async function readyPlant(page: Page, flowId: string, patches: DevicePatch = {}) {
  const closed = Object.fromEntries((isolation[flowId] || []).map(id => [id, { value: 0, working: false }]))
  await updatePlant(page, true, flowId, { ...closed, ...patches })
}

export async function patchDevices(page: Page, patches: DevicePatch) {
  await updatePlant(page, false, undefined, patches)
}

export async function plantState(page: Page, ids: string[] = []) {
  return page.evaluate(async ids => {
    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/state/simulator.ts'))
    if (!resource) throw new Error('Shared simulator state module was not loaded')
    const { state } = (await import(resource.name)).useSimulator()
    return {
      flowId: state.flowId, running: state.flowRunning, paused: state.paused, elapsed: state.elapsed, stepIndex: state.stepIndex,
      devices: Object.fromEntries(ids.map(id => {
        const device = state.devices[id]
        if (!device) throw new Error(`Real device/alias ${id} is missing`)
        return [id, { id: device.id, value: device.value, working: device.working, enabled: device.enabled, error: device.error, connected: device.connected, direction: device.direction }]
      })),
    }
  }, ids)
}

export async function navigateScene(page: Page, id: string) {
  await page.locator(`[data-page="${id}"]`).click()
  await expect(page.getByTestId('wpf-scene')).toHaveAttribute('data-scene-id', id)
  await page.getByRole('button', { name: '全图适配', exact: true }).click()
}

export function pipeNodes(page: Page, id: string) {
  return page.locator(`.scene-node[data-pipe-id="${id}"]`)
}

export async function expectPipe(page: Page, id: string, medium: string, flowing: boolean, blockedBy?: string) {
  const nodes = pipeNodes(page, id)
  await expect(nodes.first(), `Real drawn pipe ${id} must exist`).toBeAttached()
  const count = await nodes.count()
  const expected = { medium, filled: String(medium !== 'empty'), flowing: String(flowing), ...(blockedBy ? { blockedBy } : {}) }
  await expect.poll(async () => nodes.evaluateAll((nodes, checkBlock) => nodes.map(node => ({
    medium: node.getAttribute('data-medium'), filled: node.getAttribute('data-filled'), flowing: node.getAttribute('data-flowing'),
    ...(checkBlock ? { blockedBy: node.getAttribute('data-blocked-by') } : {}),
  })), Boolean(blockedBy)), `Pipe ${id}: ${medium}, flowing=${flowing}`).toEqual(Array.from({ length: count }, () => expected))
  for (const nodeId of await nodes.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-node-id')!))) {
    await expect(page.locator(`[data-pipe-fill="${nodeId}"]`)).toHaveCount(medium === 'empty' ? 0 : 1)
    await expect(page.locator(`[data-pipe-flow="${nodeId}"]`)).toHaveCount(flowing ? 1 : 0)
  }
}

export async function expectMedium(page: Page, medium: string, flowing: boolean) {
  expect(await page.locator(`.scene-node[data-medium="${medium}"][data-filled="true"]`).count(), `${medium} must remain filled`).toBeGreaterThan(0)
  const paths = page.locator(`.pipe-flow[data-medium="${medium}"]`)
  if (flowing) expect(await paths.count(), `${medium} must have a real active path`).toBeGreaterThan(0)
  else {
    await expect(paths, `${medium} must be static, not a dead-end animation`).toHaveCount(0)
    await expect(page.locator(`.scene-node[data-medium="${medium}"][data-flowing="true"]`)).toHaveCount(0)
  }
}

export async function filledSnapshot(page: Page) {
  return page.locator('.scene-node[data-filled="true"]').evaluateAll(nodes => nodes.map(node => ({
    node: node.getAttribute('data-node-id'), pipe: node.getAttribute('data-pipe-id'), medium: node.getAttribute('data-medium'),
  })).sort((a, b) => (a.node || '').localeCompare(b.node || '')))
}

export async function setValveInUi(page: Page, id: string, open: boolean) {
  await page.locator(`[data-runtime-device-id="${id}"][data-node-kind="valve"]`).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(id)
  await dialog.getByRole('button', { name: open ? '开启' : '关闭', exact: true }).click()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect((await plantState(page, [id])).devices[id]).toMatchObject({ value: open ? 100 : 0, working: open })
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
}

export async function stopInUi(page: Page) {
  await page.getByTestId('finish-operation').click()
  await page.getByRole('dialog').getByRole('button', { name: '结束操作', exact: true }).click()
  expect((await plantState(page)).running).toBe(false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)
}

export async function expectCssMotion(page: Page) {
  const path = page.locator('.pipe-flow').first()
  await expect(path).toBeAttached()
  const initial = await path.evaluate(path => getComputedStyle(path).strokeDashoffset)
  await expect.poll(() => path.evaluate(path => getComputedStyle(path).strokeDashoffset), {
    message: 'Native CSS dash animation must advance while the JS simulation clock is frozen', timeout: 3000, intervals: [100, 150, 200],
  }).not.toBe(initial)
  expect(await plantState(page)).toMatchObject({ elapsed: 0, stepIndex: 0 })
}

export async function auditDrawing(page: Page) {
  const result = await page.evaluate(async expectedMedia => {
    const scene = document.querySelector('[data-testid="wpf-scene"]')!
    const issues: string[] = []
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`
    const palette = new Map(expectedMedia.map(medium => [medium.id as string, medium]))
    const legends = [...scene.querySelectorAll('.medium-key')].map(node => ({
      id: node.getAttribute('data-medium'), label: node.textContent?.trim(), color: getComputedStyle(node.querySelector('i')!).backgroundColor,
    }))
    const expectedLegends = expectedMedia.map(medium => ({ id: medium.id, label: medium.label, color: rgb(medium.color) }))
    if (JSON.stringify(legends) !== JSON.stringify(expectedLegends)) issues.push(`Eight-medium legend differs: ${JSON.stringify(legends)}`)

    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/data/piping.ts'))
    if (!resource) throw new Error('Real piping metadata was not loaded')
    const { pipingTopology } = await import(resource.name)
    // Check route membership only, never call the solver to compute our expected states.
    const canonical = (raw: string) => {
      let id = String(raw).trim().replace(/^pipe/i, '')
      for (let i = 0; i < 1000 && pipingTopology.canonicalPipes[id] && pipingTopology.canonicalPipes[id] !== id; i++) id = pipingTopology.canonicalPipes[id]
      return id
    }
    const routed = new Set<string>(pipingTopology.routes.flatMap((route: any) => route.segments.map((segment: any) => canonical(segment.pipe))))
    const nodes = [...scene.querySelectorAll('.scene-node[data-pipe-id]')]
    const shells = [...scene.querySelectorAll<SVGPathElement>('.pipe-shells path')]
    if (shells.length !== nodes.length) issues.push(`Shell count ${shells.length} != drawn pipe count ${nodes.length}`)
    for (const [index, path] of shells.entries()) {
      const d = path.getAttribute('d') || ''
      const length = path.getTotalLength()
      const box = path.getBBox()
      if (!d || /NaN|Infinity/.test(d) || !Number.isFinite(length) || length <= 0 || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) issues.push(`Invalid SVG pipe shell ${index}: ${d}`)
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const point = path.getPointAtLength(length * fraction)
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) issues.push(`Unsampleable pipe shell ${index} at ${fraction}`)
      }
    }
    let unmapped = 0
    for (const node of nodes) {
      const nodeId = node.getAttribute('data-node-id')!
      const pipeId = node.getAttribute('data-pipe-id')!
      const filled = node.getAttribute('data-filled') === 'true'
      const flowing = node.getAttribute('data-flowing') === 'true'
      const medium = node.getAttribute('data-medium')!
      const fills = scene.querySelectorAll<SVGPathElement>(`[data-pipe-fill="${nodeId}"]`)
      const flows = scene.querySelectorAll<SVGPathElement>(`[data-pipe-flow="${nodeId}"]`)
      if (fills.length !== Number(filled) || flows.length !== Number(flowing)) issues.push(`${nodeId}: fill/animation DOM does not match the drawn state`)
      if (flowing && !filled || filled === (medium === 'empty')) issues.push(`${nodeId}: contradictory filled/flowing/medium state`)
      if (!routed.has(pipeId) && !pipeId.startsWith('connector:')) {
        unmapped++
        if (filled || flowing || medium !== 'empty') issues.push(`${nodeId}/${pipeId}: unmapped pipe must stay empty, even at a geometric intersection`)
      }
      for (const path of fills) {
        const style = getComputedStyle(path)
        const expected = palette.get(medium)
        if (!expected || path.getAttribute('data-medium') !== medium || style.stroke !== rgb(expected.color) || /url\(/.test(path.getAttribute('stroke') || '') || style.fill !== 'none' || style.opacity !== '1' || style.strokeOpacity !== '1') issues.push(`${nodeId}: medium fill must use its opaque, flat palette colour`)
        if (style.animationName !== 'none') issues.push(`${nodeId}: static fill itself must not animate`)
      }
      for (const path of flows) {
        const style = getComputedStyle(path)
        const expected = palette.get(medium)
        const reverse = path.getAttribute('data-forward') === 'false'
        if (!expected || style.stroke !== rgb(expected.flowColor) || path.getAttribute('data-medium') !== medium || !/pipe-motion/.test(style.animationName) || !(parseFloat(style.animationDuration) > 0) || style.animationPlayState !== 'running') issues.push(`${nodeId}: flowing segment must have the correct native CSS animation`)
        if (path.classList.contains('reverse') !== reverse || style.animationDirection !== (reverse ? 'reverse' : 'normal')) issues.push(`${nodeId}: authored flow direction differs from the animation`)
      }
    }
    for (const path of scene.querySelectorAll('[data-pipe-fill], [data-pipe-flow]')) {
      const nodeId = path.getAttribute('data-pipe-fill') || path.getAttribute('data-pipe-flow')
      if (!nodes.some(node => node.getAttribute('data-node-id') === nodeId)) issues.push(`Orphan coloured/animated path ${nodeId}`)
    }
    return { issues, pipes: nodes.length, fills: scene.querySelectorAll('[data-pipe-fill]').length, flows: scene.querySelectorAll('.pipe-flow').length, unmapped }
  }, expectedMedia)
  expect(result.issues, 'Actual SVG rendering, palette, and unmapped-pipe invariants').toEqual([])
  return result
}
