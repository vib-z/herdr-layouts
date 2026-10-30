import test from "node:test";
import assert from "node:assert/strict";
import { collectRows, partitionRows, remember, confirmHistory, nextBlocked, age, HISTORY_LIMIT, ROW_LIMIT } from "../mods/queue/model.js";

const now = 10000000;
const space = [{ id: "api", tabs: [{ id: "api-1", settled: true }] }];
const agent = (address, status, extra = {}) => ({ address, status, title: address, space: "api", space_name: "API", tab: "api-1", tab_name: "cache", ...extra });

test("blocked is permanent across space, Today, search, snooze and settlement", () => {
  const blocked = agent("remote/t1", "blocked", { settled: true });
  const view = partitionRows([blocked, agent("t2", "working")], {
    space: "elsewhere", today: true, query: "no match", snoozed: { "remote/t1": now + 5000 }
  }, now);
  assert.deepEqual(view.ordered, [blocked]);
});

test("urgency is blocked, unseen done, working, idle; Today keeps done", () => {
  const rows = [agent("t1", "idle"), agent("t2", "working"), agent("t3", "done"), agent("t4", "blocked")];
  assert.deepEqual(partitionRows(rows).ordered.map(a => a.status), ["blocked", "done", "working", "idle"]);
  assert.deepEqual(partitionRows(rows, { today: true }).ordered.map(a => a.status), ["blocked", "done"]);
});

test("ranked rows are bounded after urgency sorting; blockers are never capped", () => {
  const many = Array.from({ length: 80 }, (_, i) => agent(`t${i}`, "working"));
  const blockers = Array.from({ length: 70 }, (_, i) => agent(`blocked${i}`, "blocked"));
  const view = partitionRows([...many, agent("done", "done"), ...blockers]);
  assert.equal(view.rest.length, ROW_LIMIT);
  assert.equal(view.rest[0].status, "done");
  assert.equal(view.blockers.length, blockers.length);
  assert.equal(view.ordered.length, ROW_LIMIT + blockers.length);
});

test("collect descendants without panes, normalize error and raw done, join real timestamps", () => {
  const raw = [
    { address: "t3", parent: "t2", status: "done", state: "live" },
    { address: "t2", parent: "t1", status: "error", state: "live", status_ms: 1234 },
    { address: "t1", state: "live", status_ms: 5678 },
    { address: "t4", state: "live", program: { shell: true } }
  ];
  const rows = collectRows([agent("t1", "done")], raw, space);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, "done");
  assert.equal(rows[0].status_ms, 5678);
  assert.equal(rows[1].status, "blocked");
  assert.equal(rows[1].child, true);
  assert.equal(rows[1].settled, true);
  assert.equal(rows[2].status, "idle");
  assert.equal(rows[2].status_ms, null);
});

test("task title falls back from agent to joined report, program, then address", () => {
  const listed = [
    agent("remote/t1", "working", { title: "Terminal title", program: { name: "Agent" } }),
    agent("remote/t2", "working", { title: "", program: { name: "Agent" } }),
    agent("t3", "working", { title: "", program: { name: "Program name" } }),
    agent("t4", "working", { title: "", program: null })
  ];
  const raw = [
    { address: "remote/t2", state: "live", report: { title: "Report-only task" }, status_ms: 1234 },
    { address: "remote/t1", state: "live", report: { title: "Lower-priority title" }, status_ms: 5678 },
    { address: "t5", state: "live", parent: "t4", status: "working", program: { name: "Child program" } },
    { address: "t6", state: "live", parent: "t4", status: "working" }
  ];
  const rows = new Map(collectRows(listed, raw, []).map(row => [row.address, row]));
  assert.equal(rows.get("remote/t1").title, "Terminal title");
  assert.equal(rows.get("remote/t1").status_ms, 5678);
  assert.equal(rows.get("remote/t2").title, "Report-only task");
  assert.equal(rows.get("remote/t2").status_ms, 1234);
  assert.equal(rows.get("t3").title, "Program name");
  assert.equal(rows.get("t4").title, "t4");
  assert.equal(rows.get("t5").title, "Child program");
  assert.equal(rows.get("t6").title, "t6");
});

test("next blocked crosses spaces and excludes working and done", () => {
  const rows = [agent("t1", "working"), agent("t2", "blocked"), agent("remote/t3", "blocked")];
  assert.equal(nextBlocked(rows, "t1").address, "t2");
  assert.equal(nextBlocked(rows, "t2").address, "remote/t3");
  assert.equal(nextBlocked(rows, "remote/t3").address, "t2");
  assert.equal(nextBlocked([], null), null);
});

test("missing is unavailable, only confirmed finished is closed; live wins stale snapshot", () => {
  const history = remember([], [agent("t1", "idle", { created_ms: 123 })], now);
  assert.equal(confirmHistory(history, null, [], now)[0].unavailable, true);
  assert.equal(confirmHistory(history, { terminals: [] }, [], now)[0].closed, false);
  const snapshot = { terminals: [{ address: "t1", state: "finished", exit_code: 1 }] };
  const closed = confirmHistory(history, snapshot, [], now)[0];
  assert.equal(closed.closed, true);
  assert.equal(closed.exit_code, 1);
  assert.equal(confirmHistory(history, snapshot, [agent("t1", "working")], now)[0].closed, false);
  assert.equal(confirmHistory(history, { terminals: [{ ...snapshot.terminals[0], created_ms: 456 }] }, [], now)[0].closed, false);
});

test("history is bounded, expires at seven days, and age never invents a timestamp", () => {
  const many = Array.from({ length: 100 }, (_, i) => agent(`t${i}`, "idle"));
  assert.equal(remember([], many, now).length, HISTORY_LIMIT);
  assert.equal(remember([{ ...agent("old", "idle"), last_seen: now - 8 * 86400000 }], [], now).length, 0);
  for (const missing of [null, undefined, 0, -1, NaN, Infinity]) assert.equal(age(missing, now), "");
  assert.equal(age(now - 125000, now), "2m");
  assert.equal(age(now + 1000, now), "<1m");
});
