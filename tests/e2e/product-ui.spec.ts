import { expect, test } from '@playwright/test'

test('登录页和教师主页展示可用的产品界面', async ({ page }) => {
  await page.goto('/simulator-web/')
  await expect(page.getByText('前端界面复原版')).toHaveCount(0)
  await expect(page.getByText('WPF EXPERIENCE', { exact: false })).toHaveCount(0)
  await page.getByTestId('enter-teacher').click()
  await page.getByRole('button', { name: '教师主页', exact: true }).click()
  await expect(page.getByRole('heading', { name: '学员训练记录' })).toBeVisible()
  await expect(page.getByText('在线学生监视')).toHaveCount(0)
  await expect(page.getByText('本地示意 / 非图传')).toHaveCount(0)
  await page.locator('.ws-monitor-layout section .ws-list-row').first().click()
  await expect(page.getByRole('dialog')).toContainText('已提交记录')
  await expect(page.getByRole('dialog')).not.toContainText('屏幕监控')
})
