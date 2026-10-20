# The Pi verification harness

The instrument behind INSTALL-PI.md's "verified 14/14" — kept here so the claim
stays re-runnable instead of being a number you have to trust. Adapted from
engram's `experiments/pi-harness` (the original of this pattern).

**What it does:** stands up a mock OpenAI-compatible provider on `127.0.0.1:8199`
that **captures every payload pi is about to send a model**, installs this repo as
a local pi package inside a **sandboxed `HOME`** (your real `~/.pi` is never
touched), and asserts against the captured payloads — no live LLM anywhere:

- H0/H1 — sandbox holds; the package registers with the extension, all skills, and
  the prompt template (asserted on `settings.json` + the `pi config` render).
- H2 — parent print-mode run: all **14 skills** in the system prompt (Agent Skills
  `<available_skills>` XML), paths into this repo, `skills/_shared/` not offered,
  no guard (the extension is deliberately inert headless).
- H3 — `/production-grade <args>` prompt template expands with the arguments.
- H4 — RPC mode (the interactive-equivalent path, `ctx.hasUI` true) in a project
  containing `Claude-Production-Grade-Suite/`: the session-guard message is
  injected as a **user-role** message with the first prompt, carries the real
  artifact counts, and the TUI notify request is emitted.
- H5 — RPC mode in a plain project: no notify, no guard text in any payload —
  the silence, asserted in the one mode where the guard machinery actually runs
  (a print-mode "no guard" check alone would be vacuous; H2's is labeled as the
  inertness check, not the silence check).
- H6 — RPC mode in the suite project with `PRODUCTION_GRADE_CHILD=1`: no guard —
  the env flag that platform-adaptation.md's child-spawn recipe sets is what
  keeps dispatched work units clean, and this check is why we know it works.

**Run it:**

```bash
node experiments/pi-harness/harness.cjs     # needs `pi` on PATH (or PI_BIN=/path/to/pi)
```

Exit 0 and `14/14 checks passed` is the pass state. Scratch state lives under
`experiments/pi-harness/work/` (gitignored); the harness installs and removes
this repo as a pi package inside its sandboxed HOME only.

**Version notes:** 14/14 on pi **0.84.2** (`latest`, Node ≥ 22.19), macOS,
2026-08-19. The `legacy-node20` line (0.74.2) has not been run against this
plugin — the extension's API usage matches what engram verified there, but that
is inference, not a check. Pi parses prompt-template frontmatter as strict YAML
and **silently skips** a template whose unquoted `description:` carries a second
colon — every frontmatter value in `prompts/*.md` stays double-quoted.

Not wired into CI: it needs a pi binary installed, and CI has none.
