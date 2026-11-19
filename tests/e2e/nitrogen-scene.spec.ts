import { expect, test } from '@playwright/test'

test('氮气页移除截图的冗余支路，但保留控制面板及其他页面的 H1243', async ({ page }) => {
  await page.goto('/simulator-web/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  await page.locator('[data-page="nitrogen"]').click()
  const scene = page.getByTestId('wpf-scene')
  await expect(scene).toHaveAttribute('data-scene-id', 'nitrogen')
  for (const id of ['nitrogen-pipe-13', 'nitrogen-pipe-14', 'nitrogen-pipe-15', 'nitrogen-pipe-23', 'nitrogen-pipe-24', 'nitrogen-text-2', 'nitrogen-valve-9', 'nitrogen-valve-10', 'nitrogen-valve-11']) {
    await expect(scene.locator(`[data-node-id="${id}"]`)).toHaveCount(0)
    await expect(scene.locator(`[data-pipe-fill="${id}"], [data-pipe-flow="${id}"]`)).toHaveCount(0)
  }
  await expect(scene.locator('.scene-stat')).toContainText('18 台设备 · 23 段管线')
  for (const id of ['H1241', 'H1242']) await expect(scene.locator(`[data-runtime-device-id="${id}"][data-node-kind="control-button"]`)).toHaveCount(1)
  for (const id of ['overview', 'lfss']) {
    await page.locator(`[data-page="${id}"]`).click()
    await expect(scene).toHaveAttribute('data-scene-id', id)
    await expect(scene.locator('[data-runtime-device-id="H1243"][data-node-kind="valve"]')).toHaveCount(1)
  }
})
