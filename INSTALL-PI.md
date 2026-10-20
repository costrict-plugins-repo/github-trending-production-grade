# Production Grade on Pi

Production Grade is an **omni-repo**: one codebase that runs on Claude Code, OpenAI Codex, OpenCode — and [Pi](https://pi.dev), Earendil's minimal, extensible coding agent. The core is the same everywhere: the 14 `skills/` (Agent Skills standard `SKILL.md`) plus the shared protocols in `skills/_shared/`. There is no engine and no global state — the whole system is the skills plus the per-project `Claude-Production-Grade-Suite/` workspace they create. This file covers the Pi-specific glue.

Pi reads the Agent Skills standard natively and its package manager understands a plain git repo, so the port is thin: the repo has no `package.json`, which means Pi's **conventional-directory scan** picks up `skills/`, `prompts/`, and `extensions/` from the clone directly.

## What ships for Pi

```
skills/                        # SHARED — the same 14 skills every platform uses (recursive SKILL.md scan)
skills/_shared/                # SHARED — protocols + platform-adaptation.md (no SKILL.md → not offered as a skill)
prompts/production-grade.md    # /production-grade prompt template (args pass through via $@)
extensions/production-grade.ts # session guard: detects pipeline-built projects, offers the choice once
```

## Requirements

- **pi ≥ 0.74** (the extension uses `before_agent_start`'s injected-message return, present in 0.74.x). Current pi needs Node ≥ 22.19; on Node 20, npm serves pi's `legacy-node20` line instead — name which line you run when reporting issues.

## Install

```bash
pi install git:github.com/nagisanzenin/production-grade
```

Pi clones the repo under `~/.pi/agent/git/…`, registers it in `~/.pi/agent/settings.json`, and — with no package.json present — discovers the skills, the template, and the extension by convention. `pi update` tracks the default branch. A local clone works too: `pi install /path/to/clone` references the path without copying (the route for hacking on the plugin). `pi remove <source>` undoes either.

## Invoking

| You want | Type |
|---|---|
| anything through the pipeline | `/production-grade <request>` — or just say "build me X, production grade" |
| a specific skill explicitly | `/skill:production-grade <request>` (the sub-skills are all routed via the orchestrator) |

## The Pi differences

### ⚠ 1 · Structured questions become numbered lists

Pi has no AskUserQuestion tool. Gates and engagement-mode questions arrive as numbered option lists you answer in chat (per `skills/_shared/platform-adaptation.md`). Same options, same order, recommended first.

### ⚠ 2 · No subagents — fresh processes or inline execution

Pi ships no subagent mechanism, deliberately. Where the orchestrator would dispatch parallel agents, it follows platform-adaptation.md: either fresh non-interactive children (`PRODUCTION_GRADE_CHILD=1 pi --no-session -p "Read <skill path> and follow it…"` — a fresh process is a fresh context, and the env guard keeps this plugin's own extension silent in the child) or plain inline sequential execution with the same receipts, gates, and re-anchoring. Correctness is preserved; wall-clock parallelism is not.

### ⚠ 3 · The session guard is a Pi extension

On Claude Code a SessionStart hook detects projects built with the pipeline. On Pi, `extensions/production-grade.ts` does the same: when the cwd contains `Claude-Production-Grade-Suite/`, you get one TUI notice and the model receives the guard message with your first prompt — use the pipeline, work directly, or discuss. Silent in every other case (no suite dir, headless `-p`, `--mode json`, or spawned children). There is no PostToolUse oracle gate on Pi — agents run the fast oracle themselves after each edit, per the loop protocol.

## Verify the install

```bash
pi config     # production-grade listed, with skills / extension / prompts enabled
pi            # then type /  — production-grade should appear in the picker
```

## Honest status of the Pi glue

**Verified against pi 0.84.2 (`latest`, Node ≥ 22.19; macOS, 2026-08-19) — 14/14 checks by the committed payload-capture harness** ([`experiments/pi-harness/`](experiments/pi-harness/): a mock OpenAI-compatible provider inside a sandboxed `HOME`, so every payload pi was about to send a model could be inspected — engram's verification pattern, reused):

- `pi install` of this repo by local path; registration in `settings.json`; discovery of all **14 skills** by conventional-dir scan (`skills/_shared/` correctly not offered), plus the extension and the `/production-grade` template (`pi config` shows all three resource kinds enabled).
- Skills arrive in the captured system prompt in Agent Skills `<available_skills>` XML form, with paths into the installed repo.
- `/production-grade <args>` expands to the pointing-prompt with the arguments in place in the first model payload.
- The session guard injects its message as a **user-role** message on the first prompt in a directory containing `Claude-Production-Grade-Suite/` (with the real artifact counts), emits the TUI notify, and stays silent in a directory without the suite — both sides asserted over RPC, the mode where the guard machinery actually runs (in `-p` the extension is inert by design, which is asserted separately).
- Child hygiene: with `PRODUCTION_GRADE_CHILD=1`, no guard text appears in the child's payload even inside a suite-bearing directory.

**Not verified:** a complete live pipeline run on Pi with a real model (the transport under it is what the harness proved), the `pi install git:…` route (the harness installs by local path; the git route is pi's standard package flow over the same discovery), and the `legacy-node20` pi line (0.74.2 — the extension's API usage matches what engram verified there, but this plugin's harness ran on the current line only). Reports welcome — open an issue with what you see.
