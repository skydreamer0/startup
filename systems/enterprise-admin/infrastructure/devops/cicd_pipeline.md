# 34a_CI/CD & Deployment Strategy (Enterprise Standard)

## 1. 部署架構 (Infrastructure Setup)
本管理系統支援容器化 (Containerization) 與無狀態 (Stateless) 部署架構：
- **Container Registry**: AWS ECR / GCP Artifact Registry / GitHub Packages
- **Orchestration**: Kubernetes (K8s) 或 AWS ECS / Google Cloud Run
- **Reverse Proxy / Ingress**: Nginx / AWS ALB
- **CI/CD Platform**: GitHub Actions (推薦) 或 GitLab CI

## 2. GitHub Actions 部署流程 (Pipeline Stages)
分為三大核心 Job：`Lint & Test`, `Build & Push`, `Deploy`

### 2.1 觸發條件 (Triggers)
- **Push to `main`**: 觸發 Production 流程
- **Push to `develop` / `staging`**: 觸發 Staging 流程
- **Pull Request (PR)**: 僅觸發 `Lint & Test` (防禦性預檢)

### 2.2 Stage 1: 代碼品質與安全檢測 (Lint, Test, Sec-Scan)
```yaml
jobs:
  test-and-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node/Python
        uses: actions/setup-node@v3
      - name: Install Dependencies
        run: npm ci # 確保依賴版本嚴格一致
      - name: Run Linter
        run: npm run lint
      - name: Run Unit Tests
        run: npm run test:coverage
      - name: Security Audit (SAST)
        run: npm audit --audit-level=high 
        # 企業級可加入 SonarQube 或 Trivy 掃描
```

### 2.3 Stage 2: 建置與推送映像檔 (Build & Push Image)
```yaml
  build-and-push:
    needs: test-and-scan
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/staging'
    steps:
      - name: Build Docker Image
        run: docker build -t my-admin-system:${{ github.sha }} .
      - name: Push to Registry
        run: docker push my-registry/my-admin-system:${{ github.sha }}
```

### 2.4 Stage 3: 自動化部署 (Review & Deploy)
採用 GitOps 流程或直接透過 CLI 更新服務。
```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production # 必須在 GitHub 設定 Review 審核機制
    steps:
      - name: Deploy to Cloud (K8s / ECS)
        run: |
          # 替換 K8s Deployment image tag
          kubectl set image deployment/admin-backend backend=my-registry/my-admin-system:${{ github.sha }}
          kubectl rollout status deployment/admin-backend
      - name: Run Database Migrations
        run: npm run db:migrate:deploy
```

## 3. 環境與發布策略 (Release Strategies)
1. **藍綠部署 (Blue/Green Deployment)**: 適用於 Production 環境，透過 Load Balancer 切換流量，確保 Zero-downtime 且出錯時可秒級回退 (Rollback)。
2. **資料庫 Migration 規則**: 
   - Migration 腳本必須具備向上相容性 (Backward-compatible)。
   - 不可執行 `DROP COLUMN` 導致舊版 Code 崩潰，應採「新增欄位 -> 修改 Code 雙寫 -> 移除舊欄位讀取」之三階段遷移策略。
3. **基礎設施即代碼 (IaC)**: 強烈建議使用 Terraform 或 AWS CDK 管理 K8s/DB/Redis 等資源，並將 IaC 腳本存於獨立 Repo。
