import { expect, test, type Page } from '@playwright/test'

async function simulatorState(page: Page, update?: string) {
  return page.evaluate(async update => {
    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/state/simulator.ts'))
    if (!resource) throw new Error('Simulator module not loaded')
    const simulator = (await import(resource.name)).useSimulator()
    if (update === 'reset') {
      simulator.startClock()()
      simulator.reset()
      for (const device of new Set<any>(Object.values(simulator.state.devices))) {
        if (['valve', 'hose', 'pump', 'fan', 'engine', 'heater'].includes(device.kind)) Object.assign(device, { value: 0, working: false })
        if (device.kind === 'hose') device.connected = false
      }
    }
    if (update === 'fault') simulator.setDevice('M1602', { enabled: false, error: true }, false)
    return { free: simulator.isFreeManual(), flow: simulator.state.flowId, running: simulator.state.flowRunning, safety: simulator.state.safetyComplete,
      valve: { value: simulator.state.devices.M1602.value, error: simulator.state.devices.M1602.error, enabled: simulator.state.devices.M1602.enabled }, warnings: simulator.state.manualWarnings.map((warning: any) => warning.id) }
  }, update)
}

async function operateValve(page: Page, id: string, opened: boolean) {
  await page.locator(`[data-runtime-device-id="${id}"][data-node-kind="valve"]`).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('manual-device-note')).toBeVisible()
  await dialog.getByRole('button', { name: opened ? '开启' : '关闭', exact: true }).click()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
}

const flow = (page: Page, pipe: string) => page.locator(`[data-pipe-flow][data-pipe-id="${pipe}"]`).first()

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/simulator-web/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  await simulatorState(page, 'reset')
  await page.getByTestId('start-manual').click()
  await expect(page.getByTestId('manual-status')).toBeVisible()
})

test('甲醇加注试验：只开入液阀即流动，未连接软管仅提示；关闭撤销，暂停恢复不丢失介质', async ({ page }) => {
  await page.getByTestId('manual-safety-panel').getByRole('button', { name: '加注前端', exact: true }).click()
  await expect(page.getByTestId('wpf-scene')).toHaveAttribute('data-scene-id', 'bunkering-front')
  await expect(page.locator('[data-pipe-flow]')).toHaveCount(0)
  await operateValve(page, 'V1002', true)
  await expect(flow(page, '1755764815355')).toHaveAttribute('data-medium', 'methanol')
  await expect(flow(page, '1756445796569')).toBeAttached()
  const animation = await flow(page, '1755764815355').evaluate(node => getComputedStyle(node).animationName)
  expect(animation).toContain('pipe-motion')
  await expect(page.locator('[data-manual-warning="connection:Rg002"]')).toBeVisible()
  expect(await simulatorState(page)).toMatchObject({ free: true, flow: '', safety: false })
  await expect(page.locator('.flow-progress')).toHaveCount(0)
  const fills = await page.locator('[data-pipe-fill]').count()
  await page.getByTestId('manual-status').getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('[data-pipe-flow]')).toHaveCount(0)
  await expect(page.locator('[data-pipe-fill]')).toHaveCount(fills)
  await page.getByTestId('manual-status').getByRole('button', { name: '继续', exact: true }).click()
  await expect(flow(page, '1755764815355')).toBeAttached()
  await operateValve(page, 'V1002', false)
  await expect(page.locator('[data-pipe-flow]')).toHaveCount(0)
})

test('任意顺序和锁定故障状态仍能开阀，安全提示不复位设备；退出后恢复锁定', async ({ page }) => {
  await page.getByTestId('manual-safety-panel').getByRole('button', { name: '甲醇加注', exact: true }).click()
  await expect(page.getByTestId('wpf-scene')).toHaveAttribute('data-scene-id', 'bunkering')
  await simulatorState(page, 'fault')
  await operateValve(page, 'M1602', true)
  await expect(flow(page, '40')).toBeAttached()
  await expect(page.locator('[data-manual-warning="device:M1602"]')).toBeVisible()
  expect(await simulatorState(page)).toMatchObject({ free: true, valve: { value: 100, error: true, enabled: false } })
  await page.getByTestId('manual-status').getByRole('button', { name: '退出手动操作', exact: true }).click()
  await expect(page.getByTestId('manual-safety-panel')).toHaveCount(0)
  await expect(page.locator('[data-pipe-flow]')).toHaveCount(0)
  await expect(page.locator('[data-runtime-device-id="M1602"][data-node-kind="valve"]').first()).toHaveAttribute('aria-disabled', 'true')
  expect(await simulatorState(page)).toMatchObject({ free: false, valve: { value: 100, error: true, enabled: false } })
})

test('从待机直接开阀自动运行，无需点手动操作，底栏显示加注进程', async ({ page }) => {
  await simulatorState(page, 'reset')
  await page.locator('[data-page="bunkering-front"]').click()
  await expect(page.getByTestId('manual-status')).toHaveCount(0)
  await page.locator('[data-runtime-device-id="V1002"][data-node-kind="valve"]').first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '开启', exact: true }).click()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await expect(flow(page, '1755764815355')).toHaveAttribute('data-medium', 'methanol')
  await expect(flow(page, '1756445796569')).toBeAttached()
  await expect(page.getByTestId('manual-status')).toContainText('甲醇加注试验')
  await expect(page.getByTestId('current-process')).toContainText('甲醇加注试验 · 运行中')
  expect(await simulatorState(page)).toMatchObject({ free: true, flow: '', running: true, safety: false })
})
