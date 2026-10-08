# #50B1：低庫存分頁後端切片

## 2026-10-08：合併後 exact-head CI 驗收入口

本節是新驗收配置的操作說明，不是執行通過紀錄。下方原生 8/8、全後端
253 的歷史證據保留；#55／後續整合 CI 的 245 passed／8 skipped 不可改列
為本次 8 個真 PostgreSQL 案例通過。候選在本機僅做純 Node harness controls
與靜態檢查；本機缺 backend dependencies、PostgreSQL、Docker，且只有
Node 24，原 6 mock／8 native、Node 22 CI、build／全 suite 均尚未重跑。

`.github/workflows/ci.yml` 追加獨立 `Product pagination PostgreSQL acceptance`
job；原 Agent Context Validation、Backend CI、Admin UI CI、POS UI CI 四 job、
#66／#67 與既有產品閘門原樣保留。新 job 沿用普通 PR／push／既有手動 workflow
觸發，沒有 privileged PR 事件、新 secret、付費 runner 或正式環境部署。
PR 情況明確 checkout PR head；`source.json` 同時保存真正 checkout head/tree
與 workflow event SHA，避免把 PR merge SHA 當成 head 執行證據。

安全與生命周期由 backend 的 `scripts/products-pagination-ci.mjs` 驗證：

- 只接受 GitHub-hosted runner、Node 22、該 job 提供的 container/network ID
- PostgreSQL 15 Alpine 是本 job 新建的獨立 service。無密碼 `test` 的 trust
  初始化只限此 disposable fixture；沒有改 host／既有 PostgreSQL／HBA／帳號權限
- host port 明確為 `127.0.0.1:55434:5432`；每階段以 Docker inspect 拒絕
  wildcard／IPv6／其他 port、host network、privileged container、bind mount、
  額外 network／容器；不對外發布 port
- 兩個 URL env 只能同為
  `postgresql://test@127.0.0.1:55434/checkout_http_recovery_inventory_pagination_ci`；
  原 integration test 的 guard 完全未改，另保存原 guard 的靜態正／反向檢查
- preflight 要求 public schema 無 table，才登記自有空 DB；只套用既有 migrations，
  不跑 general seed；所有業務表測前須零列，測試只建立原有合成 fixtures
- 真 Prisma 連線再核 DB 名稱、使用者、PostgreSQL 版本與 service IP/port；
  測試子程序使用最小環境，不繼承外部 integrations、JWT 或其他連線設定
- 分別執行原 6 mock、8 native，保存 verbose／JSON 和命令 exit；逐項檢查
  原 case 名稱、passed、無 skipped/todo、無遺漏／替換。純 harness controls
  另列，不能計入上述 14 案
- `always()` cleanup 只處理本 run 成功登記的 DB：先保存所有業務表計數，
  再 DROP 自有 DB 並確認不存在；即使有殘留也移除 fixture，但驗收仍失敗。
  job/container 最後由 Actions 銷毀。取消／逾時缺少完整 cleanup 證據不算 PASS

整個 job 最多 15 分鐘；每個測試／migration 子命令最多 120 秒。
原始輸出放在 7 天保留的 `products-pagination-<head>-<attempt>` artifact，
包含 source/tree/hash、network、guard、database identity、migration log、
`mock.json`／`native.json` 每案結果、before/cleanup counts 與 cleanup receipt。
只有 6+8 真通過、業務表清零且 DB 確認移除後，才產生 `accepted.json`。
審查／下載時核對 artifact 的 head/tree 與該 PR 最新 exact head，不能只看綠燈。
node helper 的純靜態 controls 可在 backend 執行：

```sh
node --test scripts/products-pagination-ci.test.mjs
```

完整 acceptance harness 只允許上述 Actions fixture，不提供本機／正式 URL
override。不改 API、庫存權威、退款、schema 或原測試，不代表 browser／真 HTTP、
店內硬體、G0–G7、UI 商品分頁或整張 #50／#31 已驗收。

## 原 #55 保存的歷史證據

2026-10-07；base master `1f7eeb092af0fd66ca4f3533939c44662020c9d8`，獨立分支
`fix/inventory-low-stock-pagination`。Refs #50 / #31。#53、#54 的分支保持原樣。
[Draft PR #55](https://github.com/skydreamer0/startup/pull/55)；早期來源 head
`b5e69a56d48238a506eadfad14467de3060e3c0f`，tree
`93a99ddf7fff1c46e1ea23514f2dea618e0b87a0`。

只有 `InventoryService.getProducts` 的 production 行為改動：既有帳量
`stockQuantity <= safetyStock` 欄位比較先於分頁，count/findMany 同條件，
依 name asc、id asc 排序。仍經既有 tenant-scoped Prisma delegate。
page=1/limit=50、total/page/limit/data、ApiSuccess、supplier/category 與
isLowStock 均保留；沒有 schema、UI、supplier 或共用型別改動。

## 早期候選的實際證據

- first RED：正常庫存 A/B 在低庫存 C/D/E 前，limit=2 原回 total=0；修正後 C/D、total=3。
- tie RED：同名反向 seed 原回 d/c/b/a；加入唯一 ID 後 a/b/c/d。
- 最終 mocked service：6/6；末頁 E 與超頁空陣列均 total=3；等於安全量、0==0、false/省略、預設值、關聯與 isLowStock 覆蓋。
- 後端 build、lint、早期 context 檢查 exit 0。
- 既有合成 PostgreSQL 15.18 / loopback 55434 / checkout_http_recovery_base：已用 guarded explicit Prisma 連線唯讀確認。這不是產品列表 DB 測試證據。

完整原始輸出在 [early-raw.zip](early-raw.zip)，每檔命令、exit、階段、
位元組與 SHA-256 在 [early-manifest.json](early-manifest.json)。ZIP 保留 raw
位元組（含 runner 格式），不改寫失敗輸出。所有執行當時 tracked HEAD 是 base，
服務/測試處於記錄的未提交階段，不能宣稱是在稍後提交 SHA 重跑。

## 追加的真 PostgreSQL 與後端證據

早期候選保存後，以原 executor 既有 PostgreSQL 15.18（127.0.0.1:55434）
建立獨立 `checkout_http_recovery_inventory_pagination_6cdc1ba618af41e7b27147426c16fe95`。
只套用 base 的 10 份 migrations 與既有 synthetic seed，沒有新 migration。
Prisma Client 6.19.2 / engine c2990dca591cba766e3b7ef5d9e8a84796e47ab7。
測試使用真實 InventoryService、原 tenant extension、真 PostgreSQL，沒有 mock
此 delegate 或自行以 SQL 替代商品查詢。測試用 basePrisma 僅建立/移除自有合成 fixture；
runner 的 CREATE/DROP DATABASE 只管理它新建的隔離 DB。

| 追加檢查 | 實際結果 |
| --- | --- |
| focused mocked + real Prisma | 2 files / 14 passed（6 mocked、8 real PostgreSQL） |
| 正常 A/B 在低庫存 C/D/E 前，limit=2 | C/D → E → 空頁；每頁 total=3 |
| 每列比較 / 邊界 | C=1/3、D=2/2、E=0/0 皆入選；A/B=10/3 排除 |
| false / 省略與既有預設 | tenant A 全部 5 筆，page=1、limit=50、逐筆 isLowStock 保留 |
| 同名反向 seed / ID tie-break | 兩頁依 ID 升冪共 4 筆，超頁為空，無重複或漏項 |
| tenant 與 count 隔離 | 並行 A：total=3；B：total=1；B 未篩選 total=2；資料全部屬正確 tenant |
| 缺 tenant | true / 省略均拒絕（Missing tenant context） |
| supplier/category | 真關聯物件與 null、isLowStock、total/page/limit/data 保留 |
| 完整 backend | 31 files / 253 passed，無 skipped；不是重用先前 239 的結果 |
| 新增兩份 test TypeScript | explicit tsc --noEmit：exit 0（API build 本身排除 tests） |
| API build / lint / context / diff | exit 0 |

完整 suite 的 SQL constraint/injected failure 與 HTTP 409 日誌來自既有負向案例，
保留原始輸出；Vitest 結果為 253 passed、exit 0，沒有把這些日誌刪掉。
完整 suite 包含既有 checkout-command crash/restart 回歸，沒有重做其 production 實作。

新的 [native-raw.zip](native-raw.zip) 與 [native-manifest.json](native-manifest.json)
保存每段 command、exit、source hash、tracked-head 關係、環境鍵名與 raw hash。
早期 9 份 raw / early ZIP / early manifest 未改；production service 與 mocked test
均與早期 b5e69a56 完全相同。追加執行當時 tracked HEAD 為 b5e69a56，integration
test 尚未提交，完整三個 source 的 SHA-256 已記錄；後續提交只保存同一測試與
文件/證據，不宣稱在後續 SHA 重跑。空的 type-check 輸出也保留並記錄 exit 0。
JWT 測試 secret 僅於記憶體產生，未寫入 raw 或 manifest；外部 integrations 為空。
自有隔離 DB 測完已移除，沒有啟停原 PostgreSQL 或未知 server。

## 重現

需自行指定原本隔離 PostgreSQL 上新建、套用既有 migrations 的 synthetic DB；
不要用正式連線。新測試僅接受 user=test、無 password、127.0.0.1、明確 port、
上述隔離 prefix，且 PRODUCT_PAGINATION_DATABASE_URL 必須與 DATABASE_URL 相同。
未提供 opt-in 時 8 個 native 案例會顯示 skipped，不能當 real DB PASS。

```sh
# systems/enterprise-admin/backend；使用既有 dependencies / generated Prisma client
# DATABASE_URL 與 PRODUCT_PAGINATION_DATABASE_URL 指向同一 guarded synthetic DB
# NODE_ENV=test；測試 JWT secrets 請只在執行環境記憶體中產生
npm test -- src/modules/inventory/__tests__/products-pagination.test.ts src/__tests__/products-pagination.integration.test.ts
npm test
node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module ESNext --moduleResolution bundler --esModuleInterop --strict --skipLibCheck src/modules/inventory/__tests__/products-pagination.test.ts src/__tests__/products-pagination.integration.test.ts
npm run build
npm run lint
```

raw ZIP 的 run-verification.mjs 記錄本次 fixture 建立、明確 env 與 cleanup
流程；不要在未確認的 cluster 執行其管理 DDL。原生測試沒有 ambient URL fallback。

## 保留的邊界

UI 商品分頁、invalid page/limit、新上限、跨並行更新的 count/rows 同快照另案。
同名 ID 排序僅保證靜態資料的完整翻頁，不承諾更新期間的 offset 穩定性。
只使用合成 fixture；不讀正式處方、病人、支付或庫存資料。

這不完成整張 #50/#31，不修改 #29/#30/#37 上線門檻，不關 issue、不勾既有
未完成方框。不改 workflows，不啟用/dispatch/rerun Actions；commit 使用
`[skip ci]`，exact-head all-event Actions 0 是執行邊界紀錄，不是 CI PASS。
先 Draft 與獨立非作者 review，不合併、不 ready、不部署、不變更權限或憑證。
