import { expect, test } from '@playwright/test'

test('WPF 登录、10张工艺图、全局工具导航可用', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('系统登录', { exact: true })).toBeVisible()
  await page.getByTestId('enter-teacher').click()
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('overview.png') })
  for (const id of ['nitrogen', 'bunkering-front', 'bunkering', 'fuel-tank', 'lfss', 'engine', 'water', 'recovery', 'control', 'overview']) {
    await page.locator(`[data-page="${id}"]`).click()
    await expect(page.getByTestId('wpf-scene')).toBeVisible()
    await expect(page.locator('[data-device-id]').first()).toBeVisible()
  }
  expect(errors).toEqual([])
})
test('未完成安全检查不允许开始加注，检查表和提示界面可进入', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.getByTestId('flow-launcher').click()
  await page.locator('[data-flow="bunkering"]').click()
  await expect(page.getByText('开始该流程前，请先完成加注作业安全检查。')).toBeVisible()
  await expect(page.locator('input[type="checkbox"]').first()).toBeVisible()
  await page.getByRole('button', { name: '操作提示' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click()
})
test('所有二级工具窗口可打开和关闭', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  for (const type of ['monitor', 'statistics', 'sensors', 'faults', 'fans', 'inventory', 'logs', 'operations', 'load', 'save', 'settings', 'introduction', 'debug']) {
    await page.getByTestId('more-tools').click()
    await page.locator(`[data-tool="${type}"]`).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.getByRole('dialog').first().getByRole('button', { name: '关闭窗口', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
test('教学、学生、练习考试和操作题编辑器入口可用', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '教师主页', exact: true }).click()
  await expect(page.locator('main')).toContainText('任务')
  await page.screenshot({ path: testInfo.outputPath('teacher.png') })
  await page.getByRole('button', { name: '学生主页', exact: true }).click()
  await expect(page.locator('main')).toContainText('任务')
  await page.getByRole('button', { name: '练习 / 考试', exact: true }).click()
  await expect(page.locator('main')).toContainText('练习')
  await page.getByTestId('more-tools').click()
  await page.getByRole('button', { name: '场景编辑器', exact: true }).click()
  await expect(page.locator('main')).toContainText('场景')
  expect(errors).toEqual([])
})
test('笔记本尺寸布局可操作、无页面横向溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  expect(overflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('overview-laptop.png') })
})
