import { expect, test, type Page } from '@playwright/test'
import { navigateScene, patchDevices, readyPlant, setValveInUi } from './helpers/piping'

async function jacketSnapshot(page: Page) {
  return page.locator('.double-wall-jackets path').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-nitrogen-jacket'), path: node.getAttribute('d'), stroke: node.getAttribute('stroke'), width: node.getAttribute('stroke-width'),
  })))
}
const fill = (page: Page, id: string) => page.locator(`[data-pipe-fill][data-pipe-id="${id}"]`).first()

test.beforeEach(async ({ page }) => {
  await page.goto('/simulator-web/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
})

test('图中内管吹扫连通主管：补齐89/82的填充，外管氮气路径/颜色/宽度完全不变', async ({ page }) => {
  await readyPlant(page, 'supply-purge')
  await patchDevices(page, Object.fromEntries(['M1301', 'M1302', 'V1231', 'V1232', 'Engine01', 'Engine02', 'H1422', 'H1412', 'D1421', 'D1411', 'H1301', 'H1302'].map(id => [id, { value: 0, working: false }])))
  await navigateScene(page, 'lfss')
  await page.getByTestId('start-manual').click()
  const jackets = await jacketSnapshot(page)
  expect(jackets.length).toBeGreaterThan(0)
  expect(jackets.every(jacket => jacket.stroke === '#DBB620')).toBe(true)
  await expect(page.locator('[data-pipe-fill][data-pipe-id="117"], [data-pipe-fill][data-pipe-id="125"]')).toHaveCount(0)
  for (const id of ['H1422', 'H1412', 'D1421', 'D1411', 'H1301', 'H1302']) await setValveInUi(page, id, true)
  for (const id of ['117', '125', '89', '82', '83', '1754723051']) await expect(fill(page, id)).toHaveAttribute('data-medium', 'nitrogen')
  for (const id of ['89', '82', '83', '1754723051']) await expect(page.locator(`[data-pipe-flow][data-pipe-id="${id}"]`)).toHaveCount(0)
  await expect(page.locator('[data-pipe-fill][data-pipe-id="88"], [data-pipe-fill][data-pipe-id="81"]')).toHaveCount(0)
  expect(await jacketSnapshot(page)).toEqual(jackets)
})

test('主管供甲醇后内管整圈填充甲醇，外管始终为氮气，不被内管颜色覆盖', async ({ page }) => {
  await readyPlant(page, 'supply')
  await patchDevices(page, Object.fromEntries(['M1301', 'M1302', 'Engine01', 'Engine02', 'D1411', 'D1421', 'H1301', 'H1302'].map(id => [id, { value: 0, working: false }])))
  await navigateScene(page, 'engine')
  const engineJackets = await jacketSnapshot(page)
  await expect(page.locator('[data-pipe-fill][data-pipe-id="119"], [data-pipe-fill][data-pipe-id="127"]')).toHaveCount(0)
  await navigateScene(page, 'lfss')
  await page.getByTestId('start-manual').click()
  const jackets = await jacketSnapshot(page)
  await expect(page.locator('[data-pipe-fill][data-pipe-id="121"], [data-pipe-fill][data-pipe-id="129"]')).toHaveCount(0)
  await setValveInUi(page, 'M1301', true)
  await setValveInUi(page, 'M1302', true)
  for (const id of ['117', '121', '123', '125', '129', '131']) await expect(fill(page, id)).toHaveAttribute('data-medium', 'methanol')
  expect(await jacketSnapshot(page)).toEqual(jackets)
  expect(jackets.every(jacket => jacket.stroke === '#DBB620')).toBe(true)
  for (const id of ['117', '125']) await expect(page.locator(`[data-pipe-flow][data-pipe-id="${id}"]`)).toHaveCount(0)
  await navigateScene(page, 'engine')
  for (const id of ['119', '127']) await expect(fill(page, id)).toHaveAttribute('data-medium', 'methanol')
  expect(await jacketSnapshot(page)).toEqual(engineJackets)
  await patchDevices(page, { Engine01: { working: true, value: 100 }, Engine02: { working: true, value: 100 } })
  for (const id of ['117', '125']) await expect(page.locator(`[data-pipe-flow][data-pipe-id="${id}"]`).first()).toHaveAttribute('data-forward', 'false')
  expect(await jacketSnapshot(page)).toEqual(engineJackets)
})
