# DL-720W NEW 本機標籤代理

此模組由 2026-10-15 已驗收的 Windows BLE 程式整合進 STARTUP。保留 Python/Bleak 的已驗證傳輸路徑；`src/deli720w/`、`scripts/`、`tests/` 和固定實驗封包來自原交付件。原始驗收報告位於使用者交付的 `deli-720w-bluetooth.zip`，未將含裝置資訊的傳輸日誌納入版控。

## 本機安裝

在店內**連接標籤機的 Windows 電腦**執行，不在雲端 backend 或 Docker 容器執行。Python 3.12 為本次驗收環境；需要 Windows 藍牙與繁體中文字型。

```powershell
cd systems/enterprise-admin/local-print-agent
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\requirements-tested.txt
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m deli720w.api init-token --token-file .\private\api-token.txt
```

先以禁止實體列印模式啟動。使用的 `--allow-origin` 必須和實際後台頁面的 origin 完全一致；本機開發例子須用 `http://127.0.0.1:<port>` 開頁，正式部署可指定單一 HTTPS origin。不要提交 token、工作紀錄或把 token 放入前端環境變數。

```powershell
.\.venv\Scripts\python.exe -m deli720w.api serve --token-file .\private\api-token.txt --report-dir .\private\api-reports --port 8765 --allow-origin http://127.0.0.1:5173
```

後台「Inventory (Products)」可填英文商品名、規格、劑型、學名、健保碼及完整藥證字號。這些欄位對既有資料為空值，須由藥師核對並補齊。三行版上方依序為「商品中文品名原文」「英文商品名」「學名」；規格與劑型不另附加在中文行。分隔線下先印藥證，下一行左側印健保碼、右側以小字印**本次列印時輸入的實際儲位**，橫線正上方靠右的 QR 編入 `P1:<SKU>`。實際儲位每次重填，修改後必須重新取得預覽，不寫回商品或批次。缺欄位或 SKU 格式不符時不允許預覽。輸入本機 token 後，先取得 50 × 30 mm 橫式閱讀預覽與實際工作 SHA-256，再核對送印一張。實體紙張設定為 50 × 30 mm、400 × 240 點陣，工作點陣相對閱讀預覽旋轉 180°，沿用使用者確認正確的編號 2 方向。代理以 `medicine-landscape-v8` 區分先前版型。縮小 QR 已通過本機軟體解碼；單張 v3 工作 BLE 完整寫入，但使用者回報字體太小。v4 曾放大字體並送印一張；依使用者後續意見，v5 移除紙面 SKU 並再次放大文字，僅產生預覽、不再送印。v6 再將 QR 移到右上、儲位縮小至右下並放大主文字，僅產生預覽、不再送印；v7 再將藥證移至分隔線下首行，健保碼與右側儲位同列，放大主文字；只產生預覽。v8 將 QR 下緣對齊橫線上方，保留 QR 白邊；僅產生預覽。v8 的紙上可讀性與 QR 掃描仍待實體驗收，不能僅憑 BLE 寫入視作通過。此版是**店內藥品品項識別標籤**，不含批次、效期、病人資訊或用藥指示；QR 不代表原廠 GS1 DataMatrix。原廠條碼辨識、官方資料對照及 `P1` 掃描查詢仍待另案接入。Code128 不產生，掃碼驗收仍未完成。

實體列印需用 `deli720w list --show-address` 確認本人的印表機位址與完整廣播名稱，並明確重啟代理：

```powershell
.\.venv\Scripts\python.exe -m deli720w.api serve --token-file .\private\api-token.txt --report-dir .\private\api-reports --port 8765 --allow-origin http://127.0.0.1:5173 --enable-printing --target-address '<確切位址>' --target-name '<DL-720W(NEW)加四碼尾綴>'
```

`queued` 只代表排入佇列；`submitted_unverified` 只代表 BLE 傳輸完成。工作逾時、斷線或代理重啟可能是 `outcome_unknown`，代理不自動重印。操作員應檢查紙張和本機紀錄，再決定是否建立新工作。先前 v1 本機 API 曾實際出紙但方向錯誤；v2 方向由直接 BLE 測試的編號 2 實物確認，更新後的 v2 本機 API、正式後台來源與瀏覽器 loopback 權限仍需實機驗收。Code128 解碼尚未驗收。

本機 HTTP 合約與安全閘門見 `src/deli720w/api.py`；STARTUP 呼叫端見 `admin-ui/src/services/localLabelPrinter.ts`。原 POS 收據列印不經此代理。
