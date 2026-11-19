export interface SafetyItem {
  id: number
  name: string
  image?: string
  cabinet?: string
  target?: string
}
export interface SafetySection {
  id: string
  title: string
  bilateral: boolean
  items: SafetyItem[]
}

// Exact IDs and text from Simulator.Library/ViewModels/MainPart/CheckViewModel.cs.
export const safetySections: SafetySection[] = [
  {
    "id": "prepare",
    "title": "加注准备阶段检查表",
    "bilateral": true,
    "items": [
      {
        "id": 1,
        "name": "1. 符合当地和/或我国主管部门有关规定。"
      },
      {
        "id": 2,
        "name": "2. 所有强制性消防设备立即可用。",
        "cabinet": "消防设施"
      },
      {
        "id": 3,
        "name": "3. 甲醇蒸气探测设备均经过测试和校准，处于良好的状态且工作正常。"
      },
      {
        "id": 4,
        "name": "4. 作业人员已穿戴个人防护装备。",
        "cabinet": "消防设施"
      },
      {
        "id": 5,
        "name": "5. 加注接头下方配备围板和/或集液盘，且集液盘已清空。"
      },
      {
        "id": 6,
        "name": "6. 仪表、控制、切断和安全设备工作正常。"
      },
      {
        "id": 7,
        "name": "7. 已配备加注计划、加注操作手册和应急计划。"
      },
      {
        "id": 8,
        "name": "8. 参与作业的人员经过专门的培训，熟悉相关设备的操作程序。"
      },
      {
        "id": 9,
        "name": "9. 加注船和受注船已就系泊和护舷安排达成协议。"
      },
      {
        "id": 10,
        "name": "10. 加注船获得授权靠泊受注船。"
      },
      {
        "id": 11,
        "name": "11. 作业区域具有充分的照明。"
      },
      {
        "id": 12,
        "name": "12. 加注双方已议定传输和吹扫的操作程序。"
      },
      {
        "id": 13,
        "name": "13. 已商定并指定限制区域。"
      }
    ]
  },
  {
    "id": "pretransfer",
    "title": "预传输检查表",
    "bilateral": true,
    "items": [
      {
        "id": 20,
        "name": "1.A 部分已完成，且 A 部分中所述项目未发生改变。"
      },
      {
        "id": 21,
        "name": "2.已获得甲醇加注许可（如适用）并发出通知。"
      },
      {
        "id": 22,
        "name": "3. 天气和风浪条件在可接受的范围内。"
      },
      {
        "id": 23,
        "name": "4.船岸通道符合安全要求。"
      },
      {
        "id": 24,
        "name": "5.船舶保持随时自航移动的能力。"
      },
      {
        "id": 25,
        "name": "6.对受注船、槽罐加注车、加注船和岸站的燃料操作都有充分的监督。"
      },
      {
        "id": 26,
        "name": "7.已商定电气接地的模式。"
      },
      {
        "id": 27,
        "name": "8.建立有效的甲板观察。"
      },
      {
        "id": 28,
        "name": "9.加注方和受注方均建立有效的甲醇加注观察。"
      },
      {
        "id": 29,
        "name": "10.限制区域已设有警示牌且无无关人员进入。"
      },
      {
        "id": 30,
        "name": "11.限制区域内没有其他船舶，未经允许的人员、设备及点火源。"
      },
      {
        "id": 31,
        "name": "12.已对限制区域的电气和机械点火源进行控制。"
      },
      {
        "id": 32,
        "name": "13.受注船加注侧上层建筑或甲板室两侧的所有门、窗及其他开口和空气进口均应保持关闭状态。"
      },
      {
        "id": 33,
        "name": "14.已建立有效的通讯方式并通过测试。通信语言已商定。"
      },
      {
        "id": 34,
        "name": "15.急停信号和紧急切断程序已商定，且经测试。"
      },
      {
        "id": 35,
        "name": "16.加注双方已交换 ESD 的关闭时间。"
      },
      {
        "id": 36,
        "name": "17.已配备防高空坠物的程序。"
      },
      {
        "id": 37,
        "name": "18.甲醇传输泵及所有的遥控阀均处于良好的工作状态。"
      },
      {
        "id": 38,
        "name": "19.系统仪表、高液位报警器均可运行，设置正确且处于良好的工作状态。"
      },
      {
        "id": 39,
        "name": "20.受注船燃料舱在任何时候都应防止过充，持续监测舱容且正确设置报警装置。"
      },
      {
        "id": 40,
        "name": "21.甲醇探测设备经过运行测试且处于良好的工作状态。"
      },
      {
        "id": 41,
        "name": "22.加注作业人员已穿戴适当的人员防护设备。",
        "cabinet": "消防设施"
      },
      {
        "id": 42,
        "name": "23.船上的无线电发射天线已可靠接地。"
      },
      {
        "id": 43,
        "name": "24.(驱动式)紧急释放装置{( P) ERC} 已安装并立即可用。"
      },
      {
        "id": 44,
        "name": "25.软管、固定管路和支管都处于良好的状态，被正确装配、支撑、正确的连接。未使用的接头已关闭、盲板且螺栓固定。"
      },
      {
        "id": 45,
        "name": "26.加注系统连接好后经过泄漏测试。测试结果无泄漏。"
      },
      {
        "id": 46,
        "name": "27.加注方和受注船之间的加注系统设有干式断开装置。"
      },
      {
        "id": 47,
        "name": "28.加注系统上的干式断开装置已就位，经过目视检查，处于良好的工作状态。"
      },
      {
        "id": 48,
        "name": "29.加注方和受注船之间的加注系统设有适合的电气绝缘装置且已就位。"
      },
      {
        "id": 49,
        "name": "30.槽罐加注车电气接地，且车轮被楔住。"
      },
      {
        "id": 50,
        "name": "31.加注作业期间，槽罐加注车引擎熄火。"
      },
      {
        "id": 51,
        "name": "32.船舶消防控制图处于外部。"
      },
      {
        "id": 52,
        "name": "33.受注船已确认加注设施可开始作业。"
      }
    ]
  },
  {
    "id": "ship",
    "title": "船对船加注过程程序确认",
    "bilateral": false,
    "items": [
      {
        "id": 70,
        "name": "1. 加注开始"
      },
      {
        "id": 71,
        "name": "2. 批准（加注计划确认表）",
        "target": "plan"
      },
      {
        "id": 72,
        "name": "3. 两船兼容"
      },
      {
        "id": 73,
        "name": "4. 加注区满足要求。"
      },
      {
        "id": 74,
        "name": "5. 天气条件满足要求"
      },
      {
        "id": 75,
        "name": "6. 灯光条件满足要求"
      },
      {
        "id": 76,
        "name": "7. 准备完成"
      },
      {
        "id": 77,
        "name": "8. 储罐系统检查完毕"
      },
      {
        "id": 78,
        "name": "9. 系泊设备检查完毕"
      },
      {
        "id": 79,
        "name": "10. 加注设备检查完毕"
      },
      {
        "id": 80,
        "name": "11. 填写“加注准备阶段检查表”、“同步作业检查表”（如适用）和“甲醇传输检查表”",
        "target": "prepare"
      },
      {
        "id": 81,
        "name": "12. 准备"
      },
      {
        "id": 82,
        "name": "13. 呼叫"
      },
      {
        "id": 83,
        "name": "14. 安全通讯确认",
        "image": "/simulator-web/assets/branding/progress/图5.png"
      },
      {
        "id": 84,
        "name": "15. 系泊计划被同意"
      },
      {
        "id": 85,
        "name": "16. 加注船向受注船停靠"
      },
      {
        "id": 86,
        "name": "17. 护舷就位"
      },
      {
        "id": 87,
        "name": "18. 关闭雷达",
        "image": "/simulator-web/assets/branding/progress/图7.png"
      },
      {
        "id": 88,
        "name": "19. 系泊缆绳系好"
      },
      {
        "id": 89,
        "name": "20. 系泊缆绳监控"
      },
      {
        "id": 90,
        "name": "21. 系泊完成",
        "image": "/simulator-web/assets/branding/progress/图4.png"
      },
      {
        "id": 91,
        "name": "22. 通讯线路连接"
      },
      {
        "id": 92,
        "name": "23. 连接设备",
        "image": "/simulator-web/assets/branding/progress/图6.png"
      },
      {
        "id": 93,
        "name": "24. 填写“预传输检查表”",
        "target": "pretransfer"
      },
      {
        "id": 94,
        "name": "25. 传输量/速率确认"
      },
      {
        "id": 95,
        "name": "26. 打开手动阀"
      },
      {
        "id": 96,
        "name": "27. 开启准备信号"
      },
      {
        "id": 97,
        "name": "28. 打开泵"
      },
      {
        "id": 98,
        "name": "29. 是否泄漏"
      },
      {
        "id": 99,
        "name": "30. 系统工作正常"
      },
      {
        "id": 100,
        "name": "31. 开始加注"
      },
      {
        "id": 101,
        "name": "32. 没有异常情况"
      },
      {
        "id": 102,
        "name": "33. 加注完成"
      },
      {
        "id": 103,
        "name": "34. 停泵"
      },
      {
        "id": 104,
        "name": "35. 吹扫连接设备"
      },
      {
        "id": 105,
        "name": "36. 关闭手动阀"
      },
      {
        "id": 106,
        "name": "37. 解除连接设备"
      },
      {
        "id": 107,
        "name": "38. 加注设备归位"
      },
      {
        "id": 108,
        "name": "39. 吹扫/惰化管路"
      },
      {
        "id": 109,
        "name": "40. 填写“加注后检查表”",
        "target": "after"
      },
      {
        "id": 110,
        "name": "41. 解除通讯线接（可选）"
      },
      {
        "id": 111,
        "name": "42. 系泊缆绳解除",
        "image": "/simulator-web/assets/branding/progress/图8.png"
      },
      {
        "id": 112,
        "name": "43. 护舷收回"
      },
      {
        "id": 113,
        "name": "44. 雷达打开"
      },
      {
        "id": 114,
        "name": "45. 解缆完成"
      },
      {
        "id": 115,
        "name": "46. 靠泊船离开"
      },
      {
        "id": 116,
        "name": "47. 吹扫/惰化管路"
      },
      {
        "id": 117,
        "name": "48. 填写“加注后检查表”",
        "target": "after"
      },
      {
        "id": 118,
        "name": "49. 加注结束“加注签收单”",
        "target": "receipt"
      }
    ]
  },
  {
    "id": "truck",
    "title": "车对船加注过程程序确认",
    "bilateral": false,
    "items": [
      {
        "id": 120,
        "name": "1. 开始"
      },
      {
        "id": 121,
        "name": "2. 批准（加注计划确认表）",
        "target": "plan"
      },
      {
        "id": 122,
        "name": "3. 加注区满足要求"
      },
      {
        "id": 123,
        "name": "4. 天气条件满足要求"
      },
      {
        "id": 124,
        "name": "5. 灯光条件满足要求"
      },
      {
        "id": 125,
        "name": "6. 准备完成"
      },
      {
        "id": 126,
        "name": "7. 储罐系统检查完毕"
      },
      {
        "id": 127,
        "name": "8. 系泊设备检查完"
      },
      {
        "id": 128,
        "name": "9. 甲醇槽罐车到达指定位置"
      },
      {
        "id": 129,
        "name": "10. 甲醇槽罐车证书可用？"
      },
      {
        "id": 130,
        "name": "11. 甲醇槽罐车就位操作"
      },
      {
        "id": 131,
        "name": "12. 甲醇槽罐车位置合适？"
      },
      {
        "id": 132,
        "name": "13. 填写“加注准备阶段检查表”、“甲醇传输检查表”",
        "target": "prepare"
      },
      {
        "id": 133,
        "name": "14. 所有问题确认"
      },
      {
        "id": 134,
        "name": "15. 受注船操作人员确认控制系统和阀门已准备好"
      },
      {
        "id": 135,
        "name": "16. 槽罐车操作人员进行槽罐车接地操作"
      },
      {
        "id": 136,
        "name": "17. 连接设备",
        "image": "/simulator-web/assets/branding/progress/图10.png"
      },
      {
        "id": 137,
        "name": "18. 警示灯光开启"
      },
      {
        "id": 138,
        "name": "19. 填写“预传输检查表”",
        "target": "pretransfer"
      },
      {
        "id": 139,
        "name": "20. 传输量/速率确认"
      },
      {
        "id": 140,
        "name": "21. 打开手动阀"
      },
      {
        "id": 141,
        "name": "22. 开启准备信号"
      },
      {
        "id": 142,
        "name": "23. 槽罐车操作人员打开泵"
      },
      {
        "id": 143,
        "name": "24. 是否泄漏"
      },
      {
        "id": 144,
        "name": "25. 系统工作正常"
      },
      {
        "id": 145,
        "name": "26. 开始加注"
      },
      {
        "id": 146,
        "name": "27. 无异常情况"
      },
      {
        "id": 147,
        "name": "28. 加注完成"
      },
      {
        "id": 148,
        "name": "29. 停泵"
      },
      {
        "id": 149,
        "name": "30. 吹扫连接设备"
      },
      {
        "id": 150,
        "name": "31. 关闭手动"
      },
      {
        "id": 151,
        "name": "32. 解除连接设备"
      },
      {
        "id": 152,
        "name": "33. 吹扫/惰化管路"
      },
      {
        "id": 153,
        "name": "34. 填写“加注后检查表”",
        "target": "after"
      },
      {
        "id": 154,
        "name": "35. 结束“加注签收单”",
        "target": "receipt"
      }
    ]
  },
  {
    "id": "shore",
    "title": "岸对船加注过程程序确认",
    "bilateral": false,
    "items": [
      {
        "id": 160,
        "name": "1. 开始"
      },
      {
        "id": 161,
        "name": "2. 批准（加注计划确认表）",
        "target": "plan"
      },
      {
        "id": 162,
        "name": "3. 两船兼容"
      },
      {
        "id": 163,
        "name": "4. 加注区满足要求"
      },
      {
        "id": 164,
        "name": "5. 天气条件满足要求"
      },
      {
        "id": 165,
        "name": "6. 灯光条件满足要求"
      },
      {
        "id": 166,
        "name": "7. 准备完成"
      },
      {
        "id": 167,
        "name": "8. 储罐系统检查完毕"
      },
      {
        "id": 168,
        "name": "9. 系泊设备检查完毕"
      },
      {
        "id": 169,
        "name": "10. 加注设备检查完毕"
      },
      {
        "id": 170,
        "name": "11. 填写“加注准备阶段检查表”、“同步作业检查表”（如适用）和“甲醇传输检查表”",
        "target": "prepare"
      },
      {
        "id": 171,
        "name": "12. 准备"
      },
      {
        "id": 172,
        "name": "13. 呼叫"
      },
      {
        "id": 173,
        "name": "14. 安全通讯确认",
        "image": "/simulator-web/assets/branding/progress/图5.png"
      },
      {
        "id": 174,
        "name": "15. 系泊计划被同意"
      },
      {
        "id": 175,
        "name": "16. 同意系泊计划"
      },
      {
        "id": 176,
        "name": "17. 受注船向岸站停靠"
      },
      {
        "id": 177,
        "name": "18. 关闭雷达",
        "image": "/simulator-web/assets/branding/progress/图7.png"
      },
      {
        "id": 178,
        "name": "19. 系泊缆绳系好",
        "image": "/simulator-web/assets/branding/progress/图9.png"
      },
      {
        "id": 179,
        "name": "20. 系泊缆绳监控"
      },
      {
        "id": 180,
        "name": "21. 系泊完成"
      },
      {
        "id": 181,
        "name": "22. 通讯线路连接（可选）"
      },
      {
        "id": 182,
        "name": "23. 连接设备（见图6）",
        "image": "/simulator-web/assets/branding/progress/图6.png"
      },
      {
        "id": 183,
        "name": "24. 填写“预传输检查表”",
        "target": "pretransfer"
      },
      {
        "id": 184,
        "name": "25. 传输量/速率确认"
      },
      {
        "id": 185,
        "name": "26. 打开手动阀"
      },
      {
        "id": 186,
        "name": "27. 开启准备信号"
      },
      {
        "id": 187,
        "name": "28. 打开泵"
      },
      {
        "id": 188,
        "name": "29. 是否泄漏"
      },
      {
        "id": 189,
        "name": "30. 系统工作正常"
      },
      {
        "id": 190,
        "name": "31. 开始加注"
      },
      {
        "id": 191,
        "name": "32. 异常情况"
      },
      {
        "id": 192,
        "name": "33. 加注完成"
      },
      {
        "id": 193,
        "name": "34. 停泵"
      },
      {
        "id": 194,
        "name": "35. 吹扫连接设备"
      },
      {
        "id": 195,
        "name": "36. 关闭手动阀"
      },
      {
        "id": 196,
        "name": "37. 解除连接设备"
      },
      {
        "id": 197,
        "name": "38. 连接设备归位"
      },
      {
        "id": 198,
        "name": "39. 吹扫/惰化加注管路"
      },
      {
        "id": 199,
        "name": "40. 填写“加注后检查表”",
        "target": "after"
      },
      {
        "id": 200,
        "name": "41. 解除通讯线连接（可选）"
      },
      {
        "id": 201,
        "name": "42. 系泊缆绳解除（见图8）",
        "image": "/simulator-web/assets/branding/progress/图8.png"
      },
      {
        "id": 202,
        "name": "43. 雷达打开（见图7）"
      },
      {
        "id": 203,
        "name": "44. 解缆完成"
      },
      {
        "id": 204,
        "name": "45. 受注船离开"
      },
      {
        "id": 205,
        "name": "46. 填写“加注后检查表”",
        "target": "after"
      },
      {
        "id": 206,
        "name": "47. 结束“加注签收单”",
        "target": "receipt"
      }
    ]
  },
  {
    "id": "after",
    "title": "加注后检查表",
    "bilateral": true,
    "items": [
      {
        "id": 60,
        "name": "1. 管汇阀门已关闭并准备断开。"
      },
      {
        "id": 61,
        "name": "2. 甲醇加注软管和管线已吹扫完毕，准备断开连接。"
      },
      {
        "id": 62,
        "name": "3. 远程控制和手动截止阀关闭且准备好断开连接。"
      },
      {
        "id": 63,
        "name": "4. 断开连接后限制区域及警戒区域解除，撤除标志。"
      },
      {
        "id": 64,
        "name": "5. 已通知受注船及主管机关甲醇加注工作已完成。"
      },
      {
        "id": 65,
        "name": "6. 险情和事故已上报主管机关（如适用）。"
      }
    ]
  }
]

export const safetyTabs = [
  ...safetySections.map(section => ({ id: section.id, title: section.title })),
  { id: 'transfer', title: '甲醇传输数据表' },
  { id: 'plan', title: '加注计划确认表' },
  { id: 'receipt', title: '加注签收单' },
]

export function itemKey(sectionId: string, itemId: number, side: 'initiator' | 'receiver') {
  return `safety:${sectionId}:${itemId}:${side}`
}

export const requiredSafetyKeys = [
  ...safetySections.flatMap(section => section.items.flatMap(item => [
    itemKey(section.id, item.id, 'initiator'),
    // The three procedural confirmation tabs have only one visible confirmation column in WPF.
    ...(section.bilateral ? [itemKey(section.id, item.id, 'receiver')] : []),
  ])),
  ...safetySections.map(section => `safety:${section.id}:signed`),
  ...['transfer', 'plan', 'receipt'].flatMap(id => [`safety:${id}:data`, `safety:${id}:signed`]),
]
