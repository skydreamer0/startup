---
description: 自動化程式碼與 PR 規範審查 (Code Review)
---

# 自動 PR 與代碼品質審查工作流

當使用者觸發此審查工作流時，表示需要 AI 扮演 Tech Lead 進行代碼檢查。請執行以下步驟：

1. **載入工程規範基準**
   - `view_file("infrastructure/standards/code_style_pr.md")`
   - `view_file("infrastructure/standards/test_pyramid.md")`
   - `view_file(".github/pull_request_template.md")`

2. **釐清審查範圍**
   - 詢問使用者想要審查的 `PR 分支`、`檔案清單` 或直接要求使用者貼上 `git diff`。

3. **執行五維度深度審查**
   請基於擷取到的代碼，進行以下五個維度的嚴格審查：
   - **規範符合度 (Compliance)**: 變數與函式命名是否符合 `snake_case` 或 `camelCase` 規範？
   - **單一職責 (Single Responsibility)**: 函式是否過於龐大？是否需要重構抽離？
   - **可靠性 (Reliability)**: 是否有做好 Error Handling 與防呆？
   - **安全與觀測 (Sec & Obs)**: 有涉及權限的地方是否加上了 RBAC？是否有正確輸出 JSON Format Log 與 `trace_id`？
   - **測試覆蓋 (Testing)**: 這段新邏輯是否有對應的 Unit / Integration Test？

4. **產出審查報告 (Code Review Report)**
   - 輸出一份標準的 Code Review 報告。
   - 使用 Markdown 的 `diff` 語法給出具體的修改建議。
   - 若有嚴重違反標準架構之處，請給出 `[BLOCKER]` 標籤要求修改。
