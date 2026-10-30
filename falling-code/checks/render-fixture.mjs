// A static behavior fixture, not a GPUI renderer or herdr-app check substitute.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as model from "../mods/falling-code/model.js";

class Element {
  constructor() { this.values = {}; this.contents = []; }
}
const element = () => new Proxy(new Element(), {
  get(target, key, proxy) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === "child") target.contents.push(args[0]);
      else if (key === "children") target.contents.push(...args[0]);
      else if (key === "when") { if (args[0]) args[1](proxy); }
      else target.values[key] = args;
      return proxy;
    };
  },
});
const source = await readFile(new URL("../mods/falling-code/main.js", import.meta.url), "utf8");
assert(!source.includes("HC_SESSION"));
const compiled = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)";/g, (_, names, module) =>
  `const {${names}} = ${module === "herdr" ? "api" : module.startsWith(".") ? "model" : "ui"};`)
  .replace("export default class FallingCode", "return class FallingCode");
const calls = [], tasks = [], timers = [], store = new Map(), sharedStore = new Map();
let role = "rain", active = true, queryFails = false;
const spaces = [
  { id: "api", name: "api", machine: null, branch: "main", active: true,
    tabs: [{ id: "api-main", name: "auth", active: true, settled: false }] },
  { id: "web", name: "web", machine: null, branch: "ui", active: false,
    tabs: [{ id: "web-main", name: "settled tab", active: false, settled: true }] },
  { id: "remote/ops", name: "ops", machine: "remote", branch: "main", active: false,
    tabs: [{ id: "remote/ops-main", name: "deploy", active: false, settled: false }] },
];
let list = Array.from({ length: 9 }, (_, i) => {
  const sector = spaces[i % spaces.length];
  return { address: i === 5 ? "remote/t6" : `t${i + 1}`, pane: `p${i + 1}`,
    space: sector.id, space_name: sector.name, tab: sector.tabs[0].id,
    tab_name: sector.tabs[0].name, title: i === 3 ? "a very long permission decision that must keep its full identity in the tooltip" : `task ${i + 1}`,
    status: ["working", "done", "idle", "blocked", "working", "blocked", "idle", "working", "working"][i],
    program: { name: "Agent", icon: "icons/agent.svg", tint: true }, focused: i === 0 };
});
const raw = () => [
  ...list.map(a => ({ address: a.address, state: "live", status: a.status,
    report: { kind: a.status === "blocked" ? "question" : "", msg: "Choose a path\nnot displayed" } })),
  { address: "t99", state: "live", parent: "t4", status: "error", title: "child needs permission", report: { kind: "permission" } },
  { address: "t100", state: "live", status: null, program: { shell: true } },
];
const colors = JSON.parse(await readFile(new URL("../themes/falling-code.json", import.meta.url))).colors;
const api = {
  props: () => ({ role, pane: "p1" }), agents: () => list, terminals: raw,
  spaces: () => spaces, theme: () => colors, window: () => ({ active }),
  machines: () => [{ name: null, layout: "ready" }, { name: "remote", layout: "ready" }],
  panes: () => list.map(a => ({ ...a, pane: a.pane, terminal: a.address })),
  shared: key => sharedStore.get(key), setShared: (key, value) => sharedStore.set(key, value),
  setAgentOrder: order => calls.push(["order", order]), run: (...args) => calls.push(args),
  hc: async args => {
    calls.push(["hc", args]);
    if (queryFails) throw new Error("offline");
    return { code: 0, stdout: JSON.stringify({ terminals: [{ address: "t88", state: "finished" }] }) };
  },
};
const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
const cx = { timer: { every: (ms, fn) => timers.push([ms, fn]) },
  spawn: fn => tasks.push(fn(cx)), notify() {}, stop_propagation() {} };
const liveApi = new Proxy(api, { get: (target, key) => (...args) => target[key](...args) });
const Mod = new Function("api", "ui", "model", "localStorage", compiled)(liveApi,
  { View: class {}, div: element, svg: element, image: element, h_flex: element, v_flex: element }, model, localStorage);
const view = new Mod();
view.init({}, cx);
const nodes = root => [root, ...root.contents.filter(c => c instanceof Element).flatMap(nodes)];
const byId = (root, id) => nodes(root).find(n => n.values.id?.[0] === id);
const labelText = root => nodes(root).flatMap(n => n.contents.filter(c => typeof c === "string")).join("\n");
const countMotion = root => nodes(root).filter(n => n.values.frames || n.values.loop || n.values.transition).length;

let tree = view.render(cx);
assert.equal(nodes(tree).filter(n => n.values.id?.[0]?.startsWith("column-")).length, 10);
assert(!byId(tree, "column-t100"));
assert(byId(tree, "falling-code-attention"));
for (const address of ["t4", "remote/t6", "t99"]) {
  const row = byId(tree, `attention-${address}`);
  assert(row && labelText(row).includes(address));
  assert(row.values.tooltip[0].includes(address));
  row.values.on_click[0]();
}
assert(calls.some(c => c[0] === "agent.focus" && c[1].terminal === "t4"));
assert(calls.some(c => c[0] === "agent.focus" && c[1].terminal === "remote/t6"));
assert(calls.some(c => c[0] === "terminal.peek" && c[1].terminal === "t99"));
assert(nodes(tree).filter(n => n.values.frames).every(n => n.values.frames[1] === 200));
assert(countMotion(tree) > 0);
for (const [width, height] of [[1000, 250], [1512, 331], [1600, 349]]) {
  byId(tree, "falling-code-rain-root").values.on_size_change[0]({ width, height }, cx);
  tree = view.render(cx);
  assert(byId(tree, "falling-code-attention"));
  assert(byId(tree, "rain-content").values.items_stretch);
  assert(byId(tree, "rain-field-column").values.h_full);
  const bands = nodes(byId(tree, "rain-bands")).filter(n => n.values.id?.[0]?.startsWith("band-"));
  assert(bands.length > 0 && bands.every(n => n.values.h[0] > 0));
  assert(bands.every(band => band.contents.reduce((sum, group) => sum + group.values.w[0], 0) <= width - 316 - 24));
  const columns = nodes(tree).filter(n => n.values.id?.[0]?.startsWith("column-"));
  assert.equal(columns.length, 10);
  assert(columns.every(n => n.values.h[0] > 0));
  for (const column of columns) {
    assert.equal(column.values.w[0], 48);
    const body = nodes(column).find(n => n.values.id?.[0]?.startsWith("body-"));
    assert.equal(body.values.h[0], Math.max(54, column.values.h[0] - 68));
  }
  assert(nodes(tree).every(n => !n.values.text_size || n.values.text_size[0] >= 10));
}
console.log("PASS: populated rain keeps full-height cross-axis sizing and positive band/column heights at target sizes; readable labels are at least 10px");
byId(tree, "toggle-still").values.on_click[0]();
assert.equal(countMotion(view.render(cx)), 0);
sharedStore.set("falling-code.still", false);
active = false;
assert.equal(countMotion(view.render(cx)), 0);
active = true;
assert(timers.every(([ms]) => ms >= 10000));
assert.equal(tasks.length, 0); // No core polling while all remembered agents are live.

view.history.push({ ...model.collectAgents(list, raw(), spaces)[0], address: "t88" });
view.render(cx);
await Promise.all(tasks.splice(0));
tree = view.render(cx);
assert(labelText(byId(tree, "column-t88")).includes("EXIT"));
assert(calls.some(c => c[0] === "hc" && JSON.stringify(c[1]) === '["ls","--all","--json"]'));
queryFails = true;
view.checkedAt = 0;
view.confirmExits(cx);
await Promise.all(tasks.splice(0));
assert(labelText(byId(view.render(cx), "column-t88")).includes("N/A"));

role = "alert";
assert(labelText(view.render(cx)).includes("3 NEEDS YOU"));
role = "header";
assert(labelText(view.render(cx)).includes("WORKING"));
console.log("PASS: three roles, 10 live columns, settled/remote/child attention, actions, 200ms frames, still/inactive mode, inherited-session exit query and offline fallback");

const longTitle = "x".repeat(60);
const longAgent = { ...list[0], title: longTitle, status: "blocked" };
for (const scene of [
  { name: "fresh install", spaces: [], agents: [], window: null },
  { name: "60-character title", spaces: [spaces[0]], agents: [longAgent], window: { active: true } },
  { name: "report-only title", spaces: [spaces[0]], agents: [{ ...longAgent, title: "" }], window: { active: true },
    terminals: [{ address: longAgent.address, state: "live", report: { title: longTitle } }] },
]) {
  api.spaces = () => scene.spaces;
  api.agents = () => scene.agents;
  api.terminals = () => scene.terminals ?? scene.agents.map(a => ({ ...a, state: "live" }));
  api.panes = () => scene.agents.map(a => ({ ...a, terminal: a.address }));
  api.window = () => scene.window;
  api.focused = () => null;
  for (const nextRole of ["rain", "alert", "header"]) {
    role = nextRole;
    store.clear();
    sharedStore.clear();
    const fresh = new Mod();
    fresh.init({}, cx);
    const root = fresh.render(cx);
    assert(root instanceof Element, `${scene.name}: ${role}`);
    if (scene.name === "fresh install") {
      assert.equal(countMotion(root), 0);
      if (role === "rain") assert(labelText(root).includes("No reporting agents."));
      if (role === "alert") assert(labelText(root).includes("No active tab"));
      if (role === "header") assert.equal(labelText(root), "");
    } else if (role === "rain") {
      assert(byId(root, "attention-t1").values.tooltip[0].includes(longTitle));
      assert(byId(root, "column-t1").values.tooltip[0].includes(longTitle));
    } else if (role === "alert") {
      assert(root.values.tooltip[0].includes(longTitle));
    } else {
      assert(root.values.tooltip[0].includes(longTitle));
    }
  }
}
console.log("PASS: rain/alert/header with zero spaces, no focused tab, zero agents, null window; all roles retain a 60-character terminal or report-only title");
