import assert from 'node:assert/strict'
import test from 'node:test'
import { uploadExperimentResult, validateAiData } from '../src/integrations/ilab.ts'

// 合成测试数据，不代表本项目已发生这些 AI 调用，禁止用作真实实验回传。
function validData() {
  return {
    ai_call_count: 2,
    ai_models_used: [{
      model: '测试模型',
      version: '1.0',
      deployment: '公有云服务',
      provider: '测试服务商',
    }],
    ai_usage_scenarios: ['智能导学', '实验报告辅助生成'],
    ai_input_token_count: 1200,
    ai_output_token_count: 800,
    ai_remark: '',
  }
}

test('图片示例结构：完整合法的 ai_data 校验通过', () => {
  assert.equal(validateAiData(validData(), true), null)
})

test('未调用 AI：次数为 0，两个必填数组允许为空', () => {
  assert.equal(validateAiData({
    ai_call_count: 0,
    ai_models_used: [],
    ai_usage_scenarios: [],
  }, true), null)
})

test('可选字段：provider、token 数量和备注均可省略', () => {
  const data = validData()
  delete data.ai_models_used[0].provider
  delete data.ai_input_token_count
  delete data.ai_output_token_count
  delete data.ai_remark
  assert.equal(validateAiData(data, true), null)
})

test('token 数量为 0 合法', () => {
  assert.equal(validateAiData({ ...validData(), ai_input_token_count: 0, ai_output_token_count: 0 }, true), null)
})

for (const deployment of ['公有云服务', '私有化部署', '混合服务', '本地运行']) {
  test(`部署方式允许值：${deployment}`, () => {
    const data = validData()
    data.ai_models_used[0].deployment = deployment
    assert.equal(validateAiData(data, true), null)
  })
}

// 对照第三张图片，逐项验证 code=19 和对应错误原因。
const invalidCases = [
  ['ai_data缺失', () => undefined],
  ['ai_data格式错误', () => []],
  ['ai_data字段名称[extra]错误', data => ({ ...data, extra: 1 })],
  ['ai_call_count缺失', data => { delete data.ai_call_count; return data }],
  ['ai_call_count格式错误', data => ({ ...data, ai_call_count: '2' })],
  ['ai_models_used缺失', data => { delete data.ai_models_used; return data }],
  ['ai_models_used格式错误', data => ({ ...data, ai_models_used: {} })],
  ['ai_models_used不能为空', data => ({ ...data, ai_models_used: [] })],
  ['ai_models_used字段名称[extra]错误', data => { data.ai_models_used[0].extra = 1; return data }],
  ['ai_models_used中model缺失', data => { delete data.ai_models_used[0].model; return data }],
  ['ai_models_used中version缺失', data => { delete data.ai_models_used[0].version; return data }],
  ['ai_models_used中deployment缺失', data => { delete data.ai_models_used[0].deployment; return data }],
  ['ai_models_used中deployment错误', data => { data.ai_models_used[0].deployment = '云端'; return data }],
  ['ai_usage_scenarios缺失', data => { delete data.ai_usage_scenarios; return data }],
  ['ai_usage_scenarios格式错误', data => ({ ...data, ai_usage_scenarios: '智能导学' })],
  ['ai_usage_scenarios不能为空', data => ({ ...data, ai_usage_scenarios: [] })],
  ['ai_input_token_count格式错误', data => ({ ...data, ai_input_token_count: -1 })],
  ['ai_output_token_count格式错误', data => ({ ...data, ai_output_token_count: 1.5 })],
]

for (const [reason, makeInvalid] of invalidCases) {
  test(`图片错误规则：${reason}`, () => {
    assert.deepEqual(validateAiData(makeInvalid(validData()), true), {
      code: 19,
      msg: `数据错误：${reason}`,
    })
  })
}

for (const value of [null, '文本', 1, true]) {
  test(`ai_data 必须为 JSON 对象：${JSON.stringify(value)}`, () => {
    assert.deepEqual(validateAiData(value, true), { code: 19, msg: '数据错误：ai_data格式错误' })
  })
}

for (const key of ['ai_call_count', 'ai_input_token_count', 'ai_output_token_count']) {
  for (const value of [-1, 0.5, '1', null, true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    test(`非负安全整数边界：${key}=${String(value)}`, () => {
      assert.deepEqual(validateAiData({ ...validData(), [key]: value }, true), {
        code: 19, msg: `数据错误：${key}格式错误`,
      })
    })
  }
}

for (const item of [null, [], '测试模型', 1]) {
  test(`模型数组元素必须为对象：${JSON.stringify(item)}`, () => {
    assert.deepEqual(validateAiData({ ...validData(), ai_models_used: [item] }, true), {
      code: 19, msg: '数据错误：ai_models_used格式错误',
    })
  })
}

for (const item of ['', '   ', null, 1]) {
  test(`场景数组元素必须为非空字符串：${JSON.stringify(item)}`, () => {
    assert.deepEqual(validateAiData({ ...validData(), ai_usage_scenarios: [item] }, true), {
      code: 19, msg: '数据错误：ai_usage_scenarios格式错误',
    })
  })
}

test('provider、ai_remark 有值时必须为字符串', () => {
  const data = validData()
  data.ai_models_used[0].provider = 123
  assert.deepEqual(validateAiData(data, true), { code: 19, msg: '数据错误：ai_models_used中provider格式错误' })
  assert.deepEqual(validateAiData({ ...validData(), ai_remark: 123 }, true), { code: 19, msg: '数据错误：ai_remark格式错误' })
})

test('不适用 2026 AI 规则时，不校验 ai_data', () => {
  assert.equal(validateAiData(undefined, false), null)
  assert.equal(validateAiData({ unknown: true }, false), null)
})

// 所有回传测试都注入 fetch 替身，绝不会调用真实平台。
test('回传请求：POST、JSON、token 编码、保留原有字段及返回结果', async () => {
  const result = { status: 1, legacy_test_field: { steps: [1, 2] }, ai_data: validData() }
  const before = structuredClone(result)
  const token = 'test-only+a&b=?中文'
  const reply = { code: 0, msg: 'mock response' }
  let calls = 0
  const response = await uploadExperimentResult(token, result, {
    requiresAiData: true,
    fetch: async (url, init) => {
      calls++
      assert.equal(url.origin, 'https://www.ilab-x.com')
      assert.equal(url.pathname, '/open/api/v2/data_upload')
      assert.equal(url.searchParams.get('access_token'), token)
      assert.equal([...url.searchParams].length, 1)
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(init.body), result)
      return Response.json(reply)
    },
  })
  assert.equal(calls, 1)
  assert.deepEqual(response, reply)
  assert.deepEqual(result, before)
})

for (const requiresAiData of [false, true]) {
  for (const status of [1, 2]) {
    test(`适用范围：requiresAiData=${requiresAiData}、status=${status}`, async () => {
      let calls = 0
      const upload = () => uploadExperimentResult('test-token', { status }, {
        requiresAiData,
        fetch: async () => { calls++; return Response.json({ code: 0 }) },
      })
      if (requiresAiData && status === 1) {
        await assert.rejects(upload, { message: '数据错误：ai_data缺失' })
        assert.equal(calls, 0)
      } else {
        assert.deepEqual(await upload(), { code: 0 })
        assert.equal(calls, 1)
      }
    })
  }
}

test('完成实验的 AI 数据非法时，本地阻止发送', async () => {
  let calls = 0
  await assert.rejects(() => uploadExperimentResult('test-token', {
    status: 1, ai_data: { ...validData(), ai_models_used: [] },
  }, {
    requiresAiData: true,
    fetch: async () => { calls++; return Response.json({ code: 0 }) },
  }), { message: '数据错误：ai_models_used不能为空' })
  assert.equal(calls, 0)
})

test('HTTP 错误应抛出异常', async () => {
  await assert.rejects(() => uploadExperimentResult('test-token', { status: 2 }, {
    requiresAiData: true,
    fetch: async () => new Response('', { status: 503 }),
  }), { message: '实验结果回传失败：HTTP 503' })
})

test('网络异常应传递给调用方', async () => {
  await assert.rejects(() => uploadExperimentResult('test-token', { status: 2 }, {
    requiresAiData: true,
    fetch: async () => { throw new Error('mock network failure') },
  }), { message: 'mock network failure' })
})

test('响应不是 JSON 时应抛出解析异常', async () => {
  await assert.rejects(() => uploadExperimentResult('test-token', { status: 2 }, {
    requiresAiData: true,
    fetch: async () => new Response('<html>error</html>'),
  }), SyntaxError)
})

test('HTTP 200 不等于业务成功：服务端 code=19 原样返回', async () => {
  const reply = { code: 19, msg: '数据错误：ai_data缺失' }
  assert.deepEqual(await uploadExperimentResult('test-token', { status: 2 }, {
    requiresAiData: true,
    fetch: async () => Response.json(reply),
  }), reply)
})
