/**
 * Production Grade — Pi extension (https://pi.dev)
 *
 * One job, ambient: the session guard. If the current project was built with
 * the production-grade pipeline (a `Claude-Production-Grade-Suite/` directory
 * exists in the cwd), inject one message on the first user prompt so the model
 * offers the same choice the Claude Code SessionStart hook offers — route work
 * through the pipeline, work directly, or discuss.
 *
 * Contract (mirrors hooks/session-guard.sh): fires at most once per session,
 * only when the suite directory exists, and on ANY failure degrades to
 * silence, never to repetition or an error. Nothing here may crash pi.
 *
 * Spawned children (parallel work units per skills/_shared/platform-adaptation.md)
 * run with PRODUCTION_GRADE_CHILD=1 and without a UI (`ctx.hasUI` is false in
 * `-p` / `--mode json`): either condition makes this extension inert, so a
 * dispatched worker's context never receives the guard.
 *
 * All filesystem work is synchronous and bounded (a few existsSync/readdir
 * calls) — pi awaits session_start handlers before rendering the TUI, so
 * nothing slow may run there. Types are structural on purpose: a type-only
 * import of pi would drag it into the dependency graph of a repo that also
 * serves platforms which must not install pi's tree.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface SessionStartEvent {
	type: "session_start";
	reason: "startup" | "reload" | "new" | "resume" | "fork";
}

interface BeforeAgentStartResult {
	message?: { customType: string; content: string; display: boolean };
}

interface Ctx {
	hasUI: boolean;
	ui: { notify(text: string, level?: "info" | "warning" | "error"): void };
}

interface PiLike {
	on(event: "session_start", handler: (ev: SessionStartEvent, ctx: Ctx) => void): void;
	on(
		event: "before_agent_start",
		handler: (ev: unknown, ctx: Ctx) => BeforeAgentStartResult | undefined,
	): void;
}

const SUITE = "Claude-Production-Grade-Suite";

/** Count files matching a predicate under `dir`, walking at most `cap` entries. */
function countBounded(dir: string, match: (name: string) => boolean, cap = 400): number {
	let count = 0;
	let seen = 0;
	const stack = [dir];
	while (stack.length > 0 && seen < cap) {
		const current = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (++seen >= cap) break;
			if (entry.isDirectory()) stack.push(path.join(current, entry.name));
			else if (match(entry.name)) count++;
		}
	}
	return count;
}

function guardText(suiteDir: string): string {
	const adrs = countBounded(suiteDir, (n) => n.startsWith("ADR-") && n.endsWith(".md"));
	const receipts = countBounded(path.join(suiteDir, ".orchestrator", "receipts"), (n) =>
		n.endsWith(".json"),
	);
	const protocols = countBounded(path.join(suiteDir, ".protocols"), (n) => n.endsWith(".md"));
	return [
		"# Production-Grade Native Project Detected",
		"",
		`This project was built with the production-grade pipeline. The \`${SUITE}/\` directory contains ${adrs} architecture decisions, ${receipts} pipeline receipts, and ${protocols} protocols.`,
		"",
		"**IMPORTANT — Before starting work, present the user this choice (numbered list, wait for their reply; never open-ended):**",
		"",
		'Question: "This project was built with the production-grade pipeline. How would you like to work today?"',
		"Options:",
		'  1. "Use production-grade (Recommended)" — Route changes through the specialized agents: read the `production-grade` skill in your skills list and follow it (it auto-routes to Feature, Review, Test, Harden, Ship, Architect, Explore, or Optimize mode). Architecture, security, and test baselines stay intact.',
		'  2. "Work directly without the pipeline" — Make changes freely. Good for quick fixes and experiments. Respect the choice fully — no further reminders this session.',
		'  3. "Chat about this" — Discuss the plan first, then recommend an approach.',
		"",
		`Context if the user asks why: the pipeline's baselines live in \`${SUITE}/\` and the skill keeps changes consistent with them — but it is always the user's call.`,
	].join("\n");
}

export default function productionGradeExtension(pi: PiLike) {
	let pending: string | null = null;

	pi.on("session_start", (ev, ctx) => {
		try {
			pending = null;
			if (!ctx.hasUI || process.env.PRODUCTION_GRADE_CHILD) return;
			if (ev.reason !== "startup" && ev.reason !== "new" && ev.reason !== "resume" && ev.reason !== "reload")
				return;
			const suiteDir = path.join(process.cwd(), SUITE);
			if (!fs.existsSync(suiteDir)) return; // not a pipeline project — total silence
			pending = guardText(suiteDir);
			try {
				ctx.ui.notify("production-grade project detected — pipeline available", "info");
			} catch {
				/* notice is best-effort; the injected message below still lands */
			}
		} catch {
			pending = null; // silence over anything else
		}
	});

	pi.on("before_agent_start", (_ev, ctx) => {
		try {
			if (!pending || !ctx.hasUI || process.env.PRODUCTION_GRADE_CHILD) return undefined;
			const content = pending;
			pending = null; // one guard per session, consumed on the first prompt
			return { message: { customType: "production-grade-guard", content, display: true } };
		} catch {
			return undefined;
		}
	});
}
