# #50B2：商品列表 UI 分頁（早期 Draft）

新分支 feat/admin-product-pagination；Draft base 為 fix/admin-supplier-list-state
（#54@283eec62a0499b0aeeee240ba0ec06064363ee77）。相依 #54/#55 均未合併，
現在不改 master／原分支，不 ready／merge／deploy，不混入 #53。

聯集 checkpoint `8c1384e0373078dcda0f683a39bf0ca87a8e2c05`，tree
`e532ff04c32b0fe4c5f4ff9247c3221c02fca729`；actual parents：#54 的 283eec62，
#55 的 7b6e5276d74dc19a6c2adc28e659ce823912b945。base master 為 1f7eeb09。
兩片相對 master 的 10/11 檔聯集為 20 檔，只有 ROADMAP 重疊；兩條 evidence
逐字合併，原 base 文字與 checkbox 不變，其餘所有 blob 完全沿原已審版本。
完整逐檔對照在 [union-manifest.json](union-manifest.json)。這是本機 feature
聯集 merge commit，沒有操作 GitHub PR 合併或主線合併。

UI delta 請只審 checkpoint→候選 head，不把繼承的 #54/#55 重交為新成果。
早期只加入 ProductListPage page/filter key、前後頁與 total/末頁顯示，
first tracer actual RED（原本無分頁控制）→ GREEN 1/1；[early raw](early-raw.zip)
与 [commands/exits/hash](early-manifest.json) 保留原始完整輸出。

仍待做：typed client／精確 page 型別、filter reset、deferred/快速翻頁、
產品 loading/error/retry/stale、total 縮小復原、BatchList typed 相容、#54
回歸以及 full admin/type/build/lint/context。現在不得宣稱完整 #50B2 通過。
JSDOM 不等於 browser；本片 browser／真 HTTP／CI／硬體未跑。
不改 backend <= 定義、page1/limit50、wire shape、非法參數/max/snapshot 政策。
只用合成 HTTP fixture，沒有真交易／正式店內資料、安裝、權限/憑證變更。
原 #50/#31 checkbox／#29/#30/#37/G gates 未放行，#37 未重試。
所有提交 [skip ci]；不觸發/啟用/dispatch/rerun Actions 或改 workflow。
