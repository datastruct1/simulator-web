import { expect, test, type Locator, type Page } from '@playwright/test'

async function setReadings(page: Page, patches: Record<string, Record<string, unknown>>) {
  await page.evaluate(async patches => {
    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/state/simulator.ts'))
    if (!resource) throw new Error('Real central-state module is missing')
    const simulator = (await import(resource.name)).useSimulator()
    simulator.startClock()()
    for (const [id, patch] of Object.entries(patches)) {
      if (!simulator.state.devices[id]) throw new Error(`Fixture must use a real device: ${id}`)
      Object.assign(simulator.state.devices[id], patch)
    }
  }, patches)
}

async function sensorState(page: Page, id: string) {
  return page.evaluate(async id => {
    const resource = [...performance.getEntriesByType('resource')].reverse().find(item => item.name.includes('/src/state/simulator.ts'))!
    const { state } = (await import(resource.name)).useSimulator()
    const device = state.devices[id]
    return { id: device.id, kind: device.kind, value: device.value, min: device.min, max: device.max, unit: device.unit, frozen: device.frozen, aliasesShared: state.devices.Pit7A === state.devices.PIT7A }
  }, id)
}

async function scene(page: Page, id: string) {
  await page.locator(`[data-page="${id}"]`).click()
  await expect(page.getByTestId('wpf-scene')).toHaveAttribute('data-scene-id', id)
  await page.getByRole('button', { name: '全图适配', exact: true }).click()
}

function instrument(page: Page, id: string, kind: 'gauge' | 'digital-gauge') {
  return page.locator(`.scene-node[data-runtime-device-id="${id}"][data-node-kind="${kind}"]`).first()
}

/** Decode a real Chromium screenshot, not a serialization of the SVG/DOM. */
async function paintedPixels(page: Page, locator: Locator) {
  await expect(locator).toBeVisible()
  const screenshot = await locator.screenshot({ animations: 'disabled' })
  return page.evaluate(async bytes => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    const image = new Image()
    try {
      image.src = url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let green = 0, ink = 0, red = 0
      for (let index = 0; index < pixels.length; index += 4) {
        const [r, g, b, alpha] = pixels.slice(index, index + 4)
        if (alpha! < 200) continue
        if (g! > 120 && g! > r! * 1.6 && g! > b! * 1.6) green++
        if (r! < 80 && g! < 80 && b! < 80) ink++
        if (r! > 140 && r! > g! * 1.8 && r! > b! * 1.8) red++
      }
      return { green, ink, red, width: canvas.width, height: canvas.height }
    } finally { URL.revokeObjectURL(url) }
  }, [...screenshot])
}

test('主图数字仪表的0/负号/小数点/单位真的被画出，二级仍为数字并保持sensor别名', async ({ page }, testInfo) => {
  await page.goto('/?demo=1')
  await scene(page, 'nitrogen')
  await setReadings(page, { Pit7A: { value: 0, error: false, enabled: true } })
  const main = instrument(page, 'Pit7A', 'digital-gauge')
  const digits = main.locator('[data-gauge-digits]')
  await expect(digits).toHaveAttribute('data-gauge-digits', '000.00')
  expect((await paintedPixels(page, digits)).green, 'Zero must have visible lime segments on the actual black screen').toBeGreaterThan(20)
  await expect(main.locator('[data-gauge-unit-label]')).toHaveText('Pa')
  expect((await paintedPixels(page, main.locator('[data-gauge-unit-label]'))).ink).toBeGreaterThan(3)
  await setReadings(page, { Pit7A: { value: -50 } })
  await expect(digits).toHaveAttribute('data-gauge-digits', '-050.00')
  const sign = digits.locator('[data-gauge-digit="-"]')
  await expect(sign.locator('[data-segment-lit="true"]')).toHaveCount(1)
  expect((await paintedPixels(page, sign)).green, 'A negative sign must also paint pixels').toBeGreaterThan(1)
  expect((await paintedPixels(page, digits.locator('[data-gauge-digit="."]'))).green).toBeGreaterThan(0)
  await main.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.device-dialog')).toHaveAttribute('data-device-kind', 'sensor')
  await expect(dialog.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-visual', 'digital-gauge')
  await expect(dialog.locator('[data-gauge-needle]')).toHaveCount(0)
  await expect(dialog.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '-050.00')
  expect((await paintedPixels(page, dialog.locator('[data-gauge-digits]'))).green).toBeGreaterThan(20)
  await expect(dialog.getByRole('button', { name: '启动', exact: true })).toHaveCount(0)
  await dialog.getByLabel('当前值（Pa）', { exact: true }).fill('0')
  expect((await sensorState(page, 'Pit7A')).value).toBe(-50)
  await dialog.getByRole('checkbox', { name: '是否关闭更新（保持设定值）', exact: true }).check()
  await dialog.getByRole('button', { name: '应用', exact: true }).click()
  expect(await sensorState(page, 'PIT7A')).toMatchObject({ id: 'Pit7A', kind: 'sensor', value: 0, frozen: true, aliasesShared: true })
  await expect(dialog.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '000.00')
  await page.screenshot({ path: testInfo.outputPath('digital-gauge-dialog.png') })
  await dialog.getByRole('button', { name: '关闭窗口', exact: true }).click()
  await expect(digits).toHaveAttribute('data-gauge-digits', '000.00')
})

test('主图指针有真实工程刻度与可见读数，点击后二级保留指针/量程/单位', async ({ page }, testInfo) => {
  await page.goto('/?demo=1')
  await scene(page, 'nitrogen')
  await setReadings(page, { Pit67: { value: 0 } })
  const main = instrument(page, 'Pit67', 'gauge')
  await expect(main.locator('[data-gauge-reading]')).toHaveText(/^0(?:\.0+)? MPa$/)
  await expect(main.locator('[data-gauge-tick]').last()).toHaveText(/^2\.50?$/)
  expect((await paintedPixels(page, main.locator('[data-gauge-reading]'))).ink).toBeGreaterThan(5)
  expect((await paintedPixels(page, main.locator('[data-gauge-tick]').last())).ink).toBeGreaterThan(3)
  const oldNeedle = await main.locator('[data-gauge-needle]').getAttribute('x2')
  await setReadings(page, { Pit67: { value: 1.25 } })
  await expect(main.locator('[data-gauge-needle]')).not.toHaveAttribute('x2', oldNeedle!)
  expect((await paintedPixels(page, main.locator('[data-gauge-visual]'))).red).toBeGreaterThan(10)
  await main.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.device-dialog')).toHaveAttribute('data-device-kind', 'sensor')
  await expect(dialog.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-visual', 'gauge')
  await expect(dialog.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-max', '2.5')
  await expect(dialog.locator('[data-gauge-needle]')).toHaveCount(1)
  await expect(dialog.locator('[data-gauge-digits]')).toHaveCount(0)
  await expect(dialog.locator('[data-gauge-reading]')).toHaveText(/MPa$/)
  await page.screenshot({ path: testInfo.outputPath('pointer-gauge-dialog.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await sensorState(page, 'Pit67')).kind).toBe('sensor')
})

test('发动机刻度遵循400间隔，液位/流量转换在主图和二级一致且不修改中央原值', async ({ page }) => {
  await page.goto('/?demo=1')
  await scene(page, 'engine')
  await setReadings(page, { Er101: { value: 320 }, Ef101: { value: .0001, unit: 'FlowSpeed' } })
  const rpm = instrument(page, 'Er101', 'gauge')
  await expect(rpm.locator('[data-gauge-tick]')).toHaveText(['0', '400', '800', '1200', '1600', '2000'])
  await expect(rpm.locator('[data-gauge-reading]')).toHaveText('320 RPM')
  await rpm.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-max', '2000')
  await expect(dialog.locator('[data-gauge-reading]')).toHaveText('320 RPM')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const flow = instrument(page, 'Ef101', 'gauge')
  await expect(flow.locator('[data-gauge-reading]')).toHaveText(/^6(?:\.0+)? L\/min$/)
  await flow.click()
  await expect(dialog.locator('[data-gauge-reading]')).toHaveText(/^6(?:\.0+)? L\/min$/)
  await expect(dialog.locator('.digital-readout')).toHaveText('6.00L/min')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await sensorState(page, 'Ef101')).value).toBe(.0001)
  await scene(page, 'fuel-tank')
  await setReadings(page, { Lit101: { value: 1250, unit: 'mm' }, Tit101: { value: -12.5 } })
  const level = instrument(page, 'Lit101', 'digital-gauge')
  await expect(level.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '125.00')
  await expect(level.locator('[data-gauge-unit-label]')).toHaveText('cm')
  await level.click()
  await expect(dialog.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '125.00')
  await expect(dialog.locator('[data-gauge-unit-label]')).toHaveText('cm')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect((await sensorState(page, 'Lit101')).value).toBe(1250)
  const temperature = instrument(page, 'Tit101', 'digital-gauge')
  await expect(temperature.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '-012.50')
  expect((await paintedPixels(page, temperature.locator('[data-gauge-digits]'))).green).toBeGreaterThan(20)
})

test('DigitalScreen短矩形真实绘制零/负数/单位，二级不能退化成圆形指针表', async ({ page }, testInfo) => {
  await page.goto('/?demo=1')
  await expect(page.getByTestId('wpf-scene')).toBeVisible()
  await setReadings(page, { Pit7A: { value: 0 } })
  // The original main-view DigitalScreens are Visibility=Hidden and correctly not
  // imported. Mount the real SceneSymbol with a short screen, sharing a real sensor.
  await page.evaluate(async () => {
    const resources = [...performance.getEntriesByType('resource')].reverse()
    const moduleUrl = (fragment: string) => {
      const resource = resources.find(item => item.name.includes(fragment) && !item.name.includes('type=style'))
      if (!resource) throw new Error(`Real component module is missing: ${fragment}`)
      return resource.name
    }
    const { createApp, h } = await import(moduleUrl('/node_modules/.vite/deps/vue.js'))
    const SceneSymbol = (await import(moduleUrl('/src/components/scene/SceneSymbol.vue'))).default
    if (!SceneSymbol) throw new Error('SceneSymbol must be the actual Vue component, not its style module')
    const simulator = (await import(moduleUrl('/src/state/simulator.ts'))).useSimulator()
    const node = { id: 'screen-browser-fixture', kind: 'digital-gauge', deviceId: 'Pit7A', label: '', x: 0, y: 0, width: 120, height: 40, attributes: { sourceType: 'DigitalScreen', unit: 'Pa' } }
    const host = document.createElement('div')
    host.id = 'gauge-screen-fixture'
    Object.assign(host.style, { position: 'fixed', left: '40px', top: '210px', zIndex: '40', width: '120px', height: '40px' })
    document.body.append(host)
    createApp({ render: () => h('svg', { width: 120, height: 40, onClick: () => simulator.openModal('device', 'Pit7A · 数字屏', { id: 'Pit7A', kind: 'digital-gauge', node }) }, [h(SceneSymbol, { node, device: simulator.state.devices.Pit7A, running: false, uid: 'screen-fixture' })]) }).mount(host)
  })
  const screen = page.locator('#gauge-screen-fixture')
  await expect(screen.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-visual', 'digital-screen')
  await expect(screen.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '000.00')
  expect((await paintedPixels(page, screen.locator('[data-gauge-digits]'))).green).toBeGreaterThan(20)
  await setReadings(page, { Pit7A: { value: -50 } })
  await expect(screen.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '-050.00')
  expect((await paintedPixels(page, screen.locator('[data-gauge-digits]'))).green).toBeGreaterThan(20)
  await expect(screen.locator('[data-gauge-unit-label]')).toHaveText('Pa')
  expect((await paintedPixels(page, screen.locator('[data-gauge-unit-label]'))).green).toBeGreaterThan(2)
  await screen.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('[data-gauge-visual]')).toHaveAttribute('data-gauge-visual', 'digital-screen')
  await expect(dialog.locator('[data-gauge-needle]')).toHaveCount(0)
  await expect(dialog.locator('[data-gauge-digits]')).toHaveAttribute('data-gauge-digits', '-050.00')
  expect((await paintedPixels(page, dialog.locator('[data-gauge-digits]'))).green).toBeGreaterThan(20)
  await expect(dialog.locator('.device-dialog')).toHaveAttribute('data-device-kind', 'sensor')
  await page.screenshot({ path: testInfo.outputPath('digital-screen-dialog.png') })
})
