# Startup pharmacy scope — local overrides

This file is maintained by `skydreamer0/startup`; it is not upstream content.
It applies whenever this project uses UI/UX Pro Max. User instructions and
repository rules take precedence; within that scope, these local rules override
generic upstream workflows, examples and recommendations. `SKILL.md`, references,
catalogues and Python source remain byte-for-byte upstream originals.

## Product and design scope

- Work on the explicitly requested screen or flow for one pharmacy/store. Preserve
  the existing tenant isolation; the single-store scope does not authorize changing
  auth, permissions, data models or deployment topology.
- Improve hierarchy, readability, keyboard/focus behavior, responsive layout,
  zoom, touch targets, clear labels and loading/empty/error feedback using the
  existing product behavior and API contract.
- Use the current framework, components, semantic tokens, fonts and icons. The
  current Admin UI and POS UI use React + Vite and already include `lucide-react`;
  detect the target module's actual dependencies before selecting stack guidance.
  Upstream examples for Next.js, mobile/native apps or other stacks do not migrate
  this project. Map general guidance to existing primitives.
- Search/catalogue output is advice to review against the task and repository,
  not a product specification. Do not add e-commerce, storefronts, loyalty,
  patient portals, diagnosis, drug selection, dosing, interaction checking or
  other medical judgments because an upstream industry/profile suggests them.
- Keep stock, expiry, inspection, quarantine and refund meanings aligned with
  the module context and API contract. UI polish cannot claim clinical suitability,
  stock availability or successful posting without the existing authoritative result.
- PR #85 owns its receipt UI implementation and design documents. This skill/docs
  installation neither imports its code nor overwrites its branch or design files.
  When later working on that feature, read the design documents actually present
  on the selected branch; do not assume an open PR's documents exist on master.

## Data, assets and execution boundaries

- Never send patient information, prescriptions, identities, transactions, credentials,
  private repository content or other confidential data to upstream services,
  search tools or persisted output. Use short generic task terms and synthetic
  examples, including for any future explicitly authorized local search.
- Do not automatically download fonts, icons, images or packages. The vendored
  Google Fonts and Phosphor files are catalogue/attribution metadata, not permission
  to retrieve or add their assets. Keep the project's existing fonts and Lucide icons.
  Do not follow catalogue CSS imports or external URLs as an installation step.
- This installation preserves Python source as static files. It has not run
  `search.py`, `design_system.py`, `core.py`, `reasoning_contract.py`,
  `validate_data.py`, upstream tests, installers or asset refresh/generation tools.
  Reading these files or parsing their syntax does not execute/import them.
  There is no runtime or search-output acceptance evidence from this PR.
- For this task, use static `references/quick-reference.md`, `references/pro-rules.md`
  and relevant CSV rows. Report general guidance as such; never pretend a search ran.
  Installing the skill does not authorize a future script run or environment change.
- Do not auto-persist generated design recommendations. `--persist` requires explicit
  authorization for the destination and proposed content, even for a new file.
  Read existing master/page documents first. `--force` or another overwrite mechanism
  additionally requires confirmation of the concrete files and replacement content.
  No global settings, security permissions, PC4070 work or production database access
  is part of this installation.

## Repository path adaptation

The unchanged upstream `SKILL.md` contains Claude-plugin examples using
`${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/`. That is historical upstream
syntax, not this repository's installed location. Do not set `CLAUDE_PLUGIN_ROOT`
or change global agent configuration to make those examples work.

Let `<repo-root>` mean the absolute path of the selected `skydreamer0/startup`
checkout, including a feature worktree when applicable. Replace the upstream
skill-directory prefix with:

```text
<repo-root>/.agents/skills/ui-ux-pro-max/
<repo-root>/.agents/skills/ui-ux-pro-max/scripts/search.py
<repo-root>/.agents/skills/ui-ux-pro-max/references/quick-reference.md
```

These paths identify files; they are not executable instructions. Do not assume
the current working directory or another machine has the same absolute root.
Resolve and read the chosen checkout's files before any later authorized use.

## Context and delivery

Follow the root `AGENTS.md`, `CONTEXT-MAP.md`, system `CONTEXT.md`,
`docs/agents/navigation.md` and selected module `MODULE.md` first. This optional
skill adds design advice and its local safety scope; it does not change architecture,
contracts, roadmap acceptance gates or the repository's CI/review workflow.

Use the smallest context: local rules plus `SKILL.md`, then the relevant reference,
CSV rows or detected stack file. Preserve UTF-8 and upstream bytes when maintaining
the installation. Verify files against `SOURCE.lock.json`; retain the upstream MIT
notice in `LICENSE`. Remote preservation is not proof that every machine/session
has loaded or activated the skill.
