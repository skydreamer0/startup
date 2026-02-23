# 08_供應鏈與SKU策略模板

## Metadata
| 欄位 | 內容 |
| --- | --- |
| Owner | Ops Lead |
| Update Frequency | 每週一次；重大活動前後加更 |
| Input From | A_戰略層定位、H_實戰工具紀錄、店務數據 |
| Output To | D_財務模型、F_執行驗證計畫、G_治理會議 |


## 用途
建立 SKU 分級、補貨規則、安全庫存與供應商評分模型，支撐毛利與履約穩定。

## 適用時機
- 試點上線前。
- 缺貨率或滯銷率異常時。
- 新供應商導入時。

## 必填欄位
| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `sku_id` | string | 是 | 對應 `SKUProfileV1` |
| `sku_name` | string | 是 | 商品名稱 |
| `category` | enum | 是 | 分類 |
| `unit_cost_twd` | number | 是 | 進貨成本 |
| `unit_price_twd` | number | 是 | 售價 |
| `gross_margin_pct` | number | 是 | 單品毛利 |
| 安全庫存天數 | number | 是 | 補貨下限 |
| 供應商評分 | number | 是 | 1-5 分 |
| `compliance_flag` | boolean | 是 | 是否涉合規控管 |

## 填寫規則
1. SKU 至少分為 A/B/C 級（銷量與毛利維度）。
2. 每個 SKU 需有替代供應策略。
3. 補貨規則須定義觸發點與採購週期。
4. `compliance_flag=true` 的 SKU 需引用 06/07 文件。

## 輸出範例格式
```text
[SKU卡]
sku_id: SKU-XXX
sku_name: <名稱>
category: <分類>
unit_cost_twd: <數字>
unit_price_twd: <數字>
gross_margin_pct: <數字>
安全庫存天數: <數字>
compliance_flag: <true/false>

[供應商卡]
供應商名稱: <名稱>
到貨準時率_pct: <數字>
退貨率_pct: <數字>
評分: <1-5>
```

## 常見錯誤
- 只看銷量不看毛利。
- 未設安全庫存導致斷貨。
- 供應商評分沒有量化依據。

---

## SKU 分級模板
| sku_id | sku_name | 等級 | 毛利率_pct | 月銷量 | 補貨週期(天) | 安全庫存(天) |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 交叉引用
- 商業模式：`../A_戰略層/05_商業模式與定價模板.md`
- 單位經濟：`../D_財務層/12_單位經濟模型模板.md`

## 初版填寫示例（可直接改）
```text
[SKU卡A]
sku_id: SKU-HLT-001
sku_name: 越南族群高頻保健品A
category: health
unit_cost_twd: 180
unit_price_twd: 280
gross_margin_pct: 35.7
安全庫存天數: 14
compliance_flag: false

[SKU卡B]
sku_id: SKU-LIV-003
sku_name: 家庭常備生活用品B
category: living
unit_cost_twd: 95
unit_price_twd: 160
gross_margin_pct: 40.6
安全庫存天數: 10
compliance_flag: false

[SKU卡C]
sku_id: SKU-RX-010
sku_name: 處方相關流程配套項目
category: rx_related
unit_cost_twd: 60
unit_price_twd: 120
gross_margin_pct: 50.0
安全庫存天數: 7
compliance_flag: true

[供應商卡]
供應商名稱: Vendor_A
到貨準時率_pct: 96
退貨率_pct: 1.8
評分: 4.5
備援供應商: Vendor_B
```

### 初版SKU分級（示例）
| sku_id | sku_name | 等級 | 毛利率_pct | 月銷量 | 補貨週期(天) | 安全庫存(天) |
| --- | --- | --- | --- | --- | --- | --- |
| SKU-HLT-001 | 越南族群高頻保健品A | A | 35.7 | 120 | 7 | 14 |
| SKU-LIV-003 | 家庭常備生活用品B | A | 40.6 | 95 | 7 | 10 |
| SKU-HLT-009 | 季節性保健品C | B | 33.0 | 40 | 14 | 7 |
| SKU-RX-010 | 處方相關流程配套項目 | B | 50.0 | 30 | 7 | 7 |
| SKU-LIV-021 | 社群測試新品D | C | 28.0 | 12 | 14 | 5 |

### 初版補貨規則（示例）
1. 觸發補貨：庫存可售天數 < 安全庫存天數。
2. 優先級：A級 SKU 24 小時內下單，B級 48 小時，C級每週彙整。
3. 斷貨應變：超過 48 小時未到貨即啟用備援供應商。
4. `compliance_flag=true` SKU 補貨前需再檢核合規清單（對應 06/07）。
