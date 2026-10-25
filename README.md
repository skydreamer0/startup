# PharmaSaaS｜單店藥局營運工作台

把商品、批號效期庫存、門市 POS、會員與營運報表放進同一套資料流程。先讓一家藥局每天用得穩，再談擴充。

**目前為開發與驗收階段，尚未完成實店端到端驗收。** 下列是已合入主線的功能與工程切片，不代表可直接投入正式營運。完整交付與上線門檻見 [單店藥局整備 #37](https://github.com/skydreamer0/startup/issues/37)。

## 五分鐘看懂專案

1. **現在做什麼：** 先讀下方功能與限制，再看 [ROADMAP 現況](systems/enterprise-admin/ROADMAP.md#current-status)。需求與驗收仍由 [#31](https://github.com/skydreamer0/startup/issues/31)、[#37](https://github.com/skydreamer0/startup/issues/37) 原 AC 及後續確認承接；[#37 差額索引](https://github.com/skydreamer0/startup/issues/37#issuecomment-6331185482) 說明已做、缺口與依賴。
2. **如何組成：** [CONTEXT-MAP](CONTEXT-MAP.md) → [system CONTEXT](systems/enterprise-admin/CONTEXT.md) → [任務導覽](docs/agents/navigation.md) → 相關 MODULE。只讀本次旅程需要的檔案，不先掃完整份 repo。
3. **哪些不能改錯：** [現行架構與不變量](docs/architecture.md) 說明共用交易、unknown 結果、退款與草稿的邊界。兩個 SPA 已存在，共用同一個後端，不另建 POS 系統。
4. **從哪個畫面開始：** [六個角色旅程](systems/enterprise-admin/infrastructure/design-system/MASTER.md#role-journeys) 連到既有頁面、服務與驗收。UI 先確保可操作、可讀與符合螢幕，不以全站換皮取代流程修正。
5. **怎樣才算完成：** 用精確 head、原始測試／畫面及未驗項判定。PR 已合併、CI 通過、真實設備和營運驗收是不同狀態；舊文件中的 Draft 或 proposed 不能單獨判定今天的交付進度。

## 已合入主線的開發功能

- **門市 POS：** 員工登入、商品查找、購物車、掛單、付款記錄、退款登記，以及部分結帳重送／重啟復原。保留精確 **SKU** 掃碼；另有人工維護並覆核的原廠／GTIN 包裝查找、候選選擇及 revision 重驗（[#142](https://github.com/skydreamer0/startup/pull/142)）。查到碼不代表已驗過真掃碼槍或所有包裝換算。
- **商品與庫存：** 商品、分類、供應商、批號效期、初次批次收貨；POS 與一般訂單共用部分扣庫規則，保存 FEFO 批次分攤與稽核紀錄，並有批次更正／放行權限及初次收貨介面。
- **人工收貨草稿：** 私人草稿、手動保存、版本 CAS、失回應查回及唯讀歷史已進主線（[#153](https://github.com/skydreamer0/startup/pull/153)）；尚不是正式 ReceiptDocument，也不會過帳庫存。
- **掃描證據：** 手動文字、圖片與相機可取得本地證據，再明確交給包裝查找；不是 OCR，也不直接寫庫存。
- **會員與管理：** 會員標籤與購買紀錄、RBAC 權限、操作稽核、商品匯入預覽與確認、Excel／CSV 匯入匯出。
- **營運資訊：** 訂單、日結、毛利等報表介面，另有費用 API；完整費用操作頁仍待交付。現金流頁已標示「估算，非實際現金流」，不能用來判斷實際可用餘額或對帳。
- **唯一 POS 單號：** 台北營業日、租戶／日計數器與舊資料升級的限定範圍已完成，見 [#47](https://github.com/skydreamer0/startup/issues/47)。金額政策、報表接線與完整結帳驗收仍屬 [#30](https://github.com/skydreamer0/startup/issues/30)。

## 快速開始

### 1. 安裝與啟動開發資料庫

需要儲存庫存取權限、Bash、**Node.js 22（至少 22.12，未支援 23 以上）**、npm 11.21.0、pnpm 10.34.6，以及運行中的 Docker 與 Compose。

```bash
git clone https://github.com/skydreamer0/startup.git
cd startup/systems/enterprise-admin
npm install --global npm@11.21.0 pnpm@10.34.6
npm --prefix backend ci
pnpm install --frozen-lockfile
docker compose up -d postgres
docker compose exec postgres pg_isready -U admin -d enterprise_admin
```

以下步驟均從 `systems/enterprise-admin` 執行。只使用可重建的本機開發資料庫；[Compose](systems/enterprise-admin/docker-compose.yml) 的 PostgreSQL 對本機使用 **5433** 連接埠，內含開發用帳密，不適合直接公開部署。

### 2. 設定後端

建立 `backend/.env`，將下列佔位符換成實際值。資料庫帳密需與 Compose 相符；兩組 JWT secret 須不同且各至少 32 字元。佔位符不是可直接啟動的設定。

```dotenv
DATABASE_URL="postgresql://<user>:<password>@localhost:5433/enterprise_admin"
JWT_ACCESS_SECRET="<replace-with-a-random-secret>"
JWT_REFRESH_SECRET="<replace-with-a-different-random-secret>"
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

可各執行一次以下指令產生 JWT secret，分別填入對應欄位；不要提交 `.env` 或機密。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

設定來源是 [`backend/src/config/env.ts`](systems/enterprise-admin/backend/src/config/env.ts)。兩個前端均透過 Vite 將 `/api` 代理至後端；LINE 憑證為選填。

### 3. 初始化本機資料庫

確認 PostgreSQL 已就緒，並再次確認 `DATABASE_URL` 指向本機開發資料庫。遷移及 seed 會寫入資料，不要指向正式或既有門市資料庫。

```bash
npm --prefix backend run db:generate
npm --prefix backend run db:migrate
npm --prefix backend run db:seed
```

`db:migrate` 使用 `prisma migrate dev`，僅供開發。帳號與 POS 員工代碼由 [`seed.ts`](systems/enterprise-admin/backend/prisma/seed.ts) 建立；範例帳號、密碼與資料不可用於正式環境。

### 4. 啟動服務

開啟三個終端機，皆切換至 `systems/enterprise-admin`，分別執行：

```bash
npm --prefix backend run dev     # API       http://localhost:3000
pnpm --filter admin-ui run dev   # 管理後台  http://localhost:5173
pnpm --filter pos-ui run dev     # 門市 POS  http://localhost:5174
```

API 基底路徑為 `/api/v1/admin`。後端 `/health` 只表示程序存活，`/ready` 才檢查資料庫連線與套件內的遷移狀態；服務啟動也會檢查 readiness。詳見 [健康檢查契約](systems/enterprise-admin/infrastructure/verification/health-readiness/README.md)。

## 架構與資料責任

```text
管理後台 admin-ui ─┐
                  ├── Express API ── Prisma ── PostgreSQL
門市 POS pos-ui ───┘   backend
```

程式位於 `systems/enterprise-admin`，採模組化單體：React 19／Vite 6 前端，Express 5／Prisma 6 後端，PostgreSQL 15 資料庫。

- `admin-ui/`、`pos-ui/` 負責操作介面，`packages/types/` 放共用型別；由 **pnpm workspace** 管理。
- `backend/` 負責權限、租戶隔離、交易與資料持久化，保留獨立 **npm** 安裝邊界。請勿混用 lockfile，見 [依賴管理](systems/enterprise-admin/infrastructure/standards/dependency_management.md)。
- 實體庫存由後端過帳流程處理；商品匯入只改中繼資料，退款登記不等於實體退貨入庫。完整收退貨、更正與全入口一致性仍有待辦。
- 人工 ReceivingDraft 已有獨立保存與歷史；來源原圖、OCR proposal 與正式收貨過帳仍是後續工作。掃描、OCR、列印均不能直接改存量。OCR 候選尚未定案，既有範圍禁止使用雲端 OCR／Vision／LLM／AI API。

模組導覽見 [CONTEXT.md](systems/enterprise-admin/CONTEXT.md)；資料模型以 [Prisma Schema](systems/enterprise-admin/backend/prisma/schema.prisma) 為準，介面契約見 [API 規格](systems/enterprise-admin/infrastructure/api/api_spec.md)。

## 測試與驗收

在 `systems/enterprise-admin` 執行：

```bash
pnpm run build                           # 後端及前端建置
pnpm run test                            # 後端及 workspace 套件測試
pnpm run lint                            # 後端及有 lint script 的套件
pnpm --filter @pharmasaas/types run typecheck
pnpm run agent:context                   # 文件／模組導覽檢查
```

部分後端整合測試需要已初始化的 PostgreSQL；專用原生資料庫驗收另有明確啟用與隔離條件。請依 [測試策略](systems/enterprise-admin/infrastructure/standards/test_pyramid.md) 及各驗收文件操作，不能把跳過的測試算作通過。

[CI](.github/workflows/ci.yml) 保留 Agent Context、Backend、Admin UI、POS UI 四個核心檢查，另有各切片的 PostgreSQL／瀏覽器驗收與安全檢查。工作數與選擇條件以當次 workflow 和精確 head 的全部實際 checks 為準，不以舊快照的固定 job 數判定。

測試證據分層看待：

- **單元／元件：** 邏輯及 JSDOM 操作，不代表真實瀏覽器或設備。
- **原生 PostgreSQL／HTTP：** 驗證隔離測試資料的交易、遷移與重送等限定範圍。
- **瀏覽器：** 分清目前 head 的真 API／PG 旅程、模擬 HTTP 畫面測試，以及歷史固定版本 scanner／supplier。每份證據只驗其記錄的版本、資料來源與案例；不能互相代用。
- **實店驗收：** 真實付款、掃碼槍、列印、Safari／iPad、備份還原與營運對帳，仍須另行驗證。CI 通過不等於正式上線。

本機結帳測試可限定執行下列兩份 spec。需要已安裝的 Chromium、運行中的 API（3000）／POS（5174），以及隔離開發資料庫、seed 員工與有庫存商品。`checkout-flow` 會寫入交易及關閉測試員工既有班次，務必只用可重建的測試資料；`checkout-recovery` 則攔截 HTTP 使用合成回應。

```bash
pnpm --filter pos-ui run test:e2e:install
pnpm --filter pos-ui run test:e2e checkout-flow.spec.ts checkout-recovery.spec.ts
```

不加 spec 篩選會收集需要其他連接埠與專用啟動器的測試，不能只靠上述 API／POS 服務執行。專用流程請依 [HTTP 復原](systems/enterprise-admin/infrastructure/verification/checkout-command/http-restart/README.md)、[SKU 驗收](systems/enterprise-admin/infrastructure/verification/pos-product-lookup-ci/README.md) 與 [固定版本 scanner／supplier 瀏覽器驗收](systems/enterprise-admin/infrastructure/verification/reviewed-ui-browser/README.md) 的設定；預設 CI 也未執行整個廣泛 E2E 集合。

## 限制與下一步

- **結帳／帳務：** 唯一單號已交付；精確金額政策、完整結帳驗收與報表對帳仍待完成。現金流以固定示範期初及近似收支計算，詳見 [#30](https://github.com/skydreamer0/startup/issues/30)。
- **條碼／收貨：** 已有覆核包裝查找與人工草稿；全店單位政策、真碼制硬體、有碼／無碼正式收貨閉環、照片／單據 OCR 及原圖留存仍未完成。見 [#31](https://github.com/skydreamer0/startup/issues/31)、[#48](https://github.com/skydreamer0/startup/issues/48) 與 [#37](https://github.com/skydreamer0/startup/issues/37)。
- **庫存：** 實體退貨、庫位／移位、更正對帳及全入口統一過帳仍待完成，見 [#29](https://github.com/skydreamer0/startup/issues/29)。
- **付款／離線：** 拆分付款記錄不代表串接刷卡或 LINE Pay；離線佇列尚未接入正式結帳，不能作為離線收銀。
- **外部整合／部署：** LINE 需設定憑證；QuickBooks／Xero 仍是 adapter／mock provider；電子發票延後。正式 TLS、機密、資料庫網路、備份還原及標籤真機列印尚待驗收。
- **整合狀態：** [拆單付款／PIN 焦點 #88](https://github.com/skydreamer0/startup/pull/88) 已於 2026-10-10 合併；[#142](https://github.com/skydreamer0/startup/pull/142)、[#153](https://github.com/skydreamer0/startup/pull/153)、[#160](https://github.com/skydreamer0/startup/pull/160) 也已合入。其限定證據不代表整張 #31／#37 或實店門檻完成。尚未合併的修補只算候選，最新狀態查 PR 與 ROADMAP。

## 文件入口

- [Roadmap](systems/enterprise-admin/ROADMAP.md)：工程狀態與歷史證據；舊階段完成不代表新需求或實店驗收完成
- [整備總追蹤 #37](https://github.com/skydreamer0/startup/issues/37)：目前待交付範圍與驗收門檻
- [架構決策 ADR](systems/enterprise-admin/infrastructure/adr/)：持久化、庫存、結帳與其他設計邊界
- [Production Runbook](systems/enterprise-admin/infrastructure/standards/production_runbook.md)：正式遷移、部署與維護準備
- [AGENTS.md](AGENTS.md) · [Git 工作流程](systems/enterprise-admin/infrastructure/standards/git_workflow.md)：開發與審查規則
