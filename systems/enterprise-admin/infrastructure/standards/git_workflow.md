# Git Workflow & Branching Strategy

## 1. Strategy: Trunk-Based Development (with Short-lived Branches)
We prefer **Trunk-Based Development** to minimize integration hell. Developers should merge small, frequent changes to the main line.

## 2. Branch Naming
Branches must be prefixed with their intent:
- `feat/description`: New features.
- `fix/description`: Bug fixes.
- `refactor/description`: Clean up or structural changes without new features.
- `chore/description`: Build tasks, config updates, dependencies.

## 3. Commit Message Standards (Conventional Commits)
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
`<type>[optional scope]: <description>`

Example:
- `feat(api): add user registration endpoint`
- `fix(ui): resolve login button alignment issue`

## 4. Merging Policy
- **Rebase over Merge**: We prefer rebasing feature branches against `main` periodically to maintain a clean, linear history.
- **Squash and Merge**: Feature branches should be squashed into a single commit when merging to `main` to keep the history readable.
