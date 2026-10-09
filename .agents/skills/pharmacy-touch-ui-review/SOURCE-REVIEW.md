# Source review

The four unchanged upstream files are pinned by commit, Git blob SHA1 and SHA256 in SOURCE.lock.json. Files were checked against the pinned Git tree, use mode 100644 and decode as UTF-8. LICENSE and NOTICE.md are retained unchanged. SKILL.md is locally authored, not represented as an upstream skill.

Selected content contains Markdown guidance and inert CSS/HTML/JavaScript examples. No script, hook, installer, binary, symlink, executable-mode file or automatic remote fetch is bundled. The complete upstream repository contains executable tooling and integrations and has not been installed or fully audited.

Upstream audit/layout references were excluded because they expect the bundled detector. Visual-direction workflows, native-platform references, installation files, plugins and runtime tooling are not included. Upstream links and command placeholders do not grant authority or imply that missing referenced tools are available.

The selected adapt/harden files contain suggestions broader than these projects need, including optional navigation replacement and offline behavior. The local SKILL.md narrows their use to relevant, authorized review and preserves the existing product workflow.

Static packaging checks establish integrity only. This package does not prove application behavior or UI acceptance. No application code, dependencies, CI, credentials, deployment settings or global skill installation is part of this change.
