# Git Workflow & Branching Strategy

## 1. Strategy: Trunk-Based Development (with Short-lived Branches)
We prefer **Trunk-Based Development** to minimize integration hell. Developers should merge small, frequent changes to the main line.

## 2. Branch Naming
Branches must be prefixed with their intent:
- `feat/<description>` — New features
- `fix/<description>` — Bug fixes
- `refactor/<description>` — Cleanups or structural changes without new features
- `chore/<description>` — Build tasks, config, dependencies
- `docs/<description>` — Documentation only

## 3. Branch Discipline (C-02)
> Codifies "C-02: 短週期 Feature Branch 紀律" from `systems/enterprise-admin/ROADMAP.md`.

**Rules**:
1. **One feature point = one branch.** Don't pile unrelated work onto the same branch — each ROADMAP item, bug fix, or refactor gets its own short-lived branch.
2. **Commit at least once per day, before EOD.** Even a WIP commit beats losing context overnight. Push to the remote daily — a branch that lives only on your laptop is invisible to teammates and to CI.
3. **Branches >2 days without a push are technical debt.** Either get them reviewed, rebase onto current `main` and keep moving, or close them. Stale branches accumulate conflicts and block others.
4. **Analytics and CRM are conflict hotspots.** These modules see the most parallel churn (see Phase 7 history — three of the largest stashes were here). When working in these areas:
   - Open a draft PR early so others can see what's coming.
   - Rebase onto `main` daily, not weekly.
   - Prefer smaller PRs (≤300 LOC diff) over batched ones.

## 4. Commit Message Standards (Conventional Commits)
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>
```

### Repo-standard types
`feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `style`

### Repo-standard scopes
Use the closest module / area as the scope. Common choices in this repo:

| Scope | When to use |
|-------|-------------|
| `analytics` | `backend/src/modules/analytics/**` (CRM/Product/Operations sub-services) |
| `crm` | `backend/src/modules/crm/**` and CRM UI screens |
| `auth` | login, JWT, RBAC middleware |
| `rbac` | permission / role enforcement |
| `pos` | POS module (backend + ui) |
| `pos-ui` | POS frontend only |
| `admin-ui` | admin frontend in `systems/enterprise-admin/admin-ui/` |
| `backend` | cross-module backend changes |
| `inventory`, `orders`, `reports`, `dashboard`, `users`, `roles` | corresponding modules |
| `arch` | architectural / cross-cutting fixes (Arch-Fix Phase 1–5) |
| `repo` | repo-level config (.github, .gitattributes, root scripts) |
| `test` | test-only changes that don't fit a single module scope |
| `db` | Prisma schema / migrations |

Examples (taken from real history):
- `refactor(arch): Arch-Fix Phase 2 — type safety and consistency`
- `test(pos-ui): expand checkout operation coverage`
- `perf+fix(arch): Arch-Fix Phase 3 — JWT optimization and rate limiting`
- `feat(analytics): add bonus-gate endpoint`

If a change cleanly spans two scopes, prefer `<typeA>+<typeB>(<scope>)` (as above) over inventing a compound scope.

## 5. Merging Policy
- **Rebase over Merge**: Rebase feature branches against `main` periodically to maintain a clean, linear history.
- **Squash and Merge**: Feature branches are squashed into a single commit when merging to `main` to keep history readable.
- **Force-push only your own branch.** Never force-push `main`.

## 6. PR Requirements
Every PR must satisfy `.github/pull_request_template.md`. In particular, per **C-03**:
- ROADMAP items must be ticked off in the same PR that implements them.
- Architectural changes require a new ADR under `systems/enterprise-admin/infrastructure/adr/`.

## 7. References
- `systems/enterprise-admin/ROADMAP.md` → §"橫切關注點 (Cross-cutting Concerns)" C-02 / C-03 / C-04
- `systems/enterprise-admin/infrastructure/standards/code_style_pr.md`
- `.github/pull_request_template.md`
