// Original WPF parameters: ISensorManager.cs, valve.xlsx, ItemCab.xaml.cs.
export interface SensorDefinition {
  id: string
  name: string
  room: string
  sensorType: string
  unit: string
  min: number
  max: number
  lowLow: number | null
  low: number | null
  high: number | null
  highHigh: number | null
}
export interface ValveDefinition {
  id: string
  name: string
  valveType: string
  size: string
  pressure: string
  material: string
  certificate: string
  section: string
}
export interface CabinetItem {
  id: string
  category: string
  name: string
  description: string
  url: string
  format: string
}

export const sensorDefinitions: SensorDefinition[] = [
  {"id": "Pit7A", "name": "氮气室风压传感器", "room": "氮气吹扫系统", "sensorType": "压力变送器", "unit": "Pa", "min": -100.0, "max": 50.0, "lowLow": null, "low": null, "high": -50.0, "highHigh": null},
  {"id": "Pit66", "name": "氮气瓶组压力", "room": "氮气吹扫系统", "sensorType": "压力变送器", "unit": "MPa", "min": 0.0, "max": 25.0, "lowLow": null, "low": 1.5, "high": 15.0, "highHigh": null},
  {"id": "Pit67", "name": "氮气瓶组供气压力", "room": "氮气吹扫系统", "sensorType": "压力变送器", "unit": "MPa", "min": 0.0, "max": 2.5, "lowLow": null, "low": 0.7, "high": 1.2, "highHigh": null},
  {"id": "Do71", "name": "氮气总管氧含量浓度", "room": "氮气吹扫系统", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 30.0, "lowLow": null, "low": null, "high": 5.0, "highHigh": 5.0},
  {"id": "Do701", "name": "氮气间氧含量浓度1", "room": "氮气吹扫系统", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 30.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Do702", "name": "氮气间氧含量浓度2", "room": "氮气吹扫系统", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 30.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pit101", "name": "甲醇燃料舱压力", "room": "燃料舱", "sensorType": "压力变送器", "unit": "kPa", "min": -25.0, "max": 25.0, "lowLow": null, "low": 3.0, "high": 18.0, "highHigh": null},
  {"id": "Tit101", "name": "甲醇燃料舱温度", "room": "燃料舱", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": 5.0, "high": 45.0, "highHigh": null},
  {"id": "Lit101", "name": "甲醇燃料舱液位高高", "room": "燃料舱", "sensorType": "液位变送器", "unit": "mm", "min": 0.0, "max": 2000.0, "lowLow": 100.0, "low": null, "high": 1960.0, "highHigh": 1960.0},
  {"id": "Lit102", "name": "甲醇燃料舱液位高", "room": "燃料舱", "sensorType": "液位变送器", "unit": "mm", "min": 0.0, "max": 2000.0, "lowLow": null, "low": 400.0, "high": 1900.0, "highHigh": null},
  {"id": "Do101", "name": "甲醇燃料舱氧含量浓度", "room": "燃料舱", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 30.0, "lowLow": null, "low": null, "high": 8.0, "highHigh": null},
  {"id": "Tit21", "name": "甲醇燃料舱出口温度", "room": "燃料舱", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Fq101", "name": "甲醇流量", "room": "燃料舱", "sensorType": "质量流量计", "unit": "kg/h", "min": 0.0, "max": 3000.0, "lowLow": 300.0, "low": 300.0, "high": null, "highHigh": null},
  {"id": "Pit1A", "name": "燃料隔离空舱风压传感器", "room": "燃料隔离空舱", "sensorType": "压力变送器", "unit": "Pa", "min": -100.0, "max": 50.0, "lowLow": null, "low": null, "high": -50.0, "highHigh": null},
  {"id": "Di11", "name": "隔离空舱1号可燃气体浓度", "room": "燃料隔离空舱", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Pit2A", "name": "燃料准备间风压传感器", "room": "燃料准备间", "sensorType": "压力变送器", "unit": "Pa", "min": -100.0, "max": 50.0, "lowLow": null, "low": null, "high": -50.0, "highHigh": null},
  {"id": "Pit41", "name": "燃料准备间风机压力", "room": "燃料准备间", "sensorType": "压力变送器", "unit": "kPa", "min": -1.0, "max": 1.0, "lowLow": -50.0, "low": -50.0, "high": 0.0, "highHigh": 0.0},
  {"id": "Di41", "name": "燃料准备间1号可燃气体浓度", "room": "燃料准备间", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Pit31", "name": "1号主机通风双壁管压力", "room": "甲醇发动机机舱", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": -50.0, "low": -50.0, "high": 0.0, "highHigh": 0.0},
  {"id": "Pit32", "name": "2号主机通风双壁管压力", "room": "甲醇发动机机舱", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": -50.0, "low": -50.0, "high": 0.0, "highHigh": 0.0},
  {"id": "Di31", "name": "1号主机处所可燃气体浓度", "room": "甲醇发动机机舱", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Di32", "name": "2号主机处所可燃气体浓度", "room": "甲醇发动机机舱", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Ef101", "name": "主机1号燃料消耗流量", "room": "甲醇发动机机舱", "sensorType": "质量流量计", "unit": "kg/h", "min": 0.0, "max": 2.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Ef102", "name": "主机1号燃料消耗流量", "room": "甲醇发动机机舱", "sensorType": "质量流量计", "unit": "kg/h", "min": 0.0, "max": 2.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Er101", "name": "主机1号转速", "room": "甲醇发动机机舱", "sensorType": "转速", "unit": "r/min", "min": 0.0, "max": 500.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Er102", "name": "主机1号转速", "room": "甲醇发动机机舱", "sensorType": "转速", "unit": "r/min", "min": 0.0, "max": 500.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Et101", "name": "主机1号温度", "room": "甲醇发动机机舱", "sensorType": "温度变送器", "unit": "℃", "min": 0.0, "max": 500.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Et102", "name": "主机1号温度", "room": "甲醇发动机机舱", "sensorType": "温度变送器", "unit": "℃", "min": 0.0, "max": 500.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Ep101", "name": "主机1号运行功率", "room": "甲醇发动机机舱", "sensorType": "功率", "unit": "kW", "min": 0.0, "max": 1000.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Ep102", "name": "主机1号运行功率", "room": "甲醇发动机机舱", "sensorType": "功率", "unit": "kW", "min": 0.0, "max": 1000.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pit61", "name": "加注站气相双壁管氮封压力", "room": "加注站", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.0, "low": 3.0, "high": 10.0, "highHigh": null},
  {"id": "Pit62", "name": "加注站液相双壁管氮封压力", "room": "加注站", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.0, "low": 3.0, "high": 10.0, "highHigh": null},
  {"id": "Pit72", "name": "加注站控制空气压力", "room": "加注站", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.5, "low": 4.0, "high": 8.0, "highHigh": null},
  {"id": "Di61", "name": "加注站可燃气体浓度", "room": "加注站", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Pit42", "name": "循环泵出口压力", "room": "机舱冷热水撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": null, "low": 3.0, "high": null, "highHigh": null},
  {"id": "Tit41", "name": "循环泵入口温度", "room": "机舱冷热水撬块", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": 5.0, "high": null, "highHigh": null},
  {"id": "Tit42", "name": "冷热水系统出口温度", "room": "机舱冷热水撬块", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": 15.0, "high": 45.0, "highHigh": null},
  {"id": "Pit75", "name": "水系统控制空气压力", "room": "机舱冷热水撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.5, "low": 4.0, "high": 8.0, "highHigh": null},
  {"id": "Pit501", "name": "收集舱压力", "room": "甲板回收撬", "sensorType": "压力变送器", "unit": "kPa", "min": -25.0, "max": 25.0, "lowLow": null, "low": 3.0, "high": 18.0, "highHigh": null},
  {"id": "Pit51", "name": "回收泵出口压力", "room": "甲板回收撬", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Lit51", "name": "收集舱液位", "room": "甲板回收撬", "sensorType": "液位变送器", "unit": "mm", "min": 0.0, "max": 2000.0, "lowLow": null, "low": null, "high": 1900.0, "highHigh": null},
  {"id": "Di401", "name": "膨胀水柜可燃气体浓度", "room": "水乙二醇水箱", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Pit21", "name": "升压泵出口压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": null, "low": 3.0, "high": 9.5, "highHigh": null},
  {"id": "Pit22", "name": "流量计出口压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pit23", "name": "稳压装置压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": null, "low": null, "high": 10.0, "highHigh": null},
  {"id": "Pit71", "name": "LFSS供应撬控制空气压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.5, "low": 4.0, "high": 8.0, "highHigh": null},
  {"id": "Pit73", "name": "隔膜泵控制空气压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.5, "low": 4.0, "high": 8.0, "highHigh": null},
  {"id": "Pit74", "name": "氮气系统控制空气压力", "room": "加注撬块", "sensorType": "压力变送器", "unit": "bar", "min": 0.0, "max": 10.0, "lowLow": 3.5, "low": 4.0, "high": 8.0, "highHigh": null},
  {"id": "Tit22", "name": "流量计出口温度", "room": "加注撬块", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": 15.0, "high": 45.0, "highHigh": null},
  {"id": "Tit23", "name": "加热器出口温度", "room": "加注撬块", "sensorType": "温度变送器", "unit": "℃", "min": -20.0, "max": 80.0, "lowLow": null, "low": 15.0, "high": 45.0, "highHigh": null},
  {"id": "Pit24", "name": "保护设备储藏间风机压力", "room": "其它", "sensorType": "压力变送器", "unit": "kPa", "min": -1.0, "max": 1.0, "lowLow": null, "low": -50.0, "high": 0.0, "highHigh": null},
  {"id": "Di13", "name": "轴隧舱1号可燃气体浓度", "room": "其它", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Di14", "name": "轴隧舱2号可燃气体浓度", "room": "其它", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Di21", "name": "保护设备储藏间可燃气体浓度", "room": "其它", "sensorType": "可燃气体探测器", "unit": "%LEL", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": 20.0, "highHigh": 40.0},
  {"id": "Do21", "name": "保护设备储藏间氧含量浓度", "room": "其它", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 30.0, "lowLow": null, "low": 19.5, "high": null, "highHigh": null},
  {"id": "Pit0", "name": "风机压力", "room": "其它", "sensorType": "压力变送器", "unit": "kPa", "min": -70.0, "max": 10.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pm61", "name": "加注站液相进口压力", "room": "其它", "sensorType": "压力表", "unit": "bar", "min": 0.0, "max": 16.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pm62", "name": "加注站气相进口压力", "room": "其它", "sensorType": "压力表", "unit": "bar", "min": 0.0, "max": 16.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pm63", "name": "加注站气相进口压力", "room": "其它", "sensorType": "压力表", "unit": "bar", "min": 0.0, "max": 16.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Pm64", "name": "加注站液相进口压力", "room": "其它", "sensorType": "压力表", "unit": "bar", "min": 0.0, "max": 16.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Do201", "name": "流入燃料罐前的氧气浓度", "room": "其它", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Do202", "name": "惰化软管后的氧气浓度", "room": "其它", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
  {"id": "Do203", "name": "流出燃料罐前的氧气浓度", "room": "其它", "sensorType": "氧含量传感器", "unit": "%V/V", "min": 0.0, "max": 100.0, "lowLow": null, "low": null, "high": null, "highHigh": null},
]

export const valveDefinitions: ValveDefinition[] = [
  {"id": "V1101", "name": "燃料舱氮气吹扫阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1101", "name": "燃料舱氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1102", "name": "燃料舱出口阀", "valveType": "球阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1201", "name": "1号升压泵入口阀", "valveType": "球阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1202", "name": "2号升压泵入口阀", "valveType": "球阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1203", "name": "换热器甲醇出口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1206", "name": "过滤器甲醇出口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1207", "name": "甲醇流量计出口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1210", "name": "初滤器排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1211", "name": "1号升压泵排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1212", "name": "2号升压泵排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1213", "name": "双联滤器排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1214", "name": "甲醇换热器排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1231", "name": "1号主机甲醇供应阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1232", "name": "2号主机甲醇供应阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1201", "name": "1号升压泵出口止回阀", "valveType": "截止止回阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1202", "name": "2号升压泵出口止回阀", "valveType": "截止止回阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1203", "name": "燃料舱出口氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1207", "name": "回收管路氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1208", "name": "缓冲装置出口止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1303", "name": "1号双壁管排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1304", "name": "2号双壁管排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1411", "name": "1号主机供气阀组氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1421", "name": "2号主机供气阀组氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1412", "name": "1号主机双壁管氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1422", "name": "2号主机双壁管氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1501", "name": "1号回收泵入口阀", "valveType": "球阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1502", "name": "2号回收泵入口阀", "valveType": "球阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1503", "name": "回收舱氮封阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1501", "name": "1号回收泵出口止回阀", "valveType": "截止止回阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1502", "name": "2号回收泵出口止回阀", "valveType": "截止止回阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1601", "name": "气相甲醇加注阀", "valveType": "球阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1602", "name": "液相甲醇加注阀", "valveType": "球阀", "size": "DN50", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "一、手动阀"},
  {"id": "V1603", "name": "气相管路入口气体排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1604", "name": "液相管路入口气体排放阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1605", "name": "加注站集液盘排放阀", "valveType": "球阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1606", "name": "加注站集液盘放空阀", "valveType": "球阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1608", "name": "回收罐废液排岸阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1609", "name": "加注站氮气管路阀", "valveType": "球阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1603", "name": "气相管路入口氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "D1604", "name": "液相管路入口氮气吹扫止回阀", "valveType": "截止止回阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1401", "name": "加热器入口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "镀锌碳钢", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1402", "name": "加热器出口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "镀锌碳钢", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1403", "name": "水泵出口阀", "valveType": "球阀", "size": "DN25", "pressure": "PN16", "material": "镀锌碳钢", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1404", "name": "膨胀柜水箱入口阀", "valveType": "球阀", "size": "DN32", "pressure": "PN16", "material": "镀锌碳钢", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1701", "name": "氮气撬入口截止阀", "valveType": "高压截止阀", "size": "DN25", "pressure": "0~20MPA", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1702", "name": "氮气撬出口截止阀", "valveType": "低压截止阀", "size": "DN25", "pressure": "PN25", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "V1703", "name": "氮气撬旁路截止阀", "valveType": "高压截止阀", "size": "DN25", "pressure": "0~20MPA", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "C1701", "name": "氮气撬装置减压阀", "valveType": "双极双表减压器", "size": "DN25", "pressure": "0~20MPA", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "C1702", "name": "氮气撬氧含量检测管路减压阀", "valveType": "气体减压阀", "size": "1/8", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "一、手动阀"},
  {"id": "M1101", "name": "燃料舱气相甲醇加注入口控制阀", "valveType": "紧急气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "M1102", "name": "燃料舱液相甲醇加注入口控制阀", "valveType": "紧急气动切断阀", "size": "DN50", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "H1423", "name": "燃料舱集液盘排放阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "M1201", "name": "燃料舱甲醇出口紧急切断阀", "valveType": "紧急气动切断阀", "size": "DN32", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "H1201", "name": "燃料罐出口氮气吹扫阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1241", "name": "氮气透气控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1242", "name": "1号双截止控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1243", "name": "2号双截止控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1230", "name": "供气撬集液盘排放阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1231", "name": "燃料准备间污水井排放阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "M1301", "name": "1号主机甲醇供应紧急切断阀", "valveType": "紧急气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "M1302", "name": "2号主机甲醇供应紧急切断阀", "valveType": "紧急气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "H1412", "name": "1号FVT氮气吹扫控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1422", "name": "2号FVT氮气吹扫控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1432", "name": "1号主机双壁管氮气吹扫控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1442", "name": "2号主机双壁管氮气吹扫控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1301", "name": "1号主机回流控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1302", "name": "2号主机回流控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1411", "name": "1号FVT氮气吹扫回流控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1421", "name": "2号FVT氮气吹扫回流控制阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1501", "name": "隔膜泵入口控制阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1502", "name": "回收罐排岸控制阀", "valveType": "气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1503", "name": "回收集舱控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "M1601", "name": "甲醇气相加注入口紧急切断阀", "valveType": "紧急气动切断阀", "size": "DN40", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "M1602", "name": "甲醇液相加注入口紧急切断阀", "valveType": "紧急气动切断阀", "size": "DN50", "pressure": "PN16", "material": "不锈钢304", "certificate": "C/E", "section": "二、气动阀"},
  {"id": "H1710", "name": "氮气管总控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1711", "name": "氮气管排气控制阀", "valveType": "气动切断阀", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1401", "name": "江水入口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1402", "name": "江水出口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1403", "name": "1号淡水入口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1404", "name": "2号淡水入口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1405", "name": "1号淡水出口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "H1406", "name": "2号淡水出口控制阀", "valveType": "气动切断阀", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "二、气动阀"},
  {"id": "C1201", "name": "甲醇回液调节阀", "valveType": "", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "三、气动调节阀"},
  {"id": "C01", "name": "调节阀", "valveType": "", "size": "DN15", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "三、气动调节阀"},
  {"id": "C1401", "name": "换热器出口三通调节阀", "valveType": "", "size": "DN25", "pressure": "PN16", "material": "不锈钢304", "certificate": "TA", "section": "三、气动调节阀"},
  {"id": "A1201", "name": "升压泵出口安全阀", "valveType": "", "size": "", "pressure": "", "material": "不锈钢304", "certificate": "C/E", "section": "四、安全阀"},
  {"id": "A1701", "name": "氮气出口安全阀", "valveType": "", "size": "", "pressure": "", "material": "不锈钢304", "certificate": "C/E", "section": "四、安全阀"},
]

export const cabinetItems: CabinetItem[] = [
  {"id": "cab-01", "category": "医疗用品", "name": "体温枪", "description": "体温枪是一种用于快速测量人体体温的医疗设备，常用于筛查发热症状，帮助及时发现传染病患者。", "url": "/simulator-web/assets/models/医疗用品/体温枪.obj", "format": "obj"},
  {"id": "cab-02", "category": "医疗用品", "name": "口罩", "description": "口罩用于遮盖口鼻，防止飞沫传播，保护个人和他人免受呼吸道疾病侵害，是疫情防控的重要防护用品。", "url": "/simulator-web/assets/models/医疗用品/口罩.obj", "format": "obj"},
  {"id": "cab-03", "category": "医疗用品", "name": "呼吸罐", "description": "呼吸罐是一种用于辅助呼吸的装置，可帮助用户在缺氧或需要额外氧气支持时维持正常呼吸功能。", "url": "/simulator-web/assets/models/医疗用品/呼吸罐.obj", "format": "obj"},
  {"id": "cab-04", "category": "医疗用品", "name": "手套", "description": "手套用于保护手部，防止寒冷、伤害或污垢，同时方便进行精细操作或保暖。", "url": "/simulator-web/assets/models/医疗用品/手套.obj", "format": "obj"},
  {"id": "cab-05", "category": "医疗用品", "name": "消毒液", "description": "消毒液用于杀灭细菌、病毒等病原体，起到清洁和预防感染的作用。", "url": "/simulator-web/assets/models/医疗用品/消毒液obj.obj", "format": "obj"},
  {"id": "cab-06", "category": "医疗用品", "name": "葡萄糖䃼水液", "description": "葡萄糖䃼水液用于补充能量，适用于术后恢复、低血糖及需要快速补充电解质的患者", "url": "/simulator-web/assets/models/医疗用品/瓶子.obj", "format": "obj"},
  {"id": "cab-07", "category": "医疗用品", "name": "药", "description": "“药”用于治疗疾病、缓解症状，帮助人体恢复健康，是医疗保健的重要手段。", "url": "/simulator-web/assets/models/医疗用品/药.obj", "format": "obj"},
  {"id": "cab-08", "category": "医疗用品", "name": "镊子", "description": "镊子是一种用于夹取细小物体的工具，常用于医学、实验室和维修工作中，能精确操作微小部件。", "url": "/simulator-web/assets/models/医疗用品/镊子.obj", "format": "obj"},
  {"id": "cab-09", "category": "消防设施", "name": "灭火器", "description": "灭火器用于扑灭初起火灾，控制火势蔓延，保护人员和财产安全，是消防安全的重要工具。", "url": "/simulator-web/assets/models/消防设施/灭火器.obj", "format": "obj"},
  {"id": "cab-10", "category": "消防设施", "name": "防护服", "description": "防护服用于保护人员在火灾或危险环境中免受热辐射、火焰和有毒气体的伤害，确保安全作业。", "url": "/simulator-web/assets/models/消防设施/防护服.obj", "format": "obj"},
  {"id": "cab-11", "category": "消防设施", "name": "面罩", "description": "面罩用于保护面部免受火焰、烟雾和飞溅物的伤害，是消防员在灭火和救援时的重要防护装备。", "url": "/simulator-web/assets/models/消防设施/防毒面具.obj", "format": "obj"},
  {"id": "cab-12", "category": "设备组件", "name": "90长半径弯头", "description": "90长半径弯头用于管道系统中实现方向转变，具有较大的弯曲半径，减少流体阻力，适用于需要较大曲率的场合。", "url": "/simulator-web/assets/models/设备组件/90长半径弯头.obj", "format": "obj"},
  {"id": "cab-13", "category": "设备组件", "name": "bfc系列空气过滤组", "description": "bfc系列空气过滤组用于高效过滤空气中的颗粒物和污染物，保障设备运行环境的清洁与稳定。", "url": "/simulator-web/assets/models/设备组件/bfc系列空气过滤组 (2).obj", "format": "obj"},
  {"id": "cab-14", "category": "设备组件", "name": "svs三片式调节型球阀", "description": "“svs三片式调节型球阀”用于精确控制流体流量，具备调节功能，适用于多种工况下的阀门调节需求。", "url": "/simulator-web/assets/models/设备组件/svs三片式调节型球阀.obj", "format": "obj"},
  {"id": "cab-15", "category": "设备组件", "name": "u型螺栓管夹", "description": "U型螺栓管夹用于固定管道或金属部件，通过螺栓紧固实现牢固连接，适用于各种工业和建筑场景。", "url": "/simulator-web/assets/models/设备组件/u型螺栓管夹.obj", "format": "obj"},
  {"id": "cab-16", "category": "设备组件", "name": "ysvs三片式气动球阀", "description": "ysvs三片式气动球阀用于控制气体流动，具备良好的密封性和调节性能，适用于工业自动化系统中的介质流通控制。", "url": "/simulator-web/assets/models/设备组件/ysvs三片式气动球阀.obj", "format": "obj"},
  {"id": "cab-17", "category": "设备组件", "name": "单联通滤组", "description": "“单联通滤组”用于过滤和分离流体中的杂质，确保系统运行畅通，提高设备效率与稳定性。", "url": "/simulator-web/assets/models/设备组件/单联通滤组.3ds", "format": "3ds"},
  {"id": "cab-18", "category": "设备组件", "name": "压力变送器", "description": "压力变送器用于测量和传输流体或气体的压力值，是工业过程控制中的关键传感元件。", "url": "/simulator-web/assets/models/设备组件/压力变送器.obj", "format": "obj"},
  {"id": "cab-19", "category": "设备组件", "name": "双联蓝式滤器", "description": "双联蓝式滤器用于过滤液体中的杂质，确保流体清洁，提高设备运行效率和使用寿命。", "url": "/simulator-web/assets/models/设备组件/双联蓝式滤器.3ds", "format": "3ds"},
  {"id": "cab-20", "category": "设备组件", "name": "异径三通", "description": "异径三通用于连接不同直径的管道，使流体在不同管径间顺利转换，确保系统运行顺畅。", "url": "/simulator-web/assets/models/设备组件/异径三通.obj", "format": "obj"},
  {"id": "cab-21", "category": "设备组件", "name": "手动球阀手柄型", "description": "手动球阀手柄型用于控制流体通断，通过旋转手柄操作阀门开闭，结构简单、操作方便，适用于一般工况下的开关控制。", "url": "/simulator-web/assets/models/设备组件/手动球阀手柄型.obj", "format": "obj"},
  {"id": "cab-22", "category": "设备组件", "name": "换热器", "description": "换热器用于实现不同流体之间的热量交换，常用于加热、冷却或温度调节等过程。", "url": "/simulator-web/assets/models/设备组件/换热器.obj", "format": "obj"},
  {"id": "cab-23", "category": "设备组件", "name": "接线柜", "description": "接线柜用于汇集和分配电力线路，实现电气设备之间的连接与控制，确保电路安全运行。", "url": "/simulator-web/assets/models/设备组件/接线柜.obj", "format": "obj"},
  {"id": "cab-24", "category": "设备组件", "name": "板式平焊钢制管法兰", "description": "板式平焊钢制管法兰用于连接管道与设备，提供密封和支撑作用，确保系统安全运行。", "url": "/simulator-web/assets/models/设备组件/板式平焊钢制管法兰1.obj", "format": "obj"},
  {"id": "cab-25", "category": "设备组件", "name": "模型组", "description": "“模型组”用于集中管理与展示各类设备模型，便于系统配置、调试及可视化操作。", "url": "/simulator-web/assets/models/设备组件/17.obj", "format": "obj"},
  {"id": "cab-26", "category": "设备组件", "name": "止回阀", "description": "止回阀用于防止流体倒流，确保介质单向流动，保障系统安全和稳定运行。", "url": "/simulator-web/assets/models/设备组件/止回阀.obj", "format": "obj"},
  {"id": "cab-27", "category": "设备组件", "name": "氧气罐", "description": "氧气罐用于提供高浓度氧气，支持生命维持、医疗治疗及工业过程中的氧供应需求。", "url": "/simulator-web/assets/models/设备组件/氧气罐.obj", "format": "obj"},
  {"id": "cab-28", "category": "设备组件", "name": "温度变送器", "description": "温度变送器用于将温度传感器检测到的温度信号转换为标准电信号，便于远距离传输和显示、记录。", "url": "/simulator-web/assets/models/设备组件/温度变送器.obj", "format": "obj"},
  {"id": "cab-29", "category": "设备组件", "name": "焊接截止阀", "description": "焊接截止阀用于控制流体流动，具备密封性好、结构紧凑的特点，常用于管道系统中实现流体的截止与调节。", "url": "/simulator-web/assets/models/设备组件/焊接截止阀.obj", "format": "obj"},
  {"id": "cab-30", "category": "设备组件", "name": "电磁阀", "description": "电磁阀通过电磁力控制流体通断，用于调节或切换液体、气体等介质的流动方向和压力，广泛应用于自动化控制系统中。", "url": "/simulator-web/assets/models/设备组件/电磁阀.obj", "format": "obj"},
  {"id": "cab-31", "category": "设备组件", "name": "直角安全阀", "description": "直角安全阀用于保护设备免受过压损坏，通过在压力超过设定值时自动泄压，确保系统安全运行。", "url": "/simulator-web/assets/models/设备组件/直角安全阀.obj", "format": "obj"},
  {"id": "cab-32", "category": "设备组件", "name": "磁力泵", "description": "磁力泵通过电磁力驱动液体输送，具有无泄漏、安全可靠的特点，常用于化工、制药等需要密封性高的场合。", "url": "/simulator-web/assets/models/设备组件/磁力泵.obj", "format": "obj"},
  {"id": "cab-33", "category": "设备组件", "name": "突面对焊钢", "description": "“突面对焊钢”用于增强结构连接强度，通过面对面焊接方式提高设备组件的稳定性与密封性。", "url": "/simulator-web/assets/models/设备组件/突面对焊钢.3ds", "format": "3ds"},
  {"id": "cab-34", "category": "设备组件", "name": "等径三通", "description": "等径三通用于连接三个等直径管道，使流体或介质在不同方向均匀分流或汇合，确保流量平衡和系统稳定。", "url": "/simulator-web/assets/models/设备组件/等径三通.obj", "format": "obj"},
  {"id": "cab-35", "category": "设备组件", "name": "缓冲罐体", "description": "缓冲罐体用于吸收和储存流体冲击能量，减少系统震动，保护设备免受压力波动影响，确保运行稳定与安全。", "url": "/simulator-web/assets/models/设备组件/缓冲罐体.obj", "format": "obj"},
  {"id": "cab-36", "category": "设备组件", "name": "质量流体计", "description": "质量流体计用于测量液体或气体的质量流量，广泛应用于化工、冶金等工业领域，确保生产过程中的精确控制与安全运行。", "url": "/simulator-web/assets/models/设备组件/质量流体计.obj", "format": "obj"},
  {"id": "cab-37", "category": "设备组件", "name": "燃料储罐", "description": "燃料储罐是用于储存和供应燃料的关键部件，确保设备运行时燃料的稳定供给与安全控制。", "url": "/simulator-web/assets/models/设备组件/燃料储罐.3ds", "format": "3ds"},
]

export const sensorRooms = ['全部', ...new Set(sensorDefinitions.map(sensor => sensor.room))]

export const fanRooms = [
  { name: '氮气间通风系统', room: '氮气吹扫系统', page: 'nitrogen', sensorId: 'Pit7A', masterId: 'FanForPit7AMaster', backupId: 'FanForPit7ABackup' },
  { name: '燃料隔离空仓通风系统', room: '燃料隔离空舱', page: 'fuel-tank', sensorId: 'Pit1A', masterId: 'FanForPit1AMaster', backupId: 'FanForPit1ABackup' },
  { name: '燃料准备间', room: '燃料准备间', page: 'lfss', sensorId: 'Pit2A', masterId: 'FanForPit2AMaster', backupId: 'FanForPit2ABackup' },
] as const

export const settingTabs = ['流程', '学员端', '教练端', '其它设置', '关于']
export const debugTabs = ['动作', '设备', '管道', '连管', '动画', '连结', '寻充']
export const faultKinds = [
  { id: 'failure', name: '运行异常 / 设备故障', description: '停止设备正常工作并产生异常报警。' },
  { id: 'disabled', name: '禁止用户操作', description: '锁定设备，复位前不能通过普通设备窗口操作。' },
  { id: 'stuck', name: '阀门卡滞', description: '将阀门固定到指定开度并锁定操作。' },
  { id: 'freeze', name: '传感器冻结 / 关闭更新', description: '保持指定测量值，不接受自动仿真更新。' },
  { id: 'bias', name: '传感器偏差', description: '在当前测量值上叠加指定偏移量。' },
  { id: 'leak', name: '甲醇泄漏', description: '标记泄漏并触发严重报警；可复位回安全状态。' },
] as const

export const defaultSettings: Record<string, string | number | boolean> = {
  bunkerFlow: 600, serverAddress: 'ws://127.0.0.1:5000', localCoach: true, imageQuality: '高',
  successAutoClose: true, successCloseMs: 2000, informationAutoClose: true, informationCloseMs: 3000,
  warningAutoClose: false, warningCloseMs: 5000, errorAutoClose: false, errorCloseMs: 5000,
  criticalAutoClose: false, criticalCloseMs: 5000, highlightMs: 5000,
  autoNitrogenFan: true, autoFuelCutoff: true, autoFuelPump: true,
  autoPreparationFan: true, autoCofferdamFan: true, autoWater: true,
  muted: false, flashOff: false,
}

export const autoSettingItems = [
  { key: 'autoNitrogenFan', label: '氮气间风机异常自动切换' },
  { key: 'autoFuelCutoff', label: '燃料供应泵全坏后自动断流' },
  { key: 'autoFuelPump', label: '燃料供应泵坏了自动切换' },
  { key: 'autoPreparationFan', label: '燃料装备间风机异常自动切换' },
  { key: 'autoCofferdamFan', label: '燃料隔离空仓风机异常自动切换' },
  { key: 'autoWater', label: '水乙二醇系统自动控制' },
] as const

export const promptSettingItems = [
  { key: 'success', label: '成功提示', symbol: '✅' },
  { key: 'information', label: '信息提示', symbol: 'ℹ️' },
  { key: 'warning', label: '警告提示', symbol: '⚠️' },
  { key: 'error', label: '错误提示', symbol: '❌' },
  { key: 'critical', label: '异常提示', symbol: '🛑' },
] as const

export interface LegendEntry { name: string; color?: string; image?: string }
export const legendGroups: { title: string; entries: LegendEntry[] }[] = [
  { title: '管路介质', entries: [
    { name: '氮气', color: '#f6c244' }, { name: '甲醇', color: '#a871c0' },
    { name: '低温水', color: '#4a9de4' }, { name: '高温水', color: '#e47659' }, { name: '水乙二醇', color: '#77b765' },
  ] },
  { title: '工艺元件', entries: [
    { name: '安全阀', image: '/simulator-web/assets/controls/SafetyValve.png' }, { name: '滤器', image: '/simulator-web/assets/controls/Filter.png' },
    { name: '换热器', image: '/simulator-web/assets/controls/Heater/Heater.png' }, { name: '双联滤器', image: '/simulator-web/assets/controls/双联滤器.png' },
    { name: '缓冲罐', image: '/simulator-web/assets/controls/BTTank.png' }, { name: '主(辅)机', image: '/simulator-web/assets/controls/Engine.png' },
    { name: '水箱', image: '/simulator-web/assets/controls/WaterTank.png' }, { name: '回收舱', image: '/simulator-web/assets/controls/回收舱.png' },
    { name: '燃料舱', image: '/simulator-web/assets/controls/FuelTank.png' }, { name: '压力传感器', image: '/simulator-web/assets/controls/Sensor.png' },
    { name: '温度传感器', image: '/simulator-web/assets/controls/Sensor.png' }, { name: '可燃气体探测仪', image: '/simulator-web/assets/controls/Sensor.png' },
    { name: '泵', image: '/simulator-web/assets/controls/Pump.png' }, { name: '氮气瓶', image: '/simulator-web/assets/controls/NitrogenCan.png' },
  ] },
]

export const deviceKindLabels: Record<string, string> = {
  valve: '阀门', pump: '泵', fan: '风机', engine: '主 / 辅机', dynamo: '主 / 辅机', sensor: '传感器',
  gauge: '仪表', 'digital-gauge': '数字仪表', tank: '燃料储罐', 'water-tank': '水箱', 'balance-tank': '缓冲罐',
  'nitrogen-cylinder': '氮气瓶', heater: '换热器 / 加热器', filter: '滤器', 'dual-filter': '双联滤器',
  hose: '软管', pipe: '管道', station: '加注设施', 'control-button': '控制按钮', knob: '旋钮', slider: '滑块',
}
