# Production Runbook

> Scope: `systems/enterprise-admin` production Docker Compose deployment.  
> Related architecture: `../adr/adr_011_production_deployment.md`.  
> Original operator workflow: 2026-06-02.
> Local-store acceptance supplement: 2026-10-08, source baseline `37b5ba3` (tree `d7d05669`).

> **Execution gate:** This is a deployment scaffold and an unexecuted acceptance plan, not a verified pharmacy installation. Read §10 before using any command below. The historical §3–6 examples assume an approved, explicitly selected target; they are not safe defaults for a live store or an isolated rehearsal. No deployment, restore, reboot or device test was performed for this supplement. Production gates in `../../ROADMAP.md` and issue #37 remain open.
>
> **Current source caveats:** `docker-compose.yml` has inline development credentials and no `env_file` mapping. Merely copying `.env.production` does not replace those values. The backend image's default command runs `prisma migrate deploy` before starting the API; `make prod`/Compose start can therefore mutate a database. The scaffold has no service `restart` policies and no original-image data mount/backup job. A host owner must approve and validate an explicit deployment configuration before use; this document does not change it.

This runbook turns Phase 11 deployment scaffolding into an operator workflow. It covers the minimum steps an on-call or cloud worker needs to deploy, verify, migrate, roll back, and restore the enterprise admin stack without relying on conversation history.

---

## 1. Deployment Topology

Production runs as one Docker Compose stack from `systems/enterprise-admin`:

| Service | Responsibility | Public exposure |
| --- | --- | --- |
| `nginx` | Single HTTP entrypoint and reverse proxy | Host port `80` by default; `443` is reserved for future TLS enablement. |
| `backend` | Express API and `/health` endpoint | Internal Compose network only, exposed to `nginx` as `backend:3000`. |
| `admin-ui` | Static admin SPA served by nginx | Internal Compose network only, proxied at `/`. |
| `pos-ui` | Static POS SPA served by nginx | Internal Compose network only, proxied at `/pos/`. |
| `postgres` | Application database | Bound to host port `5433` for current scaffold access; restrict or remove host binding on hardened hosts. |

Nginx route contract:

- `/api/*` proxies to `backend:3000`.
- `/pos` redirects to `/pos/`.
- `/pos/*` proxies to `pos-ui:80` after stripping the `/pos/` prefix.
- `/` proxies to `admin-ui:80`.
- `/health` returns `ok` from the edge proxy.

---

## 2. Secret And Environment Ownership

Use `systems/enterprise-admin/.env.production.example` as the template, not as a deployable secret file.

| Variable | Owner | Rotation / handling |
| --- | --- | --- |
| `DATABASE_URL` | Platform / DBA owner | Must match the production database credentials. Rotate with DB password rotation and update dependent services together. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Platform / DBA owner | Required only when Compose owns Postgres. Do not commit real values. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Backend / security owner | Minimum 32 random characters. Rotate by deploying new secrets and forcing user re-login. |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Backend owner | Keep access tokens short-lived; refresh duration follows product security policy. |
| `URL`, `FRONTEND_URL`, `CORS_ORIGIN` | Platform / frontend owner | Must match the public DNS origin exactly, including scheme. |
| TLS certificate material | Platform owner | Store outside git. Current Compose file includes certbot placeholders only. |

Before any production deploy:

1. Copy `.env.production.example` to the deployment host secret store or host-local `.env.production` file.
2. Replace every `change-me`, `replace-with-*`, and `example.com` value.
3. Confirm the deploy user can read secrets but they are not world-readable.
4. Confirm no real secrets appear in git diff, shell history, PR text, or logs.

---

## 3. Standard Deployment Procedure

Run commands from `systems/enterprise-admin` unless noted otherwise.

### 3.1 Preflight

1. Confirm the branch/commit being deployed and review the associated PR.
2. Confirm CI has passed, especially backend `prisma generate`, backend build, admin-ui build, and pos-ui build.
3. Confirm `.env.production` or the host secret injection mechanism is populated.
4. Confirm disk space is sufficient for image build, Postgres data, and a backup artifact.
5. Create a pre-deploy database backup before running migrations.

### 3.2 Build And Start

```bash
make prod
```

Equivalent command:

```bash
docker compose up -d --build
```

Expected result:

- `postgres` becomes healthy first.
- `backend` starts after Postgres is healthy.
- `admin-ui` and `pos-ui` start after backend is healthy.
- `nginx` exposes the public HTTP entrypoint.

### 3.3 Verify Health

```bash
docker compose ps
curl -fsS http://localhost/health
docker compose exec backend wget -qO- http://localhost:3000/health
```

Interpretation:

| Check | Healthy signal | Action when unhealthy |
| --- | --- | --- |
| `docker compose ps` | Services show `running` / `healthy` where healthchecks exist. | Run `docker compose logs -f <service>` and check the dependency chain. |
| `GET /health` at nginx | Returns `ok`. | Check nginx config, upstream service names, and port exposure. |
| Backend healthcheck | Backend `/health` returns JSON from inside the backend container. | Check `DATABASE_URL`, JWT env parsing, Prisma generation, and backend logs. |
| Admin UI route `/` | Admin shell loads. | Check `admin-ui` container build and nginx upstream. |
| POS route `/pos/` | POS shell loads with assets under `/pos/`. | Check `VITE_BASE=/pos/` build arg and nginx rewrite rules. |

---

## 4. Migration Procedure

Use migrations only after a backup exists and the release commit is confirmed.

```bash
make migrate
```

Equivalent command:

```bash
docker compose run --rm backend npx prisma migrate deploy
```

Migration checklist:

1. Confirm backup artifact exists and restore steps are known.
2. Confirm no application deploy is simultaneously running.
3. Run `make migrate` once per deployment.
4. Watch backend logs for Prisma migration errors.
5. Re-run health checks and smoke-test login plus a read-only admin page.

If migration fails:

1. Stop further deploy steps.
2. Capture `docker compose logs backend postgres`.
3. Do not retry repeatedly without identifying the failed migration and DB state.
4. If the failed migration partially changed schema/data, follow the rollback/restore section.

---

## 5. Rollback Procedure

Rollback depends on whether migrations were applied.

### 5.1 Application-Only Rollback

Use when no migration ran or when the migration is backward-compatible with the previous image.

1. Check out or select the previous known-good release commit/tag.
2. Rebuild and restart:

```bash
docker compose up -d --build
```

3. Verify `docker compose ps`, `/health`, `/`, and `/pos/`.
4. Record the rollback commit and reason in the incident notes.

### 5.2 Migration Rollback / Restore

Use when a migration changed schema/data and the previous app version is not compatible.

1. Stop write traffic if possible.
2. Keep containers/logs available for forensics.
3. Restore the pre-deploy database backup into the target database.
4. Deploy the previous known-good application commit.
5. Re-run health checks and smoke tests.
6. Open a follow-up issue with the failed migration name, logs, and restore timestamp.

Do not manually edit production schema as a rollback unless the DBA/platform owner approves and records the exact SQL.

---

## 6. Backup And Restore Expectations

Minimum production expectation:

- Take a database backup before every migration-bearing deploy.
- Keep automated daily backups for the retention period defined by the platform owner.
- Test restore on a non-production database before trusting a backup strategy.
- Store backup artifacts outside the application git repository.

Suggested Compose-owned Postgres backup command pattern:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%Y%m%d%H%M%S).sql
```

Suggested restore command pattern for a verified backup:

```bash
cat backup.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

For managed databases, use the provider snapshot and point-in-time recovery workflow instead of ad hoc host-local dumps.

---

## 7. Monitoring Checklist

Use this checklist during deploys and as first-response triage.

### 7.1 Service Health

- `nginx` `/health` returns `ok`.
- Backend `/health` is reachable from inside the Compose network.
- `docker compose ps` shows no restart loop.
- `docker compose logs -f nginx backend postgres` has no repeated 5xx, connection, or migration errors.

### 7.2 Error Monitoring

- Track backend 5xx rate and failed auth requests.
- Track nginx upstream errors for `/api/*`, `/pos/*`, and `/` separately.
- Alert when SLO thresholds in `slo_error_budget.md` are breached.

### 7.3 Audit And Security Signals

- Confirm sensitive admin actions still write audit logs after deploy.
- Alert on unusual spikes in failed login attempts.
- Alert on repeated RBAC/permission-denied responses for privileged endpoints.
- Never log passwords, JWT secrets, full payment data, or other sensitive PII.

### 7.4 Rate Limit And Abuse Signals

- Monitor barcode/product lookup spikes from POS clients.
- Monitor analytics/report endpoints for repeated expensive requests.
- Alert when edge/backend rate limit counters approach configured limits.

### 7.5 Data And Database Signals

- Monitor Postgres disk usage, connection count, and restart count.
- Confirm migration completion before accepting write traffic.
- Confirm backup job completion and restore-test cadence.

---

## 8. First Response For Failed Deploys

1. Keep the failing containers running long enough to capture logs unless they are actively damaging data.
2. Capture:

```bash
docker compose ps
docker compose logs --tail=200 nginx backend postgres admin-ui pos-ui
```

3. Classify the failure:
   - **Config/secrets:** env parser errors, CORS mismatch, JWT secret length, wrong public URL.
   - **Database:** Postgres unhealthy, migration failed, Prisma client/schema mismatch.
   - **Routing:** nginx 404/502, `/pos/` asset path errors, `/api/*` proxy errors.
   - **Build/image:** UI assets missing, backend image build failed, stale image tag.
4. Apply the smallest safe fix or rollback path.
5. Re-run health checks and smoke tests.
6. Record the root cause, command output, and follow-up owner.

---

## 9. Known Gaps And Deferred Hardening

- TLS/certbot is scaffolded but deferred until host DNS is fixed.
- Compose-owned Postgres is acceptable for scaffolded deployments; hardened production may require a managed database and private networking.
- The current Compose scaffold binds Postgres to host port `5433`; remove or firewall that binding for hardened hosts.
- Roadmap A found that some cloud environments cannot fetch Prisma engines from `binaries.prisma.sh`; production/CI runners must either allow that host or cache the required engines. CI now caches `~/.cache/prisma`, but first-time runners still need network access or a pre-populated cache.
- POS Playwright E2E requires browser installation via `pnpm --filter pos-ui run test:e2e:install` before it can be used as a deploy gate. Cloud runners may receive 403 responses from Playwright CDN downloads; use network allowlisting or a pre-populated browser cache before promoting E2E to a required gate.


---

## 10. 單店本地部署、隔離還原與設備驗收計畫（尚未執行）

### 10.1 邊界與責任

- 沿用 ADR-011 的單套 **Docker Compose + nginx**：店內主機提供 PostgreSQL、backend、admin-ui、pos-ui，收銀端以瀏覽器進入 `/pos/`。這是單店部署目標，不是已裝妥的店內系統；不導入 Electron 或 Tauri，也不移除既有 tenant 隔離。
- 藥局負責人決定可接受的停業／資料損失範圍、核准切換與恢復營業；主機／DB 負責人準備隔離環境、備份、權限與回退方案；現場驗收人員持實際掃碼器／印表機完成操作。執行前填具人名與聯絡方式，不能以「CI 通過」代替任何簽核。
- 本次只整理手冊。不得據此自行啟動主機／資料庫、讀取正式憑證、還原正式資料、調整防火牆／安全權限或部署。另行批准演練時，也只可操作明確指定的隔離目標；正式切換需另外核准。
- **RPO、RTO、備份頻率／保存期限、異地副本位置與演練週期均待人決定**。每日備份是 §6 的最低建議，不能自行推定 RPO=24 小時，更不能承諾 RTO。記錄決定人、目標值、核准日期；尚未決定或未量測時不得標為通過。

### 10.2 備份集：PostgreSQL、原圖與安全設定

每次備份／演練使用唯一 backup-set ID，製作不含敏感值的 manifest，至少包括：

| 範圍 | 必要內容與檢核 | 本次狀態 |
| --- | --- | --- |
| PostgreSQL | PostgreSQL 主版本、備份工具版本、dump 格式、schema/migration 狀態、備份起訖時間與時區、檔案大小／SHA-256、還原所需角色／extension 清單。包含租戶、權限、訂單、付款紀錄、批號／庫存異動、分攤與 checkout command 結果；不要只挑商品資料表。 | 只讀程式庫；未建立或驗證備份 |
| 原圖與其他外部檔案 | 先由資料負責人確認原圖是否存在、真實位置、DB 對應鍵、檔案清單、大小／hash、讀取權限與版本。保留原始檔，不以縮圖／截圖替代。不得猜測 storage path 或把另一專案的圖庫當成本系統資料。 | 目前 Compose 沒有原圖持久卷／備份工作；位置與整合未核實，是驗收缺口 |
| 部署設定 | 固定 release commit/tree、每個 image digest、Compose/nginx 設定版本、volume/network 名稱、主機 OS／架構、Node/PostgreSQL 版本與 migration 目錄版本。保留必要離線安裝／映像取得方案，先核授權與來源。 | 僅有 scaffold；未驗最終主機 |
| 安全設定與復原能力 | 記錄秘密保管人、保管系統／版本 ID、取回授權流程、備份加密與解密責任、必要角色及 TLS／DNS／CORS／JWT 設定名稱。真正的 secret、私鑰、DB URL 與密碼分離保管，不能進 repo、公開 PR、截圖或 manifest。復原驗收以授權人確認可取回為準。 | 未讀取秘密或變更安全設定 |
| 收銀端未決狀態 | PostgreSQL 備份不包含瀏覽器 localStorage／IndexedDB 中的待確認 checkout intent。操作人員盤點各收銀端是否 pending/unknown/conflict；不得清瀏覽資料或把憑證／完整瀏覽器 profile 匯入證據。 | 未盤點實機 |

資料一致性必須由 DB 與檔案負責人選定同一恢復點：例如經批准的停寫窗口，或經驗證且涵蓋所有資料源的協調快照。只在不同時間分別複製 DB 與圖片，不足以證明可一致還原。manifest 記錄停寫與恢復點、仍在途／未決交易、檔案差異及處理決定。備份必須有主機外的受控副本；與原機同碟的檔案不能獨自承擔災難復原。

保留 §6 的歷史 SQL 範例供辨識格式，**不要直接套到正式或既有 DB**。plain SQL 與 custom-format dump 要選相符的還原工具，啟用遇錯即停並保存 exit status；失敗的半成品不可繼續使用。資料、角色、extension 或圖片未完整覆蓋時，先列缺項，不得宣稱成功。

### 10.3 隔離還原演練順序與停止條件

以下均為待批准、待執行步驟，沒有預設可直接複製執行的 restore 指令：

1. **核准與識別**：填演練單（backup-set ID、目的、操作者、目標主機／空白 DB、可操作範圍、清理方式、RPO/RTO 目標）。優先用合成資料跑流程；正式副本只在明確批准、受限環境使用，不能上傳公開服務。
2. **證明隔離後才啟動**：使用獨立 Compose project、獨立空白 volume／DB、隔離網路與無衝突的 loopback port；禁止正式 volume、共享名稱、正式主機 bind mount、正式 DNS／DB URL。只改 project name 並不足夠，原 scaffold 的 `80`／`5433` port 不會自動隔離。保留經遮罩的目標清單，雙人核對；任何指向正式來源或非空目標都停止。
3. **驗備份與啟動順序**：比對 checksum、dump 格式／版本、DB 與原圖恢復點及所需可用容量。先只準備隔離 DB／檔案目標，應用維持停止、切斷外部通知／會計／付款等副作用。不得用 default backend command 偷跑 migration；明確配置並審查不自動 migrate 的演練啟動方式，未做到就停。
4. **授權操作者還原**：依備份格式還原至新的空白目標，遇錯即停；恢復檔案至隔離位置，不覆寫原始備份或正式檔案。記錄開始／結束時間、工具版本、遮罩後輸出／exit status。任何 hash 不合、錯誤、缺檔或版本不相容都保留失敗證據，不接續開站。
5. **靜態對帳**：核 migration 狀態、表／關鍵列數、tenant 所屬、PK/FK、角色／權限、訂單→付款→批號分攤／OUT movement 關係及商品／批號餘額。對原圖逐一比清單/hash，抽驗可開啟與 DB 關聯；未實作或無來源時記 blocked，不以空清單通過。既有歷史庫存落差需原樣標記，不自行改量或補造紀錄。
6. **受控應用驗收**：先啟動備份對應的已知良好版本；若需 migration，以另一個可丟棄副本單獨測試並記錄前後差異。驗 `/`、`/pos/`、API 登入／角色／租戶隔離、只讀查詢及 audit。nginx `/health` 的 `ok` 只證明 edge 存活，不能證明 DB 就緒；API `/health` 也不能代替實際 DB 查詢。合成交易才可測結帳／重試／退款登記，禁止對外實際扣款。
7. **復原一致性**：對備份點前已知 command 查原結果／payloadHash；還原點之後的 pending/unknown 或衝突不得當成「沒成交」重開新單。回復舊 DB 可能失去已成交 command、付款與庫存異動，必須停止自動重送，由負責人對帳所有收銀端與外部付款紀錄後才決定補償。不得刪 command 結果解除卡單。
8. **結案與清理**：量測事故判定→可安全恢復營業的總時間及各階段耗時作為 RTO 證據；以最後可一致恢復交易時間量測資料損失窗口，與 RPO 比較。保留遮罩後證據與失敗項，核准人簽核。清理只限演練自己建立的資源；保留期未到或刪除需另核准時，不自行刪除。演練通過仍不授權正式切換。

### 10.4 Migration 與正式回退決策閘門

- 任何 `make prod`、Compose backend 啟動或 `make migrate` 之前，先確認實際目標、停寫安排、可驗備份集、release/image digest、migration 清單與上版相容性；目前 Dockerfile 啟動會自動 migration，不能把 §3 然後 §4 理解成「先純啟動，再首次 migration」。避免兩個 migration 執行者同時跑。
- 只有「未跑 migration」或「已證明新 schema／資料與舊 API、兩個 SPA 均相容」才可選 §5.1。`additive` 名稱本身不是相容證據；ADR-018 的 checkout command 合約需要 backend/POS 配套，不可只降一端。
- 不相容 schema、部分 migration、資料轉換或備份後仍有成交時，停止寫入並保存現況，交負責人選 forward-fix、經審查的反向 migration 或批准的整組還原。Prisma `migrate deploy` 不提供自動 down migration；不得以 reset、改 `_prisma_migrations` 或手改資料來假裝回退成功。
- 整組還原會丟失恢復點後的資料；只有確定損失範圍、原圖一致性、command／付款對帳與補償方案且取得明確批准，才可走 §5.2。先在隔離環境證明相同版本組合可恢復；回復營業由藥局負責人決定。

### 10.5 重開機、斷線與真實硬體驗收

下列每項都要在經批准的店內設備／測試主機上記錄 pass/fail/blocked/not-run，包含設備型號、OS、瀏覽器版本、韌體／驅動、連線方式、測試人與時間。本次全部 **not-run**。

| 場景 | 最低驗收與證據 |
| --- | --- |
| 主機正常重開機 | 有停寫與未決交易盤點後，驗 OS／Docker 自啟、服務啟動次序、volume 不變、路由／實際 DB 查詢與登入可用。現有 Compose 沒有 restart policy，不能推定重開機後自動恢復。保存 reboot 前後服務與資料對帳；RTO 由量測得出。 |
| 程序中止／斷電 | 只在批准的隔離主機與合成交易測試中斷／UPS 情境；分別覆蓋送出前、提交後回應遺失、主機恢復。查同一 command 原結果，不重複 order/payment/庫存異動。既有 HTTP restart 測試不等於真斷電、磁碟損壞或 UPS 驗收。 |
| 網際網路斷線與店內 LAN／API 中斷 | 分開測外網斷線而 LAN 可用、LAN 中斷、API/DB 不可用。店內主機仍可用不代表離線收銀已完成。ADR-008 的 offline queue 是設計歷史；現有 status/sync 介面存在，但結帳流程未接 `enqueueCheckout`，不得承諾可離線收 50 筆。斷線不得顯示成功；pending/unknown/conflict 保持凍結，恢復後按原 identity 查證。 |
| 實體掃碼器 | 真實 SKU／核准條碼樣本、前導零、連續掃描、中文輸入法、輸入焦點、Enter／Tab 設定、延遲／重複掃描與切單中斷。模糊／多筆／查無不得自動加品；確認畫面數量／庫存與實际 HTTP。合成鍵盤事件或 browser E2E 不證明掃碼器相容，也不保證完整廠商條碼目錄。 |
| 印表機與列印 | 記實際印表機／紙寬／USB或網路方式；驗中文、金額／折扣、長品名、切紙、取消、缺紙、斷線／重連與補印標示。WebUSB 依瀏覽器、secure context 與使用者授權而異；LAN HTTP 不等於 localhost，無 HTTPS 時不可假定可用。`window.print()` fallback 需獨立實機驗紙張／對話框；產生 ESC/POS buffer 或 PDF 不能當作已列印。 |

### 10.6 驗收證據清單與目前結論

演練包至少包含：核准／責任人與目標識別、來源 commit/tree/image digest、backup-set manifest、DB／原圖一致性及 checksum、遮罩後設定與隔離證明、操作時間／exit status、migration 前後狀態、資料對帳報告、API／UI 結果、重開機／硬體結果、RPO/RTO 目標與實測、未決交易處置、失敗／未跑項、獨立覆核及恢復營業簽核。原圖與交易樣本若含個資只在批准的受限位置保存；公開 issue/PR 僅放去識別摘要。

本次結論：只完成文件與靜態來源核對，沒有建立 DB、執行 restore、操作設備或測量 RPO/RTO。`../../ROADMAP.md`、既有 verification 文件與 ADR 的歷史測試紀錄維持原意；本節不完成 G0–G7，也不解除 #37 的正式部署閘門。
