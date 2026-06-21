#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "AGENTS.md"
  "CONTEXT-MAP.md"
  "docs/agents/domain.md"
  "docs/agents/navigation.md"
  "systems/enterprise-admin/CONTEXT.md"
  "systems/enterprise-admin/package.json"
  "systems/enterprise-admin/backend/MODULE.md"
  "systems/enterprise-admin/admin-ui/MODULE.md"
  "systems/enterprise-admin/pos-ui/MODULE.md"
  "systems/enterprise-admin/packages/types/MODULE.md"
  "systems/enterprise-admin/infrastructure/standards/README.md"
  "systems/enterprise-admin/infrastructure/standards/agent_context.md"
  "systems/enterprise-admin/infrastructure/standards/git_workflow.md"
  ".github/pull_request_template.md"
  ".github/workflows/ci.yml"
)

required_patterns=(
  "AGENTS.md|Start-of-work read order"
  "AGENTS.md|End-of-work context update loop"
  "CONTEXT-MAP.md|Source-of-truth map"
  "CONTEXT-MAP.md|Freshness rule"
  "docs/agents/navigation.md|End-of-work route"
  "systems/enterprise-admin/CONTEXT.md|End-of-work context rules"
  "systems/enterprise-admin/backend/MODULE.md|Common task routes"
  "systems/enterprise-admin/admin-ui/MODULE.md|Common task routes"
  "systems/enterprise-admin/pos-ui/MODULE.md|Common task routes"
  "systems/enterprise-admin/packages/types/MODULE.md|Common task routes"
  "systems/enterprise-admin/infrastructure/standards/README.md|Agent Context Workflow"
  "systems/enterprise-admin/infrastructure/standards/agent_context.md|Git-controlled freshness"
  ".github/pull_request_template.md|AI context freshness"
  ".github/workflows/ci.yml|Agent Context Validation"
  "systems/enterprise-admin/package.json|agent:context"
)

failures=0

if [[ ! -x "scripts/validate-agent-context.sh" ]]; then
  echo "validation script is not executable: scripts/validate-agent-context.sh" >&2
  failures=$((failures + 1))
fi

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing required file: $file" >&2
    failures=$((failures + 1))
    continue
  fi

  if ! git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    echo "required file is not tracked by git: $file" >&2
    failures=$((failures + 1))
  fi
done

for entry in "${required_patterns[@]}"; do
  file="${entry%%|*}"
  pattern="${entry#*|}"
  if [[ -f "$file" ]] && ! grep -Fq -- "$pattern" "$file"; then
    echo "missing required pattern in $file: $pattern" >&2
    failures=$((failures + 1))
  fi
done

linked_paths=(
  "systems/enterprise-admin/CONTEXT.md"
  "systems/enterprise-admin/package.json"
  "docs/agents/navigation.md"
  "systems/enterprise-admin/backend/MODULE.md"
  "systems/enterprise-admin/admin-ui/MODULE.md"
  "systems/enterprise-admin/pos-ui/MODULE.md"
  "systems/enterprise-admin/packages/types/MODULE.md"
  "systems/enterprise-admin/infrastructure/standards/git_workflow.md"
  "systems/enterprise-admin/infrastructure/standards/agent_context.md"
  "systems/enterprise-admin/infrastructure/adr"
  "systems/enterprise-admin/infrastructure/api/api_spec.md"
  "systems/enterprise-admin/backend/prisma/schema.prisma"
  "systems/enterprise-admin/ROADMAP.md"
  ".github/workflows/ci.yml"
)

for path in "${linked_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "linked path does not exist: $path" >&2
    failures=$((failures + 1))
  fi
done

module_links=(
  "systems/enterprise-admin/backend/MODULE.md|../../../docs/agents/navigation.md"
  "systems/enterprise-admin/admin-ui/MODULE.md|../../../docs/agents/navigation.md"
  "systems/enterprise-admin/pos-ui/MODULE.md|../../../docs/agents/navigation.md"
  "systems/enterprise-admin/packages/types/MODULE.md|../../infrastructure/api/api_spec.md"
)

for entry in "${module_links[@]}"; do
  file="${entry%%|*}"
  relative_path="${entry#*|}"
  target_dir="$(dirname "$file")"
  if [[ -f "$file" ]] && [[ ! -e "$target_dir/$relative_path" ]]; then
    echo "module link does not resolve from $file: $relative_path" >&2
    failures=$((failures + 1))
  fi
done

if (( failures > 0 )); then
  echo "agent context validation failed with $failures issue(s)." >&2
  exit 1
fi

echo "agent context validation passed."
