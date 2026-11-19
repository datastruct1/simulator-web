import imported from './workflows.generated.json'
import type { Workflow } from '../types/simulator'

export const pages = [
  { id: 'overview', title: '系统总览', short: '系统总览', icon: 'LayoutDashboard', source: 'IndexView.xaml' },
  { id: 'nitrogen', title: '氮气供应撬块', short: '氮气供应', icon: 'Wind', source: 'NitrogenCompartmentView.xaml' },
  { id: 'bunkering-front', title: '加注前端撬块', short: '加注前端', icon: 'Anchor', source: 'BeforeAddView.xaml' },
  { id: 'bunkering', title: '加注撬块', short: '甲醇加注', icon: 'Fuel', source: 'AddPartView.xaml' },
  { id: 'fuel-tank', title: '燃料舱隔离空舱', short: '燃料储舱', icon: 'Container', source: 'FuelSiloPartView.xaml' },
  { id: 'lfss', title: '燃料准备间', short: '燃料准备', icon: 'Workflow', source: 'LFSSPartView.xaml' },
  { id: 'engine', title: '甲醇发动机机舱', short: '发动机舱', icon: 'Cog', source: 'DynamoPartView.xaml' },
  { id: 'water', title: '冷热水撬块', short: '水乙二醇', icon: 'Thermometer', source: 'WaterPartView.xaml' },
  { id: 'recovery', title: '回收撬块', short: '废液回收', icon: 'Recycle', source: 'RecyclePartView.xaml' },
  { id: 'control', title: '总控室', short: '总控室', icon: 'SlidersHorizontal', source: 'GeneralControlView.xaml' },
] as const

export const workflows = imported.workflows as unknown as Workflow[]
export const initialDevices = imported.devices
export const presets = imported.presets

export const toolItems = [
  { type: 'monitor', title: '设备监测', icon: 'Activity' },
  { type: 'statistics', title: '实时趋势', icon: 'ChartNoAxesCombined' },
  { type: 'sensors', title: '传感器设置', icon: 'Gauge' },
  { type: 'faults', title: '异常配置', icon: 'TriangleAlert' },
  { type: 'fans', title: '通风系统', icon: 'Fan' },
  { type: 'inventory', title: '物品柜', icon: 'BriefcaseMedical' },
  { type: 'logs', title: '系统日志', icon: 'ScrollText' },
  { type: 'operations', title: '操作记录', icon: 'ListChecks' },
  { type: 'load', title: '加载工况', icon: 'FolderOpen' },
  { type: 'save', title: '保存工况', icon: 'Save' },
  { type: 'settings', title: '系统设置', icon: 'Settings' },
  { type: 'introduction', title: '系统介绍', icon: 'Info' },
  { type: 'debug', title: '仿真调试', icon: 'Bug' },
] as const

export const pageAliases: Record<string, string> = {
  '首页': 'overview', '返回首页': 'overview', '返回主页': 'overview',
  '氮气供应撬块': 'nitrogen', '氮气间': 'nitrogen', '加注前端撬块': 'bunkering-front',
  '加注站': 'bunkering-front', '燃料舱': 'fuel-tank', '加注前端': 'bunkering-front',
  '加注撬块': 'bunkering', '燃料舱隔离空舱': 'fuel-tank', '储罐隔离空舱': 'fuel-tank',
  'LFSS撬块': 'lfss', '燃料准备间': 'lfss', '燃料整备间': 'lfss',
  '甲醇发动机机舱': 'engine', '冷热水撬块': 'water', '回收撬块': 'recovery',
  '总控室': 'control', '加注作业前安全检查表': 'safety', '教师主页': 'teacher', '学生主页': 'student',
}
