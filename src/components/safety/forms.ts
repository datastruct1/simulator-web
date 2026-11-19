export interface SafetyField {
  key: string
  label: string
  value: string
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'time' | 'select'
  options?: string[]
  unit?: string
  min?: number
  max?: number
  required?: boolean
}
export interface SafetyFormGroup { title: string; fields: SafetyField[] }
export interface SafetyFormDefinition { title: string; introduction?: string; notes: string[]; groups: SafetyFormGroup[] }
const field = (key: string, label: string, value: string, extra: Partial<SafetyField> = {}): SafetyField => ({ key, label, value, required: true, ...extra })
const number = (key: string, label: string, value: string, unit: string, min = 0, max = 1000000): SafetyField => field(key, label, value, { type: 'number', unit, min, max })

// Original labels and example values from the final three tabs of CheckView.xaml.
export const safetyForms: Record<string, SafetyFormDefinition> = {
  transfer: {
    title: '甲醇传输数据表',
    notes: ['注意约定的物理量单位（PQU）：m³ / 公吨。', '本表采用原 WPF 示例参数，表中 bar/psi（rel）表示相对压力。所有适用栏目须填写。'],
    groups: [
      { title: '计划及加注设施', fields: [
        field('plannedAt', '计划日期和时间', '2024-01-01T08:00', { type: 'datetime-local' }),
        field('berth', '加注地点和码头', '上海港1号码头'),
        field('facility', '加注设施（槽罐加注车 / 加注船 / 岸站）', '加注船', { type: 'select', options: ['槽罐加注车', '加注船', '岸站'] }),
        field('receiver', '受注船', '远航号'),
        field('pqu', '约定的物理量单位（PQU）', 'm³', { type: 'select', options: ['m³', '公吨'] }),
      ] },
      { title: '商定的开始压力及剩余舱容', fields: [
        number('supplierPressure', '加注方开始压力', '3.5', 'bar/psi（rel）'),
        number('receiverPressure', '受注船燃料舱开始压力', '3.2', 'bar/psi（rel）'),
        number('supplierCapacity', '加注方有效（剩余）舱容', '150', 'PQU'),
        number('receiverCapacity', '受注船有效（剩余）舱容', '145', 'PQU'),
      ] },
      { title: '商定的加注作业', fields: [
        number('quantity', '商定的加注量', '100', 'PQU'),
        number('manifoldStartPressure', '总管的开始压力', '3.5', 'bar/psi（rel）'),
        number('startRate', '开始速率', '50', 'PQU per hour'),
        number('maximumRate', '最大加注速率', '80', 'PQU per hour'),
        number('toppingRate', '补足速率', '30', 'PQU per hour'),
        number('maximumPressure', '总管中最大压力', '6.0', 'bar/psi（rel）'),
      ] },
      { title: '商定的最大和最小值', fields: [
        number('bunkeringMax', '加注过程压力 · 最大值', '6.0', 'bar/psi（rel）'),
        number('bunkeringMin', '加注过程压力 · 最小值', '2.5', 'bar/psi（rel）'),
        number('tankMax', '燃料舱压力 · 最大值', '4.5', 'bar/psi（rel）'),
        number('tankMin', '燃料舱压力 · 最小值', '2.0', 'bar/psi（rel）'),
        number('loadingMax', '燃料舱装载极限 · 最大值', '95', '%', 0, 100),
        number('loadingMin', '燃料舱装载极限 · 最小值', '85', '%', 0, 100),
      ] },
    ],
  },
  plan: {
    title: '加注计划确认表',
    introduction: '尊敬的先生：受公司指定，谨向贵船供应下述品种燃料。请双方确认燃料品种、数量、基本参数、加注泵速和加注顺序。',
    notes: ['注1：本表为加注前加注方代表和受注方代表共同签署的加注凭证。', '注2：本表所有相关与适用栏目均填写，空白栏填写“N/A”。', '泵压力单位沿用原 WPF 的 MPa；与传输数据表的 bar/psi（rel）分别保留，不自动换算。'],
    groups: [
      { title: '受注方及供应信息', fields: [
        field('receiver', '受注名称', '远航号'), field('date', '受注方加注日期', '2024-01-01', { type: 'date' }),
        field('berth', '加注港口及泊位', '上海港1号码头'), field('firstFuel', '我船将首先供应', '甲醇燃料'), field('secondFuel', '随后供应', 'N/A'),
        number('ratedPumpRate', '加注船额定泵速', '80', 'm³/h'), number('ratedPumpPressure', '最大泵压力', '6.0', 'MPa'),
      ] },
      { title: '双方协商泵速 · 甲醇', fields: [
        field('fuel1', '燃料', '甲醇'), number('startRate', '起始泵速', '50', 'm³/h'), number('normalRate', '正常泵速', '80', 'm³/h'),
        number('changeTankRate', '换舱泵速', '60', 'm³/h'), number('toppingRate', '收尾泵速', '30', 'm³/h'), number('agreedPressure', '双方协商最大泵压力', '6.0', 'MPa'),
      ] },
      { title: '双方协商泵速 · 第二品种（如适用）', fields: [
        field('fuel2', '燃料', 'N/A'), field('secondStartRate', '起始泵速（m³/h）', 'N/A'), field('secondNormalRate', '正常泵速（m³/h）', 'N/A'),
        field('secondChangeTankRate', '换舱泵速（m³/h）', 'N/A'), field('secondToppingRate', '收尾泵速（m³/h）', 'N/A'),
      ] },
      { title: '监督、取样与计量约定', fields: [
        field('superviseSampling', '受注方代表是否需要监督取样过程？', '是', { type: 'select', options: ['是', '否'] }),
        field('superviseMeter', '受注方代表是否需要监督加注船流量计读数？', '是', { type: 'select', options: ['是', '否'] }),
        field('thirdParty', '是否申请第三方计量？', '否', { type: 'select', options: ['是', '否'] }),
      ] },
    ],
  },
  receipt: {
    title: '加注签收单',
    introduction: '声明：上述所供燃料符合 MARPOL 附则 VI 第18.3条规定，燃料硫含量不超过所勾选的限值。',
    notes: ['注1：本表所有相关与适用栏目均填写，空白栏填写“N/A”。', '注2：本表一式二份，加注方和受注方各保存一份。', '条件1：按照附则第4条规定的等效合规方式使用；条件2：按照附则第3.2条，船舶进行硫氧化物减排和控制技术研究试验获得相关豁免。'],
    groups: [
      { title: '船舶与作业信息', fields: [
        field('location', '加注地点', '上海港'), field('date', '加注日期', '2024-01-01', { type: 'date' }),
        field('supplierShip', '加注船名', '供油1号'), field('receiverShip', '受注船名', '远航号'),
        field('pumpStart', '开泵时间', '08:00', { type: 'time' }), field('pumpStop', '关泵时间', '12:00', { type: 'time' }),
        field('imo', 'IMO 编号', 'IMO1234567'), field('owner', '船东或代理', '中远海运'),
      ] },
      { title: '采样点与采样方法', fields: [
        field('samplePosition', '采样点位置', '受注船管路', { type: 'select', options: ['受注船管路', '加注船管路', '受注船及加注船管路'] }),
        field('sampleMethod', '采样方法', '时间比例取样', { type: 'select', options: ['时间比例取样', '流量比例取样'] }),
      ] },
      { title: '加注燃料基本参数', fields: [
        field('fuel', '加注燃料名称', '甲醇燃料'), number('density', '密度（15℃ / 20℃）', '791', 'kg/m³', 0, 10000),
        number('water', '水含量（体积分数）', '0.05', '%', 0, 100), number('flashPoint', '闪点', '12', '℃', -200, 500),
        number('sulfur', '硫含量（质量分数）', '0.1', '%', 0, 100), number('temperature', '燃料温度', '25', '℃', -200, 500),
      ] },
      { title: '燃料样品密封号', fields: [field('supplierSeal', '加注船', '100'), field('receiverSeal', '受注船', '98'), field('thirdPartySeal', '第三方计量', 'N/A')] },
      { title: '加注数量', fields: [
        number('standardVolume', '总标准体积', '100', 'm³'), number('volume20', '体积（20℃）', '99.5', 'm³'), number('totalMass', '总加注质量', '79.1', 't'),
      ] },
      { title: '硫含量限值与适用条件', fields: [
        field('sulfurRule', '请在适用的限值方框中标记（√）', '第14.4条：0.10%（m/m）', { type: 'select', options: ['第14.1条：0.5%（m/m）', '第14.4条：0.10%（m/m）', '购买者规定的限值'] }),
        number('buyerLimit', '购买者规定的限值', '0.1', '%（m/m）', 0, 100),
        field('application', '燃料应用条件', '一般使用', { type: 'select', options: ['一般使用', '第4条：等效合规方式', '第3.2条：获得研究试验豁免'] }),
      ] },
      { title: '船章', fields: [field('supplierStamp', '加注船章', '供油1号章'), field('receiverStamp', '受注船章', '远航号章')] },
    ],
  },
}

export function createFormValues(): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(safetyForms).map(([id, form]) => [id, Object.fromEntries(form.groups.flatMap(group => group.fields.map(item => [item.key, item.value])))]))
}
export function validateSafetyForm(id: string, values: Record<string, string>): string[] {
  const definition = safetyForms[id]
  if (!definition) return ['未识别的安全表单。']
  const errors: string[] = []
  for (const item of definition.groups.flatMap(group => group.fields)) {
    const value = String(values[item.key] ?? '').trim()
    if (item.required && !value) { errors.push(`请填写“${item.label}”。`); continue }
    if (item.type === 'number') {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || (item.min !== undefined && numeric < item.min) || (item.max !== undefined && numeric > item.max)) errors.push(`“${item.label}”须为有效数值（${item.min ?? '-∞'}～${item.max ?? '+∞'}）。`)
    }
    if ((item.type === 'date' || item.type === 'datetime-local') && Number.isNaN(Date.parse(value))) errors.push(`“${item.label}”日期无效。`)
    if (item.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors.push(`“${item.label}”时间无效。`)
    if (item.options && !item.options.includes(value)) errors.push(`“${item.label}”选项无效。`)
  }
  if (id === 'transfer') {
    for (const prefix of ['bunkering', 'tank', 'loading']) if (Number(values[`${prefix}Min`]) > Number(values[`${prefix}Max`])) errors.push('商定的最小值不得大于最大值。')
    if (Number(values.startRate) > Number(values.maximumRate) || Number(values.toppingRate) > Number(values.maximumRate)) errors.push('开始 / 补足速率不得超过最大加注速率。')
    if (Number(values.quantity) > Number(values.receiverCapacity)) errors.push('商定加注量不能超过受注船的剩余舱容。')
  }
  if (id === 'plan' && [values.startRate, values.normalRate, values.changeTankRate, values.toppingRate].some(rate => Number(rate) > Number(values.ratedPumpRate))) errors.push('协商泵速不得超过加注船额定泵速。')
  if (id === 'receipt') {
    const sulfurLimit = values.sulfurRule?.includes('14.1') ? .5 : values.sulfurRule?.includes('14.4') ? .1 : Number(values.buyerLimit)
    if (Number(values.sulfur) > sulfurLimit) errors.push('燃料硫含量超过所选择的声明限值。')
    if (!/^(IMO)?\d{7}$/i.test(values.imo || '')) errors.push('IMO 编号须为7位数字，可带 IMO 前缀。')
  }
  return [...new Set(errors)]
}
