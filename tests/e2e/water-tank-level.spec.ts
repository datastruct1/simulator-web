import { expect, test } from '@playwright/test'

test('总览和冷热水页面的水箱液位条位于罐体内并随液位变化', async ({ page }) => {
  await page.goto('/simulator-web/?demo=1')
  await page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource').find(item => item.name.includes('/src/state/simulator.ts'))
    if (!entry) throw new Error('模拟器状态模块未加载')
    ;(window as any).__waterTankSimulator = (await import(entry.name)).useSimulator()
  })
  for (const [pageId, nodeId, width] of [['overview', 'overview-water-tank-1', 224.07], ['water', 'water-water-tank-1', 160]] as const) {
    await page.locator(`[data-page="${pageId}"]`).click()
    const tank = page.locator(`[data-node-id="${nodeId}"]`)
    const frame = tank.locator('[data-water-tank-level-frame]')
    const fill = tank.locator('[data-water-tank-level-fill]')
    await expect(frame).toBeVisible()
    const right = Number(await frame.getAttribute('x')) + Number(await frame.getAttribute('width'))
    const imageRight = width * 0.497 + Math.min(200, width * 0.664 * 559 / 346) * 0.45
    expect(right).toBeLessThan(imageRight)
    for (const [value, ratio] of [[0, 0], [50, 0.5], [100, 1]] as const) {
      await page.evaluate(value => (window as any).__waterTankSimulator.setDevice('T401', { value, min: 0, max: 100 }), value)
      await expect.poll(async () => Number(await fill.getAttribute('height'))).toBeCloseTo(42 * ratio, 2)
      const top = Number(await fill.getAttribute('y'))
      const bottom = top + Number(await fill.getAttribute('height'))
      expect(top).toBeGreaterThanOrEqual(Number(await frame.getAttribute('y')))
      expect(bottom).toBeLessThanOrEqual(Number(await frame.getAttribute('y')) + Number(await frame.getAttribute('height')))
    }
  }
})
