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
