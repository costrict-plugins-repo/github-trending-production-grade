# Production Grade on OpenAI Codex

Production Grade is an **omni-repo**: one codebase that runs on Claude Code, OpenAI Codex, OpenCode, and Pi. The core is the same everywhere — the 14 `skills/` (Agent Skills standard `SKILL.md`) plus the shared protocols in `skills/_shared/` are shared verbatim; there is no engine and no global state, so the whole system is the skills plus a per-project `Claude-Production-Grade-Suite/` workspace they create. This file covers the Codex-specific glue. Claude Code users need none of this; see the main README.

> Codex's plugin, skills, and hooks systems are modeled closely on Claude Code's, so most of this is 1:1. The genuine differences are called out as **⚠ Codex difference** below.

## What ships for Codex

```
.codex-plugin/plugin.json          # Codex plugin manifest (mirrors .claude-plugin/plugin.json, maps ./skills/)
.agents/plugins/marketplace.json   # Codex marketplace catalog (source: "./")
skills/                            # SHARED — the same 14 skills Claude Code uses
skills/_shared/                    # SHARED — protocols + platform-adaptation.md
hooks/                             # SHARED — session-guard + oracle-gate (self-resolving hooks.json, auto-discovered)
```

## Install

### Route A — as a plugin

```bash
codex plugin marketplace add nagisanzenin/production-grade
codex plugin add production-grade@production-grade
# or /plugin … in-session; restart Codex / reload plugins
```

The skills become available as **`$production-grade`**, `$polymath`, `$solution-architect`, … (Codex invokes skills by `$name` mention or via the `/skills` picker — there is no `/production-grade` slash command as on Claude Code). Say `$production-grade build me a SaaS for …` and the orchestrator takes it from there.

### Route B — skills only (no plugin machinery)

Any Agent Skills installer works, because `skills/*/SKILL.md` is the open standard:

```bash
npx skills add nagisanzenin/production-grade
# or, with Codex's bundled installer:
#   $skill-installer install production-grade from nagisanzenin/production-grade
```

If your installer stages **only the skill folders**, note that the skills read `skills/_shared/` (protocols and the platform-adaptation map) — prefer an installer that brings the whole `skills/` tree, or fall back to a plain clone and point your agent at `skills/`. The skills degrade gracefully either way (each carries an inline fallback paragraph), but the shared protocols are where the full discipline lives.

## The Codex differences

### ⚠ 1 · Skills are `$name`-invoked

`/production-grade just harden` on Claude Code is `$production-grade just harden` here. Everything after the name is passed through unchanged (modes, partial execution, all of it).

### ⚠ 2 · No Task/Teams tools — parallel waves become sequential or child processes

On Claude Code the orchestrator dispatches parallel agents with the Agent/Task tools. Codex has no equivalent generic subagent tool, so the orchestrator follows `skills/_shared/platform-adaptation.md`: work units run **inline sequentially** (same receipts, same gates, same re-anchoring — slower), or as fresh headless children of the host binary where you approve that. The guarantees (fresh context per unit, receipts, gate verification) are preserved; only the mechanism changes.

### ⚠ 3 · The sandbox meets the workspace

Everything Production Grade writes lives **inside your project** (`Claude-Production-Grade-Suite/`, `services/`, `tests/`, …), so Codex's default `workspace-write` sandbox is a natural fit — no home-directory state, no approval prompts for plugin state. The only writes outside the workspace would be the ones your build itself asks for.

### ⚠ 4 · Hooks ride along, unverified

`hooks/hooks.json` uses the same shape Codex documents (SessionStart + PostToolUse), the commands resolve their root by waterfall (`CLAUDE_PLUGIN_ROOT` → `CODEX_PLUGIN_ROOT` → cache scan), and they exit silently when nothing resolves. If Codex runs them, you get the session guard (pipeline-project detection) and the oracle gate (fast oracle after every source edit) for free. If it doesn't, nothing breaks — the loop-protocol tells agents to run the fast oracle themselves after each edit.

## Verify the install

```bash
codex             # then type /skills — the 14 production-grade skills should list
# then: $production-grade review my code   (smallest end-to-end exercise: Review mode, read-only)
```

## Honest status of the Codex glue

**Verified:** the shared skills and protocols (byte-identical to the Claude Code plugin, exercised daily there), the manifest shape (mirrors engram's Codex manifest, which also backs its OpenClaw bundle loading), and the hooks' silent degradation when no plugin root resolves (tested by running both hook commands with no `*_PLUGIN_ROOT` set — silence, exit 0).

**Not verified against a live Codex binary** (this port was built without one): the exact marketplace/plugin-add flow, whether Codex executes `hooks/hooks.json` for plugins and expands `CODEX_PLUGIN_ROOT` in it (a mismatch is harmless — the commands check file existence and exit 0), and the `$name` invocation spelling beyond what Codex's docs state. If any plugin route misbehaves, **Route B (skills only) is the robust fallback** — the skills are the portable core and carry the whole pipeline. Please open an issue with what you see.
