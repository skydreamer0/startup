# Writing Agent Briefs

An agent brief is a structured comment posted on a GitHub issue when it moves to `ready-for-agent`. It consolidates the current behavioral specification and acceptance criteria into a resumable work contract. Link the source Issue criteria and latest applicable human instructions; the brief is not a new source of authorization and cannot override them.

## Principles

### Durability over precision

The issue may sit in `ready-for-agent` for days or weeks. The codebase will change in the meantime. Write the brief so it stays useful even as files are renamed, moved, or refactored.

- **Do** describe interfaces, types, and behavioral contracts
- **Do** name specific types, function signatures, or config shapes that the agent should look for or modify
- **Don't** make a path the durable requirement; keep current file ownership in the revision-bound dispatch record below and revalidate it on resume
- **Don't** reference line numbers
- **Don't** assume the current implementation structure will remain the same

### Behavioral, not procedural

Describe **what** the system should do, not **how** to implement it. The agent will explore the codebase fresh and make its own implementation decisions.

- **Good:** "The `SkillConfig` type should accept an optional `schedule` field of type `CronExpression`"
- **Bad:** "Open src/types/skill.ts and add a schedule field on line 42"
- **Good:** "When a user runs `/triage` with no arguments, they should see a summary of issues needing attention"
- **Bad:** "Add a switch statement in the main handler function"

### Complete acceptance criteria

The agent needs to know when it's done. Every agent brief must have concrete, testable acceptance criteria. Each criterion should be independently verifiable.

- **Good:** "Running `gh issue list --label needs-triage` returns issues that have been through initial classification"
- **Bad:** "Triage should work correctly"

### Explicit scope boundaries

State what is out of scope. This prevents the agent from gold-plating or making assumptions about adjacent features.

<a id="dispatch-contract"></a>
## Dispatch and acceptance record

Keep the human-readable brief below. Add one small JSON record beside it when dispatching or handing off work, so a person or a simple reader can recover ownership, current evidence and the next step without inferring them from a chat transcript. This is a documentation convention, not a new orchestrator, permission system or repository label workflow.

```json
{
  "version": 1,
  "source": {
    "issue": "REPLACE_WITH_VERIFIED_ISSUE_URL",
    "ac_ids": ["AC-1"],
    "latest_authorization_ref": "REPLACE_WITH_MESSAGE_OR_COMMENT_REFERENCE",
    "checked_at": null
  },
  "owner": "REPLACE_WITH_CURRENT_OWNER",
  "paths": ["REPLACE_WITH_EXACT_OWNED_PATH"],
  "revision": { "base": null, "head": null },
  "artifact": [],
  "environment": {
    "target": "REPLACE_WITH_AUTHORIZED_ENVIRONMENT",
    "readiness": "unknown",
    "evidence": null
  },
  "status": "planned",
  "acceptance": [
    {
      "ac_id": "AC-1",
      "layer": "source",
      "verdict": "NOT RUN",
      "head": null,
      "command_or_action": null,
      "evidence": [],
      "reason": "Not evaluated yet"
    }
  ],
  "next": { "owner": "REPLACE_WITH_CURRENT_OWNER", "action": "Verify live scope, revision and prerequisites" },
  "stop": ["Latest human instruction cancels or pauses this work", "Required authority, environment or dependency is unavailable"]
}
```

Replace placeholders before dispatch. Use `null` or an empty list for genuinely unknown information, never an invented SHA, link, approval or successful result. Keep secrets and private conversation contents out of the record; a reference locates the original instruction, it does not copy it into a public or broader audience.

### Field and resume rules

- `source`: link the original Issue and stable criterion IDs. If the Issue lacks IDs, map brief IDs to its exact criterion text without silently changing acceptance. Re-read current Issue comments and the latest applicable human authorization before acting; record the check time with timezone. An old schedule, label or brief never overrides a newer human instruction. Missing or inaccessible authority is unknown, not implied consent.
- `owner` / `paths`: record one owner and exact, bounded write paths for this slice. They are current coordination metadata, not permanent architecture. Recheck them at the selected revision; resolve overlapping ownership before writing. A rename or need for another path requires coordination, not silently taking another worker's files.
- `revision` / `artifact`: record full base and head commit IDs plus verified PR, diff, report or artifact references. Bind evidence to the tested head and environment, not merely a branch name or an older green run. A later edit invalidates the affected claim until rechecked.
- `environment`: use `readiness` = `unknown`, `waiting`, `ready` or `blocked`, with a current observation in `evidence`. Distinguish availability from permission and the tools required for the next step. This record does not authorize a local computer, production data, installation, CI/permission changes, publication, merge or deployment.
- `status`: use `planned`, `waiting`, `running`, `blocked`, `review` or `done`. `waiting` names an expected prerequisite; `blocked` names an obstacle requiring a decision or allowed remedy. `review` means evidence is ready for review, not already accepted. `done` means this bounded slice met its applicable criteria and required review/checks; it does not close the parent Issue or imply deployment.
- `acceptance`: add one row for every applicable AC/evidence layer. Use an explicit layer such as `source`, `unit`, `integration`, `browser-synthetic`, `browser-real-api`, `native-db`, `physical-device`, `operational` or `review`. Link the command/action, source head and result artifact; do not substitute one layer for another. Summaries do not replace raw evidence when the gate requires it.
- `next` / `stop`: name the next owner, concrete action and completion or stop boundary. On a real denial, stop that operation and preserve the exact target, reason and outcome. New wording or this record cannot bypass it; a retry requires materially new relevant evidence under the host policy, and an uncertain prior outcome must be checked first. Continue only independent authorized work.

### Verdicts and completion

| Verdict | Meaning |
| --- | --- |
| `PASS` | The stated criterion passed at this layer on the recorded revision and environment; evidence is linked. |
| `FAIL` | The criterion was evaluated and did not meet the expected result. |
| `BLOCKED` | A required action cannot proceed; state the exact action/target, reason, what completed and whether it was denied, is pending or has an uncertain outcome. |
| `NOT RUN` | No qualifying execution/evaluation exists for this criterion or layer. State why and what remains. |
| `N/A` | The criterion/layer is genuinely inapplicable to the agreed slice; explain why. Missing hardware, access, tools or evidence are not N/A. |

Missing, failed, cancelled or unexpectedly skipped checks are never PASS. Compare the expected checks with the observed checks for the exact head; no check record does not mean success. Keep pending checks open, and report cancellations/skips with their reason rather than silently dropping the AC. A docs-only slice may mark product behavior testing N/A with justification, but still must meet applicable documentation validation, independent review and repository CI requirements. Follow the existing PR template and CI policy; this record cannot weaken a gate or manufacture authority to rerun it.

Keep unmet parent criteria visible even when a smaller slice is done. For pharmacy UI, [MASTER role journeys](../../../systems/enterprise-admin/infrastructure/design-system/MASTER.md#role-journeys) identifies workflow boundaries; [pharmacy-touch-ui-review](../pharmacy-touch-ui-review/SKILL.md) routes the relevant evidence. Neither is a new business policy or acceptance approval.

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one-line description of what needs to happen

**Current behavior:**
Describe what happens now. For bugs, this is the broken behavior.
For enhancements, this is the status quo the feature builds on.

**Desired behavior:**
Describe what should happen after the agent's work is complete.
Be specific about edge cases and error conditions.

**Key interfaces:**
- `TypeName` — what needs to change and why
- `functionName()` return type — what it currently returns vs what it should return
- Config shape — any new configuration options needed

**Acceptance criteria:**
- [ ] AC-1: Specific, testable criterion 1 (link source criterion)
- [ ] AC-2: Specific, testable criterion 2 (link source criterion)
- [ ] AC-3: Specific, testable criterion 3 (link source criterion)

**Source and dispatch record:**
Link the Issue, latest applicable human instructions and current dispatch record.
Refresh revision, ownership, environment and per-AC evidence on handoff or resume.

**Out of scope:**
- Thing that should NOT be changed or addressed in this issue
- Adjacent feature that might seem related but is separate
```

## Examples

The examples below illustrate durable behavioral prose, not live tasks or authorization. They are not complete dispatch records: add verified source criteria, current ownership/revision and evidence using the contract above before using an example for real work.

### Good agent brief (bug)

```markdown
## Agent Brief

**Category:** bug
**Summary:** Skill description truncation drops mid-word, producing broken output

**Current behavior:**
When a skill description exceeds 1024 characters, it is truncated at exactly
1024 characters regardless of word boundaries. This produces descriptions
that end mid-word (e.g. "Use when the user wants to confi").

**Desired behavior:**
Truncation should break at the last word boundary before 1024 characters
and append "..." to indicate truncation.

**Key interfaces:**
- The `SkillMetadata` type's `description` field — no type change needed,
  but the validation/processing logic that populates it needs to respect
  word boundaries
- Any function that reads SKILL.md frontmatter and extracts the description

**Acceptance criteria:**
- [ ] Descriptions under 1024 chars are unchanged
- [ ] Descriptions over 1024 chars are truncated at the last word boundary
      before 1024 chars
- [ ] Truncated descriptions end with "..."
- [ ] The total length including "..." does not exceed 1024 chars

**Out of scope:**
- Changing the 1024 char limit itself
- Multi-line description support
```

### Good agent brief (enhancement)

```markdown
## Agent Brief

**Category:** enhancement
**Summary:** Add `.out-of-scope/` directory support for tracking rejected feature requests

**Current behavior:**
When a feature request is rejected, the issue is closed with a `wontfix` label
and a comment. There is no persistent record of the decision or reasoning.
Future similar requests require the maintainer to recall or search for the
prior discussion.

**Desired behavior:**
Rejected feature requests should be documented in `.out-of-scope/<concept>.md`
files that capture the decision, reasoning, and links to all issues that
requested the feature. When triaging new issues, these files should be
checked for matches.

**Key interfaces:**
- Markdown file format in `.out-of-scope/` — each file should have a
  `# Concept Name` heading, a `**Decision:**` line, a `**Reason:**` line,
  and a `**Prior requests:**` list with issue links
- The triage workflow should read all `.out-of-scope/*.md` files early
  and match incoming issues against them by concept similarity

**Acceptance criteria:**
- [ ] Closing a feature as wontfix creates/updates a file in `.out-of-scope/`
- [ ] The file includes the decision, reasoning, and link to the closed issue
- [ ] If a matching `.out-of-scope/` file already exists, the new issue is
      appended to its "Prior requests" list rather than creating a duplicate
- [ ] During triage, existing `.out-of-scope/` files are checked and surfaced
      when a new issue matches a prior rejection

**Out of scope:**
- Automated matching (human confirms the match)
- Reopening previously rejected features
- Bug reports (only enhancement rejections go to `.out-of-scope/`)
```

### Bad agent brief

```markdown
## Agent Brief

**Summary:** Fix the triage bug

**What to do:**
The triage thing is broken. Look at the main file and fix it.
The function around line 150 has the issue.

**Files to change:**
- src/triage/handler.ts (line 150)
- src/types.ts (line 42)
```

This is bad because:
- No category
- Vague description ("the triage thing is broken")
- Uses file paths and line numbers in place of durable behavior, with no revision-bound ownership record
- No acceptance criteria
- No scope boundaries
- No description of current vs desired behavior

