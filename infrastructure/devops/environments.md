# 34b_Environment Variables & Secrets (Enterprise Standard)

## 1. 原則與規範 (Core Principles)
1. **No Secrets in Code**: 絕對禁止將任何密碼、API Key 或 Token 推入 Git Repo。
2. **Environment Parity**: Local, Staging, Production 的環境變數「鍵名(Keys)」必須完全一致，僅「值(Values)」不同。
3. **Secret Manager**: Production 環境不依賴 `.env` 檔案，而是透過雲端注入 (如 AWS Secrets Manager, GCP Secret Manager, 或 K8s External Secrets)。

## 2. `.env.example` 標準範本
開發者 Local 環境應提供一份脫敏的 `.env.example` 供 `cp .env.example .env` 使用：

```env
# ==========================================
# 1. 應用程式基礎設定 (App Config)
# ==========================================
NODE_ENV=development
PORT=8080
API_PREFIX=/api/v1/admin
LOG_LEVEL=debug # prod 應設為 info 或 warn

# ==========================================
# 2. 資料庫與快取 (Database & Cache)
# ==========================================
# 格式: postgres://[user]:[password]@[host]:[port]/[db_name]
DATABASE_URL=postgres://local_user:local_pass@localhost:5432/admin_db
REDIS_URL=redis://localhost:6379/0

# ==========================================
# 3. 身分驗證與安全 (Auth & Security)
# ==========================================
# 至少 64 bytes 的隨機字串 (Local 開發可用預設，Prod 必須嚴加保存)
JWT_SECRET=super_secret_local_key_change_me_in_prod
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN_WHITELIST=http://localhost:3000,http://127.0.0.1:3000

# ==========================================
# 4. 第三方服務與監控 (Third-party & Monitoring)
# ==========================================
# AWS S3 (用於上傳後台報表或大檔)
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=

# Sentry / Datadog / NewRelic
SENTRY_DSN=
```

## 3. 機敏資訊輪替與審閱 (Secret Rotation & Audit)
1. **定期輪替**: `JWT_SECRET` 與 DB 密碼應每季或每半年由 DevOps 團隊進行安全輪替 (Key Rotation)。
2. **自動掃描**: 於 CI/CD Pipeline 導入 `git-secrets` 或 `TruffleHog`，一旦偵測到工程師誤推 Secret 到版控，立即阻擋 Commit / Push。
