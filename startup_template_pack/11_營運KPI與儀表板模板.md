# 11_營運KPI與儀表板模板

## 用途
定義週/月營運 KPI、公式與警戒值，作為決策會議固定依據。

## 適用時機
- 試點上線後每週使用。
- 月度經營檢討。
- 對外報告前統一口徑。

## 必填欄位
| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `period` | string | 是 | `YYYY-WW` 或 `YYYY-MM` |
| `channel_id` | enum | 是 | store/line/community/kol |
| `new_customers` | number | 是 | 新客數 |
| `repeat_customers` | number | 是 | 回購客數 |
| `conversion_rate_pct` | number | 是 | 首購或回購轉換率 |
| `cac_twd` | number | 是 | 每位新客成本 |
| 客單價_twd | number | 是 | AOV |
| `gross_margin_pct` | number | 是 | 月度毛利率 |
| 缺貨率_pct | number | 是 | 供應履約指標 |
| `dio_days` | number | 是 | 庫存週轉天數 |
| `dso_days` | number | 是 | 應收帳款天數 |
| `dpo_days` | number | 是 | 應付帳款天數 |
| `ccc_days` | number | 是 | 現金轉換週期（DIO+DSO-DPO） |
| `major_compliance_incident_count` | number | 是 | 重大合規事件數 |
| `bonus_gate_pass` | boolean | 是 | 獎金雙門檻是否通過 |

## 填寫規則
1. 週報看趨勢，月報看結構。
2. 每項 KPI 需定義 owner 與行動閾值。
3. KPI 計算公式固定，不可臨時改動。
4. 任何指標異常需在週會提出對策與時程。
5. 月結算需同步判斷 `bonus_gate_pass = (gross_margin_pct >= 30 AND ccc_days <= 30 AND major_compliance_incident_count = 0)`。

## 輸出範例格式
```text
[週報摘要]
period: YYYY-WW
new_customers: <數字>
repeat_customers: <數字>
conversion_rate_pct: <數字>
cac_twd: <數字>
客單價_twd: <數字>
gross_margin_pct: <數字>
缺貨率_pct: <數字>
dio_days: <數字>
dso_days: <數字>
dpo_days: <數字>
ccc_days: <數字>
major_compliance_incident_count: <數字>
bonus_gate_pass: <true/false>

[異常警示]
- 指標: <名稱>
- 現值: <數字>
- 閾值: <數字>
- 責任人: <角色>
- 改善截止日: YYYY-MM-DD
```

## 常見錯誤
- 每週改 KPI 定義，導致無法比較。
- 沒有設定警戒值。
- 指標與實際行動脫節。

---

## KPI 字典模板
| KPI | 公式 | 週目標 | 月目標 | 警戒值 | Owner |
| --- | --- | --- | --- | --- | --- |
| 新客數 |  |  |  |  |  |
| 回購率_pct |  |  |  |  |  |
| CAC_twd |  |  |  |  |  |
| 毛利率_pct |  |  |  |  |  |
| CCC_days |  |  |  |  |  |
| bonus_gate_pass |  |  |  |  |  |

## 交叉引用
- 單位經濟：`12_單位經濟模型模板.md`
- 三年財務：`13_三年財務模型_月度模板.md`

## 初版填寫示例（可直接改）
```text
[週報摘要]
period: 2026-W12
channel_id: store
new_customers: 22
repeat_customers: 9
conversion_rate_pct: 24.4
cac_twd: 205
客單價_twd: 640
gross_margin_pct: 29.2
缺貨率_pct: 3.1
dio_days: 24
dso_days: 3
dpo_days: 17
ccc_days: 10
major_compliance_incident_count: 0
bonus_gate_pass: false

[月報摘要]
period: 2026-03
new_customers: 88
repeat_customers: 31
conversion_rate_pct: 18.5
cac_twd: 172
客單價_twd: 655
gross_margin_pct: 28.6
缺貨率_pct: 2.8
dio_days: 22
dso_days: 2
dpo_days: 18
ccc_days: 6
major_compliance_incident_count: 0
bonus_gate_pass: false

[異常警示]
- 指標: cac_twd
- 現值: 205
- 閾值: 180
- 責任人: 通路負責人
- 改善截止日: 2026-03-31
```

### 初版KPI字典（示例）
| KPI | 公式 | 週目標 | 月目標 | 警戒值 | Owner |
| --- | --- | --- | --- | --- | --- |
| 新客數 | 該期間首購人數 | >= 18 | >= 80 | < 12/週 | 通路負責人 |
| 回購率_pct | 回購客數/首購客數 | >= 28% | >= 30% | < 20% | CRM負責人 |
| CAC_twd | 行銷與通路成本/新客數 | <= 190 | <= 180 | > 220 | 成長負責人 |
| 毛利率_pct | (營收-銷貨成本)/營收 | >= 27% | >= 28% | < 24% | 採購負責人 |
| CCC_days | dio_days + dso_days - dpo_days | <= 30 | <= 30 | > 35 | 財務負責人 |
| bonus_gate_pass | 毛利/CCC/合規三條件 | true | true | false | 創辦人 |

### 初版會議輸出規範（示例）
1. 每週會議必須產出：1 項問題定義、1 項調整行動、1 個截止日。
2. 每月會議必須產出：下月 KPI 目標與預算調整建議。
