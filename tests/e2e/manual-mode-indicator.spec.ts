import { expect, test } from '@playwright/test'

test('手动操作模式清晰显示并可暂停、继续和退出', async ({ page }) => {
  await page.goto('/simulator-web/?demo=1')
  await page.getByTestId('start-manual').click()
  const status = page.getByTestId('manual-status')
  await expect(status).toBeVisible()
  await expect(status).toContainText('手动操作模式')
  await expect(status).toContainText('运行中')
  await status.getByRole('button', { name: '暂停' }).click()
  await expect(status).toContainText('已暂停')
  await status.getByRole('button', { name: '继续' }).click()
  await expect(status).toContainText('运行中')
  await page.locator('[data-page="water"]').click()
  await expect(status).toContainText('手动操作模式')
  await status.getByRole('button', { name: '退出手动操作' }).click()
  await expect(status).toHaveCount(0)
})
