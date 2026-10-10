---
description: 自動化程式碼與 PR 規範審查 (Code Review)
---

# 自動 PR 與代碼品質審查工作流

當使用者觸發此審查工作流時，表示需要 AI 扮演 Tech Lead 進行代碼檢查。請執行以下步驟：

1. **載入工程規範基準**
   - 先依根目錄 `AGENTS.md` 完成最小 context 閱讀，再從 repository root 讀取：
     - `systems/enterprise-admin/infrastructure/standards/code_style_pr.md`
     - `systems/enterprise-admin/infrastructure/standards/test_pyramid.md`
     - `.github/pull_request_template.md`
     - `.github/workflows/ci.yml` 與該變更適用的其他 workflow

2. **釐清審查範圍**
   - 使用已提供的 PR／分支／diff；只有缺少範圍時才詢問。記錄 base、head 與實際受測 commit／tree，先看變更檔案，再讀相關模組。

3. **執行五維度深度審查**
   請基於擷取到的代碼，進行以下五個維度的嚴格審查：
   - **規範符合度 (Compliance)**: 變數與函式命名是否符合 `snake_case` 或 `camelCase` 規範？
   - **單一職責 (Single Responsibility)**: 函式是否過於龐大？是否需要重構抽離？
   - **可靠性 (Reliability)**: 是否有做好 Error Handling 與防呆？
   - **安全與觀測 (Sec & Obs)**: 有涉及權限的地方是否加上了 RBAC？是否有正確輸出 JSON Format Log 與 `trace_id`？
   - **測試覆蓋 (Testing)**: 這段新邏輯是否有對應的 Unit / Integration Test？

4. **產出審查報告 (Code Review Report)**
   - 輸出 Code Review 報告，按嚴重程度列出可驗證的問題、檔案位置及影響；沒有發現也要明列覆蓋限制。
   - 分開報告程式審查、實際 CI jobs、GitHub required checks，以及 browser／原生 DB／設備驗收。用 PASS、FAIL、NOT RUN 或 BLOCKED 記錄，不把未執行、skipped 或舊固定版本的證據當成本次通過。
   - 檢查 PR 模板各項是否適用；不適用必須有理由，不能以 N/A 免除受影響的安全或驗收要求。
   - 使用 Markdown 的 `diff` 語法給出具體的修改建議。
   - 若有嚴重違反標準架構之處，請給出 `[BLOCKER]` 標籤要求修改。
