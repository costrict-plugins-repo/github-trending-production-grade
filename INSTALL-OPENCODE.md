# Production Grade on OpenCode

Production Grade is an **omni-repo**: one codebase that runs on Claude Code, OpenAI Codex, OpenCode, and Pi. The core is the same everywhere — the 14 `skills/` (Agent Skills standard `SKILL.md`) plus the shared protocols in `skills/_shared/` are shared verbatim; there is no engine and no global state, so the whole system is the skills plus a per-project `Claude-Production-Grade-Suite/` workspace they create. This file covers the OpenCode route.

> Verified against a live **OpenCode v1.18.4** install — skill discovery via `skills.paths` was exercised with `opencode debug skill` (see honest status below). No adapter code, no npm package: OpenCode's own config points at a clone.

## What OpenCode reads

```
skills/                     # SHARED — the same 14 skills every platform uses
skills/_shared/             # SHARED — protocols + platform-adaptation.md (read by the skills at runtime)
```

Nothing else. OpenCode does not read the Claude/Codex manifests, and this plugin ships no OpenCode plugin module — the port is a config entry.

## Install

1. Clone the repo somewhere stable:

```bash
git clone https://github.com/nagisanzenin/production-grade.git \
  ~/.local/share/production-grade
```

2. Add the skills path to your OpenCode config — global (`~/.config/opencode/opencode.json`, `.jsonc` works too) or per-project (`opencode.json` in the project):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "skills": {
    "paths": ["~/.local/share/production-grade/skills"]
  }
}
```

3. Restart OpenCode. Verify with:

```bash
opencode debug skill        # the 14 production-grade skills should list
```

**Update:** `git -C ~/.local/share/production-grade pull`. (The orchestrator's own auto-update check is Claude-Code-marketplace-specific and skips itself silently here.)

**Uninstall:** remove the config entry, delete the clone.

## Invoking

Skill descriptions sit in the model's context, so natural language activates the orchestrator: *"build me a SaaS for X, production grade"*, *"harden this before launch"*, *"review my code"*. The orchestrator classifies the request into one of the 10 execution modes exactly as on Claude Code.

## The OpenCode differences

### ⚠ 1 · No AskUserQuestion tool

Gates and engagement-mode questions arrive as numbered option lists you answer in chat (per `skills/_shared/platform-adaptation.md`) instead of Claude Code's arrow-key picker. Same options, same order, recommended first.

### ⚠ 2 · Parallel dispatch maps to OpenCode's own agents

OpenCode has native subagent support; where the orchestrator would call the Claude Code Agent tool, it uses the host's task/subagent mechanism, or falls back to inline sequential execution with the same receipts and gates (platform-adaptation.md governs the mapping). Wave parallelism is therefore host-dependent; correctness is not.

### ⚠ 3 · No hooks

OpenCode does not run this plugin's `hooks/hooks.json`, so there is no automatic session guard and no PostToolUse oracle gate. The discipline is unchanged — the loop protocol requires agents to run the fast oracle (`Claude-Production-Grade-Suite/.orchestrator/oracle.sh`) after every source edit themselves; only the mechanical enforcement is absent.

### ⚠ 4 · Generic skill names share a namespace

The 14 skills include generically-named ones (`qa-engineer`, `code-reviewer`, `devops`, …). If you already have same-named skills from another source, check `opencode debug skill` for collisions; the sub-skills are all routed through the `production-grade` orchestrator, so renaming your own conflicting skill (or scoping this entry per-project) is the escape hatch.

## Honest status of the OpenCode glue

**Verified live on OpenCode v1.18.4:** `skills.paths` in config discovers all 14 skills from a plain clone of this repo (`opencode debug skill` lists them; `skills/_shared/` is correctly not offered as a skill).

**Not verified:** a full multi-hour pipeline run on OpenCode (gates, receipts, and re-anchoring are plain file operations and prose contracts, so they carry over, but no end-to-end build has been driven here yet), and subagent dispatch depth. If anything misbehaves, open an issue with what you see.
