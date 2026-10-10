# Code Style & Pull Request (PR) Policy

## 1. Code Style Principles
- **Readability is King**: Write code for humans first, compilers second.
- **Single Responsibility**: Each function/component should do one thing well.
- **Automated Checks**: Use the owning package's configured checks and the commands in `dependency_management.md`. Backend and Admin UI have ESLint gates. POS UI currently has tests and build/type-check gates but no `lint` script; do not report a POS lint pass from another package's result. Adding a new lint gate is a separate change, not an assumed existing check.

## 2. Pull Request (PR) Requirements
Every PR must include:
1. **Description**: What changed and why?
2. **Issue Link**: Link to the ticket or task.
3. **Tests**: Exact commands, source head, results, and relevant CI links. Distinguish unit/mocked integration, real PostgreSQL, browser, and device coverage; list failed, blocked, skipped, and not-run stages. See `test_pyramid.md` for the current CI matrix.
4. **Screenshots/Videos**: For UI-related changes, provide evidence of the affected version and flow. Historical pinned-subject screenshots or JSDOM results do not establish current browser/focus/geometry acceptance.

## 3. Reviewer Checklist
Reviewers should focus on:
- **Correctness**: Does it solve the problem?
- **Security**: Any obvious vulnerabilities?
- **Style**: Does it follow the established patterns?
- **Maintainability**: Is the code clear?
- **Testing & API Spec**:  **MANDATORY**: Are there unit/integration tests (`__tests__/`) for new endpoints? Is `api_spec.md` updated? If not, the PR is NOT complete.

Conditional checklist items may be marked N/A only with a scope-based explanation. Missing tools or an unavailable test environment mean BLOCKED / NOT RUN, not N/A or PASS. CI success does not resolve code-review findings or grant merge/deployment authorization.

## 4. Documentation
If an architectural decision was made, it **must** be accompanied by an ADR update in the `systems/enterprise-admin/infrastructure/adr/` directory (repository root).
