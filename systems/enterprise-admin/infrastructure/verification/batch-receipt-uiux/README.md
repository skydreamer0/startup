# 批次收貨 UIUX 驗證（Draft）

[Draft PR #85](https://github.com/skydreamer0/startup/pull/85)，分支 `feat/batch-receipt-uiux-20261009`，base `backup/batch-audit-20261009-edb1bc3`（#76）。基底完整 SHA `ed13c5939026bde044bdcd68072d793d5d46de8f`，tree `92972743213c005b24784c48e6a5d387f24669f6`，建分支前已對遠端核對，未覆寫其他作者分支。

畫面與 browser-report 的執行 SHA 為 `3808f92c4ec544bf27807c2d83a8d8955536f0a3`。本文件及畫面提交後會在最終精確 HEAD 再跑受影響測試、types/build 與 browser harness，結果、final SHA/tree、遠端逐檔 SHA256 讀回核對記於 PR，避免在 commit 內自指 SHA。頁面與測試的 Git blob 可由最終 tree 核對。

## 結果與證據

| 檢查 | 結果／實際邊界 |
| --- | --- |
| Admin 受影響回歸 | 4 files / 44 tests：BatchListPage、batchReceipt（含新增焦點／讀取恢復／過期結果）、batchAudit、productPagination。真實 client/AuthProvider 的 HTTP boundary fixture，非真 API。 |
| Admin types/build、lint、context | TypeScript 與 Vite build 通過，lint 無警告，agent context validation 通過。 |
| Backend 既有收貨回歸 | inventory-receipt.integration + initial-release：2 files / 25 tests；前者為真 PostgreSQL、後者為 service 測試。Backend build 通過。 |
| 既有 batch audit PG 回歸 | 初次執行 15 skipped，未算 pass；另建精確符合既有 guard 的自有隔離 DB 後 15/15 通過，含初次放行原因／獨立權限／可信 actor、audit/movement 失敗整筆 rollback 與 append-only。未修改 guard。 |
| 雲端 Chromium | 20 項檢查、22 張 native viewport PNG；[完整 report](screenshots/browser-report.json) 記錄視窗、DPR、source SHA、畫面 SHA256。1366×768、1024×768、390×844，長品名／SKU／批號、數字靠右、局部表格方向鍵捲動、單欄手機表單、dialog 無水平溢出。 |
| 真正 200% page zoom | 使用 Chromium default partition 的原生 page-zoom preference，1366×768 實際 CSS viewport 683×384、DPR 2、visualViewport.scale 1、body CSS zoom 1。不改 deviceScaleFactor、不用 CSS zoom 或縮 viewport 冒充。PNG 由 CDP Page.captureScreenshot 捕捉實際 1366×768 像素，避免 Playwright fullPage 在 native zoom 下裁半張圖。 |
| 鍵盤與 pending | 標題入焦、背景 focus 被原生 modal 阻擋、Tab/Shift+Tab 循環、Esc 取消與返回入口。第一輪發現原生 Tab 從末端可掉到 body，已補 explicit Tab wrap；pending 將焦點移回 dialog 標題，所有欄位／取消／入口 disabled，Esc 不關閉。連續 submit 只有 1 POST。 |
| 訊息與草稿 | browser fixture：慢 GET/POST、空批次／商品、讀取403與明確 retry、提交403草稿保留。unit：409、500、網路未知失敗不自動重送；商品重新讀取保留選擇及原因；refetch 失敗不把過期結果或失敗當空資料。未知提交先核對批次／庫存。 |
| 真 API → PG | browser 經真 HTTP API 連自有 PostgreSQL：新合成商品→QUARANTINE 收貨4→重複批號拒絕且草稿保留→商品仍4。PG 核對每個合成商品的 product4 / lot4 / IN4，只有1 movement，見 [原始查詢](raw/pg-stock.txt)。這段 browser 沒有用 fixture 回傳；browser 的 RELEASED UI 測試另屬 fixture，真放行權限/原因由上述 PG 回歸核實。 |

## 桌機、手機與縮放畫面

- 桌機：[清單1366](screenshots/list-1366-100.png)、[表單1366](screenshots/receipt-1366-100.png)、[1024表單](screenshots/receipt-1024-100.png)。
- 手機：[390清單](screenshots/list-390-100.png)、[表單上半部](screenshots/receipt-390-100.png)、[表單提交區](screenshots/receipt-end-390-100.png)、[403保留草稿](screenshots/error-390-100.png)。
- 200%：[清單](screenshots/list-1366-200.png)、[表單上半部](screenshots/receipt-1366-200.png)、[提交區](screenshots/receipt-end-1366-200.png)。
- 狀態：[載入](screenshots/list-loading.png)、[空清單](screenshots/list-empty.png)、[空商品](screenshots/receipt-empty-products.png)、[讀取403](screenshots/list-403.png)。
- 真API：[收貨後](screenshots/real-api-receipt.png)、[重複批號](screenshots/real-api-duplicate.png)。全部為合成資料，不含正式個資／token／原始營運資料。

## 獨立重現

前端使用 Node 22.23.3 / pnpm 10.34.6，backend npm 11.21.0，PostgreSQL15 官方既有 image。依 dependency_management.md frozen 安裝，Vite 在127.0.0.1:5179、隔離 API 在127.0.0.1:3049。API 的 DATABASE_URL 必須指向自己建立的合成資料庫；本次是 loopback55439，11 個既有 migrations 與既有 seed。沒有使用或修改正式 DB。

browser harness 使用現有 pos-ui 的 @playwright/test 安裝，**未改 POS 程式或 dependencies**。執行時由操作者提供 `RECEIPT_TEST_LOGIN_EMAIL` 與 `RECEIPT_TEST_LOGIN_PASSWORD`，需與其自有隔離 DB 的 seed 輸入一致；程式不含登入預設值、不記錄密碼或 token，真 API 僅接受 loopback。不要提供正式憑證。可設定 `EVIDENCE_DIR` 將最終精確 HEAD 的證據寫到外部資料夾，保持工作樹乾淨。

```sh
node systems/enterprise-admin/infrastructure/verification/batch-receipt-uiux/browser-verify.mjs
```

受影響 Admin：`pnpm --filter admin-ui test src/pages/Inventory/BatchListPage.test.tsx src/__tests__/batchReceipt.test.tsx src/__tests__/batchAudit.test.tsx src/__tests__/productPagination.test.tsx`，再執行該 package 的 lint / build。

Backend：既有 `inventory-receipt.integration.test.ts` 與 `modules/product-batches/__tests__/initial-release.test.ts` 使用自有 seeded PG。`batch-audit.integration.test.ts` 另要求 guard 指定的無密碼 test user、loopback55437、`checkout_http_recovery_batch_audit_ci`，且 `BATCH_AUDIT_DATABASE_URL` 等於 `DATABASE_URL`；只能建立自己的合成 DB，不修改 guard 或連正式資料庫。本次沒有碰角色／API／schema 原始碼。

## 安全掃描與未完成項

GitGuardian incident **27497179** 指向早期 commit `6ef546eba146bced5bdbcf14c35cc0d61b4df6ab` 的 browser harness 固定測試登入輸入。經核實僅源自現有 seed 並用於自有隔離 synthetic DB；沒有正式憑證。已於 `3808f92c4ec544bf27807c2d83a8d8955536f0a3` 移除硬編碼，改為執行時輸入並重驗。**歷史仍保留該 commit**，未重寫 git 歷史、未改 GitGuardian 規則或停用掃描；掃描最新 head 及歷史警告是否阻擋以 PR 最新 checks 為準，不能把功能通過稱安全全綠。

Safari、iPad 實機、手機原生鍵盤／日期選擇器、螢幕閱讀器、320 CSS px reflow、完整 WCAG 與下一位獨立人工評審尚未完成。沒有跑整個 repo 全套本地測試；本次只跑受影響回歸及 types/build，完整 CI 結果另看精確 final SHA。既有刪除／BatchAuditPanel 不在本次修改範圍。

維持 Draft，不 Ready、不 merge、不正式部署、不宣稱 #76 整體驗收完成。
