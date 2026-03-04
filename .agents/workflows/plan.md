---
description: 功能需求規劃與實作藍圖工作流 (Brainstorming & Planning)
---

# 功能需求規劃與實作藍圖 (Planning) 工作流

當接收到開發新功能、建立組件或修改行為的要求時，請**嚴格依照此三階段流程**進行規劃。

## 🚨 核心禁令：禁止「直接開工」
在使用者核准「設計方案」與「實作計畫」前，**禁止** 修改任何程式碼、初始化專案或直接實作。

---

## 階段 1：需求腦力激盪 (Brainstorming)
**透過對話釐清目的，避免無效率的開發：**

1. **探索現Context**：查看現有檔案、文件與 Git 提交，理解目前架構。
2. **釐清問題 (一次一個問題)**：主動詢問目的、約束條件、成功標準。
3. **提案與權衡**：提供 2-3 種可行的實作方案，並列出 優缺點、風險 與 你的建議。
4. **展現設計細節**：針對核准的方案，說明其架構、數據流、組件結構、錯誤處理與測試策略。

## 階段 2：撰寫設計文件 (Design Document)
- 將共識記錄在：`systems/enterprise-admin/infrastructure/plans/{YYYYMMDD}_{topic}_design.md`。
- 文件必須包含：決策點、架構圖 (如有必要)、介面規格。

## 階段 3：產生實作清單 (Implementation Plan)
**將工作拆解為「微型任務 (Micro-tasks)」，建議每個任務僅需 5-15 分鐘：**

- **明確路徑**：標註精確的檔案路徑、行號、新增或修改。
- **具體程式碼**：計畫中應包含核心逻辑的範例。
- **驗證步驟 (TDD)**：明確標註各任務的測試命令與預期結果。
- **存檔路徑**：`systems/enterprise-admin/infrastructure/plans/{YYYYMMDD}_{feature}_plan.md`。

**任務清單格式範例**：
> ### 任務 1: 新增用戶日誌篩選功能 (Backend)
> **檔案**:
> - 修改: `backend/src/services/log_service.py`
> - 修改: `backend/src/api/v1/logs.py`
> - 測試: `backend/tests/test_log_filters.py`
>
> **步驟**:
> 1. 撰寫失敗測試 (vitest path/to/test)。
> 2. 實作 API 參數解析。
> 3. 更新 DB 查詢邏輯 (SQLAlchemy)。
> 4. 驗證測試通過 (green)。
> 5. Git Commit: `feat(api): add log filtering by severity`.

---

## ✅ 流程核准機制
當完成「設計」與「計畫」後，請告知使用者：
> 「已完成功能規劃，設計文件與實作計畫已存檔。是否核准開始執行？」

---
> [!TIP]
> **YAGNI 原則**：在規劃階段請嚴格剔除「未來可能會用到」的冗餘功能。
