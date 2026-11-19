import { expect, test, type Page } from '@playwright/test'

async function deviceState(page: Page, id: string) {
  return page.evaluate(async deviceId => {
    const resource = performance.getEntriesByType('resource').find(item => item.name.includes('/src/state/simulator.ts'))
    if (!resource) throw new Error('Shared state module was not loaded')
    const module = await import(resource.name)
    const value = module.useSimulator().state.devices[deviceId]
    return { value: value.value, working: value.working, enabled: value.enabled, id: value.id }
  }, id)
}

test('阀门开度草稿取消不生效，应用后同步到工艺图', async ({ page }, testInfo) => {
  await page.goto('/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  const old = await deviceState(page, 'V1601')
  await page.locator('[data-runtime-device-id="V1601"][data-node-kind="valve"]').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('V1601')
  await dialog.getByRole('button', { name: '75%', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await deviceState(page, 'V1601')).value).toBe(old.value)
  await page.locator('[data-runtime-device-id="V1601"][data-node-kind="valve"]').first().click()
  await dialog.getByRole('button', { name: '75%', exact: true }).click()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect((await deviceState(page, 'V1601')).value).toBe(75)
  await page.screenshot({ path: testInfo.outputPath('valve-control.png') })
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
})
test('加注软管连接与原Rg001和图形Pipe别名联动', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.locator('[data-page="bunkering-front"]').click()
  await page.locator('[data-device-id="Pipe1756445628569"][data-node-kind="hose"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '设备操作 / 详细设置', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Rg001')
  await dialog.getByRole('checkbox', { name: '连接加注软管', exact: true }).check()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect((await deviceState(page, 'Rg001')).value).toBe(100)
  expect((await deviceState(page, 'Pipe1756445628569')).id).toBe('Rg001')
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
})
test('各撬块泵组开关和急停操作使用真实命令参数', async ({ page }) => {
  await page.goto('/?demo=1')
  for (const [scene, start, stop, pump] of [['lfss', 'lfss-button-2', 'lfss-button-3', 'P101'], ['water', 'water-button-1', 'water-button-2', 'P401'], ['recovery', 'recovery-button-3', 'recovery-button-4', 'P201']]) {
    await page.locator(`[data-page="${scene}"]`).click()
    await page.locator(`[data-node-id="${start}"]`).click()
    expect((await deviceState(page, pump!)).working).toBe(true)
    await page.locator(`[data-node-id="${stop}"]`).click()
    expect((await deviceState(page, pump!)).working).toBe(false)
  }
})
