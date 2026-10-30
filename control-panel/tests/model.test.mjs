import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as m from "../mods/control-panel/model.js";
import frames from "../mods/control-panel/frames.js";
import * as f from "./fixtures.mjs";

test("joins state timestamps by address, preserves terminal title, excludes shell", () => {
  const rows = m.collectRows(f.agents, f.terminals, f.spaces);
  assert.equal(rows.length, 9);
  assert.equal(rows.find(a => a.address === "t1").status_ms, f.now - 194000);
  assert.equal(rows.find(a => a.address === "t1").title, "refresh token cache");
  assert.equal(rows.find(a => a.address === "t9").tab, "a1");
  assert.equal(rows.find(a => a.address === "t9").child, true);
  assert.ok(!rows.some(a => a.address === "t10"));
});
test("raw errors block and raw child finishes never become unseen done", () => {
  const raw = [...f.terminals, { address: "t21", parent: "t1", status: "error" },
    { address: "t22", parent: "t21", status: "done" }];
  const rows = m.collectRows(f.agents, raw, f.spaces);
  assert.equal(rows.find(a => a.address === "t21").status, "blocked");
  assert.equal(rows.find(a => a.address === "t22").status, "idle");
  assert.equal(rows.find(a => a.address === "t22").rawDone, true);
  assert.equal(rows.find(a => a.address === "t4").status, "done");
  assert.equal(rows.find(a => a.address === "t22").space, "s1");
});
test("remote label collisions stay on their machine and parent cycles terminate", () => {
  const spaces = [{ id: "s3", machine: null, name: "local", tabs: [{ id: "c1", name: "local" }] }, ...f.spaces];
  const raw = [
    { address: "remote/t20", parent: "gone", status: "blocked", labels: { "herdr.space": "s3", "herdr.tab": "c1" } },
    { address: "t31", parent: "t32", status: "working" }, { address: "t32", parent: "t31", status: "working" }
  ];
  const rows = m.collectRows([], raw, spaces);
  assert.equal(rows.find(a => a.address === "remote/t20").space, "remote/s3");
  assert.equal(rows.find(a => a.address === "t31").space_name, "unassigned");
});
test("ordering is stable across seq changes and blockers include settled and remote tabs", () => {
  const first = m.collectRows(f.agents, f.terminals, f.spaces);
  const second = m.collectRows([...f.agents].reverse().map((a, i) => ({ ...a, seq: i * 400 })), f.terminals, f.spaces);
  assert.deepEqual(second.map(a => a.address), first.map(a => a.address));
  const parts = m.partitionRows(first);
  assert.deepEqual(parts.blocked.map(a => a.address), ["t2", "t5", "remote/t7"]);
  assert.ok(parts.rest.every(a => a.status !== "blocked"));
  assert.equal(parts.blocked.length + parts.rest.length, first.length);
});
test("elapsed formatting uses status epoch, handles boundaries and missing times", () => {
  for (const [seconds, expected] of [[0, "0:00"], [59, "0:59"], [60, "1:00"], [3599, "59:59"],
    [3600, "1h 00m"], [86400, "1d 0h"], [90000, "1d 1h"], [86400000, "999d+"]]) {
    assert.equal(m.elapsed(f.now - seconds * 1000, f.now), expected);
  }
  for (const invalid of [null, undefined, NaN, 0, -1, f.now + 1]) assert.equal(m.elapsed(invalid, f.now), "--:--");
});
test("observed state clocks reset on transitions and retain unchanged starts across restarts", () => {
  const row = { ...f.agents[0], status_ms: null };
  let memory = m.remember([], [row], f.now);
  assert.equal(memory[0].state_started_ms, f.now);
  memory = m.remember(memory, [{ ...row, title: "renamed task" }], f.now + 5000);
  assert.equal(memory[0].state_started_ms, f.now);
  memory = m.remember(JSON.parse(JSON.stringify(memory)), [row], f.now + 10000);
  assert.equal(memory[0].state_started_ms, f.now);
  memory = m.remember(memory, [{ ...row, status: "blocked", status_ms: f.now - 100000 }], f.now + 12000);
  assert.equal(memory[0].state_started_ms, f.now + 12000);
  assert.equal(memory[0].status, "blocked");
  const finished = m.remember([], [{ ...row, status: "idle", rawDone: false }], f.now);
  assert.equal(m.remember(finished, [{ ...row, status: "idle", rawDone: true }], f.now + 2000)[0].state_started_ms, f.now + 2000);
});
test("core clock only advances a stored start, and missing clocks seed from tab estimates", () => {
  const row = { ...f.agents[0], status_ms: null };
  const memory = m.remember([], [row], f.now);
  for (const stamp of [null, 0, f.now - 5000, f.now + 20000]) {
    assert.equal(m.remember(memory, [{ ...row, status_ms: stamp }], f.now + 10000)[0].state_started_ms, f.now);
  }
  assert.equal(m.remember(memory, [{ ...row, status_ms: f.now + 8000 }], f.now + 10000)[0].state_started_ms, f.now + 8000);
  const spaces = [{ id: row.space, tabs: [{ id: row.tab, working_since: f.now - 90000, changed_at: f.now - 30000 }] }];
  assert.equal(m.remember([], [row], f.now, spaces)[0].state_started_ms, f.now - 90000);
  assert.equal(m.remember([], [{ ...row, status: "blocked" }], f.now, spaces)[0].state_started_ms, f.now - 30000);
  assert.equal(m.remember([], [{ ...row, status_ms: f.now - 60000 }], f.now, spaces)[0].state_started_ms, f.now - 60000);
  const seeded = m.remember([], [row], f.now, spaces);
  spaces[0].tabs[0].working_since = f.now;
  assert.equal(m.remember(seeded, [row], f.now + 5000, spaces)[0].state_started_ms, f.now - 90000);
  const legacy = [{ address: row.address, title: row.title }];
  assert.equal(m.remember(legacy, [row], f.now, spaces)[0].state_started_ms, f.now);
});
test("terminal text removes CSI, OSC hyperlinks, DCS, C1 and blank trailing lines", () => {
  const raw = "old\n\x1b[32mready\x1b[0m \x1b]8;;https://example.invalid\x07link\x1b]8;;\x1b\\\n  \n";
  assert.equal(m.lastLine(raw), "ready link");
  assert.equal(m.lastLine("old\rnew\n\n"), "new");
  assert.equal(m.lastLine("\x1bPsecret\x1b\\\x9b31mclean\x9b0m"), "clean");
  assert.equal(m.lastLine("\x1b]unterminated"), "");
  assert.equal(m.lastLine("\n \n"), "");
  assert.equal(m.lastLine("a\tb"), "a    b");
});
test("a 60-character title and Unicode text truncate by cells without losing originals", () => {
  const title = "x".repeat(60);
  const rows = m.collectRows([{ ...f.agents[0], title }], f.terminals, f.spaces);
  assert.equal(rows.find(a => a.address === "t1").title, title);
  for (const cells of [1, 8, 26, 36, 60]) {
    assert.ok(m.cellWidth(m.truncate(title, cells)) <= cells);
    assert.ok(m.cellWidth(m.truncate("缓存检查é e\u0301 ✨ ready", cells)) <= cells);
  }
  assert.equal(m.truncate(title, 26), "x".repeat(25) + "…");
});
test("grid columns and spacing land on four pixels at both acceptance sizes", () => {
  for (const width of [1000, 1600]) {
    const g = m.gridSpec(width);
    assert.equal(g.width, width);
    assert.ok([...g.columns.map(c => c * m.CELL), g.padding, g.gap, m.ROW].every(n => n % 4 === 0));
    assert.equal(g.columns[0], 14);
  }
  assert.equal(m.FONT * 0.6, 8);
});
test("only visible rows are readable and scrolling the roster never scrolls blockers", () => {
  const live = m.collectRows(f.agents, f.terminals, f.spaces);
  const many = [...live, ...Array.from({ length: 30 }, (_, i) => ({ ...live[0], address: `t${100 + i}` }))];
  const first = m.panelSlices(many, 432);
  const next = m.panelSlices(many, 432, { blocked: 0, rest: 7 });
  assert.deepEqual(first.blocked.rows, next.blocked.rows);
  assert.equal(m.readableRows(first).length, 11);
  assert.equal(first.blocked.capacity + first.rest.capacity, 11);
  assert.notDeepEqual(first.rest.rows, next.rest.rows);
  assert.equal(next.rest.offset, 7);
  assert.equal(m.viewport(many, 500, 4).rows.length, 4);
  assert.equal(m.viewport([], 50, 4).offset, 0);
});
test("missing is unavailable until a finished record confirms it; history is bounded and contains no output", () => {
  const a = f.agents[0];
  const memory = m.remember([], [a], f.now);
  assert.equal(m.missingRows(memory, [], [])[0].status, "unavailable");
  const confirmed = m.confirmExits(memory, { terminals: [{ address: a.address, state: "finished", exit_code: 1 }] }, new Set());
  assert.equal(m.missingRows(confirmed, [], [])[0].status, "dead");
  assert.equal(m.missingRows(confirmed, [], [a]).length, 0);
  assert.equal(m.confirmExits(memory, { terminals: [{ address: a.address, state: "finished" }] }, new Set([a.address]))[0].exit, null);
  assert.throws(() => m.confirmExits(memory, {}, new Set()), /Unexpected/);
  const many = m.remember([], Array.from({ length: 200 }, (_, i) => ({ ...a, address: `t${i}`, output: "never store", report: { msg: "never store" } })), f.now);
  assert.equal(many.length, 128);
  assert.ok(!JSON.stringify(many).includes("never store"));
});
test("empty model and a hidden ancestor are safe", () => {
  assert.deepEqual(m.collectRows(), []);
  assert.equal(m.readableRows(m.panelSlices([], 432)).length, 0);
  assert.equal(m.nodeVisible({ id: "root", hidden: true, children: [{ id: "panel" }] }, "panel"), false);
  assert.equal(m.nodeVisible({ id: "root", children: [{ id: "panel" }] }, "panel"), true);
});
test("generated frame module equals the JSON, is one-cell, under 3 Hz, and has still states", async () => {
  assert.deepEqual(frames, JSON.parse(await readFile(new URL("../mods/control-panel/frames.json", import.meta.url), "utf8")));
  for (const name of Object.keys(m.STATUS)) {
    assert.equal(m.cellWidth(frames[name].still), 1);
    assert.ok(frames[name].frames.every(s => m.cellWidth(s) === 1));
    if (frames[name].ms) assert.ok(1000 / frames[name].ms < 3);
  }
  assert.deepEqual(frames.done.frames, ["✓"]);
});
