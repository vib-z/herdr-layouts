import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../mods/fleet-tab/model.js";
import { agents, terminals, spaces, agent } from "./fixtures.mjs";
const rows = () => m.collectRows(agents, terminals, spaces);

test("address-only titles fall through to reported title, program and finally address", () => {
  for (const address of ["t1", "edge/t1"]) {
    const a = agent(address, "working", { title: ` ${address} ` });
    assert.equal(m.titleOf(a, { report: { title: "refresh cache" } }), "refresh cache");
    assert.equal(m.titleOf(a), "demo-agent");
    assert.equal(m.titleOf({ address, title: address }), address);
    assert.equal(m.titleOf({ ...a, title: "keep named task" }, { report: { title: "reported" } }), "keep named task");
    assert.equal(m.collectRows([a], [{ address, report: { title: "refresh cache" } }], spaces)[0].title, "refresh cache");
  }
});

test("title precedence, truthful host/project, native states and raw remote children", () => {
  const all = rows();
  assert.equal(all.length, 12);
  assert.equal(all.find(a => a.address === "t1").host, "local");
  assert.equal(all.find(a => a.address === "t1").project, "service");
  const child = all.find(a => a.address === "edge/t11");
  assert.equal(child.space, "edge/ops"); assert.equal(child.host, "edge"); assert.equal(child.tab_name, "auth");
  assert.equal(child.status, "blocked"); assert.equal(child.title, "child decision");
  assert.deepEqual(m.focusCommand(child), { name: "terminal.peek", args: { terminal: "edge/t11" } });
  assert.equal(all.find(a => a.address === "t12").status, "idle"); assert.equal(all.find(a => a.address === "t12").rawDone, true);
  assert.equal(all.find(a => a.address === "t5").status, "done");
  assert.equal(m.titleOf({ title: "" }, { report: { title: "reported" }, program: { name: "program" } }), "reported");
  assert.equal(m.titleOf({ address: "t99" }), "t99");
});
test("status, host and project grouping keep every blocker through unmatched searches", () => {
  for (const group of ["status", "host", "project"]) {
    const result = m.groupRows(rows(), "impossible search", group);
    assert.equal(result.attention.length, 4); assert.equal(result.groups.length, 0);
  }
  assert.deepEqual(m.groupRows(rows()).groups.map(g => g.key), ["done", "working", "idle"]);
  assert.deepEqual(m.groupRows(rows(), "", "host").groups.map(g => g.key), ["local"]);
  assert.deepEqual(m.groupRows(rows(), "", "project").groups.map(g => g.key), ["service"]);
  for (const query of ["task t1", "local", "service", "api"]) assert.ok(m.groupRows(rows(), query).groups.length);
});
test("model and progress appear only from an explicit report, including zero", () => {
  const a = rows()[0];
  assert.deepEqual(m.chips(a).map(c => c.value), ["local", "service", "example-v1"]); assert.equal(a.progress, 26);
  assert.equal(m.reportedModel({ title: "Use demo-agent now" }), null);
  assert.equal(m.reportedModel({ msg: "model=sample-v2" }), "sample-v2");
  assert.equal(m.reportedModel({ model: "unconfirmed-field" }), null);
  assert.equal(m.progressOf({ progress: 0 }), 0);
  for (const value of [null, "50", -1, 101, Infinity, NaN]) assert.equal(m.progressOf({ progress: value }), null);
  assert.equal(m.chips(rows()[1]).length, 2);
});
test("minimal and grouping preferences persist across reconstructed views", () => {
  const store = new Map(), read = key => store.get(key), write = (key, value) => store.set(key, value);
  assert.equal(m.preferences(read).minimal, false); m.toggleMinimal(read, write);
  assert.equal(m.preferences(key => store.get(key)).minimal, true); m.toggleMinimal(read, write);
  assert.equal(m.preferences(read).minimal, false); write("fleet-tab.group", "host"); assert.equal(m.preferences(read).group, "host");
});
test("state clock survives stale/null native timestamps, changes and persistence", () => {
  let history = m.remember([], rows(), 10000, spaces);
  const first = history[0]; assert.equal(first.state_started_ms, 2000);
  history = m.remember(JSON.parse(JSON.stringify(history)), rows(), 20000, spaces);
  assert.equal(history[0].state_started_ms, 2000);
  const changed = { ...rows()[0], status: "blocked", status_ms: 1000 };
  assert.equal(m.stateStart(changed, first, spaces, 30000), 30000);
  assert.equal(m.stateStart({ ...rows()[0], status_ms: 25000 }, first, spaces, 30000), 25000);
  assert.equal(m.stateStart({ ...rows()[0], status_ms: 99999 }, first, spaces, 30000), 2000);
  assert.equal(m.elapsed(1000, 61000), "1m"); assert.equal(m.elapsed(null, 61000), "--");
});
test("bounded history archives exact confirmed exits only and suppresses live races", () => {
  const history = m.markMissing(m.remember([], rows(), 10000, spaces), [], [], 12000);
  assert.ok(m.missingRows(history, [], []).every(a => a.status === "unavailable"));
  assert.throws(() => m.confirmExits(history, {}, new Set()));
  const payload = { terminals: [{ address: "t1", state: "finished", exit_code: 0 }, { address: "t4", state: "finished" }] };
  const confirmed = m.confirmExits(history, payload, new Set());
  assert.equal(m.missingRows(confirmed, [], [])[0].status, "archived");
  assert.equal(m.missingRows(confirmed, [], []).find(a => a.address === "edge/t4").status, "unavailable");
  assert.equal(m.confirmExits(history, payload, new Set(["t1"]))[0].exit, null);
  assert.equal(m.missingRows(confirmed, [], [{ address: "t1" }]).some(a => a.address === "t1"), false);
  assert.equal(m.remember([], Array.from({ length: 150 }, (_, i) => agent(`t${i}`, "idle")), 10000).length, m.HISTORY_LIMIT);
  assert.equal(m.missingRows(confirmed, [], [])[0].model, null);
});
test("empty state, long titles, missing fields and parent cycles are safe", () => {
  assert.deepEqual(m.collectRows(), []); assert.deepEqual(m.groupRows([]), { attention: [], groups: [] });
  assert.equal(rows().find(a => a.address === "t7").title.length, 60);
  const cyclic = m.collectRows([], [{ address: "t1", parent: "t2", status: "error" }, { address: "t2", parent: "t1", status: "error" }]);
  assert.equal(cyclic.length, 2); assert.equal(cyclic[0].space_name, "unassigned");
  assert.equal(m.plain("\x1b[31mhello\x1b[0m\nworld"), "hello world");
});
