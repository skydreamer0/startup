# #50B2：商品列表 UI 分頁

[stacked Draft #56](https://github.com/skydreamer0/startup/pull/56)，分支
feat/admin-product-pagination，PR base fix/admin-supplier-list-state
（#54@283eec62a0499b0aeeee240ba0ec06064363ee77）。相依 #54/#55 均未合，
主線整合順序依賴它們；本片沒有改 master／原分支或操作 GitHub PR merge。

## 已核的安全聯集

Checkpoint `8c1384e0373078dcda0f683a39bf0ca87a8e2c05`，tree
`e532ff04c32b0fe4c5f4ff9247c3221c02fca729`，actual parents：
`283eec62a0499b0aeeee240ba0ec06064363ee77` 和
`7b6e5276d74dc19a6c2adc28e659ce823912b945`，common master 1f7eeb09。
相對 master 的 10/11 檔聯集為 20 檔；唯一重疊 ROADMAP 的兩條 evidence
逐字保留，移除兩條後逐 byte 等於 master 原文，14 個原 checkbox 不變。
其餘 19 blobs 完全等於原已審 parent。完整對照在
[union-manifest.json](union-manifest.json)，獨立非作者已唯讀核定安全聯集。
#53 未混入；沒有 rebase／force push／主線合併。Review UI 只用 checkpoint→head，
不要把繼承的 #54/#55 source 與測試數字當成本片新工作。

早期 source head `44d4e2322cec7b04ff162d126b2a80c45e505239` / tree
`ca97beb31688f651bfb272a1c6a4f82408203f8b` 已 open Draft 保存。
當時遠端完整 25 檔／195,692 bytes／tree 已讀回，all-event Actions 0。
[early-raw.zip](early-raw.zip) 與 [early-manifest.json](early-manifest.json)
保留 first controls-missing RED → 1 GREEN；兩份 raw 與 ZIP 完全未改。

## 新 UI delta

只有 ProductListPage、inventoryApi.getProducts 和必要 shared types 的 production
修改。ProductListPage 真 query key 含 page 與 lowStock；首次 page=1，沿 API
預設 limit=50。前後頁與 footer 使用 full filtered total/limit，filter event 同步
重置 page=1；分頁不呼叫產品 create/update。

只顯示 active key 的已完成結果。明確 retry=false、staleTime=0 與無 placeholder，
避免沿全域較長 staleTime 把舊 cache 冒稱新確認結果；切回 cached 頁也會重新
確認。Pending、background refetch 與 recovery 顯示 loading，不借用舊 total/rows；
403、500、offline／一般失敗為 error＋type=button retry，失敗不顯示成功空集合。
只有 successful empty 顯示 0 與 empty。Footer pending/error 不捏造末頁資訊。
未增加 polling、跨終端 stock freshness 或 snapshot 保證。

確認新 total 後，若當前頁超出末頁，effect 只降低 page 到新末頁（零資料是頁一），
不先顯示 Page 3 of 2 的假空態；再次確認新頁後止住，沒有向上自動翻頁。
舊 request 只更新原 key 的 cache，不改目前 filter/page 或 modal draft。
這不是更新期間 offset 穩定性承諾。

ApiSuccess<InventoryProductPage> 只解包一次，page type 精確 total/page/limit/data。
既有 PaginatedData 與 PaginatedList 未改；Product 的原 nullable metadata 與
supplier/category/null/isLowStock 相容實際 wire，沒有改 schema 或新增金額語義。
BatchList production 不改，原沿 total 收集全部 product options 的流程保留；只補
既有 mocked fixtures 所需完整型別欄位，以及 real-client 合成 envelope 回歸。
#54 supplier fixtures 同樣只補 page/limit，原 31 個 assertion cases 未弱化。

## 本次實際測試

| 層次 | 結果 |
| --- | --- |
| 新 UI/real-client 合成 HTTP 邊界 | 15/15 JSDOM cases |
| focused：新 15＋原 supplier 31＋原 Batch 3 | 3 files / 49 passed |
| 完整 Admin UI | 9 files / 67 passed；不是沿用前片 52 |
| Admin TypeScript + Vite build | exit 0（tsc 包含 tests） |
| 完整 Admin lint | exit 0 |
| shared types typecheck / POS tsc --noEmit | exit 0；POS source 未改，不是 POS runtime 驗收 |
| context / diff checks | exit 0 |

新 cases 覆蓋 real envelope unwrap/type/null、正常多頁／末頁／total、filter reset、
loading→empty、403/500/offline/request error→非提交 retry、背景 refetch failure
不顯示 cached rows、兩個 deferred 反序 filter 與 rapid next/previous（含 global
60s cache）、total 101→51 與 51→0 的有限恢復、Batch 真 client 兩頁 product
options（不 POST receipt）、產品 refetch 失敗/retry 保留 modal draft 與 supplierId。
原 supplier 31 cases 保留 failure/refetch/missing-options、retry 不 submit、current
supplierId 保存 payload、新商品不自選第一 supplier 的既有結果。

六個實際 RED→GREEN：controls 缺失、typed contract/nullable mismatch、filter 未
重置、產品 error 假空態、refetch 暴露 cached rows、total 縮小停在末頁外。
另有 global fresh-cache rapid-navigation 的實際 RED→GREEN（entry 14→15）。
entry 13 是新增 Batch HTTP fixture 誤用 product pagination shape 的 test-driver
錯誤（1 failed/47 passed/1 unhandled）；只修正批次空陣列 fixture，所有 assertions
與 Batch production 保留。完整失敗輸出未刪，後續 49/full 67 無 unhandled errors。

[raw.zip](raw.zip) 與 [raw-manifest.json](raw-manifest.json) 保存增量 RED／GREEN、
full/type/build/lint 原 bytes、commands/exits/stage/source hash。Entries 03–21 當時
tracked HEAD 是 early 44d，source 在記錄的增量階段；final focused/full/static checks
使用同一組六個 source hash，之後只增文件/證據。沒有捏造早期未捕捉的逐階段
source snapshot，亦不宣稱在最後文件提交 SHA 重跑。讀者可核 early immutable
source、增量失敗 raw 與 final-source-snapshot。空 stdout 的 type checks 仍記 exit 0。

## 重現與限制

使用現有 dependencies（本片未安裝），從 admin-ui：

```sh
npm test -- src/__tests__/productPagination.test.tsx src/__tests__/supplierLists.test.tsx src/pages/Inventory/BatchListPage.test.tsx
npm test
npm run build
npm run lint
```

從 packages/types 執行 npm run typecheck，從 pos-ui 執行
node node_modules/typescript/bin/tsc --noEmit，root 執行
./scripts/validate-agent-context.sh。使用合成 fixture，沒有真交易或正式店內資料。

JSDOM 不是 browser／真 HTTP；本片 browser、CI、硬體、mobile/iPad/Safari 未跑，
也未重跑繼承的 backend PG 與 supplier 前片證據。Union 已獨審，UI 新 delta
仍待非作者 source/raw review。CI 0 runs 不等於 PASS；commits [skip ci]，沒有
workflow／Actions enable/dispatch/rerun。非法參數、max limit、跨更新 snapshot
仍另項，未放行整張 #50/#31、#29/#30/#37 或 G0–G7；#37 未重試。
仍 Draft、不 ready／merge／deploy，未改權限/憑證、建立新環境或 task。
