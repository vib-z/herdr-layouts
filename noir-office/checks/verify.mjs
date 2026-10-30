// Offline behaviour checks. No app, core, network, child process or user home access.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dataURL = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const root = new URL("../", import.meta.url);
const modelURL = dataURL(await readFile(new URL("mods/noir/model.js", root), "utf8"));
const m = await import(modelURL);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const now = 100000000;
const agent = (address, status, space = "api", tab = "auth") => ({ address, status,
  pane: `pane-${address}`, title: `task ${address}`, space, space_name: space,
  tab, tab_name: tab, tab_index: 1, focused: false });
const listed = [agent("t1", "working"), agent("t2", "done"), agent("t3", "idle"),
  agent("t4", "blocked", "web", "settled"), agent("t5", "blocked"),
  agent("remote/t1", "blocked", "ops", "remote/case")];
const raw = listed.map(a => ({ address: a.address, state: "live", created_ms: 42,
  status: a.status, report: { msg: a.status === "blocked" ? "review required" : "" } }));
raw.push({ address: "remote/t3", parent: "t2", state: "live", status: "done", created_ms: 44 });
raw.push({ address: "remote/t2", parent: "t1", state: "live", status: "error", created_ms: 43 });
raw.push({ address: "unrelated", parent: "outside", state: "live", status: "blocked" });
const all = m.collectAgents(listed, raw);
check("pane states, nested children and machine-qualified parent resolution", () => {
  assert.equal(all.length, 8);
  assert.equal(all.find(a => a.address === "t2").status, "done");
  assert.equal(all.find(a => a.address === "remote/t2").status, "blocked");
  assert.equal(all.find(a => a.address === "remote/t3").status, "idle");
  assert.equal(all.find(a => a.address === "remote/t3").space_name, "ops");
  assert.equal(all.filter(a => a.status === "blocked").length, 4);
  assert(!all.some(a => a.address === "unrelated"));
  assert.equal(m.statusOf(null), null);
});
check("agent title falls through native title, joined report, program and full address", () => {
  const a = { ...agent("remote/t-title", "working"), title: "native task", program: { name: "Agent program" } };
  const t = { address: a.address, report: { title: "reported task" }, program: { name: "Raw program" } };
  assert.equal(m.collectAgents([a], [t])[0].title, "native task");
  assert.equal(m.collectAgents([{ ...a, title: "" }], [t])[0].title, "reported task");
  assert.equal(m.collectAgents([{ ...a, title: "" }], [{ ...t, report: {} }])[0].title, "Agent program");
  assert.equal(m.collectAgents([{ ...a, title: "", program: null }], [{ ...t, report: {}, program: null }])[0].title, "remote/t-title");
});
let memory = m.remember([], all, now);
const live = new Set(all.filter(a => a.address !== "t1").map(a => a.address));
const exit = { address: "t1", created_ms: 42, state: "finished", reason: "exited", exit_code: 1 };
check("disappearance alone and failed query never mean dead", () => {
  assert.equal(m.confirmHistory(memory, live, null).find(a => a.address === "t1").state, "unavailable");
  assert.equal(m.confirmHistory(memory, live, []).find(a => a.address === "t1").state, "unavailable");
});
check("confirmed exit matches address and incarnation; live record wins", () => {
  const dead = m.confirmHistory(memory, live, [exit]).find(a => a.address === "t1");
  assert.equal(dead.state, "dead"); assert.equal(dead.exit_code, 1);
  assert.equal(m.confirmHistory(memory, live, [{ ...exit, created_ms: 99 }]).find(a => a.address === "t1").state, "unavailable");
  assert.equal(m.confirmHistory(memory, new Set(["t1"]), [exit]).find(a => a.address === "t1").state, "live");
});
check("CLI exit listing without created_ms confirms the remembered address", () => {
  const { created_ms, ...cliExit } = exit;
  const rows = m.historyRows(JSON.stringify({ terminals: [cliExit] }));
  const dead = m.confirmHistory(memory, live, rows).find(a => a.address === "t1");
  assert.equal(dead.state, "dead"); assert.equal(dead.reason, "exited"); assert.equal(dead.exit_code, 1);
  assert.equal(m.confirmHistory(memory, live, [{ ...cliExit, address: "different/t1" }]).find(a => a.address === "t1").state, "unavailable");
});
check("remote history never confirms a local address or duplicates its prefix", () => {
  const remote = m.confirmHistory(memory, new Set(), [{ ...exit, address: "remote/t1" }]);
  assert.equal(remote.find(a => a.address === "remote/t1").state, "dead");
  assert.equal(remote.find(a => a.address === "t1").state, "unavailable");
  assert.equal(m.confirmHistory(memory, new Set(), [exit]).find(a => a.address === "remote/t1").state, "unavailable");
  assert.equal(m.fullAddress("remote/t1", "remote"), "remote/t1");
});
check("history bounds, expiry, malformed persistence and restart revalidation", () => {
  assert.equal(m.remember([], Array.from({ length: 60 }, (_, i) => ({ ...all[0], address: `t${i}` })), now).length, 48);
  assert.equal(m.remember(memory, [], now + m.HISTORY_AGE + 1).length, 0);
  assert.deepEqual(m.loadHistory("broken", now), []);
  assert.deepEqual(m.loadHistory("{}", now), []);
  assert.equal(m.loadHistory(JSON.stringify(memory), now)[0].state, "unavailable");
  assert.throws(() => m.historyRows('{"wrong": []}'));
  assert.equal(m.historyRows(JSON.stringify({ terminals: [exit] }))[0].state, "finished");
});

// Minimal element recorder, not a renderer. It tests callbacks and visibility logic.
class Element {
  constructor(kind) { this.kind = kind; this.nodes = []; this.attr = {}; }
  child(v) { if (v != null) this.nodes.push(v); return this; }
  children(v) { v.forEach(x => this.child(x)); return this; }
  when(on, fn) { if (on) fn(this); return this; }
}
const methods = ["id", "size_full", "w_full", "flex_1", "flex_none", "min_h", "min_w", "max_h",
  "h", "w", "size", "px", "py", "p", "pt", "pb", "gap", "items_center", "justify_between",
  "bg", "border", "border_color", "text_color", "font_bold", "font_semibold", "text_size",
  "truncate", "relative", "absolute", "top", "left", "line_height", "overflow_hidden", "overflow_y_scrollbar",
  "overflow_x_scrollbar", "on_click", "on_size_change", "hover", "loop", "frames", "spin"];
for (const name of methods) Element.prototype[name] = function (...args) { this.attr[name] = args; return this; };
const state = { props: { role: "hallway" }, active: true, listed, raw, values: new Map(),
  actions: [], pending: [], execs: [], timers: [], order: [], result: { code: 0,
    stdout: JSON.stringify({ terminals: [{ address: "t1", state: "finished", reason: "exited", exit_code: 1 }] }) } };
const palette = JSON.parse(await readFile(new URL("themes/noir.json", root), "utf8"));
const spaceList = ["api", "web", "ops"].map(name => ({ id: name, name, active: name === "api",
  machine: name === "ops" ? "remote" : null, tabs: [{ id: name === "web" ? "settled" : "auth", name: "a very long case name ".repeat(5),
    index: 1, active: true, settled: name === "web", status: "idle" }] }));
const paneList = [...listed.map(a => ({ pane: a.pane, terminal: a.address, title: a.title, status: a.status })),
  { pane: "shell", terminal: "t-shell", title: "shell", status: null }];
state.spaces = spaceList;
state.panes = paneList;
const cx = { notify() {}, stop_propagation() {},
  spawn(fn) { const p = fn(cx); state.pending.push(p); },
  timer: { every(ms, fn) { state.timers.push({ ms, fn }); } } };
globalThis.localStorage = { getItem: k => state.values.get(k) ?? null, setItem: (k, v) => state.values.set(k, v) };
globalThis.__noirCheck = {
  View: class {}, div: () => new Element("div"), svg: path => new Element(path), image: path => new Element(path),
  h_flex: () => new Element("h_flex"), v_flex: () => new Element("v_flex"),
  agents: () => state.listed, terminals: () => state.raw, spaces: () => state.spaces, panes: () => state.panes,
  props: () => state.props, run: (name, args) => state.actions.push({ name, args }),
  theme: () => ({ ...palette, ...palette.colors }), shared: k => state.values.get(k),
  setShared: (k, v) => state.values.set(k, v), setAgentOrder: a => { state.order = a; },
  window: () => ({ active: state.active }), exec: async (...args) => { state.execs.push(args); return state.result; }
};
let source = await readFile(new URL("mods/noir/main.js", root), "utf8");
source = source.replace(/import\s+\{([^}]+)\}\s+from\s+"(?:gpui-kit|gpui-base|herdr)";/g,
  (_, names) => `const {${names}} = globalThis.__noirCheck;`)
  .replace('"./model.js"', JSON.stringify(modelURL));
const { default: Noir } = await import(dataURL(source));
const walk = el => el instanceof Element ? [el, ...el.nodes.flatMap(walk)] : [];
const words = el => el instanceof Element ? el.nodes.map(words).join(" ") : String(el);
const click = el => el.attr.on_click[0]({}, cx);
const byId = (tree, id) => walk(tree).find(el => el.attr.id?.[0] === id);
const motion = tree => walk(tree).filter(el => el.attr.loop || el.attr.frames || el.attr.spin);
const noir = new Noir(); noir.init(state.props, cx);
let hall = noir.render();
check("all blockers have caller rows, including remote and settled children", () => {
  assert.equal(walk(hall).filter(el => el.attr.id?.[0].startsWith("caller-")).length, 4);
  assert(words(hall).includes("web / settled")); assert(words(hall).includes("remote/t2 / child, peek"));
  assert.equal(state.order.slice(0, 4).length, 4);
  assert.deepEqual(state.execs, []);
  assert.equal(state.timers.length, 1); assert.equal(state.timers[0].ms, 8000);
});
check("pane callers focus, child callers peek, doors select spaces", () => {
  click(byId(hall, "caller-t4")); click(byId(hall, "caller-remote/t2")); click(byId(hall, "door-ops"));
  assert.deepEqual(state.actions.slice(-3), [
    { name: "agent.focus", args: { terminal: "t4" } },
    { name: "terminal.peek", args: { terminal: "remote/t2" } },
    { name: "space.select", args: { id: "ops" } }
  ]);
});
check("headers distinguish unseen completion, idle and unreported shells", () => {
  state.props = { role: "header", pane: "pane-t2" };
  let tree = noir.render(); assert(words(tree).includes("CASE CLOSED.")); assert.equal(motion(tree).length, 1);
  state.listed = listed.map(a => a.address === "t2" ? { ...a, status: "idle" } : a);
  tree = noir.render(); assert(words(tree).includes("OUT TO LUNCH")); assert.equal(motion(tree).length, 0);
  state.props = { role: "header", pane: "shell" };
  tree = noir.render(); assert(words(tree).includes("UNREPORTED TERMINAL"));
  click(byId(tree, "glass-shell")); assert.deepEqual(state.actions.at(-1), { name: "pane.focus", args: { pane: "shell" } });
  state.listed = listed;
});
check("still and inactive windows suppress every native animation", () => {
  state.props = { role: "hallway" }; click(byId(hall, "noir-still-toggle"));
  for (const pane of ["pane-t1", "pane-t2", "pane-t4"]) {
    state.props = { role: "header", pane }; assert.equal(motion(noir.render()).length, 0);
  }
  state.values.set("noir.still", false); state.active = false;
  for (const pane of ["pane-t1", "pane-t2", "pane-t4"]) {
    state.props = { role: "header", pane }; assert.equal(motion(noir.render()).length, 0);
  }
  state.active = true;
});
state.props = { role: "hallway" }; state.raw = raw.filter(t => t.address !== "t1"); state.listed = listed.filter(t => t.address !== "t1");
noir.checkHistory(cx); await Promise.all(state.pending);
check("exit query inherits the app environment, is read-only and yields a VACANT card", () => {
  assert.deepEqual(state.execs[0], ["hc", ["ls", "--all", "--json"]]);
  assert(!source.includes("HC_SESSION="));
  state.props = { role: "hallway" }; hall = noir.render();
  assert(words(byId(hall, "vacant-t1")).includes("VACANT"));
});
state.result = { code: 1, stdout: "" }; noir.checkHistory(cx); await Promise.all(state.pending);
check("failed recheck visibly replaces stale VACANT evidence with unavailable", () => {
  assert(words(byId(noir.render(), "vacant-t1")).includes("unavailable"));
});
check("every role initializes and renders a fresh install with no space, tab, pane or agent", () => {
  state.listed = []; state.raw = []; state.spaces = []; state.panes = [];
  state.values.clear(); state.execs = [];
  for (const role of ["hallway", "folders", "header", undefined]) {
    state.props = role ? { role } : {};
    const empty = new Noir(); empty.init(state.props, cx);
    const tree = empty.render();
    assert(tree instanceof Element); assert.equal(motion(tree).length, 0);
    if (role === "hallway" || !role) {
      assert(words(tree).includes("No clients waiting."));
      assert(words(tree).includes("The office is quiet."));
    } else if (role === "folders") assert(words(tree).includes("NO SPACE"));
    else assert.equal(tree.nodes.length, 0);
  }
  assert.deepEqual(state.execs, []);
});
check("every role accepts one 60-character title with bounded text and intact focus target", () => {
  const title = "inspect the login regression and prepare the smallest repair".padEnd(60, ".");
  assert.equal(title.length, 60);
  const a = { ...agent("t60", "blocked"), title };
  state.listed = [a];
  state.raw = [{ address: a.address, state: "live", status: "blocked", created_ms: 60, report: { msg: title } }];
  state.spaces = [{ id: "api", name: title, active: true, machine: null,
    tabs: [{ id: "auth", index: 1, name: title, active: true, status: "blocked", settled: false }] }];
  state.panes = [{ pane: a.pane, terminal: a.address, title, status: "blocked" }];
  for (const role of ["hallway", "folders", "header"]) {
    state.props = { role, pane: a.pane };
    const view = new Noir(); view.init(state.props, cx);
    const tree = view.render();
    assert(words(tree).includes(title));
    assert(walk(tree).some(el => el.attr.truncate && words(el).includes(title)));
    if (role === "hallway") click(byId(tree, "caller-t60"));
    if (role === "folders") click(byId(tree, "folder-auth"));
    if (role === "header") click(byId(tree, "glass-pane-t60"));
  }
  assert.deepEqual(state.actions.slice(-3), [
    { name: "agent.focus", args: { terminal: "t60" } },
    { name: "tab.select", args: { id: "auth" } },
    { name: "agent.focus", args: { terminal: "t60" } }
  ]);
});
check("three callers, three doors and a vacancy fit the captured hallway height budget", () => {
  state.values.clear();
  state.listed = [agent("t1", "blocked"), agent("t2", "blocked", "web"), agent("remote/t3", "blocked", "ops")];
  state.raw = state.listed.map(a => ({ address: a.address, status: a.status, state: "live", created_ms: 42 }));
  state.spaces = spaceList.map(s => ({ ...s, machine: s.id === "ops" ? "remote" : null }));
  state.props = { role: "hallway" };
  const view = new Noir(); view.init(state.props, cx);
  view.history.push({ address: "t-old", title: "previous case", space_name: "api", tab_name: "archive",
    lastSeen: Date.now(), state: "dead", reason: "exited", exit_code: 0 });
  const tree = view.render();
  const callers = walk(byId(tree, "noir-callers")).filter(el => el.attr.id?.[0].startsWith("caller-"));
  const doors = state.spaces.map(s => byId(tree, `door-${s.id}`));
  const vacancy = byId(tree, "vacant-t-old");
  assert.equal(callers.length, 3); assert(words(vacancy).includes("VACANT"));
  const callersHeight = callers.reduce((sum, el) => sum + el.attr.h[0], 0) + 2 * 5;
  assert(callersHeight <= byId(tree, "noir-callers").attr.max_h[0]);
  const attention = 16 + 20 + 6 + callersHeight;
  const hallwayContents = 16 + 16 + doors.reduce((sum, el) => sum + el.attr.h[0], 0) + 20 + vacancy.attr.h[0] + 5 * 8;
  const total = byId(tree, "noir-masthead").attr.h[0] + attention + hallwayContents + 36 + 3 + 2;
  assert(total <= 854, `height budget ${total} exceeds the capture's 854px content area`);
  for (const el of walk(tree)) if (el.attr.text_size) assert(el.attr.text_size[0] >= 10);
});
check("report-only titles reach headers without inventing elapsed-time UI", () => {
  state.listed = [{ ...agent("t-title", "working"), title: "", program: { name: "Agent program" } }];
  state.raw = [{ address: "t-title", state: "live", status: "working", report: { title: "task from report only" } }];
  state.panes = [{ pane: "pane-title", terminal: "t-title", title: "stale pane title", status: "working" }];
  state.props = { role: "header", pane: "pane-title" };
  const view = new Noir(); view.init(state.props, cx);
  const tree = view.render();
  assert(words(tree).includes("task from report only"));
  assert(!words(tree).includes("Agent program"));
  assert(!words(tree).includes("stale pane title"));
  assert(!words(tree).includes("?"));
  assert(!source.includes("status_ms"));
});
delete globalThis.__noirCheck;
delete globalThis.localStorage;
console.log(`${checks} offline checks passed. Native GPUI rendering and focus retention are not tested here.`);
