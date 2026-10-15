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

後台「Inventory (Products)」的商品列有「建立標籤」。輸入本機 token，核對藥品／商品名稱、SKU、補充資訊與可選 QR，先取得本機產生的 30 × 50 mm 點陣預覽與 SHA-256。核對後才能送一張。現有 Product 模型沒有法規用藥欄位或條碼欄位；此版是**商品識別標籤草稿**，沒有自動編入 QR 或 Code128，也不宣稱可作為處方或用藥指示標籤。

實體列印需用 `deli720w list --show-address` 確認本人的印表機位址與完整廣播名稱，並明確重啟代理：

```powershell
.\.venv\Scripts\python.exe -m deli720w.api serve --token-file .\private\api-token.txt --report-dir .\private\api-reports --port 8765 --allow-origin http://127.0.0.1:5173 --enable-printing --target-address '<確切位址>' --target-name '<DL-720W(NEW)加四碼尾綴>'
```

`queued` 只代表排入佇列；`submitted_unverified` 只代表 BLE 傳輸完成。工作逾時、斷線或代理重啟可能是 `outcome_unknown`，代理不自動重印。操作員應檢查紙張和本機紀錄，再決定是否建立新工作。此整合仍需正式後台來源、瀏覽器對 loopback 的權限與**本機 API 實際出紙**驗收。Code128 解碼尚未驗收。

本機 HTTP 合約與安全閘門見 `src/deli720w/api.py`；STARTUP 呼叫端見 `admin-ui/src/services/localLabelPrinter.ts`。原 POS 收據列印不經此代理。
