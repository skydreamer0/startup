---
description: 自動化建立架構決策紀錄 (ADR)
---

# 新增架構決策紀錄 (ADR) 工作流

當使用者觸發此工作流時，請嚴格執行以下步驟：

1. **讀取現有 ADR 前後文**
   - 讀取 `infrastructure/adr/README.md` 以取得格式要求。
   - 使用 `list_dir("infrastructure/adr")` 查看目前最大的 ADR 編號 (例如 `ADR-002`)，決定此份新 ADR 的編號 (例如 `ADR-003`)。

2. **盤問決策脈絡**
   主動向使用者詢問以下資訊 (如果他們在觸發指令時尚未提供)：
   - **Context**: 我們遇到了什麼技術挑戰或需求？
   - **Decision**: 我們決定採用什麼技術或架構？
   - **Rationale**: 為什麼這樣選？(效能、生態系、成本考量等)
   - **Consequences**: 會帶來什麼正面與負面的影響？

3. **自動產生草稿**
   - 根據使用者的回答，依照大廠標準格式撰寫一份專業的英文或中文 ADR 草稿。
   - 檔案名稱必須符合規範：`infrastructure/adr/adr_XXX_short_description.md`。

4. **更新索引目錄**
   - 將新產生的 ADR 連結與標題自動更新到 `infrastructure/adr/README.md` 的索引區塊中。
   - 將更新結果通知使用者 (notify_user)。
