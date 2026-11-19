import { expect, test, type Page } from '@playwright/test'

async function mockPlatform(page: Page, failAuth = false) {
  const uploads: any[] = []
  const reports: any[] = []
  let authenticated = false
  const session = { username: 'ilab_e2e_user', displayName: '接口测试学员', csrfToken: 'mock-csrf-memory-only', expiresAt: Date.now() + 3600000,
    mode: 'test', projectTitle: '合成浏览器测试项目', sessionId: 'mock-public-context' }
  await page.route('**/api/ilab/**', async route => {
    const path = new URL(route.request().url()).pathname
    let response: unknown, status = 200
    if (path.endsWith('/config')) response = { enabled: true, mode: 'test', appid: '10000', projectTitle: session.projectTitle, requiresAiData: true }
    else if (path.endsWith('/auth')) {
      if (failAuth) { status = 401; response = { error: '合成测试：ticket无效' } }
      else { authenticated = true; response = session }
    } else if (path.endsWith('/session')) { status = authenticated ? 200 : 401; response = authenticated ? session : { error: '请先登录' } }
    else if (path.endsWith('/logout')) { authenticated = false; response = { status: 'logged_out' } }
    else if (path.endsWith('/results')) {
      const body = route.request().postDataJSON()
      expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
      uploads.push(body.result)
      response = { status: 'uploaded', originId: body.result.originId, id: 'mock-platform-record' }
    } else if (path.endsWith('/reports')) {
      const body = route.request().postDataJSON()
      expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
      reports.push(body)
      response = { status: 'uploaded', originId: body.originId, id: 'mock-report-id' }
    } else { status = 404; response = { error: 'unexpected mock route' } }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) })
  })
  return { uploads, reports }
}

async function runtime(page: Page) {
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource')
    for (const [file, name] of [['simulator', '__sim'], ['workspace', '__ws'], ['ilab', '__ilab']] as const) {
      const module = resources.find(item => item.name.includes(`/src/state/${file}.ts`))
      if (!module) throw new Error(`${file} singleton not loaded`)
      const imported = await import(module.name)
      ;(window as any)[name] = imported[file === 'simulator' ? 'useSimulator' : file === 'workspace' ? 'useWorkspace' : 'useIlab']()
    }
  })
}

async function startOperation(page: Page) {
  await runtime(page)
  return page.evaluate(() => {
    const workspace = (window as any).__ws
    if (!workspace.requestOperation({ operationId: 'shore-inerting', returnPage: 'student', mode: 'practice' })) throw new Error('operation did not start')
    return { id: workspace.data.activeOperation.id, startedAt: workspace.data.activeOperation.startedAt }
  })
}

test('ticket认证进入学员、真实操作交卷回传、成绩详情显示平台确认且不保存凭据', async ({ page }) => {
  if (process.env.ILAB_UI_PREVIEW === '1') test.setTimeout(0)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const mock = await mockPlatform(page)
  await page.goto('/simulator-web/?ticket=mock%252Fticket%2Bvalue')
  await expect(page.getByTestId('student-workspace')).toBeVisible()
  await expect(page.getByTestId('ilab-connection')).toContainText('接口测试学员')
  expect(new URL(page.url()).searchParams.has('ticket')).toBe(false)
  await startOperation(page)
  await page.waitForTimeout(1100) // Observe actual wall-clock interval; do not invent step time.
  await page.evaluate(() => {
    const sim = (window as any).__sim
    const device = sim.ensureDevice('M1005', 'valve')
    sim.setDevice('M1005', { value: device.value > 0 ? 0 : 100, working: device.value <= 0 })
    ;(window as any).__ws.submitOperation()
  })
  await expect(page.getByTestId('ilab-connection')).toContainText('回传成功')
  expect(mock.uploads).toHaveLength(1)
  expect(mock.uploads[0].username).toBe('ilab_e2e_user')
  expect(mock.uploads[0].status).toBe(2)
  expect(mock.uploads[0].steps).toHaveLength(1)
  expect(mock.uploads[0].ai_data).toEqual({ ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] })
  await page.getByTestId('history-latest-detail').click()
  await expect(page.getByTestId('ilab-score-status')).toContainText('mock-platform-record')
  await expect(page.getByRole('button', { name: '导出回传 JSON', exact: true })).toBeVisible()
  await page.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: '合成实验报告.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic test report only') })
  await expect(page.getByTestId('ilab-report-status')).toContainText('mock-report-id')
  expect(mock.reports).toHaveLength(1)
  expect(mock.reports[0].originId).toBe(mock.uploads[0].originId)
  const storage = await page.evaluate(() => localStorage.getItem('simulator_web.ilab.v1'))
  expect(storage).not.toContain('mock-csrf-memory-only')
  expect(storage).not.toContain('mock%2Fticket+value')
  expect(errors).toEqual([])
  if (process.env.ILAB_UI_PREVIEW === '1') {
    await page.evaluate(() => {
      const notice = document.createElement('div')
      notice.textContent = '本地模拟预览 · 未连接真实实验空间平台'
      notice.style.cssText = 'position:fixed;top:0;right:0;z-index:10000;background:#fff0b8;color:#734300;padding:10px 16px;font:bold 14px sans-serif;border:1px solid #d8ac48;'
      document.body.appendChild(notice)
    })
  }
  if (process.env.ILAB_UI_PREVIEW === '1') await page.waitForTimeout(4000) // Let notifications and modal transitions settle for the visual preview.
  await page.screenshot({ path: 'test-results/ilab-preview.png', fullPage: true, animations: 'disabled' })
  if (process.env.ILAB_UI_PREVIEW === '1' && process.env.ILAB_PREVIEW_AUTOCLOSE !== '1') await page.pause()
})

test('ticket认证失败不允许demo参数绕过为教师', async ({ page }) => {
  await mockPlatform(page, true)
  await page.goto('/simulator-web/?ticket=invalid&demo=1')
  await expect(page.getByTestId('ilab-connection')).toContainText('ticket无效')
  await expect(page.getByTestId('student-workspace')).toHaveCount(0)
  await expect(page.getByTestId('wpf-scene')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重试认证', exact: true })).toBeVisible()
})

test('刷新恢复平台会话及同一个操作记录，不重新生成实验或重置开始时间', async ({ page }) => {
  const mock = await mockPlatform(page)
  await page.goto('/simulator-web/?ticket=mock-ticket')
  await expect(page.getByTestId('student-workspace')).toBeVisible()
  const before = await startOperation(page)
  await page.waitForTimeout(350) // Let existing workspace persistence flush before reload.
  await page.reload()
  await expect(page.getByTestId('student-workspace')).toBeVisible()
  await runtime(page)
  const after = await page.evaluate(() => {
    const active = (window as any).__ws.data.activeOperation
    return { id: active.id, startedAt: active.startedAt, owned: (window as any).__ilab.ownsOperation(active.id) }
  })
  expect(after).toEqual({ ...before, owned: true })
  expect(mock.uploads).toHaveLength(0)
})

test('标记完成但真实操作不足10条时显示阻止原因，不补造或发送', async ({ page }) => {
  const mock = await mockPlatform(page)
  await page.goto('/simulator-web/?ticket=mock-ticket')
  await expect(page.getByTestId('student-workspace')).toBeVisible()
  await startOperation(page)
  await page.waitForTimeout(1100)
  await page.evaluate(() => {
    const sim = (window as any).__sim, ws = (window as any).__ws
    const device = sim.ensureDevice('M1005', 'valve')
    sim.setDevice('M1005', { value: device.value > 0 ? 0 : 100, working: device.value <= 0 })
    ws.tickAssessments()
    // Test-only completed flag to exercise the application's upload guard, not a real experiment outcome.
    ws.data.activeOperation.finished = true
    ws.submitOperation()
  })
  await expect(page.getByTestId('ilab-connection')).toContainText('接口要求至少 10 步')
  expect(mock.uploads).toHaveLength(0)
})

test('开发服务器拒绝访问含密钥截图与环境配置', async ({ page }) => {
  await mockPlatform(page)
  await page.goto('/simulator-web/')
  for (const path of ['/simulator-web/src/dev-pic/pic.jpg', '/simulator-web/.env.ilab.example']) {
    const response = await page.request.get(path)
    expect(response.status()).toBe(403)
  }
})
