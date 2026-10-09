# PR #73 / Issue #46 獨立評審與交件缺口

評審日期：2026-10-09（Asia/Taipei）。狀態：**等待最新雲端交件；功能修正與新增驗收未完成**。

這份文件保存已發布版本的獨立靜態評審及接手條件。它不是雲端未提交程式的評審、功能交件或驗收通過聲明。未重做任一功能片，未修改作者分支、CI、權限、資料庫或部署。

## 版本與本地保全

| 對象 | 核對結果 |
| --- | --- |
| 原本本地 checkout | `master` / `a8de423346cbff2b015832dccbf47ac6808335de`；`git status --porcelain=v1` 空白，無 stash。保持原狀。 |
| 最新可取得主線 | `37b5ba3ce1f4d3f0f035dc3610e9bde3793c6a02`，tree `d7d056690e9d850a2b27fd7e282997a62375fe2e`。 |
| PR #73 | `feat/48-exact-sku-lookup` / `08d785e9fcb2b7983e1fa4bd7b2fa565e3a92925`，tree `7300a1d1e591ca47df9d3b39772a17c23d1c9217`。仍等於使用者提供的保存基準。 |
| #73 base | `feat/49-pos-category-api` / `a8b9a65e8f94d3a30fa1c20fec4240b882c3e32c`。 |
| #73 驗收補強 | **缺交件**：遠端 heads、PR metadata、comments、reviews 未找到較新補強提交或指向；不能把 `08d785e9` 稱為補強最新版。 |
| #46 原作者實作 | **缺交件**：遠端 heads、全部 PR 清單、issue comments/timeline 未找到實作 branch/SHA。Issue 本文仍標示規劃、未實作；這不證明雲端沒有開發。 |
| 本次保存 | 從固定主線另建 managed worktree 及 `docs/review-73-46-handoff-blockers`，只新增本文件。不是功能分支完成交付。 |

取得方法：成功 `git fetch origin --prune`、`git ls-remote --heads origin`，讀取 PR #73 metadata/files/checks/comments/reviews，以及 Issue #46 本文/comments/timeline與 PR 清單。可存取的聊天清單未提供這兩項最新雲端交件；未向其他聊天或作者送訊息。首次 sandbox 網路／FETCH_HEAD 失敗後，經允許的升權唯讀遠端查核成功。

待提供：兩項作者分支名稱、精確完整 SHA（或可取得的 bundle/patch），相應 CI run/artifact、重現命令及限制。未取得前不對舊版重做功能或宣稱補強已評審。

## PR #73 基準版獨立評審

以下 source 路徑皆相對 `systems/enterprise-admin/`，固定在上述 #73 SHA。

1. **P1：單頁網路防線不足。** `pos-ui/e2e/ui-evidence/fixtures.ts:42` 使用 `page.route`，沒有 context 層的 HTTP/WebSocket 防線。不能證明新分頁、popup 第一個請求、WebSocket 都受限；應在建立／導覽任何頁面前安裝 BrowserContext route 及 WebSocket 攔截，禁用 service worker 旁路，所有未知外連及非預期寫入須阻擋且令測試失敗。記錄全 context 的頁面／網路錯誤與嘗試，涵蓋 teardown。
2. **P1：直接塞 token 不算登入驗收。** `pos-ui/e2e/ui-evidence/scanner.spec.ts:36` 用 init script 寫 `pos_accessToken`。`pos-ui/src/pages/POSLoginPage.tsx:12` 已有員工代碼與 `/pos/staff-login` 入口。補強須從未登入的實際畫面輸入代碼並提交；合成 HTTP 模式只可精確允許、驗證並在本地 fulfill 該預期登入 POST，不能送到實際服務。不得用人工切路由或改 storage 代替介面。
3. **限制：尚未找到實際租戶切換入口。** 已查 POS App routes、checkout page及 components，只有切換人員提示，未見租戶切換控制。人工換 fixture 的 tenant、token 或路由只算 scope 模擬；須在新交件中找到並走真入口，否則明列「未完成／無入口」，不能記為通過。
4. **P1：現有 browser 成績的 subject 不含新 SKU 功能。** `pos-ui/e2e/ui-evidence/subjects.json` 固定 scanner `6977e76fb764f83c46369d0eb78ca60c2ecaa5c9`、supplier `2b2d02a4cd54ed393f32e08ee60bdb35183cdb3d`。README 已說明 historical-fixed-subject-ui；不得把這組成功 CI 當 #73 新 SKU 驗收。
5. **保留原五項真 PG 案例。** `backend/src/__tests__/pos-product-lookup.integration.test.ts:19` 是 opt-in；一項 uncapped exact/零庫存/兩租戶並行與四項 literal 不正規化案例（`123`、`001`、`a00123-1`、前置空白）。未設定專用 URL 會全部 skip。URL 形狀檢查不是資料庫所有權證據；新 harness 必須證明新建的一次性資料庫／服務身分後，才可移轉、寫入與刪除。

補強交件至少需包含以下可重現證據，原五項及既有四個必要 CI jobs 不得刪除或放寬：

- Guard 負向自測：新 page、popup 首請求、WebSocket、未知外連、非預期 POST/PUT/PATCH/DELETE 均被阻擋且測試非零失敗；精確允許的合成登入例外需驗 method、path、body 及次數。Guard 不得先把預期寫入放到真網路。
- 原五項 PG 逐案名稱／結果，明確零 skip；固定 source/execution SHA/tree、一次性 DB 建立及所有權識別、實際連線核對、完整 migration 狀態、合成 tenant 資料、隔離結果、逐案執行與最終零列及只刪自有 DB 的清理紀錄。測試失敗／中斷也須保留清理結果，禁止使用 ambient/正式 DATABASE_URL。
- 真瀏覽器的新 SKU lookup、多候選以鍵盤及一般點擊明確選取、短高度視窗中候選與操作可達、付款取消後焦點回到可繼續掃碼的位置；截圖需實際檢視，不能靠 `force: true` 掩蓋裁切。
- 登入走實際 UI；租戶切換走實際 UI，或明列無入口。不能把測試端切 scope 當使用者切換。不得為這片修改正式角色或賦權。

## Issue #46 主線獨立評審

以下固定在主線 `37b5ba3...`，**不是尚未取得的 #46 分支評審**。

1. **P1：初次收貨 RELEASED 可繞過未來獨立放行邊界。** `backend/src/modules/product-batches/product-batches.routes.ts:25` 只檢查 `create:products`；schema 接受任意 BatchStockStatus；controller `:32` 只傳 body；service `:73` 直接呼叫 receiveBatch；`backend/src/lib/inventory-posting.ts:45-48` 只檢查效期後使用傳入 RELEASED。沒有獨立放行權限、可信 actor、必填 reason 或初次放行 audit。這是靜態可達路徑，尚未以新 HTTP/DB 測試重現。
2. **P1：效期與狀態仍可直接覆寫。** `backend/src/modules/product-batches/product-batches.service.ts:80-92` 查完批次即 update，沒有取得鎖後的日期檢查或 audit；已到期 RELEASED 批次可被改成未來效期。需在 #46 作者分支檢查其實作是否仍有同等漏洞，不能把主線缺口直接套成作者已犯的缺陷。
3. **保留既有鎖與交易。** receiveBatch 已先 conditional increment 商品以取得共用鎖，再檢查當下效期，最後 lot + IN movement 使用同一 caller-owned transaction。ADR-017 明載一般收貨既有政策；本次不改主線政策。僅在 #46 分支補強要求：初次 RELEASED 必須另驗獨立權限，actor 來自可信認證上下文（不可採 body actor），原因必填，收貨／庫存投影／IN movement／初次放行 audit 同交易。
4. **效期更正的判斷時點。** 同一產品→批次鎖順序後，重新讀鎖住的舊值與當下台北日期；若舊值當下已到期且仍 RELEASED，不允許直接延長到未來而恢復可售。若未到期批次的更正結果已到期，不能維持 RELEASED。效期更正與新放行分開授權／稽核；拒絕任何靜默恢復可售。

新分支回歸至少包含：

| 案例 | 必須斷言 |
| --- | --- |
| 只有 create:products，初次 RELEASED | 403；product/lot/IN/audit 全無新增；一般 QUARANTINE/BLOCKED 收貨政策不變。 |
| 有獨立放行權限但缺 actor／原因 | 拒絕；不能採信 body 偽造 actor；全部 rollback。 |
| 授權初次 RELEASED | 可信 actor、before/after、原因、操作類型、時間可讀；與 receipt + IN + product 同交易。 |
| 跨 tenant product/batch/actor | 拒絕且不洩漏／不寫錯 tenant。 |
| 取得鎖前未到期，等待鎖跨台北午夜 | 持鎖後重判日期；不可用事前 cutoff 放行或延長已到期 RELEASED 批次。用受控 barrier 證明真的等待，而非兩個順序時間測試。 |
| 已到期 RELEASED → 未來效期 | 拒絕直接恢復可售；原值與 audit 不變。 |
| audit 或 IN persistence 失敗 | 真 PostgreSQL 驗證所有 product/lot/movement/audit 回滾。 |
| 同時銷售／狀態更正／放行 | 共用鎖順序，FEFO 不取不合格批次；歷史成本快照不變。 |

尚需核對作者 additive migration、ADR、API contract、admin-ui 專用操作及錯誤呈現與相關測試；未拿到分支前不新增 schema 或重建整片。不得執行正式 seed、授予正式角色權限或接觸正式資料庫。

## 通過／失敗／未跑

| 項目 | 結果 | 證據與界線 |
| --- | --- | --- |
| 本地未提交、stash及工作樹查核 | PASS | 原 checkout 無未提交內容；另有既存 pr64 worktree，未修改。 |
| 遠端 refs / PR / Issue 讀取 | PASS | 成功 fetch、ls-remote、GitHub metadata；最新交件仍缺。 |
| 最新補強交件完整性 | FAIL / 缺交 | #73 仍是基準，#46 無可取得作者實作分支。 |
| 基準版獨立靜態評審 | 已完成，有阻擋缺口 | 上述來源與判斷；不宣稱 runtime 重現。 |
| #73 既有 CI run 37829543379 | 歷史 SUCCESS（GitHub metadata） | Context/Backend/Admin/POS及pagination五 jobs；未重新下載核驗 raw artifacts，不能套到新補強。Dependency Review 37829543389 SUCCESS；Argon2 final-alpine SKIPPED。 |
| 原五項 SKU PostgreSQL | NOT RUN 本輪；舊 run 據 PR 本文為 SKIPPED | 沒有補強版本及所有權證據；不把 skipped 算 pass。 |
| 新 browser guard、登入、租戶、多候選、短視窗、付款焦點 | NOT RUN | 缺最新補強交件；租戶入口另有上述限制。 |
| #46 權限、跨租戶、午夜競爭、回滾及 UI | NOT RUN | 缺作者分支。 |
| 本次文件 diff/context | 另見草稿 PR 的實際執行結果 | 此文件不預先宣稱未跑的檢查通過。 |

## 接手次序

1. 取得兩項最新作者 branch + full SHA，重新 fetch 並核對 head/tree、base及當時未提交變更；若雲端只有未提交修改，先由作者保存提交，不能覆蓋。
2. 先獨立評審最新交件，再各自從固定作者 SHA 建立獨立功能修正分支；本文件分支僅是評審保存。
3. 對 #73 補 guard/UI 及真 PG 證據；對 #46 作限定的初次 RELEASED／效期安全修正及真 DB 回歸。保留原測試與 CI。
4. Conventional Commit，推新分支、草稿 PR；列所有改動檔案與完整 SHA、逐項 PASS/FAIL/SKIP/NOT RUN、清理證據及未完成 gate。不得合併、部署、改正式角色或正式資料庫。
