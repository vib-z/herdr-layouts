import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { collectAgents, normalizeStatus, readHistory, remember, confirmMissing,
  precomputeFrames, packBands, HISTORY_LIMIT } from "../mods/falling-code/model.js";

const spaces = ["api", "web", "ops"].map((id, i) => ({ id, name: id, machine: null,
  branch: "main", tabs: [{ id: `tab${i}`, name: "work", settled: i === 1 }] }));
const agent = (n, status = "working") => ({ address: `t${n}`, pane: `p${n}`,
  title: `task ${n}`, space: spaces[n % 3].id, space_name: spaces[n % 3].name,
  tab: `tab${n % 3}`, tab_name: "work", status, program: { name: "Agent" } });
const twenty = Array.from({ length: 20 }, (_, i) => agent(i));
const panes = twenty.map(a => ({ pane: a.pane, tab: a.tab, terminal: a.address, branch: "main" }));
for (const width of [660, 1172, 1260]) {
  const bands = packBands(twenty, panes, width);
  assert.equal(bands.flatMap(b => b.groups.flatMap(g => g.agents)).length, 20);
  assert(bands.every(b => b.width <= width && b.count <= 20));
  if (width === 660) assert(bands.length >= 2);
}
assert.equal(packBands(twenty.slice(0, 10), panes, 660).length, 1);
const tabAgents = [
  { ...agent(1), space: "web", tab: "first" },
  { ...agent(2), space: "web", tab: "second" },
  { ...agent(3), space: "remote/web", tab: "remote/first" },
];
const tabPanes = [
  { pane: "mod", tab: "first", terminal: null, branch: null },
  { pane: "p1", tab: "first", terminal: "t1", branch: null },
  { pane: "p2", tab: "second", terminal: "t2", branch: "feature/example" },
  { pane: "p3", tab: "remote/first", terminal: "remote/t3", branch: "remote-branch" },
  { pane: "split", tab: "second", terminal: "t4", branch: "other-split" },
];
const branches = panes => packBands(tabAgents, panes, 660).flatMap(b => b.groups.map(g => g.branch));
assert.deepEqual(branches(tabPanes), ["", "feature/example", "remote-branch"]);
assert.deepEqual(branches(tabPanes.map(p => ({ ...p, focused: p.tab === "second" }))),
  ["", "feature/example", "remote-branch"]);
assert.deepEqual(branches(tabPanes.map(p => ({ ...p, branch: null }))), ["", "", ""]);
assert.deepEqual(branches([]), ["", "", ""]);
console.log("PASS: per-tab branches, mod-pane exclusion, stable first-terminal selection, remote tabs and missing branch data");

const frames = precomputeFrames("t5");
assert.deepEqual(frames, precomputeFrames("t5"));
assert.equal(frames.length, 8);
assert(frames.every(f => f.split("\n").length === 10));
assert.notDeepEqual(frames, precomputeFrames("remote/t5"));
console.log("PASS: 20-column packing at 660px, 1172px and 1260px, stable seeded flipbooks");

const raw = [
  { address: "t98", parent: "t99", state: "live", status: "error", report: { msg: "pick one\nsecond line" } },
  { address: "t99", parent: "t1", state: "live", status: "working" },
  { address: "t97", parent: "t1", state: "live", status: "done" },
  { address: "t96", parent: "t1", state: "live", status: null, program: { shell: true } },
  { address: "remote/t2", parent: "remote/t1", state: "live", status: "blocked" },
];
const agents = collectAgents([agent(1, "done")], raw, spaces);
assert.equal(agents.find(a => a.address === "t1").status, "done");
assert.equal(agents.find(a => a.address === "t98").status, "blocked");
assert.equal(agents.find(a => a.address === "t98").space_name, "web");
assert.equal(agents.find(a => a.address === "t98").msg, "pick one");
assert.equal(agents.find(a => a.address === "t97").status, "idle");
assert(!agents.some(a => a.address === "t96"));
assert.equal(agents.find(a => a.address === "remote/t2").status, "blocked");
assert.equal(normalizeStatus("error"), "blocked");
const history = remember([], [agent(1)]);
const ready = [{ name: null, layout: "ready" }];
assert.equal(confirmMissing(history, [], { terminals: [{ address: "t1", state: "finished" }] }, ready)[0].status, "dead");
assert.equal(confirmMissing(history, [], { terminals: [] }, ready)[0].status, "unavailable");
assert.equal(confirmMissing(history, [], { terminals: [{ address: "t1", state: "finished" }] }, ready, true)[0].status, "unavailable");
assert.equal(confirmMissing(history, [], { terminals: [{ address: "t1", state: "finished" }] }, [])[0].status, "unavailable");
assert.equal(confirmMissing(history, [agent(1)], { terminals: [] }, ready).length, 0);
assert.equal(remember([], Array.from({ length: 100 }, (_, i) => agent(i))).length, HISTORY_LIMIT);
assert.deepEqual(readHistory("{broken"), []);
assert.deepEqual(readHistory("{}"), []);
console.log("PASS: native done, nested children, raw error, shell exclusion, confirmed exit, failure and bounded history");

const unnamed = { ...agent(1), title: "" };
const reported = { address: unnamed.address, state: "live", report: { title: "reported task title" }, status_ms: 123456789 };
const join = (listed, raw = []) => collectAgents([listed], raw, spaces)[0];
assert.equal(join(agent(1), [reported]).title, "task 1");
assert.equal(join(unnamed, [reported]).title, "reported task title");
assert.equal(join(unnamed).title, "Agent");
assert.equal(join({ ...unnamed, program: null }).title, "t1");
assert.equal(join(unnamed, [{ ...reported, address: "t2" }]).title, "Agent");
assert.equal(join(unnamed, [reported]).status_ms, 123456789);
assert.equal(join(unnamed).status_ms, null);
console.log("PASS: title precedence, report-only title and status timestamp join by address, program/address fallback, missing timestamp stays null");

const packageRoot = new URL("../", import.meta.url);
const recipe = await readFile(new URL("RECIPE.md", packageRoot), "utf8");
assert(recipe.includes("![Falling Code](preview.png)"));
assert(!/\b(?:lead|harness|sandbox|HC_SESSION|phases?|job)\b/i.test(recipe));
async function checkPackageText(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const file = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) await checkPackageText(file);
    else if (/\.(?:md|json|js|mjs|ts|svg)$/.test(entry.name)) {
      const content = await readFile(file, "utf8");
      assert(!/\/(?:Users|home)\//.test(content), `Private home path in ${entry.name}`);
    }
  }
}
await checkPackageText(packageRoot);
const layout = JSON.parse(await readFile(new URL("layouts/falling-code.json", packageRoot), "utf8"));
assert.equal(layout.background, "#020604");
console.log("PASS: gallery recipe, root preview reference, private-home path scan and solid terminal canvas");
