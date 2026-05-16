---
description: 測試驅動開發工作流 (Test-Driven Development)
---

# 測試驅動開發 (TDD) 工作流

當執行任何新功能開發或 Bug 修復時，請嚴格執行以下 **「紅燈-綠燈-重構 (Red-Green-Refactor)」** 循環，優先於撰寫實作程式碼。

##  核心禁令：禁止「補寫測試」
未見過測試失敗 (Red)，就不知道測試是否有效。**絕對禁止** 寫完程式碼再補測試。
> 若你不小心先寫了程式碼：請刪除它，從測試重新開始。

---

## TDD 三大階段

### 1. RED：撰寫一個會失敗的測試
- 建立一個最小化 (Minimal) 的測試案例，定義預期的行為。
- **必須執行測試**：確保看到測試呈現失敗 (紅燈)，且失敗原因是「功能尚未實現」而非語法錯誤。

**範例 (Vitest + Testing Library)**：
```typescript
test('點擊「顯示日誌」按鈕後應展開詳細資訊', async () => {
  render(<AuditLogsPage />);
  const expandButton = screen.getByRole('button', { name: /view detail/i });
  await userEvent.click(expandButton);
  expect(screen.getByText(/detailed metadata/i)).toBeInTheDocument();
});
```

### 2. GREEN：撰寫最少量的程式碼
- 撰寫剛好能通過測試的程式碼。
- **嚴禁過度設計**：此階段不考慮「未來需求」或「優雅結構」。能過測試最重要 (YAGNI)。
- **必須執行測試**：確保看到測試呈現通過 (綠燈)。

### 3. REFACTOR：清理與優化
- 在測試綠燈的保護下，進行程式碼優化：
    - 移除重複邏輯 (DRY)。
    - 優化命名、提取 Helper 或組件。
- **必須執行測試**：確保重構後依舊維持綠燈。

---

## 驗證清單 (Checklist)
在標註任務完成前，請確認：
- [ ] 每個新函數/方法都有對應測試。
- [ ] 我親眼看過測試失敗 (正確的失敗原因)。
- [ ] 我只寫了剛好能通過測試的程式碼 (無冗餘功能)。
- [ ] 測試使用的是真實代碼路徑 (儘量減少 Mock)。
- [ ] `npm test` 輸出完全無報錯或警告。

---
> [!TIP]
> **「困難的測試通常代表設計不佳」**：如果發現測試很難寫，通常意味著組件過於耦合或介面太複雜。請在「重構」階段進行解耦。
