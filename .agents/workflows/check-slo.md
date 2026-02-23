---
description: 自動化 SLO 與 Error Budget 預警檢核
---

# SLO 部署決策預警工作流

這是一個決策輔助工具。當團隊準備發布新功能，但不確定系統穩定性是否允許時觸發。

1. **讀取 SLO 政策**
   - `view_file("infrastructure/standards/slo_error_budget.md")`

2. **詢問當前指標狀態**
   向使用者索取最新的指標數據 (或讓使用者貼上來自 Datadog / Prometheus 的數據)：
   - 最近 30 天內 Auth API 的 5xx 錯誤率是多少？
   - Core Data API 的 P99 延遲是多少？

3. **自動化決策分析 (Error Budget Calculation)**
   - 比對使用者提供的真實數據與 `slo_error_budget.md` 中的基準。
   - 幫忙計算**剩餘的 Error Budget (錯誤預算)**。

4. **給出大廠級別發布建議**
   - **[GREEN - Proceed]**: 如果預算充足，回應「SLO 達標，允許按照正常 CI/CD 流程部署，建議採用 Canary 放量」。
   - **[YELLOW - Warning]**: 預算極低但未耗盡，回應「警告：穩定性邊緣，僅建議修復性發布或極小範圍變更」。
   - **[RED - Frozen]**: 預算超標，回應「**ERROR BUDGET DEPLETED (預算耗盡)**。依照基礎設施規範，建議啟動 Feature Freeze (功能凍結)，全隊轉為修復 Technical Debt 與可靠性問題」。
