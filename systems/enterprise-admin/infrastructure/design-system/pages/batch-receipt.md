# 批號清單與初次收貨 UIUX

適用 `admin-ui/src/pages/Inventory/BatchListPage.tsx` 與頁面限定 `BatchListPage.css`。設計依據見 [MASTER](../MASTER.md)。禁止擴大到 POS、OCR、部分收貨、後端 schema、角色或 API。

## 來源 → 改動 → 驗收

| 來源 | 本頁改動 | 驗收方式 |
| --- | --- | --- |
| SAP Worklist | 標題與單一主要登記入口；篩選移至清單前、aria-pressed；清單標題與本次載入筆數；更正／歷史入口保留 | 桌機 1366×768、1024×768，390px 手機，主要入口可見，篩選／標題不互相覆蓋。 |
| Carbon Table | 修正全域 overflow:hidden 的覆蓋；頁面限定 overflow:auto；14px 表頭，品名 SKU 分行，數字靠右，長批號可換行 | 長合成品名／SKU／批號；document 無水平溢出，表格可捲到右側操作；鍵盤聚焦後方向鍵可捲動。 |
| Fluent Field | 表單桌機兩欄、手機一欄；持續可見標籤，helper IDs，放行原因 required、1000字、aria-invalid | 輸入與輔助訊息關聯可讀；錯誤仍有原商品／批號／效期／數量／成本／狀態／原因；欄位原生約束有效。 |
| Fluent Message bar | 載入、空資料、403、讀取失敗、更新中與過期結果分開；讀取 retry 是 type=button；提交錯誤 focus 到訊息 | 慢回應、403、409、500、網路失敗、refetch 失敗；過期清單不冒充目前資料。未知提交先核對且不自動 POST。 |
| W3C Dialog | native dialog modal，標題入焦，背景 inert、Tab 循環、返回入口，Esc 可取消；pending 鎖定 | 鍵盤與背景操作；慢 POST 時 Esc／連點／取消不關閉或重送，成功後返回入口，錯誤草稿保留。 |
| W3C Reflow / Resize text | 本頁工具列換行、dialog 限制可見高度並捲動；延續既有字型與 tokens | 真正瀏覽器 200% zoom，記錄 innerWidth、devicePixelRatio 與縮放方法；欄位、訊息與提交可取得。Safari/iPad、320 CSS px reflow 與未執行項明列，不用裝置縮放冒充。 |

## 保持的安全與業務行為

- 登記需 `create:products`；RELEASED 另需 `release:product_batches`（沿用 wildcard）；原因 trim 後 1–1000 字且一併送出。非 RELEASED 不送舊原因。
- QUARANTINE 預設，BLOCKED 選項保留；效期與驗收狀態分開，依 Asia/Taipei 到期當日不可出庫。
- 同步 submitting ref 防止連點；pending 停止欄位編輯、取消、背景／Esc 關閉及入口重開。成功才清草稿並 invalidate 批次與商品讀取。
- 403、409、500、網路／未知錯誤保留草稿；沒有自動重送。此 UI 不提供 command idempotency 或未知結果查詢 API。
- 商品讀取 retry 不提交，不重設草稿或選擇第一個商品。空商品與讀取失敗不能登記。
- 新 CSS 僅作用 `.batch-list-page`。未修改 BatchAuditPanel、API、schema、角色或正式資料。

## 審查與限制

保持 Draft。畫面驗收使用隔離合成資料時，須明確區分 HTTP fixture 和真 API/PG。沒有執行的測試不能勾通過；完整證據見 [驗證紀錄](../../verification/batch-receipt-uiux/README.md)。
