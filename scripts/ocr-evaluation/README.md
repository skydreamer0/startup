# 本地 OCR 六欄評測工具：純合成契約驗證

這是離線、Python 標準庫的**評分器／安全邊界測試工具**，不是 OCR 引擎，也未接產品、模型、API 或資料庫。所有內容是人工編造的文字 fixture。`SYN…` 健保碼與「合成測試品…」皆為假資料，沒有查驗健保碼格式或藥品存在性。

控制組故意手工照抄 oracle；它的滿分只驗證評分器，不能稱為模型準確率、真圖辨識、收貨完成或自動入庫。這個版本刻意拒絕自稱 engine run／真資料／holdout 的輸入。未修改既有 master、Draft PR、產品候選、依賴、lockfile 或掃碼 3.1.2 停點；未安裝套件、模型、啟動環境或外部寫入。

## 原始需求與查重

- [startup #37](https://github.com/skydreamer0/startup/issues/37)，回讀 `updated_at=2026-10-11T17:01:36Z`：M1 必須看商品／批效／行、數量與單位的業務錯誤，不能用 confidence 平均代替；G3 未知商品／單位／批效需人工與已核定政策。M0 QR/條碼優先，本工具不阻塞或替代 M0。
- [startup #48](https://github.com/skydreamer0/startup/issues/48)，回讀 `updated_at=2026-10-11T10:10:01Z`：保留 literal、前導零與大小寫；OCR 只是 proposal，包裝／換算與商品 identity 不可猜。此工具不宣稱完成 #48 的 mapping 或真 PostgreSQL gate。
- 既有 OCR 調研第八節（私人研究資料，不隨本候選公開）：gold 應標欄位存在／unresolved／頁區／行；literal exact、expiry 文字與語義分開；abstain 不算擷取；數量×單位×包裝須 joint exact；模板分組的 calibration/holdout 與人工／效能需分開量測。最新 #37 的全本地決策排除歷史雲端選項。
- 已查既有本地 pharmacy 掃碼盤點及相關研究／harness，未找到 OCR 六欄離線評測器；遠端 default-branch OCR 搜尋指向 README/ROADMAP 尚未完成狀態與 UI 限界，未找到同類程式。這是有界查重，不聲稱搜尋所有歷史分支。Issue 原文與第八節來源摘錄保留於 evidence。

只新增本資料夾的 evaluator、fixtures、tests、verify 與說明／證據。不建立另一套商品、包裝、庫存或臨床權威，不改產品 schema／契約。

## 執行

需要既有 Python 3.10+，不需要 pip、npm、網路、模型或 GPU。實跑版本記在 verification-summary.json。

```sh
python3 verify.py
python3 -m unittest discover -s tests -v
python3 evaluator.py fixtures/gold.json fixtures/control_predictions.json
python3 evaluator.py fixtures/gold.json fixtures/negative_predictions.json
```

也可從別的 cwd 執行 `python3 /完整路徑/verify.py --output-dir /你的驗證結果資料夾`。verify 只寫指定證據目錄；evaluator 只讀輸入並將 JSON 印到 stdout。evaluator 的 exit code：0＝合成 oracle 契約完全符合；1＝有效輸入但有錯值、未覆核、缺漏或額外行；2＝輸入／格式錯誤。負向 fixture 的預期是 FAIL/exit 1，verify 整體應 PASS。stderr 不應被當作正常報告。

verify 保留 35 個 unittest 的原始結果、控制／負向 JSON、逐命令 exit code、同輸入連跑兩次 bytes 一致檢查、Python／平台及 source SHA256。輸入 SHA256 綁同一份實際解析 bytes；報告也含 evaluator SHA256。摘要不將程式執行秒數充當 OCR CPU 效能。

## Fixture 與輸入契約

- `gold.json` 有 11 個人為行、66 個欄位：健保碼 nhi_code、品名 product_name、批號 lot、效期 expiry、數量 quantity、單位 unit。51 個已知文字欄位、15 個不存在／不可讀／歧義欄位。
- 包含不同含量同名品、前導零、大小寫、O/0、標點、全形、只有年月、day/month 未定、民國年文字、不合法曆日、缺欄與多候選。無圖片、無真文件、無個資。
- source.document_id/page/region 是**虛構標註定位**，不是實際影像證據。row_id 為人工預先對齊且全檔唯一；順序可變，缺行不能消失，未知額外行需報錯。不測自動表格／跨頁行對齊。
- source.split 只能是 `synthetic_contract_only`。沒有校正／holdout、調參或獨立代表性樣本宣稱。未來真樣本需另訂授權、來源保全、雙人 gold 核定及文件／模板群組切分。
- gold 每行必須完整六欄：known 恰好一個原字串；absent/unreadable 零個；ambiguous 至少兩個不同候選。absent 與 unreadable 狀態分別留在逐欄明細。
- prediction 可明確 candidate／missing／ambiguous，欄位皆需 boolean review_required。confidence 可選且只能有限 [0,1]，完全不參與評分或放行。缺行／欄是 omission，不能拿來充正確 abstain。
- 字串只檢查非空與 UTF-8 可表示，評分逐碼點 exact：不 trim、轉全形、繁簡轉換、去標點、改大小寫、補零、O/0/I/1 互換或數字規格化。`1`、`01.0`、`１０` 是不同 literal。
- 不合法 JSON、重複 key/row_id、空 gold、不完整 oracle、錯型別、重複候選、未知欄位／狀態、非法 confidence 均 exit 2，不默默轉成 missing。此為有界測試檔案工具，未做敵意大型檔案的 resource-hardening。

## 指標、分母與 FAIL 的意義

每欄分列 numerator、denominator 與 value；分母 0 時 value=null，禁止把「無資料」算成 100%。

1. `literal_exact_on_known`：gold known 欄位全數為固定分母。只有恰好一個 candidate 且原字串完全相等算正確。缺欄、缺行、missing、ambiguous、錯值都不正確。歧義列表含正解也不算已辨識。
2. `single_candidate_coverage_on_known`：known 中提供一個候選的比例；有提供不等於提供對。
3. `wrong_literal_among_single_candidates`：known 上單候選錯字數／單候選數，與 exact/coverage 分開。這是 literal 錯配，**不叫商品 identity false-match**。
4. `explicit_unresolved_handling`：gold absent/unreadable 須明確 missing；gold ambiguous 須保留同一候選集合；且 review_required=true 才算合乎本 fixture oracle。不算進 extraction 正確數。另列幻覺、強選歧義、omission、覆核違反與逐欄錯因。
5. `quantity_unit_literal_joint_exact`：兩欄 known 的 8 行為分母，數量與單位同時 exact 才正確。「10盒」變「10粒」不通過。**未含包裝 identity/revision/conversion，不是原研究要求的完整業務三者 joint gate**；其餘 3 行仍在六欄明細與 unmet oracle 中，未從整體消失。
6. `all_six_literals_known_and_exact_rows`：全 11 行為分母，必須六欄全 known 且 exact。包含未知的行不算全擷取正確。

控制組只有「synthetic fixture contract PASS」；負向組固定有 24 個欄位契約不符、1 行缺失、1 額外行／6 額外候選欄，數量×單位文字 joint exact=5/8。PASS 不是風險門檻或正式功能驗收。每個結果都強制 `requires_human_confirmation=true`、`business_auto_acceptance=false`；輸入自稱不要覆核會 FAIL，不能被高 confidence 蓋過。

## 日期與人工边界

效期 exact 只問原字串是否照抄正確。例如原字串是 `2027-02-30`，忠實照抄可算文字 exact，但另標 `invalid_iso_calendar_literal`，日期業務語義仍 `NOT_EVALUATED`。只有格式恰為 YYYY-MM-DD 且 Python date 可解析才標 `valid_iso_calendar_literal_only`；也仍必須人工確認，不代表未過期或適用任何放行政策。年月、民國年與 03/04/2027 都要求人工解讀，不自行補日、換年或選日月順序。

缺值與歧義不會選第一候選；所有商品／包裝、單位換算、實收數量、來源 revision、人工批准和庫存操作都未接線。此工具沒有接受／過帳 API，也沒有網路、資料庫、引擎啟動或自動安裝程式碼。

## 尚未執行／不涵蓋

真圖 OCR 引擎、RapidOCR/PaddleOCR/ONNX 或任何模型比較、辨識準確率、商品／包裝 identity false-match、真日期／換算業務規則、影像 hash／頁座標 provenance、真表格對齊、校正／holdout 泛化、人工修正 P50/P95、CPU/RAM、外網拔線冷啟動、8GB PC 與 POS 並行、UI／Safari/iPad／掃码器、任何 G0–G7 gate：均 NOT RUN/NOT EVALUATED。未調整任何原 Issue 完成勾選。
