# #50B1：低庫存分頁後端切片

2026-10-07；base master `1f7eeb092af0fd66ca4f3533939c44662020c9d8`，獨立分支
`fix/inventory-low-stock-pagination`。Refs #50 / #31。#53、#54 的分支保持原樣。

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

## 仍待驗證與邊界

早期 Draft 的 real PostgreSQL 產品欄位比較、count/findMany、tenant 隔離與
缺 tenant fail-closed，以及完整後端測試尚未執行；之後保存新的 raw，不覆蓋早期證據。
UI 商品分頁、invalid page/limit、新上限、跨並行更新的 count/rows 同快照另案。
同名 ID 排序僅保證靜態資料的完整翻頁，不承諾更新期間的 offset 穩定性。
只使用合成 fixture；不讀正式處方、病人、支付或庫存資料。

這不完成整張 #50/#31，不修改 #29/#30/#37 上線門檻，不關 issue、不勾既有
未完成方框。不改 workflows，不啟用/dispatch/rerun Actions；commit 使用
`[skip ci]`，exact-head all-event Actions 0 是執行邊界紀錄，不是 CI PASS。
先 Draft 與獨立非作者 review，不合併、不 ready、不部署、不變更權限或憑證。
