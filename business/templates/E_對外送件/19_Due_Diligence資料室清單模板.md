# 19_Due_Diligence資料室清單模板

## Metadata
| 欄位 | 內容 |
| --- | --- |
| Owner | Founder / BD Lead |
| Update Frequency | 雙週更新；對外送件前完整校稿 |
| Input From | A~D 最新版本、F_驗證結果、G_治理紀錄 |
| Output To | 投資人、補助單位、合作方、審查單位 |


## 用途
整理投資人/補助審查所需文件清單、版本與狀態，建立可追蹤的資料室索引。

## 適用時機
- 募資啟動前。
- 補助送件前。
- 審查補件時。

## 必填欄位
| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| 文件編號 | string | 是 | 唯一索引 |
| 文件名稱 | string | 是 | 與模板名或附件名一致 |
| 類型 | enum | 是 | strategy/ops/finance/legal/compliance |
| 版本 | string | 是 | `vX.Y` |
| 狀態 | enum | 是 | draft/review/approved/shared |
| 負責人 | string | 是 | owner |
| 更新日 | date | 是 | `YYYY-MM-DD` |
| 存放路徑 | string | 是 | 檔案位置 |
| 對應審查項目 | string | 是 | 投資/補助評分項 |

## 填寫規則
1. 每份文件都要有 owner 與版本。
2. 對外共享前狀態需為 `approved`。
3. 每次補件需新增版本，不覆蓋舊版記錄。
4. 涉及個資或法規附件需設取用權限。

## 輸出範例格式
```text
[資料室清單]
doc_id: DD-001
文件名稱: ../D_財務層/13_三年財務模型_月度模板.md
類型: finance
版本: v0.3
狀態: approved
負責人: Finance
更新日: YYYY-MM-DD
存放路徑: /path/to/file
對應審查項目: 財務可行性
```

## 常見錯誤
- 文件版本混亂，審查時無法確認最新版本。
- 缺少對應審查項目欄位。
- 把草稿直接對外共享。

---

## Data Room 索引模板
| 文件編號 | 文件名稱 | 類型 | 版本 | 狀態 | 負責人 | 更新日 | 對應審查項目 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DD-001 |  |  |  |  |  |  |  |

## 補件追蹤模板
| 補件編號 | 需求來源 | 需求描述 | 截止日 | 負責人 | 完成狀態 |
| --- | --- | --- | --- | --- | --- |
| RF-001 |  |  |  |  |  |

## 交叉引用
- 募資資料：`14_募資資料模板.md`
- 補助模板：`15_補助申請模板_台灣新創中小企業.md`

## 初版填寫示例（可直接改）
```text
[資料室清單]
doc_id: DD-001
文件名稱: ../A_戰略層/01_創業論點與願景模板.md
類型: strategy
版本: v0.9
狀態: review
負責人: Founder
更新日: 2026-03-20
存放路徑: /Users/george/Library/CloudStorage/OneDrive-MSFT/0.專案/startup/startup_template_pack/../A_戰略層/01_創業論點與願景模板.md
對應審查項目: 問題定義與解法合理性

doc_id: DD-002
文件名稱: ../B_合規層/06_法規與合規矩陣_台灣模板.md
類型: compliance
版本: v0.8
狀態: review
負責人: Pharmacist Lead
更新日: 2026-03-20
存放路徑: /Users/george/Library/CloudStorage/OneDrive-MSFT/0.專案/startup/startup_template_pack/../B_合規層/06_法規與合規矩陣_台灣模板.md
對應審查項目: 合規與風險控管

doc_id: DD-003
文件名稱: ../D_財務層/13_三年財務模型_月度模板.md
類型: finance
版本: v0.7
狀態: review
負責人: Finance
更新日: 2026-03-20
存放路徑: /Users/george/Library/CloudStorage/OneDrive-MSFT/0.專案/startup/startup_template_pack/../D_財務層/13_三年財務模型_月度模板.md
對應審查項目: 財務可行性與資金需求
```

### 初版Data Room索引（示例）
| 文件編號 | 文件名稱 | 類型 | 版本 | 狀態 | 負責人 | 更新日 | 對應審查項目 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DD-001 | ../A_戰略層/01_創業論點與願景模板.md | strategy | v0.9 | review | Founder | 2026-03-20 | 問題與解法 |
| DD-002 | ../B_合規層/06_法規與合規矩陣_台灣模板.md | compliance | v0.8 | review | Pharmacist Lead | 2026-03-20 | 合規管理 |
| DD-003 | ../D_財務層/13_三年財務模型_月度模板.md | finance | v0.7 | review | Finance | 2026-03-20 | 財務可行性 |
| DD-004 | 14_募資資料模板.md | strategy | v0.6 | draft | Founder | 2026-03-20 | 募資主張 |

### 初版補件追蹤（示例）
| 補件編號 | 需求來源 | 需求描述 | 截止日 | 負責人 | 完成狀態 |
| --- | --- | --- | --- | --- | --- |
| RF-001 | 投資人 | 補充SOM估算來源 | 2026-03-28 | Founder | in_progress |
| RF-002 | 顧問 | 補充法規條號依據 | 2026-03-26 | Pharmacist Lead | todo |
