# 07_處方相關服務SOP模板

## 用途
將處方相關服務流程標準化，確保接單、驗證、交付與異常處置可重複、可稽核。

## 適用時機
- 第一次啟動處方相關服務。
- 流程異常或客訴增加時。
- 新人訓練與內部稽核時。

## 必填欄位
| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `rx_case_id` | string | 是 | 對應 `RxServiceRecordV1` |
| 受理時間 | datetime | 是 | 接單時間 |
| 驗證狀態 `verification_status` | enum | 是 | pending/verified/rejected/escalated |
| `pharmacist_signoff` | string | 是 | 藥師簽核資訊 |
| `handoff_timestamp` | datetime | 是 | 交付時間 |
| `incident_flag` | boolean | 是 | 是否有異常 |
| 異常處置紀錄 | text | 條件必填 | `incident_flag=true` 時必填 |
| `需藥師/法顧確認` | boolean | 是 | 固定為 true |

## 填寫規則
1. 每個案例都需產生唯一 `rx_case_id`。
2. 驗證未完成不得進入交付步驟。
3. 異常事件需在 24 小時內完成初步紀錄。
4. 所有對客說明需有可追溯紀錄（時間、人員、內容）。
5. 本模板涉及法規判定處請標記 `需藥師/法顧確認`。

## 輸出範例格式
```text
[案件主檔]
rx_case_id: RX-YYYYMM-XXXX
verification_status: verified
pharmacist_signoff: <簽核人/時間>
handoff_timestamp: YYYY-MM-DD HH:MM:SS
incident_flag: false
需藥師/法顧確認: true

[流程紀錄]
Step1 受理: <時間/人員>
Step2 驗證: <時間/結果>
Step3 交付: <時間/方式>
Step4 追蹤: <時間/結果>
```

## 常見錯誤
- 案件缺少簽核或驗證結果。
- 交付紀錄不完整，導致爭議無法追溯。
- 異常事件沒有關閉機制與改善追蹤。

---

## SOP 流程模板
1. 接單受理
- 來源通路：
- 案件建立：
- 身分與資料確認：

2. 驗證與簽核
- 驗證步驟：
- 藥師簽核：
- 驗證結果：

3. 交付與說明
- 交付方式：
- 用藥與注意事項說明：
- 客戶確認：

4. 異常處置
- 事件描述：
- 即時行動：
- 後續追蹤：

## 稽核點
- 案件完整率：
- 異常處理時效：
- 簽核合規率：

## 交叉引用
- 合規矩陣：`06_法規與合規矩陣_台灣模板.md`
- KPI 儀表板：`../C_營運層/11_營運KPI與儀表板模板.md`

## 初版填寫示例（可直接改）
```text
[案件主檔]
rx_case_id: RX-202603-0001
受理時間: 2026-03-05 10:15:00
verification_status: verified
pharmacist_signoff: Pharmacist_A@2026-03-05 10:38:00
handoff_timestamp: 2026-03-05 11:05:00
incident_flag: false
需藥師/法顧確認: true

[流程紀錄]
Step1 受理:
- 來源通路: store
- 受理人員: OP-01
- 身分與聯絡確認: 完成

Step2 驗證:
- 驗證人員: Pharmacist_A
- 驗證結果: verified
- 驗證備註: 文件齊全，可進行後續交付（需藥師/法顧確認）

Step3 交付:
- 交付方式: 到店領取
- 交付時間: 2026-03-05 11:05:00
- 客戶確認: 已簽收

Step4 追蹤:
- 追蹤時間: 2026-03-06 18:30:00
- 追蹤結果: 無異常回報
```

### 初版角色與SLA（示例）
1. 接單受理：5 分鐘內建立 `rx_case_id`，10 分鐘內進入待驗證佇列。
2. 驗證簽核：一般案件 30 分鐘內完成；疑義案件升級 `escalated`。
3. 交付執行：驗證完成後 60 分鐘內完成交付或排程通知。
4. 異常回報：`incident_flag=true` 時 24 小時內完成初步報告。

### 初版稽核指標（示例）
- 案件完整率：>= 98%
- 驗證完成時效（中位數）：<= 30 分鐘
- 異常事件關閉時效：<= 72 小時
- 簽核合規率：100%
