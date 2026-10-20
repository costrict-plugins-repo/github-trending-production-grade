#!/usr/bin/env node
// Deterministic validation harness for the production-grade Pi port.
// Adapted from engram's experiments/pi-harness (the proven instrument behind
// its INSTALL-PI.md), simplified: no engine, no store — the surfaces under
// test are skill discovery, the /production-grade template, and the
// session-guard extension. Fully sandboxed: pi runs with HOME pointed into
// the scratch dir, so the user's real ~/.pi is never touched.
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HARNESS = __dirname;
const REPO = path.resolve(__dirname, "../..");
const PI = process.env.PI_BIN || "pi"; // point PI_BIN at a specific binary to pin the pi under test
const WORK = path.join(HARNESS, "work");
const HOME = path.join(WORK, "home"); // sandboxed ~ for every pi spawn
const PROJ_PLAIN = path.join(WORK, "proj-plain"); // no suite dir
const PROJ_SUITE = path.join(WORK, "proj-suite"); // has Claude-Production-Grade-Suite/
const CAPTURE = path.join(WORK, "capture.jsonl");
const PORT = 8199;
const GUARD_MARK = "Production-Grade Native Project Detected";

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (detail ? "  — " + String(detail).slice(0, 200) : ""));
}

function captureLines() {
  if (!fs.existsSync(CAPTURE)) return [];
  return fs.readFileSync(CAPTURE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
function msgToText(m) {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((c) => (typeof c === "string" ? c : c.text || "")).join("\n");
  return "";
}
function reqText(req) {
  return (req.body.messages || []).map((m) => (m.role || "") + ": " + msgToText(m)).join("\n---\n");
}
function runPi(args, env, opts) {
  return spawnSync(PI, args, {
    cwd: (opts && opts.cwd) || PROJ_PLAIN,
    env: { ...process.env, HOME, ...env },
    encoding: "utf8",
    timeout: 120000,
  });
}
const SKILLS = [
  "production-grade", "polymath", "product-manager", "solution-architect", "software-engineer",
  "frontend-engineer", "qa-engineer", "security-engineer", "code-reviewer", "devops", "sre",
  "data-scientist", "technical-writer", "skill-maker",
];

function rpcSession(cwd, extraEnv) {
  const proc = spawn(PI, ["--mode", "rpc", "--no-session", "--provider", "mock", "--model", "mock-1"], {
    cwd,
    env: { ...process.env, HOME, ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = [];
  let buf = "";
  proc.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) lines.push(line);
    }
  });
  proc.stderr.on("data", () => {});
  return { proc, lines };
}
const waitFor = (pred, ms) =>
  new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const hit = pred();
      if (hit || Date.now() - t0 > ms) {
        clearInterval(iv);
        res(hit || null);
      }
    }, 100);
  });

async function main() {
  // ---- setup --------------------------------------------------------------
  fs.rmSync(WORK, { recursive: true, force: true });
  for (const d of [WORK, HOME, PROJ_PLAIN, PROJ_SUITE]) fs.mkdirSync(d, { recursive: true });
  // suite project: what a pipeline-built repo looks like
  const suite = path.join(PROJ_SUITE, "Claude-Production-Grade-Suite");
  fs.mkdirSync(path.join(suite, ".orchestrator", "receipts"), { recursive: true });
  fs.mkdirSync(path.join(suite, ".protocols"), { recursive: true });
  fs.writeFileSync(path.join(suite, ".orchestrator", "receipts", "T1-product-manager.json"), "{}");
  fs.writeFileSync(path.join(suite, ".protocols", "ux-protocol.md"), "# ux\n");
  fs.writeFileSync(path.join(suite, "ADR-001-example.md"), "# adr\n");

  // mock provider in the SANDBOXED home
  const modelsJson = path.join(HOME, ".pi", "agent", "models.json");
  fs.mkdirSync(path.dirname(modelsJson), { recursive: true });
  fs.writeFileSync(
    modelsJson,
    JSON.stringify({
      providers: {
        mock: {
          baseUrl: "http://127.0.0.1:" + PORT + "/v1",
          api: "openai-completions",
          apiKey: "mock",
          models: [{ id: "mock-1", name: "Mock 1", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 32000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
        },
      },
    }, null, 2),
  );

  // install production-grade as a local-path pi package (in the sandboxed home)
  let r = runPi(["install", REPO], {}, { cwd: WORK });
  console.log("pi install:", (r.stdout || "").trim(), (r.stderr || "").trim());
  check("H0 sandbox held: no real ~/.pi created", !fs.existsSync(path.join(process.env.HOME, ".pi")));
  // pi stores local-path packages relative to ~/.pi/agent — resolve before comparing
  const settingsDir = path.join(HOME, ".pi", "agent");
  const settings = JSON.parse(fs.readFileSync(path.join(settingsDir, "settings.json"), "utf8"));
  const pkgRegistered = (settings.packages || []).some(
    (p) => path.resolve(settingsDir, String(p)) === REPO,
  );
  const cfg = runPi(["config"], {}, { cwd: WORK });
  const cfgOut = ((cfg.stdout || "") + (cfg.stderr || "")).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  check(
    "H1 package registered (settings.json) and pi config shows extension + skills",
    pkgRegistered && cfgOut.includes("production-grade.ts") && cfgOut.includes("qa-engineer"),
    (pkgRegistered ? "registered" : "NOT in settings.json") + "; tui shows ext=" + cfgOut.includes("production-grade.ts"),
  );
  fs.writeFileSync(path.join(WORK, "pi-config.txt"), cfgOut);

  // mock server up
  const mock = spawn("node", [path.join(HARNESS, "mock-llm.cjs")], {
    env: { ...process.env, MOCK_PORT: String(PORT), MOCK_CAPTURE: CAPTURE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((res) => mock.stdout.once("data", res));

  const piArgs = ["--no-session", "--provider", "mock", "--model", "mock-1"];

  try {
    // ---- H2: parent print-mode run — all 14 skills discovered -------------
    let before = captureLines().length;
    r = runPi(["-p", ...piArgs, "hello there"], {}, { cwd: PROJ_PLAIN });
    check("H2 pi -p exits 0 and prints mock reply", r.status === 0 && (r.stdout || "").includes("MOCK-OK"), "status=" + r.status + " " + (r.stderr || "").slice(0, 150));
    let reqs = captureLines().slice(before);
    const sys = reqs[0] ? msgToText((reqs[0].body.messages || [])[0] || {}) : "";
    const present = SKILLS.filter((s) => sys.includes("skills/" + s + "/SKILL.md"));
    check("H2 all 14 skills in system prompt", present.length === 14, "found " + present.length + ": " + present.join(","));
    check("H2 skills presented in Agent Skills XML form", sys.includes("<available_skills>"));
    check("H2 skill paths point into the installed repo", sys.includes(REPO + "/skills/") || /skills\/production-grade\/SKILL\.md/.test(sys));
    check("H2 _shared not offered as a skill", !sys.includes("_shared/SKILL.md"));
    check("H2 no guard in print mode (extension inert headless)", !reqText(reqs[0] || { body: {} }).includes(GUARD_MARK));

    // ---- H3: /production-grade template expansion --------------------------
    before = captureLines().length;
    r = runPi(["-p", ...piArgs, "/production-grade build me a todo app"], {}, { cwd: PROJ_PLAIN });
    reqs = captureLines().slice(before);
    const h3 = reqs[0] ? reqText(reqs[0]) : "";
    check("H3 /production-grade template expanded with args", h3.includes("Load the Production Grade orchestrator") && h3.includes("build me a todo app"), h3.slice(0, 200));

    // ---- H4: RPC in a suite project — guard injected as user message -------
    before = captureLines().length;
    const s1 = rpcSession(PROJ_SUITE, {});
    await new Promise((res) => setTimeout(res, 2500));
    s1.proc.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message: "hello from rpc" }) + "\n");
    await waitFor(() => captureLines().length > before, 20000);
    await new Promise((res) => setTimeout(res, 500));
    reqs = captureLines().slice(before);
    const guardAsUser = reqs.some((req) =>
      (req.body.messages || []).some((m) => m.role === "user" && msgToText(m).includes(GUARD_MARK)),
    );
    check("H4 guard injected as user-role message on first prompt (suite project)", guardAsUser, reqs.map(reqText).join("").includes(GUARD_MARK) ? "present, wrong role" : "guard text absent");
    const guardCounts = reqs.map(reqText).join("\n");
    check("H4 guard message carries real counts (1 receipt, 1 protocol, 1 ADR)", guardCounts.includes("1 architecture decisions") && guardCounts.includes("1 pipeline receipts") && guardCounts.includes("1 protocols"));
    const notifySeen = s1.lines.some((l) => l.includes("notify") && l.includes("production-grade"));
    check("H4 RPC notify request emitted (the TUI-notice half)", notifySeen);
    s1.proc.kill();

    // ---- H5: RPC in a plain project — silence in the live mode -------------
    before = captureLines().length;
    const s2 = rpcSession(PROJ_PLAIN, {});
    await new Promise((res) => setTimeout(res, 2500));
    s2.proc.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message: "hello from rpc" }) + "\n");
    await waitFor(() => captureLines().length > before, 20000);
    await new Promise((res) => setTimeout(res, 500));
    reqs = captureLines().slice(before);
    const anyGuard = reqs.map(reqText).join("").includes(GUARD_MARK);
    const notify2 = s2.lines.some((l) => l.includes("notify") && l.includes("production-grade"));
    check("H5 plain project over live RPC UI: no notify, no guard in payload", !anyGuard && !notify2);
    s2.proc.kill();

    // ---- H6: child env guard — suite project, RPC, PRODUCTION_GRADE_CHILD=1
    before = captureLines().length;
    const s3 = rpcSession(PROJ_SUITE, { PRODUCTION_GRADE_CHILD: "1" });
    await new Promise((res) => setTimeout(res, 2500));
    s3.proc.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message: "child unit task" }) + "\n");
    await waitFor(() => captureLines().length > before, 20000);
    await new Promise((res) => setTimeout(res, 500));
    reqs = captureLines().slice(before);
    check("H6 child (PRODUCTION_GRADE_CHILD=1) in suite project: no guard", !reqs.map(reqText).join("").includes(GUARD_MARK));
    s3.proc.kill();
  } finally {
    try { mock.kill(); } catch {}
    r = runPi(["remove", REPO], {}, { cwd: WORK });
    console.log("pi remove:", (r.stdout || r.stderr || "").trim());
  }

  const failed = results.filter((x) => !x.pass);
  console.log("\n== " + (results.length - failed.length) + "/" + results.length + " checks passed ==");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("harness error:", e);
  process.exit(2);
});
