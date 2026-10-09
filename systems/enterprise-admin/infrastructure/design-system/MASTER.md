# 藥局後台設計 MASTER

本規範先適用批號清單與初次收貨表單；其他頁面需獨立檢視，不代表全站已完成設計或無障礙驗收。保留現有元件、CSS tokens、icons 與既有本地／系統字型，不安裝新的設計系統套件。

## 官方原則與本專案採用方式

| 官方來源 | 採用的原則 | 本專案落地／驗收 |
| --- | --- | --- |
| [SAP Fiori Worklist 1.120](https://www.sap.com/design-system/fiori-design-web/v1-120/page-types/floorplans/work-list/usage) | 清楚標題、清單與明細入口；按操作層級安排動作 | 標題只放一個主要「登記批次進貨」入口，篩選在清單前，更正／歷史保留於列，提交在表單末端。小螢幕工具列可換行。只借用工作清單層級，不宣稱完整實作 Fiori floorplan；未加入 sticky 或部分處理。 |
| [IBM Carbon Data table v10](https://v10.carbondesignsystem.com/components/data-table/usage/) | 清楚欄列、文字靠左、數字靠右；長內容可閱讀 | 品名／SKU 分行、數字 tabular 與靠右、長批號換行。手機使用本頁局部表格捲動且可鍵盤聚焦，避免裁切。分行與局部捲動是專案取捨，並非 Carbon 對所有表格的硬性要求。 |
| [Fluent 2 Field](https://fluent2.microsoft.design/components/web/react/core/field/usage) | 可見標籤、輔助文字、清楚驗證訊息 | label 與欄位綁定；效期、驗收與放行原因透過 aria-describedby 關聯；原因無效時 aria-invalid，native required/min/step 保留。提交失敗不清草稿。 |
| [Fluent 2 Message bar](https://fluent2.microsoft.design/components/web/react/core/messagebar/usage) | 以持續可見訊息說明狀態與下一步 | 載入、空資料、403、讀取失敗、更新中與過期结果分開。POST 結果未知時保留草稿，先核對批次／庫存，絕不自動重送。 |
| [W3C Modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 焦點進入、留在對話框、關閉後返回，Esc 可取消 | 保留既有表單、使用 native dialog.showModal：標題初始焦點、Tab/Shift+Tab 循環、背景 inert、回到入口。pending 禁止取消；其他狀態 Esc／取消／背景關閉。 |
| [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) / [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | 放大後仍可取得資訊與操作；表格可保留必要的二維結構 | 表格外內容換行；表單單欄與垂直捲動；以瀏覽器真正 200% page zoom 驗證，CSS zoom、deviceScaleFactor 或縮 viewport 不算該驗收。 |

正文 16px、表格文字（含表頭、SKU、徽章）至少 14px、主要觸控控制至少 44px，是本專案的設計目標，**不是上述官方來源一致規定的門檻**。200% zoom 通過也不代表完整 WCAG 2.2 AA 合規；reflow 的 320 CSS px、輔具與跨瀏覽器需另行驗證。

## 頁面規範與證據

- [批次收貨](pages/batch-receipt.md)：來源 → 本頁改動 → 驗收對照。
- [本次驗證紀錄](../verification/batch-receipt-uiux/README.md)：精確版本、執行方式、畫面及未通過項目。
