# Project skills

This directory contains repository-local skills. It does not configure an agent
globally or prove that another machine or a running session has loaded a skill.

## Pharmacy UI/UX

For `skydreamer0/startup` pharmacy interface design or review:

1. Follow the repository-root `AGENTS.md` read order and select the Admin UI or
   POS UI route in `docs/agents/navigation.md`; read its `MODULE.md`.
2. Read [skill guidance](AGENTS.md) and
   [pharmacy overrides](ui-ux-pro-max/PHARMACY-OVERRIDES.md).
3. Read the unchanged [UI/UX Pro Max skill](ui-ux-pro-max/SKILL.md), then only
   relevant references or data rows. Keep recommendations within the approved task.

Example instruction to an agent, without running any script:

> Read `.agents/skills/AGENTS.md`,
> `.agents/skills/ui-ux-pro-max/PHARMACY-OVERRIDES.md` and
> `.agents/skills/ui-ux-pro-max/SKILL.md`. Review the specified single-store
> pharmacy screen using existing components, tokens and icons. Use static
> references only; report recommendations without persisting or overwriting files.

The installed [manifest](ui-ux-pro-max/SOURCE.lock.json) records every vendored
file and local document except itself, plus the old 49-file candidate comparison.
[Installation notes](ui-ux-pro-max/INSTALLATION.md) explain the different layout,
license, static safety review and verification limits.


## Task-to-skill map

| 任務 | 預設 | 視需要補充 |
|---|---|---|
| 藥局畫面、流程、定位 | [藥局覆寫](ui-ux-pro-max/PHARMACY-OVERRIDES.md)、[UI UX Pro Max](ui-ux-pro-max/SKILL.md) 靜態資料、[Design](../../DESIGN.md) | 視覺需要第二意見才讀 Impeccable 原作；不得以工具結果覆蓋本專案規則。 |
| 觸控、掃碼、焦點、長中文 | [pharmacy-touch-ui-review](pharmacy-touch-ui-review/SKILL.md)＋真頁操作 | break-ui、mobile-native、W3C 用於擴充壓力案例，不算裝置通過。 |
| 需求、架構、除錯、TDD | 選開工路由，使用目前庫內相關的 triage／architecture／diagnose／tdd 指引 | 一次只開相關規格，不跑整套無關工具。 |
| SQL、遷移、並發 | [Prisma schema](../../systems/enterprise-admin/backend/prisma/schema.prisma)、ADR、#185–190、PostgreSQL 官方文件 | 可參考 Postgres Best Practices 的鎖、索引與查詢計畫；不遷去 Supabase，也不對正式資料庫跑測試。 |
| 瀏覽器與裝置 | repo 鎖定 Playwright／測試策略、合成資料 | mock、Chrome、Safari／iPad、掃碼／列印各自驗；工具不可用就標未驗。 |

外部 Skill 只作參考。不要自動安裝、執行第三方腳本、改全域設定或使用其他專案的授權。先核版本、重疊、用途，以及該執行環境是否真的已載入。原作者入口：[Impeccable](https://github.com/pbakaus/impeccable)、[break-ui／mobile-native](https://github.com/emilkowalski/skills)、[PostgreSQL](https://www.postgresql.org/docs/current/)。
