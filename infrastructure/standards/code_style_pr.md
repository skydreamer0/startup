# Code Style & Pull Request (PR) Policy

## 1. Code Style Principles
- **Readability is King**: Write code for humans first, compilers second.
- **Single Responsibility**: Each function/component should do one thing well.
- **Linter Enforcement**: All projects must use automated linters (ESLint, Prettier, Black, etc.). CI will fail on linting errors.

## 2. Pull Request (PR) Requirements
Every PR must include:
1. **Description**: What changed and why?
2. **Issue Link**: Link to the ticket or task.
3. **Tests**: Proof that the code works (unit/integration results).
4. **Screenshots/Videos**: For UI-related changes.

## 3. Reviewer Checklist
Reviewers should focus on:
- **Correctness**: Does it solve the problem?
- **Security**: Any obvious vulnerabilities?
- **Style**: Does it follow the established patterns?
- **Maintainability**: Is the code clear?

## 4. Documentation
If an architectural decision was made, it **must** be accompanied by an ADR update in the `infrastructure/adr/` directory.
