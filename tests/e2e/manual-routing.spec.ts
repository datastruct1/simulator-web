import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { navigateScene, readyPlant, patchDevices } from './helpers/piping'

const archive = JSON.parse(readFileSync(new URL('../../src/data/piping.generated.json', import.meta.url), 'utf8'))
const catalog = JSON.parse(readFileSync(new URL('../../src/data/workflows.generated.json', import.meta.url), 'utf8'))
const primaryPages = new Map(catalog.workflows.map((flow: { id: string; page: string }) => [flow.id, flow.page]))

function canonical(raw: string) {
  let id = raw.replace(/^pipe/i, '').trim(), guard = 0
  while (archive.canonicalPipes[id] && archive.canonicalPipes[id] !== id && guard++ < 1000) id = archive.canonicalPipes[id]
  return id
}
async function visibleFlows(page: Page) {
  return page.locator('path[data-pipe-flow]').evaluateAll(nodes => nodes.map(node => ({
    node: node.getAttribute('data-pipe-flow')!, pipe: node.getAttribute('data-pipe-id')!, medium: node.getAttribute('data-medium')!,
    forward: node.getAttribute('data-forward') === 'true', reverse: node.classList.contains('reverse'),
    animation: getComputedStyle(node).animationDirection,
  })))
}
async function deviceSnapshot(page: Page) {
  return page.evaluate(async () => {
    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/state/simulator.ts'))!
    const simulator = (await import(resource.name)).useSimulator()
    return { devices: JSON.stringify(simulator.state.devices), flowId: simulator.state.flowId, manualFlowId: simulator.state.manualFlowId, automatic: simulator.state.autoDemo }
  })
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/simulator-web/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
})

for (const [id, profile] of Object.entries<any>(archive.flowProfiles)) {
  test(`${profile.name}：实图手动方向/介质/动画方向与演示对照`, async ({ page }) => {
    await readyPlant(page, id)
    const scenes = [...new Set([primaryPages.get(id) as string, 'overview'])]
    const demo: Awaited<ReturnType<typeof visibleFlows>> = []
    for (const scene of scenes) { await navigateScene(page, scene); demo.push(...await visibleFlows(page)) }
    const before = await deviceSnapshot(page)
    await page.getByTestId('start-manual').click()
    await expect(page.getByTestId('manual-flow-select')).toHaveValue(id)
    const after = await deviceSnapshot(page)
    expect(after).toMatchObject({ devices: before.devices, flowId: '', manualFlowId: id, automatic: false })
    const expected = new Map<string, any>(profile.activePipes.map((pipe: any) => [canonical(pipe.pipe), pipe]))
    const actual: Awaited<ReturnType<typeof visibleFlows>> = []
    for (const scene of scenes) {
      await navigateScene(page, scene)
      await expect(page.getByTestId('wpf-scene')).toHaveAttribute('data-manual-flow', id)
      actual.push(...await visibleFlows(page))
    }
    for (const pipe of actual) {
      const authored = expected.get(pipe.pipe)
      expect(authored, `${id}/${pipe.pipe}: no medium from another process`).toBeTruthy()
      expect(pipe.medium, `${id}/${pipe.pipe}: medium`).toBe(authored.medium)
      expect(pipe.forward, `${id}/${pipe.pipe}: direction`).toBe(authored.flowForward)
      expect(pipe.reverse).toBe(!authored.flowForward)
      expect(pipe.animation).toBe(authored.flowForward ? 'normal' : 'reverse')
    }
    const byNode = new Map(actual.map(pipe => [pipe.node, pipe]))
    for (const pipe of demo) expect(byNode.get(pipe.node), `${id}: preserve demo's rendered ${pipe.node}`).toEqual(pipe)
    if (id === 'stop') expect(actual).toHaveLength(0)
    else expect(actual.length).toBeGreaterThan(0)
  })
}

test('同一真实管段切换工艺不造源：只在对应入口/出口打开后填充，切换不重置设备', async ({ page }) => {
  await readyPlant(page, 'bunkering')
  await navigateScene(page, 'overview')
  await page.getByTestId('start-manual').click()
  const before = await deviceSnapshot(page)
  await expect(page.locator('[data-pipe-flow][data-pipe-id="34"]').first()).toHaveAttribute('data-medium', 'methanol')
  await page.getByTestId('manual-flow-select').selectOption('shore-inerting')
  expect((await deviceSnapshot(page)).devices).toBe(before.devices)
  await expect(page.locator('[data-pipe-fill][data-pipe-id="34"]')).toHaveCount(0)
  await patchDevices(page, Object.fromEntries(['M1005', 'V1004', 'V1603', 'V1604'].map(id => [id, { value: 100, working: true }])))
  await expect(page.locator('[data-pipe-flow][data-pipe-id="34"]').first()).toHaveAttribute('data-medium', 'nitrogen')
  await patchDevices(page, Object.fromEntries(['M1005', 'V1004', 'V1603', 'V1604'].map(id => [id, { value: 0, working: false }])))
  await page.getByTestId('manual-flow-select').selectOption('bunkering')
  await expect(page.locator('[data-pipe-flow][data-pipe-id="34"]').first()).toHaveAttribute('data-medium', 'methanol')
  await expect(page.locator('[data-pipe-flow][data-pipe-id="41"]').first()).toHaveAttribute('data-medium', 'nitrogen')
})

test('真实冷热水图切换加热/降温：水和水乙二醇不同介质，旧介质全部消失', async ({ page }) => {
  await readyPlant(page, 'heating')
  await navigateScene(page, 'water')
  await page.getByTestId('start-manual').click()
  await expect(page.locator('[data-pipe-flow][data-medium="hot-water"]').first()).toBeAttached()
  await expect(page.locator('[data-pipe-flow][data-medium="hot-water-glycol"]').first()).toBeAttached()
  const before = await deviceSnapshot(page)
  await page.getByTestId('manual-flow-select').selectOption('cooling')
  await expect(page.locator('[data-pipe-flow][data-medium="hot-water"]')).toHaveCount(0)
  await expect(page.locator('[data-pipe-flow][data-medium="hot-water-glycol"]')).toHaveCount(0)
  await expect(page.locator('[data-pipe-flow][data-medium="cold-water"]').first()).toBeAttached()
  await expect(page.locator('[data-pipe-flow][data-medium="cold-water-glycol"]').first()).toBeAttached()
  expect((await deviceSnapshot(page)).devices).toBe(before.devices)
})
