# 藥局後台設計 MASTER

本規範先適用批號清單與初次收貨表單；其他頁面需獨立檢視，不代表全站已完成設計或無障礙驗收。保留現有元件、CSS tokens、icons 與既有本地／系統字型，不安裝新的設計系統套件。

<a id="role-journeys"></a>
## 角色旅程與驗收入口

先選本次要改善的旅程，再讀其現有入口與契約，不要從通用設計建議推導新功能。下表的藥師、櫃台與庫管是理解工作目的的 UX 視角，不是 RBAC 角色、權限分派或實店 SOP；同一人可能負責多段旅程。實際權限沿用既有 API 與帳號，放行、退回與實店政策另依已確認的決策。

「成功證據」是後續驗收要取得的證據，不是本表宣告已通過。進度看 [ROADMAP](../../ROADMAP.md)，技術行為看 [Admin 模組](../../admin-ui/MODULE.md)、[POS 模組](../../pos-ui/MODULE.md)及相關 ADR；裝置、正式環境與營運驗收不可由文件或 CI 綠燈代替。

| 旅程／UX 視角與目的 | 輸入 | 正常路徑 | 例外與中斷續作 | 成功證據 | 現有入口與契約 |
| --- | --- | --- | --- | --- | --- |
| 收貨：庫管準備資料，藥師檢視待驗收內容 | 已知商品、批號、完整效期、數量／成本文字、驗收註記；直接登記另依表單必填與權限 | `/receiving` 手動儲存私人 ReceivingDraft、重開與查歷史；初次批次入庫是另一個明確登記動作，不把草稿勾選視為 posting | 草稿儲存結果未知先 GET 核對同一 ID／內容；版本衝突先明示差異，不自動覆寫；未儲存離頁需明確捨棄，pending／unknown 不可經 SPA 離頁丟棄。初次入庫 POST 未知先核對批次／庫存，不自動重送 | 草稿可在同一授權身分重開且 revision／內容一致，歷史唯讀；入庫須另有權威回應及批次／庫存核對，不能以草稿成功代替 | [ReceivingDraftPage](../../admin-ui/src/pages/Receiving/ReceivingDraftPage.tsx)、[ADR-025](../adr/adr_025_private_receiving_drafts.md)；[批次收貨規範](pages/batch-receipt.md)、[ADR-017](../adr/adr_017_atomic_batch_receipts.md) |
| 掃碼：櫃台辨識商品，庫管保留待核對線索 | 既有鍵盤掃碼、手動文字、圖片／相機取得的符號；已審核包裝對應 | 依入口區分純證據擷取、明確查詢與加入購物車；精確 SKU 或已確認包裝版本才依既有契約加入，不把模糊命中當精確 | 未知、多候選、未知換算需明示並讓人選擇／核對；輸入、草稿、身分或 pending／unknown／conflict 改變時作廢過期結果。關閉對話框不讓晚到掃碼搶焦點或加品項 | 實際輸入事件、選擇與焦點可追溯；重複／晚到回應不重複加入。模擬鍵盤、瀏覽器與實體掃碼器證據分開 | [POS 掃碼路由](../../pos-ui/MODULE.md#change-scanner-matching-or-asynchronous-scan-behavior)、[手動／圖片證據](../../pos-ui/MODULE.md#manual-scan-evidence-dialog)、[包裝查詢](../api/product-packages.md) |
| 庫存：櫃台確認可售資訊，庫管／藥師追查批次來源 | 商品／SKU、頁碼、低庫存條件、批次與追溯選擇 | 商品清單 → 商品批次 → 唯讀來源；保留篩選與返回位置，數量只呈現既有 API 的意義，不從局部歷史重算餘額 | loading、空資料、403、讀取失敗分開；身分／商品改變丟棄舊讀取。負數異常提示人工調查，不偷偷校正；空追溯連結不是沒有交易的證明 | 現行商品／批次身分一致，Back／Forward 與焦點可回到原位置；讀取不改 stock／movement／allocation，截斷歷史明示範圍 | [ProductListPage](../../admin-ui/src/pages/Inventory/ProductListPage.tsx)、[批次導覽](../../admin-ui/MODULE.md#change-inventory-product-pagination)、[唯讀追溯](../../admin-ui/MODULE.md#read-batch-receipt-and-sale-provenance) |
| 結帳：櫃台把已確認購物車提交成一次交易 | 當前身分、購物車、既有支付欄位與送出前凍結的 commandId／payload | 確認 → pending → 權威成功；關閉可編輯支付視窗不等於取消已送交易。恢復流程核對同一 intent 與 payloadHash | pending／unknown／conflict 凍結購物車，不換 commandId 重送；unknown 不等於失敗。既知 conflict 即使查到 matching hash 也不自動解除，保留人工調查；重新登入／刷新不得解除凍結 | 同一 command 的 API 回應、訂單與資料庫異動相符且只發生一次；失去回應與衝突路徑另有證據，toast／畫面不等於付款服務已轉帳 | [POS 結帳路由](../../pos-ui/MODULE.md#change-checkout-or-cart-behavior)、[ADR-018](../adr/adr_018_checkout_command_recovery.md)、[恢復驗收範圍](../../pos-ui/e2e/recovery-native/README.md) |
| 退回：櫃台登記退款，庫管／藥師另行判定實物處置 | 既有訂單與退款登記原因；實物回庫所需驗收尚屬分開流程 | 現行 RefundModal 只登記金額退款狀態；清楚說明不執行支付服務轉帳、不恢復實物庫存 | pending 禁止重複提交／取消；失敗、未知與已登記分開。不要把重開視窗或退款成功當作商品可再售，也不要自動建立收貨補量 | 權威退款登記結果與訂單一致，product／lot／movement／allocation 數量不變；實物回庫沒有驗收就標未完成 | [退款／實物退回路由](../../pos-ui/MODULE.md#change-refund-or-physical-return-behavior)、[ADR-015](../adr/adr_015_refund_without_stock_receipt.md) |
| 效期：藥師／庫管辨識到期、隔離與待更正批次 | 完整效期、Asia/Taipei 日期、批次驗收狀態；更正需既有原因與權限 | 批號清單篩選／查看效期，將效期與 QUARANTINE／BLOCKED／RELEASED 分開；必要更正走既有理由必填與歷史入口 | 到期當日不可出庫；讀取未知不能顯示為安全可售。失敗保留更正草稿，pending 不關閉或重送；刷新／返回仍核對同一批次，不從舊顏色推定已更正 | 日期分類與權威批次資料一致；更正成功及不可變歷史可核對。顏色、放行標籤或列印標籤都不是臨床適用性證明 | [批次收貨規範](pages/batch-receipt.md)、[更正與歷史](../../admin-ui/MODULE.md#change-batch-field-corrections-and-history)、[批次更正契約](../api/batch_field_audit.md) |

### 跨旅程不可混淆的邊界

- ReceivingDraft 是私人準備資料，不是 ReceiptDocument 正式單據或正式 posting，也不授予包裝換算、放行或庫存寫入權。初次批次登記與未來正式收貨文件的範圍不得互相冒充。
- 掃碼／圖片辨識／OCR 候選或列印本身不改庫存數量；證據擷取、人工確認、購物車編輯與最終授權 posting 是不同步驟。這裡不宣告 OCR 或完整正式收貨流程已上線。
- 維持 unknown／conflict 的保守語意與結帳凍結；不為了「順暢」而清掉待核對內容、解除拒絕或暗中重送。退款登記不是實物回庫。
- UI 調整沿用 [觸控與流程 review skill](../../../../.agents/skills/pharmacy-touch-ui-review/SKILL.md)；逐旅程選擇證據層，不要求一次讀完所有 skills，也不把手機 viewport 當成 iPad／實機驗收。

## 官方原則與本專案採用方式

| 官方來源 | 採用的原則 | 本專案落地／驗收 |
| --- | --- | --- |
| [SAP Fiori Worklist 1.120](https://www.sap.com/design-system/fiori-design-web/v1-120/page-types/floorplans/work-list/usage) | 清楚標題、清單與明細入口；按操作層級安排動作 | 標題只放一個主要「登記批次進貨」入口，篩選在清單前，更正／歷史保留於列，提交在表單末端。小螢幕工具列可換行。只借用工作清單層級，不宣稱完整實作 Fiori floorplan；未加入 sticky 或部分處理。 |
| [IBM Carbon Data table v10](https://v10.carbondesignsystem.com/components/data-table/usage/) | 清楚欄列、文字靠左、數字靠右；長內容可閱讀 | 品名／SKU 分行、數字 tabular 與靠右、長批號換行。手機使用本頁局部表格捲動且可鍵盤聚焦，避免裁切。分行與局部捲動是專案取捨，並非 Carbon 對所有表格的硬性要求。 |
| [Fluent 2 Field](https://fluent2.microsoft.design/components/web/react/core/field/usage) | 可見標籤、輔助文字、清楚驗證訊息 | label 與欄位綁定；效期、驗收與放行原因透過 aria-describedby 關聯；原因無效時 aria-invalid，native required/min/step 保留。提交失敗不清草稿。 |
| [Fluent 2 Message bar](https://fluent2.microsoft.design/components/web/react/core/messagebar/usage) | 以持續可見訊息說明狀態與下一步 | 載入、空資料、403、讀取失敗、更新中與過期結果分開。POST 結果未知時保留草稿，先核對批次／庫存，絕不自動重送。 |
| [W3C Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 焦點進入、留在對話框、關閉後返回，Esc 可取消 | 保留既有表單、使用 native dialog.showModal：標題初始焦點、明確 Tab/Shift+Tab 循環、背景 inert、回到入口。pending 禁止取消；其他狀態 Esc／取消／背景關閉。 |
| [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) / [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | 放大後仍可取得資訊與操作；表格可保留必要的二維結構 | 表格外內容換行；表單單欄與垂直捲動；以瀏覽器真正 200% page zoom 驗證，CSS zoom、deviceScaleFactor 或縮 viewport 不算該驗收。 |

正文 16px、表格文字（含表頭、SKU、徽章）至少 14px、主要觸控控制至少 44px，是本專案的設計目標，**不是上述官方來源一致規定的門檻**。200% zoom 通過也不代表完整 WCAG 2.2 AA 合規；reflow 的 320 CSS px、輔具與跨瀏覽器需另行驗證。

## 頁面規範與證據

- [批次收貨](pages/batch-receipt.md)：來源 → 本頁改動 → 驗收對照。
- [本次驗證紀錄](../verification/batch-receipt-uiux/README.md)：精確版本、執行方式、畫面及未通過項目。

