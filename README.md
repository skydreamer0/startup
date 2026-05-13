# 越南族群健康補給站 — 藥局 SaaS 創業計畫

這個 repo 同時涵蓋**業務營運文件**與**技術系統**，目標是以單店藥局為起點，最終建立可賣給多家藥局的 SaaS 平台。

**業務文件包含：**
1. **模板型文件（01-26）**：系統化整理商業、合規、營運與財務資料。
2. **落地執行文件（27-28）**：以藥局出發，鎖定越南族群，30 天內啟動試點。
3. **實戰工具（29-30）**：訪談紀錄、報價合約等可直接使用的格式。

**技術系統包含：**
- 多租戶企業後台管理系統（Admin SPA）
- 觸控收銀終端（POS PWA，開發中）

---

## 你現在該從哪裡開始

### A. 你是「還沒有客戶」
1. 先執行 `F_執行與驗證/27_30天創業落地執行版_非模板.md` 第 1 週：訪談 30 人 + 確認 SKU。
2. 目標：7 天內拿到第一批到店顧客意向。
3. 用 `H_實戰工具/29_客戶訪談紀錄模板.md` 記錄每場訪談。
4. 完成後進入 27 的第 2-4 週：開店、導流、回購。

### B. 你是「有客戶但不穩定」
1. 先執行 `F_執行與驗證/28_創業落地Roadmap_12週.md` Phase 2（Week 5-8），建立回購機制與產品化。
2. 補齊 `C_營運層/11_營運KPI與儀表板模板.md`、`D_財務層/12_單位經濟模型模板.md`。
3. 用 `F_執行與驗證/16_90天驗證計畫模板.md` 追蹤假設是否達標。
4. 目標：把營收從單次購買轉成穩定回購。

### C. 你是「想擴張」
1. 先執行 28 的 Phase 3-4（Week 9-12）：SOP 制度化、招兼職、評估第二據點。
2. 補齊 `G_人員與治理/21`~`25` 系列文件（人員、激勵、戰情會）。
3. 用 `H_實戰工具/30_報價與合約簡版模板.md` 處理 B2B 團購與 KOL 合作。
4. 目標：建立「不是你本人也能跑」的營運系統。

---

## 建議執行節奏（每週）

- 週一：訂本週 KPI（到店人數、首購數、回購率、毛利）
- 週三：檢查漏斗（哪一段掉最多）
- 週五：戰情回顧 + 下週調整

建議你用同一份 Google Sheet 記錄：
- 每日到店人數與首購轉換
- 每週 LINE 好友新增與互動率
- 每月 SKU 動銷與毛利分析
- 每月現金流與庫存週轉

---

## 交付成果（你應該看見的變化）

執行 12 週後，理想狀態：
- 有效顧客 >= 180 位，回購率 >= 25%
- 月毛利率穩定 >= 28%
- 有標準化 SOP（進貨/店面/LINE/客訴/B2B/財務）
- 有至少一條 B2B 收入來源
- 有可直接給投資人看的文件基礎（14 + 14a）

---

## 文件入口

- 快速開始：
  - `startup_template_pack/F_執行與驗證/27_30天創業落地執行版_非模板.md`
  - `startup_template_pack/F_執行與驗證/28_創業落地Roadmap_12週.md`
- 實戰工具：
  - `startup_template_pack/H_實戰工具/29_客戶訪談紀錄模板.md`
  - `startup_template_pack/H_實戰工具/30_報價與合約簡版模板.md`
- 角色導覽：
  - `ROLE_GUIDE.md`
- 全部文件索引（正式入口）：
  - `startup_template_pack/00_文件索引與填寫順序.md`

---

## 目前架構盤點（Repo Information Architecture）

目前專案的架構區分為「創業業務營運」與「技術子系統」兩大主軸，以業務營運為核心：

### 1. 業務營運與核心文件 (Business & Operations, 核心)
- `startup_template_pack/`：創業計畫、流程 SOP 與落地方案。
  - 內容用「業務能力域」切分（戰略、合規、營運、財務等），直接支援從 0 到 1 的創業流程。
  - 符合創業實務流程（先驗證、再擴張），便於分工。
- `docs/`：存放特定領域的深入研究報告或補充文件（如 `docs/research/deep-research-report.md`）。
- `AI_CONTEXT.md`：本專案 AI 協作的唯一核心指示。
- `README.md` & `ROLE_GUIDE.md`：全域導覽與角色負責範圍。

### 2. 技術子系統 (Technical Subsystems)

所有技術系統收攏於 `systems/` 目錄下。

#### 架構概覽

```
systems/
├── DESIGN.md                  ← PharmaSaaS 統一設計系統（Stripe-inspired）
└── enterprise-admin/
    ├── admin-ui/              ← Admin SPA（老闆/管理員，React + Vite）
    ├── backend/               ← API 後端（Node.js / Express / Prisma / PostgreSQL）
    │   └── prisma/
    │       ├── schema.prisma  ← 多租戶資料庫 schema
    │       └── seed.ts
    └── infrastructure/        ← 架構文件、資料庫規格、開發規範
```

> **POS PWA（收銀終端）**即將加入 `systems/pos-ui/`，設計規格已定義於 `systems/DESIGN.md`。

#### 技術棧

| 層 | 技術 |
|---|---|
| Admin 前端 | React + Vite + TypeScript |
| POS 前端（規劃中）| React PWA + Workbox（離線支援）|
| 後端 | Node.js + Express + Prisma ORM |
| 資料庫 | PostgreSQL |
| 認證 | JWT + RBAC |
| 多租戶隔離 | AsyncLocalStorage + Prisma extension 自動注入 `tenantId` |

#### 多租戶架構說明

系統採 **shared database, row-level isolation** 策略：

- 所有業務資料表皆含 `tenantId` 欄位
- Prisma extended client 在每次查詢自動注入當前 tenant 的 `tenantId`，服務層不需手動處理
- Tenant context 由 middleware 從 JWT 解析後存入 `AsyncLocalStorage`，request 全程可取用

這個結構的優點：
1. **確立主客關係**：程式碼與文件分離，`systems/` 不污染業務文件目錄。
2. **單一設計來源**：`systems/DESIGN.md` 是 Admin SPA 與 POS PWA 共用的設計 token 規格。
3. **擴充性高**：新產品線（LINE Bot、藥局官網）直接在 `systems/` 新建資料夾，共用同一 backend。

---

## 優化進度（已落地）

### 業務文件
1. **P0 完成：統一索引檔命名** — 正式索引改為 `startup_template_pack/00_文件索引與填寫順序.md`。
2. **P1 完成：新增角色導覽頁** — `ROLE_GUIDE.md`，定義 Founder / Ops / Finance / BD 的必讀文件。
3. **P2 完成：模板 metadata 標準化** — 全部 26 份模板加入 `Owner`、`Update Frequency`、`Input From`、`Output To`。

### 技術系統
1. **完成：Admin SPA + Backend** — 後台管理介面與 API 服務可運行。
2. **完成：多租戶 Tenant 隔離** — Prisma extension 自動注入 `tenantId`，所有 unique constraint 已改為 tenant-scoped。
3. **完成：DESIGN.md 設計系統** — `systems/DESIGN.md`，Admin SPA 與 POS PWA 共用的 Stripe-inspired 設計規格。
4. **進行中：POS PWA** — 設計規格已完成，前端框架待建立（`systems/pos-ui/`）。

---

## 16 / 27 / 28 三份文件怎麼搭配？

| 文件 | 用途 | 你什麼時候看 |
|------|------|------------|
| `27` 30天落地 | 第一個月每天做什麼 | 每天 |
| `28` 12週路線圖 | 三個月的階段目標 | 每週 |
| `16` 90天驗證 | 假設是否達標的 Gate Review | W4 / W8 / W12 |
