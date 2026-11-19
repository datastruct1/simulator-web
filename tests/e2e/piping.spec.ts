import { expect, test as base, type Page } from '@playwright/test'
import {
  auditDrawing, expectCssMotion, expectMedium, expectPipe, filledSnapshot, navigateScene,
  patchDevices, pipeNodes, plantState, readyPlant, setValveInUi, stopInUi, type DevicePatch,
} from './helpers/piping'

const test = base.extend<{
  ready: (flowId: string, patches?: DevicePatch) => Promise<void>
  browserErrors: string[]
}>({
  browserErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'assert') errors.push(message.text()) })
    await use(errors)
    if (errors.length) await testInfo.attach('browser-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' })
    expect(errors, 'No pageerror or console.assert failure on any real process page').toEqual([])
  }, { auto: true }],
  ready: async ({ page, browserErrors }, use) => {
    void browserErrors
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/?demo=1')
    await expect(page.getByTestId('wpf-scene')).toBeVisible()
    await readyPlant(page, '')
    await use((flowId, patches) => readyPlant(page, flowId, patches))
    expect(await plantState(page), 'The real JS simulation interval must stay frozen throughout UI interactions').toMatchObject({ elapsed: 0, stepIndex: 0 })
  },
})

const processPages = [
  { id: 'overview', flow: 'bunkering' },
  { id: 'nitrogen', flow: 'ship-inerting' },
  { id: 'bunkering-front', flow: 'bunkering' },
  { id: 'bunkering', flow: 'bunkering' },
  { id: 'fuel-tank', flow: 'bunkering' },
  { id: 'lfss', flow: 'supply' },
  { id: 'engine', flow: 'methanol-leak' },
  { id: 'water', flow: 'heating' },
  { id: 'recovery', flow: 'recovery-bunkering' },
  { id: 'control', flow: 'supply' },
]

for (const scene of processPages) {
  test(`实际工艺图 ${scene.id}：8 介质纯色、有限 SVG、仅流动段动画，暂停/停止保留填充`, async ({ page, ready }, testInfo) => {
    await ready(scene.flow)
    await navigateScene(page, scene.id)
    const drawing = await auditDrawing(page)
    const filled = await filledSnapshot(page)
    if (scene.id === 'control') {
      expect(drawing).toMatchObject({ pipes: 0, fills: 0, flows: 0 })
      expect(filled, 'Control room has no pipe geometry; never manufacture a filled segment').toEqual([])
    } else {
      expect(drawing.pipes).toBeGreaterThan(0)
      expect(drawing.fills).toBeGreaterThan(0)
      expect(drawing.flows).toBeGreaterThan(0)
      await expectCssMotion(page)
    }
    await page.screenshot({ path: testInfo.outputPath(`${scene.id}-running.png`), animations: 'allow' })

    await page.locator('.flow-progress').getByRole('button', { name: '暂停', exact: true }).click()
    expect(await plantState(page)).toMatchObject({ running: true, paused: true })
    await expect(page.locator('.process-svg')).toHaveAttribute('data-running', 'false')
    await expect(page.locator('.pipe-flow')).toHaveCount(0)
    expect(await filledSnapshot(page), 'Pause retains exactly the same real filled pipes and media').toEqual(filled)
    expect((await auditDrawing(page)).flows).toBe(0)

    await page.locator('.flow-progress').getByRole('button', { name: '继续', exact: true }).click()
    expect(await plantState(page)).toMatchObject({ running: true, paused: false })
    await expect(page.locator('.pipe-flow')).toHaveCount(drawing.flows)
    await stopInUi(page)
    expect(await filledSnapshot(page), 'Stop must not drain or recolour pipes').toEqual(filled)
    await expect(page.getByTestId('pipe-context')).toContainText('静态填充保留')
    expect((await auditDrawing(page)).flows).toBe(0)
  })
}

// Pipe expectations below are authored route/gate oracles, not calls to resolvePiping.
// In particular, positive filling alone is NOT evidence of a complete flowing path.
test('氮气真实供气：C1701 关/开仅填到阀前，维护/排气死支路不得流动', async ({ page, ready }) => {
  await ready('ship-inerting')
  await navigateScene(page, 'nitrogen')
  await expect(page.locator('[data-device-id="Pipe19875226841"]')).toHaveAttribute('data-pipe-id', '1')
  await expect(page.locator('[data-device-id="Pipe599850"]')).toHaveAttribute('data-pipe-id', '5')
  for (const id of ['1', '5', '6', '13']) await expectPipe(page, id, 'nitrogen', true)
  await expectPipe(page, '2', 'nitrogen', false, 'V1703')
  for (const id of ['3', '15', '24', '1756281103', '16', '1756782337']) await expectPipe(page, id, 'empty', false)

  await page.locator('[data-runtime-device-id="C1701"][data-node-kind="valve"]').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  expect((await plantState(page, ['C1701'])).devices.C1701).toMatchObject({ value: 100, working: true })
  await expectPipe(page, '6', 'nitrogen', true)
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect((await plantState(page, ['C1701'])).devices.C1701).toMatchObject({ value: 0, working: false })
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await expectPipe(page, '5', 'nitrogen', false)
  await expectPipe(page, '6', 'empty', false, 'C1701')
  await expectPipe(page, '13', 'empty', false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)

  await setValveInUi(page, 'C1701', true)
  await expectPipe(page, '6', 'nitrogen', true)
  await expectPipe(page, '13', 'nitrogen', true)
  await auditDrawing(page)
})

test('实际加注入液 V1002 和罐顶排气 M1101/V1001 不串色，关闭入液阀后整条路径停止', async ({ page, ready }, testInfo) => {
  await ready('bunkering')
  await navigateScene(page, 'overview')
  for (const id of ['1755764815355', '1756445796569', '34', '40', '36', '1754630791']) await expectPipe(page, id, 'methanol', true)
  for (const id of ['1756451755', '41', '31', '1756445628569', '1755764967347']) await expectPipe(page, id, 'nitrogen', true)
  await expectPipe(page, '1756445276570', 'methanol', false)
  for (const id of ['37', '39', '91', '92']) await expectPipe(page, id, 'empty', false)
  await page.screenshot({ path: testInfo.outputPath('bunkering-liquid-and-vent.png') })

  await navigateScene(page, 'bunkering-front')
  await setValveInUi(page, 'V1002', false)
  await expectPipe(page, '1755764815355', 'methanol', false)
  await expectPipe(page, '1756445796569', 'empty', false, 'V1002')
  await navigateScene(page, 'overview')
  await expectPipe(page, '34', 'empty', false)
  await expectPipe(page, '1756451755', 'nitrogen', false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)

  await navigateScene(page, 'bunkering-front')
  await setValveInUi(page, 'V1002', true)
  await navigateScene(page, 'overview')
  await expectPipe(page, '34', 'methanol', true)
  await expectPipe(page, '1755764967347', 'nitrogen', true)
  await auditDrawing(page)
})

async function openVentHose(page: Page) {
  await page.locator('[data-device-id="Pipe1756445628569"][data-node-kind="hose"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '设备操作 / 详细设置', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Rg001')
  return dialog
}

test('真实软管 Rg001 断开/重接同步原状态与 Pipe 图形别名，阀前介质保留而软管/下游不着色', async ({ page, ready }, testInfo) => {
  await ready('bunkering')
  await navigateScene(page, 'bunkering-front')
  const alias = 'Pipe1756445628569'
  expect((await plantState(page, ['Rg001', alias])).devices).toMatchObject({
    Rg001: { id: 'Rg001', value: 100, working: true, connected: true },
    [alias]: { id: 'Rg001', value: 100, working: true, connected: true },
  })
  await expectPipe(page, '1756445628569', 'nitrogen', true)
  const dialog = await openVentHose(page)
  await dialog.getByRole('checkbox', { name: '连接加注软管', exact: true }).uncheck()
  expect((await plantState(page, ['Rg001'])).devices.Rg001).toMatchObject({ value: 100, working: true, connected: true })
  await expectPipe(page, '1756445628569', 'nitrogen', true)
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect((await plantState(page, ['Rg001', alias])).devices).toMatchObject({
    Rg001: { id: 'Rg001', value: 0, working: false, connected: false },
    [alias]: { id: 'Rg001', value: 0, working: false, connected: false },
  })
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
  const hose = page.locator(`[data-device-id="${alias}"][data-node-kind="hose"]`)
  await expect(hose).toHaveAttribute('data-filled', 'false')
  await expect(hose).toHaveAttribute('data-blocked-by', 'Rg001')
  await expectPipe(page, '1756445628569', 'empty', false)
  await expectPipe(page, '271432', 'empty', false, 'Rg001')
  await expectPipe(page, '29', 'nitrogen', false)
  await expectPipe(page, '1755764815355', 'methanol', false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('vent-hose-disconnected.png') })

  const reconnect = await openVentHose(page)
  await reconnect.getByRole('checkbox', { name: '连接加注软管', exact: true }).check()
  await reconnect.getByRole('button', { name: '应用', exact: true }).click()
  expect((await plantState(page, ['Rg001', alias])).devices).toMatchObject({
    Rg001: { value: 100, working: true, connected: true }, [alias]: { id: 'Rg001', value: 100, working: true, connected: true },
  })
  await reconnect.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await expectPipe(page, '1756445628569', 'nitrogen', true)
  await auditDrawing(page)
})

test('供应真实双泵/发动机分支分别门控，停机支路保留填充但不借另一泵或发动机动画', async ({ page, ready }) => {
  await ready('supply', { P102: { working: false } })
  await navigateScene(page, 'lfss')
  await expect(page.locator('[data-device-id="Pipe339"]')).toHaveAttribute('data-pipe-id', '91')
  await expectPipe(page, '91', 'methanol', true)
  await expectPipe(page, '92', 'methanol', false)
  await patchDevices(page, { P101: { working: false }, P102: { working: true } })
  await expectPipe(page, '91', 'methanol', false)
  await expectPipe(page, '92', 'methanol', true)
  await navigateScene(page, 'fuel-tank')
  await expectPipe(page, '63', 'methanol', true)
  await expect(page.locator('.pipe-flow[data-pipe-id="63"]')).toHaveAttribute('data-forward', 'false')
  await navigateScene(page, 'lfss')
  await patchDevices(page, { Engine01: { working: false } })
  await expectPipe(page, '82', 'methanol', false)
  await expectPipe(page, '89', 'methanol', true)
  await patchDevices(page, { P102: { working: false } })
  await expectMedium(page, 'methanol', false)
})

test('供应真实 UI 关闭/重开 V1231：阀前死端 80 静态、阀后 81 空，第二发动机通路仍流动', async ({ page, ready }) => {
  await ready('supply')
  await navigateScene(page, 'lfss')
  await expectPipe(page, '80', 'methanol', true)
  await expectPipe(page, '81', 'methanol', true)
  await setValveInUi(page, 'V1231', false)
  await expectPipe(page, '80', 'methanol', false)
  await expectPipe(page, '81', 'empty', false, 'V1231')
  await expectPipe(page, '89', 'methanol', true)
  await setValveInUi(page, 'V1231', true)
  await expectPipe(page, '81', 'methanol', true)
  await expectPipe(page, '82', 'methanol', true)
})

for (const [flow, main, secondary, inlet] of [
  ['heating', 'hot-water-glycol', 'hot-water', '220'],
  ['cooling', 'cold-water-glycol', 'cold-water', '214'],
]) {
  test(`真实 ${flow}：P401 主乙二醇/P402 副水停机、故障或禁用不得互相借泵`, async ({ page, ready }) => {
    await ready(flow!)
    await navigateScene(page, 'water')
    for (const fault of [{ working: false }, { error: true }, { enabled: false }]) {
      await ready(flow!, { P402: fault })
      await expectPipe(page, '229', main!, true)
      await expectPipe(page, inlet!, secondary!, false)
      await expectMedium(page, secondary!, false)
      await ready(flow!, { P401: fault })
      await expectPipe(page, '229', main!, false)
      await expectPipe(page, inlet!, secondary!, true)
      await expectMedium(page, main!, false)
    }
  })
}

test('真实三通 C1401 用 UI 切换 25/50/75：下口换热/右口旁通分开门控，未选支路只保留填充', async ({ page, ready }, testInfo) => {
  await ready('heating')
  await navigateScene(page, 'water')
  for (const [value, name, exchanger, bypass] of [
    [25, /^下口 → 上口/, true, false],
    [50, /^右口 → 上口/, false, true],
    [75, /^下 \/ 右口 → 上口/, true, true],
  ] as const) {
    const before = (await plantState(page, ['C1401'])).devices.C1401.value
    await page.locator('[data-runtime-device-id="C1401"][data-node-kind="valve"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name }).click()
    await expect(dialog.locator('.triple-image')).toHaveAttribute('src', new RegExp(`TripleValve${value}\\.png$`))
    expect((await plantState(page, ['C1401'])).devices.C1401.value, 'Port selection is only a draft until Apply').toBe(before)
    await dialog.getByRole('button', { name: '应用', exact: true }).click()
    expect((await plantState(page, ['C1401'])).devices.C1401).toMatchObject({ value, working: true })
    await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
    await expect(page.locator('[data-device-id="Pipe507"]')).toHaveAttribute('data-pipe-id', '202')
    await expect(page.locator('[data-device-id="Pipe506"]')).toHaveAttribute('data-pipe-id', '201')
    for (const id of ['202', '208']) await expectPipe(page, id, 'hot-water-glycol', exchanger)
    for (const id of ['200', '201']) await expectPipe(page, id, 'hot-water-glycol', bypass)
    await expectPipe(page, '198', 'hot-water-glycol', true)
    await expectMedium(page, 'hot-water', true)
    await page.screenshot({ path: testInfo.outputPath(`three-way-${value}.png`) })
  }
  await patchDevices(page, { C1401: { value: 100 } })
  await expectMedium(page, 'hot-water-glycol', false)
  await expectMedium(page, 'hot-water', true)
})

test('主水入口 V1404 实际关/开：源侧 229 保留、阀后 188 空，副热水仍按 P402 流动', async ({ page, ready }) => {
  await ready('heating')
  await navigateScene(page, 'water')
  await setValveInUi(page, 'V1404', false)
  await expectPipe(page, '229', 'hot-water-glycol', false)
  await expectPipe(page, '188', 'empty', false, 'V1404')
  await expectMedium(page, 'hot-water-glycol', false)
  await expectPipe(page, '220', 'hot-water', true)
  await setValveInUi(page, 'V1404', true)
  await expectPipe(page, '188', 'hot-water-glycol', true)
})

test('真实副水出口全关：热水 H1405/H1406、冷水 H1402 阀后空，入口死端绝不持续动画', async ({ page, ready }) => {
  await ready('heating', { H1405: { value: 0, working: false }, H1406: { value: 0, working: false } })
  await navigateScene(page, 'water')
  await expectPipe(page, '220', 'hot-water', false)
  await expectPipe(page, '225', 'empty', false, 'H1405')
  await expectPipe(page, '226', 'empty', false, 'H1406')
  await expectMedium(page, 'hot-water', false)
  await expectPipe(page, '229', 'hot-water-glycol', true)
  await ready('cooling', { H1402: { value: 0, working: false } })
  await expectPipe(page, '214', 'cold-water', false)
  await expectPipe(page, '212', 'cold-water', false)
  await expectPipe(page, '211', 'empty', false, 'H1402')
  await expectMedium(page, 'cold-water', false)
  await expectPipe(page, '229', 'cold-water-glycol', true)
})

test('真实回收 P201/P202 独立支路与 42554 有效别名，关闭 V1501/V1502 不把上游死端当作流动', async ({ page, ready }) => {
  await ready('recovery-bunkering', { P202: { working: false } })
  await navigateScene(page, 'recovery')
  await expect(page.locator('[data-device-id="Pipe42554"]')).toHaveAttribute('data-pipe-id', '162')
  await expectPipe(page, '170', 'methanol', true)
  await expectPipe(page, '171', 'methanol', false)
  await expectPipe(page, '162', 'methanol', false)
  await expectPipe(page, '160', 'methanol', true)
  await patchDevices(page, { P201: { working: false }, P202: { working: true } })
  await expectPipe(page, '170', 'methanol', false)
  await expectPipe(page, '171', 'methanol', true)
  await expectPipe(page, '162', 'methanol', true)
  await patchDevices(page, { P201: { working: true } })
  await setValveInUi(page, 'V1501', false)
  await expectPipe(page, '168', 'methanol', false)
  await expectPipe(page, '170', 'empty', false, 'V1501')
  await expectPipe(page, '171', 'methanol', true)
  await setValveInUi(page, 'V1502', false)
  await expectPipe(page, '1754723267', 'methanol', false)
  await expectPipe(page, '171', 'empty', false, 'V1502')
  await expectPipe(page, '160', 'empty', false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)
  await setValveInUi(page, 'V1501', true)
  await expectPipe(page, '170', 'methanol', true)
  await expectPipe(page, '160', 'methanol', true)
})

test('真实回收源阀 V1605 关/开：集液盘 53 阀前仍有甲醇、54 阀后和回罐支路不能填充或流动', async ({ page, ready }) => {
  await ready('recovery-bunkering')
  await navigateScene(page, 'bunkering')
  await expectPipe(page, '53', 'methanol', true)
  await setValveInUi(page, 'V1605', false)
  await expectPipe(page, '53', 'methanol', false)
  await expectPipe(page, '54', 'empty', false, 'V1605')
  await navigateScene(page, 'recovery')
  await expectPipe(page, '160', 'empty', false)
  await expectPipe(page, '170', 'empty', false)
  await expect(page.locator('.pipe-flow')).toHaveCount(0)
  await navigateScene(page, 'bunkering')
  await setValveInUi(page, 'V1605', true)
  await expectPipe(page, '54', 'methanol', true)
})

test('真实排岸双泵/软管门控与 V1608 实际关/开：51 阀前静态、52 阀后空，不串成回收罐循环', async ({ page, ready }) => {
  await ready('shore-discharge', { P202: { working: false } })
  await navigateScene(page, 'recovery')
  await expectPipe(page, '166', 'methanol', true)
  await expectPipe(page, '167', 'methanol', false)
  await expectPipe(page, '170', 'methanol', true)
  await expectPipe(page, '171', 'methanol', false)
  await expectPipe(page, '160', 'methanol', false)
  await patchDevices(page, { P201: { working: false }, P202: { working: true } })
  await expectPipe(page, '166', 'methanol', false)
  await expectPipe(page, '167', 'methanol', true)
  await expectPipe(page, '170', 'methanol', false)
  await expectPipe(page, '171', 'methanol', true)
  await expectPipe(page, '162', 'methanol', true)
  await navigateScene(page, 'bunkering')
  await expectPipe(page, '52', 'methanol', true)
  await expectPipe(page, '1756477657', 'methanol', true)
  await setValveInUi(page, 'V1608', false)
  await expectPipe(page, '51', 'methanol', false)
  await expectPipe(page, '52', 'empty', false, 'V1608')
  await expect(page.locator('.pipe-flow')).toHaveCount(0)
  await navigateScene(page, 'recovery')
  await expectPipe(page, '167', 'methanol', false)
  await expectMedium(page, 'methanol', false)
  await navigateScene(page, 'bunkering')
  await setValveInUi(page, 'V1608', true)
  await expectPipe(page, '52', 'methanol', true)
})

test('可疑/未映射真实管段保持空，几何邻接与相交不能凭空提供介质', async ({ page, ready }) => {
  for (const [scene, flow, medium, live, unknown] of [
    ['nitrogen', 'ship-inerting', 'nitrogen', '5', ['1756281103', '16', '1756782337']],
    ['bunkering', 'bunkering', 'methanol', '40', ['278', '279', '261', '1756444190569']],
    ['fuel-tank', 'bunkering', 'nitrogen', '1756451755', ['1756451664', '1756451597', '1756451631', '59']],
    ['water', 'heating', 'hot-water-glycol', '201', ['5114', '535']],
    ['recovery', 'recovery-bunkering', 'methanol', '170', ['435', '436', '437', '441']],
  ] as const) {
    await ready(flow)
    await navigateScene(page, scene)
    await expectPipe(page, live, medium, true)
    for (const id of unknown) await expectPipe(page, id, 'empty', false)
    await auditDrawing(page)
  }
})
