import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as f from "./fixtures.mjs";

const layout = JSON.parse(await readFile(new URL("../layouts/control-panel.json", import.meta.url), "utf8"));
const themeData = JSON.parse(await readFile(new URL("../themes/control-panel.json", import.meta.url), "utf8"));
const guideRoot = process.env.HERDR_API_DEFAULTS;
const kitPath = process.env.HERDR_GPUI_TYPES;
const [kit, herdr, guide] = await Promise.all([
  kitPath ? readFile(kitPath, "utf8") : null,
  guideRoot ? readFile(join(guideRoot, "herdr.d.ts"), "utf8") : null,
  guideRoot ? readFile(join(guideRoot, "AGENTS.md"), "utf8") : null
]);
const methods = kit ? new Set([...kit.matchAll(/^\s+([a-z_][a-z_0-9]*)(?:<[^\n]+>)?\(/gm)].map(match => match[1])) : null;

async function harness(role = "overview", populated = true, storage = new Map(), now = f.now) {
  const state = {
    agents: populated ? structuredClone(f.agents) : [], terminals: populated ? structuredClone(f.terminals) : [],
    spaces: populated ? structuredClone(f.spaces) : [], panes: [], props: { role }, active: true,
    now, shared: new Map(), layout: structuredClone(layout), calls: [], tasks: [], timers: [], storage,
    order: [], hc: async args => ({ code: 0, stdout: args[0] === "read" ? `\x1b[32m${f.lines[args[1]] ?? "ready"}\x1b[0m\n\n` : '{"terminals":[]}', stderr: "" })
  };
  function element(kind = "div") {
    const node = { kind, items: [], attrs: {}, events: {} };
    const proxy = new Proxy(node, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === "then") return undefined;
        if (methods) assert.ok(methods.has(key), `Builder ${String(key)} is not in the supplied gpui-kit declarations`);
        return (...args) => {
          if (key === "child") node.items.push(args[0]);
          else if (key === "children") node.items.push(...args[0]);
          else if (key === "when") { if (args[0]) args[1](proxy); }
          else if (key === "hover") args[0](element("hover-style"));
          else if (key.startsWith("on_")) node.events[key] = args.at(-1);
          else node.attrs[key] = args.length === 1 ? args[0] : args;
          return proxy;
        };
      }
    });
    return proxy;
  }
  const api = {
    agents: () => state.agents, terminals: () => state.terminals, spaces: () => state.spaces, panes: () => state.panes,
    props: () => state.props, run: (...args) => { state.calls.push({ kind: "run", args }); },
    theme: () => ({ ...themeData, ...themeData.colors }), window: () => ({ active: state.active, platform: "macos", buttons: false }),
    shared: key => state.shared.get(key), setShared: (key, value) => state.shared.set(key, value),
    setAgentOrder: value => { state.order = value; }, layout: () => state.layout,
    hc: async args => { state.calls.push({ kind: "hc", args: [...args] }); return state.hc([...args]); },
    openOverlay: args => state.calls.push({ kind: "overlay", args }), closeOverlay: args => state.calls.push({ kind: "close", args })
  };
  if (herdr) for (const name of Object.keys(api)) assert.ok(herdr.includes(`export function ${name}(`), `Unconfirmed herdr API ${name}`);
  const context = vm.createContext({
    Date: class extends Date { static now() { return state.now; } },
    localStorage: { getItem: key => state.storage.get(key), setItem: (key, value) => state.storage.set(key, value) }
  });
  const sources = {
    "herdr": api, "gpui-kit": { View: class {}, div: () => element() },
    "gpui-base": { h_flex: () => element("h_flex"), v_flex: () => element("v_flex") }
  };
  const loaded = new Map();
  async function load(url) {
    if (loaded.has(url)) return loaded.get(url);
    const module = sources[url]
      ? new vm.SyntheticModule(Object.keys(sources[url]), function () { for (const [key, value] of Object.entries(sources[url])) this.setExport(key, value); }, { context, identifier: url })
      : new vm.SourceTextModule(await readFile(fileURLToPath(url), "utf8"), { context, identifier: url });
    loaded.set(url, module);
    return module;
  }
  const main = await load(new URL("../mods/control-panel/main.js", import.meta.url).href);
  await main.link((specifier, parent) => load(sources[specifier] ? specifier : new URL(specifier, parent.identifier).href));
  await main.evaluate();
  const cx = {
    notify() {}, stop_propagation() {}, timer: { every: (ms, callback) => state.timers.push({ ms, callback }) },
    spawn: callback => { state.tasks.push(callback(cx)); }
  };
  const view = new main.namespace.default();
  view.init({}, cx);
  const flush = async () => { while (state.tasks.length) await Promise.all(state.tasks.splice(0)); };
  return { state, view, cx, flush };
}
function walk(node) {
  if (!node || typeof node === "string") return [];
  return [node, ...node.items.flatMap(walk)];
}
const content = node => typeof node === "string" ? node : (node?.items ?? []).map(content).join(" ");
const find = (tree, id) => walk(tree).find(node => node.attrs.id === id);

test("optional Herdr API declaration checks", { skip: !herdr && "Set HERDR_API_DEFAULTS to check the API declarations" }, async () => {
  assert.ok(guide.includes("localStorage"));
  await harness();
});
test("optional GPUI builder declaration checks", { skip: !kit && "Set HERDR_GPUI_TYPES to check the UI declarations" }, async () => {
  for (const role of ["overview", "topbar", "livebar", "pane", "tabs"]) {
    const { view } = await harness(role);
    view.render();
  }
});

test("every role renders safely with no space, no tab, no focused pane or agents", async () => {
  for (const role of ["overview", "topbar", "livebar", "pane", "tabs"]) {
    const { view, state } = await harness(role, false);
    const tree = view.render();
    assert.ok(tree);
    assert.equal(state.calls.length, 0);
    if (role === "overview") assert.match(content(tree), /No agents reporting a state/);
    if (role === "livebar") assert.match(content(tree), /No active tab/);
  }
});
test("rendered elapsed uses the persisted observed clock when core timestamps are absent or stale", async () => {
  const { view, state } = await harness();
  state.terminals.forEach(t => { t.status_ms = null; });
  assert.match(content(find(view.render(), "control-panel-row-t1")), /0:00/);
  state.now += 61000;
  assert.match(content(find(view.render(), "control-panel-row-t1")), /1:01/);
  const saved = new Map(state.storage);
  const restarted = await harness("overview", true, saved, state.now + 1000);
  restarted.state.terminals.forEach(t => { t.status_ms = null; });
  assert.match(content(find(restarted.view.render(), "control-panel-row-t1")), /1:02/);
  restarted.state.agents[0].status = "blocked";
  restarted.state.terminals[0].status_ms = f.now - 100000;
  restarted.state.now += 5000;
  assert.match(content(find(restarted.view.render(), "control-panel-row-t1")), /0:00/);
  const record = JSON.parse(restarted.state.storage.get("control-panel.history")).find(a => a.address === "t1");
  assert.equal(record.status, "blocked");
  assert.equal(record.state_started_ms, restarted.state.now);
});
test("each agent appears once; every blocker stays named above roster scrolling", async () => {
  const { view, state, cx } = await harness();
  state.agents.push(...Array.from({ length: 20 }, (_, i) => ({ ...state.agents[0], address: `t${100 + i}` })));
  const tree = view.render();
  const before = content(find(tree, "control-panel-blocked"));
  assert.match(before, /review permission policy/);
  assert.match(before, /remote\/t7/);
  assert.equal(walk(tree).filter(n => n.attrs.id?.startsWith("control-panel-row-")).length, 11);
  find(tree, "rest-next").events.on_click({}, cx);
  const after = view.render();
  assert.equal(content(find(after, "control-panel-blocked")), before);
  assert.ok(!find(after, "control-panel-row-t1"));
});
test("polls exactly visible rows, uses plain hc, waits five seconds, and pauses when inactive or hidden", async () => {
  const { view, state, cx, flush } = await harness();
  state.agents.push(...Array.from({ length: 20 }, (_, i) => ({ ...state.agents[0], address: `t${100 + i}` })));
  const tree = view.render();
  view.refreshLines(cx); await flush();
  assert.equal(state.calls.length, 0, "no reads before measurement");
  tree.events.on_size_change({ width: 1000, height: 432 }, cx);
  view.render();
  const expected = [...view.visibleRows()].map(a => a.address);
  view.refreshLines(cx); await flush();
  const reads = state.calls.filter(c => c.kind === "hc");
  assert.deepEqual(reads.map(c => c.args[1]), expected);
  assert.ok(reads.every(c => c.args[0] === "read" && c.args[2] === "--lines" && c.args[3] === "8"));
  assert.equal(view.cache.get("t2").text, "Approve fixture changes?");
  view.refreshLines(cx); await flush();
  assert.equal(state.calls.length, reads.length);
  state.now += 5000; state.active = false;
  view.refreshLines(cx); await flush();
  assert.equal(state.calls.length, reads.length);
  state.active = true; state.layout.hidden = true;
  view.refreshLines(cx); await flush();
  assert.equal(state.calls.length, reads.length);
  state.layout.hidden = false;
  view.refreshLines(cx); await flush();
  assert.equal(state.calls.length, reads.length * 2);
  assert.ok(![...state.storage.values()].join("").includes("Approve fixture changes?"));
});
test("reads stop between awaits if inactive, and never duplicate an in-flight batch", async () => {
  const { view, state, cx, flush } = await harness();
  view.render(); view.measured = true;
  let resolve;
  state.hc = () => new Promise(done => { resolve = done; });
  view.refreshLines(cx);
  view.refreshLines(cx);
  assert.equal(state.calls.length, 1);
  state.active = false;
  resolve({ code: 0, stdout: "private output", stderr: "" });
  await flush();
  assert.equal(state.calls.length, 1);
  assert.equal(view.cache.size, 0);
});
test("scrolling during a read discards its result and removes offscreen cache", async () => {
  const { view, state, cx, flush } = await harness();
  state.agents = Array.from({ length: 24 }, (_, i) => ({ ...f.agents[0], address: `t${100 + i}`, status: "working" }));
  state.terminals = [];
  view.render(); view.measured = true;
  let resolve;
  state.hc = () => new Promise(done => { resolve = done; });
  view.refreshLines(cx);
  const oldAddress = state.calls[0].args[1];
  view.starts.rest = 12;
  resolve({ code: 0, stdout: "old viewport", stderr: "" });
  await flush();
  assert.ok(!view.cache.has(oldAddress));
  assert.equal(state.calls.length, 1);
});
test("row clicks choose focus versus child peek, never send input, and full titles survive tooltips", async () => {
  const { view, state, cx } = await harness();
  state.agents[0].title = "a".repeat(60);
  const tree = view.render();
  const row = find(tree, "control-panel-row-t1");
  assert.ok(row.attrs.tooltip.includes("a".repeat(60)));
  assert.ok(content(row).includes("a".repeat(25) + "…"));
  row.events.on_click({}, cx);
  find(tree, "control-panel-row-t9").events.on_click({}, cx);
  assert.deepEqual(state.calls.map(c => [c.args[0], c.args[1].terminal]), [["agent.focus", "t1"], ["terminal.peek", "t9"]]);
});
test("motion has native frame cadence, still and inactive modes have no animated elements", async () => {
  const { view, state } = await harness();
  assert.ok(walk(view.render()).some(n => n.attrs.frames));
  state.shared.set("control-panel.still", true);
  assert.ok(walk(view.render()).every(n => !n.attrs.frames));
  state.shared.set("control-panel.still", false); state.active = false;
  assert.ok(walk(view.render()).every(n => !n.attrs.frames));
  assert.deepEqual(state.timers.map(t => t.ms), [1000, 5000, 15000]);
});
test("column labels come first and final-state glyphs cannot widen the 14-cell state column", async () => {
  const { view } = await harness();
  view.history.push(...f.history);
  for (const width of [1000, 1600]) {
    view.size.width = width;
    const tree = view.render();
    assert.ok(content(tree).startsWith("STATE ADDRESS TASK SPACE / TAB ELAPSED LAST LINE"));
    assert.ok(!content(tree).includes("OVERVIEW"));
    for (const address of ["t4", "t12"]) {
      const state = find(tree, `state-cell-${address}`), glyph = find(tree, `glyph-${address}`);
      for (const key of ["w", "min_w", "max_w"]) {
        assert.equal(state.attrs[key], 14 * 8);
        assert.equal(glyph.attrs[key], 8);
      }
      assert.ok("overflow_hidden" in state.attrs && "overflow_hidden" in glyph.attrs);
      assert.ok("flex_none" in state.attrs && "flex_none" in glyph.attrs);
    }
  }
});
test("exit checks only run for missing records and cannot label live terminals dead", async () => {
  const { view, state, cx, flush } = await harness();
  view.render(); view.refreshExits(cx); await flush();
  assert.equal(state.calls.length, 0);
  state.agents = state.agents.filter(a => a.address !== "t1");
  state.terminals = state.terminals.filter(a => a.address !== "t1");
  state.hc = async () => ({ code: 0, stdout: JSON.stringify({ terminals: [{ address: "t1", state: "finished", exit_code: 0 }] }) });
  view.render(); view.refreshExits(cx); await flush();
  assert.deepEqual(state.calls[0].args, ["ls", "--all", "--json"]);
  assert.match(content(find(view.render(), "control-panel-row-t1")), /exited/);
  state.hc = async () => { throw new Error("offline"); };
  state.agents = []; state.terminals = [];
  view.render(); view.refreshExits(cx); await flush();
  assert.equal(view.exitLabel, "exit check unavailable");
  assert.ok(view.rows().some(a => a.status === "unavailable"));
});
test("read failures stay explicit, browsing tabs focuses explicit IDs, and non-overview roles never poll", async () => {
  const { view, state, cx, flush } = await harness();
  view.render(); view.measured = true;
  state.hc = async () => ({ code: 1, stdout: "", stderr: "offline" });
  view.refreshLines(cx); await flush();
  assert.equal(view.cache.get("t2").text, "read unavailable");
  const h = await harness("tabs");
  h.state.props.overlay = "overlay-1";
  find(h.view.render(), "tab-a2").events.on_click({}, h.cx);
  assert.deepEqual(h.state.calls.map(c => c.kind === "run" ? [c.args[0], c.args[1].id] : [c.kind, c.args]),
    [["close", "overlay-1"], ["space.select", "s1"], ["tab.select", "a2"]]);
  assert.equal(h.state.timers.length, 0);
});
