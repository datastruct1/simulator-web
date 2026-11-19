import { expect, test, type Page } from '@playwright/test'
import { navigateScene, readyPlant, patchDevices, setValveInUi, plantState } from './helpers/piping'

const fill = (page: Page, pipe: string) => page.locator(`[data-pipe-fill][data-pipe-id="${pipe}"]`).first()
const flow = (page: Page, pipe: string) => page.locator(`[data-pipe-flow][data-pipe-id="${pipe}"]`).first()
async function jackets(page: Page) {
  return page.locator('.double-wall-jackets path').evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-nitrogen-jacket'), d: node.getAttribute('d'), stroke: node.getAttribute('stroke'), width: node.getAttribute('stroke-width') })))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/simulator-web/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
})

test('pic3：关闭H1422后D1421仍打开，但后方不再凭空填充/流动；外管保持氮气', async ({ page }) => {
  await readyPlant(page, 'supply-purge')
  await patchDevices(page, Object.fromEntries(['H1412', 'M1301', 'M1302', 'Engine01', 'Engine02'].map(id => [id, { value: 0, working: false }])))
  await navigateScene(page, 'lfss')
  await page.getByTestId('start-manual').click()
  await expect(flow(page, '157')).toBeAttached()
  const before = await jackets(page)
  await setValveInUi(page, 'H1422', false)
  expect((await plantState(page, ['H1422', 'D1421'])).devices).toMatchObject({ H1422: { value: 0 }, D1421: { value: 100 } })
  await expect(fill(page, '158')).toHaveAttribute('data-medium', 'nitrogen')
  await expect(page.locator('[data-pipe-flow][data-pipe-id="158"]')).toHaveCount(0)
  for (const id of ['157', '156', '155', '117', '89']) {
    await expect(page.locator(`[data-pipe-fill][data-pipe-id="${id}"]`)).toHaveCount(0)
    await expect(page.locator(`[data-pipe-flow][data-pipe-id="${id}"]`)).toHaveCount(0)
  }
  expect(await jackets(page)).toEqual(before)
})

test('关闭内管回管后支路是死端：允许静态填充，不能继续动画，另一条开通支路正常', async ({ page }) => {
  await readyPlant(page, 'supply-purge')
  await patchDevices(page, Object.fromEntries(['M1301', 'M1302'].map(id => [id, { value: 0, working: false }])))
  await navigateScene(page, 'lfss')
  await page.getByTestId('start-manual').click()
  await expect(flow(page, '117')).toBeAttached()
  await setValveInUi(page, 'H1302', false)
  for (const id of ['157', '156', '155', '117']) {
    await expect(fill(page, id)).toHaveAttribute('data-medium', 'nitrogen')
    await expect(page.locator(`[data-pipe-flow][data-pipe-id="${id}"]`)).toHaveCount(0)
  }
  await expect(flow(page, '125')).toBeAttached()
})

test('P202停止后其42554/162管段不再借用P201流动，另一泵的排岸支路保持运行', async ({ page }) => {
  await readyPlant(page, 'shore-discharge')
  await navigateScene(page, 'recovery')
  await page.getByTestId('start-manual').click()
  await expect(page.locator('[data-device-id="Pipe42554"]')).toHaveAttribute('data-pipe-id', '162')
  await expect(flow(page, '162')).toBeAttached()
  await page.locator('[data-runtime-device-id="P202"][data-node-kind="pump"]').first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '停止', exact: true }).click()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await expect(page.locator('[data-pipe-flow][data-pipe-id="162"]')).toHaveCount(0)
  await expect(flow(page, '165')).toBeAttached()
})
