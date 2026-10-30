// JavaScript render-path probes only. This is not a GPUI or pixel renderer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as model from "../mods/queue/model.js";

const source = readFileSync(new URL("../mods/queue/main.js", import.meta.url), "utf8")
  .replace(/^import\s[\s\S]*?;\n/gm, "")
  .replace("export default class Queue", "class Queue") + "\nQueue;";
const roles = ["bar", "list", "context", "footer", "reply"];
const longTitle = "Review token cache behaviour with exceptionally long task name".slice(0, 60);
assert.equal(longTitle.length, 60);

class Element {
  constructor(kind) { this.kind = kind; this.nodes = []; this.styles = {}; this.events = {}; }
  child(value) { assert.notEqual(value, undefined, "undefined UI child"); this.nodes.push(value); return this; }
  children(values) { values.forEach(value => this.child(value)); return this; }
  when(condition, build) { return condition ? build(this) : this; }
  hover(build) { build(new Element("hover")); return this; }
}
for (const name of ["size", "size_full", "h", "w", "max_w", "min_w", "min_h", "max_h", "h_full", "w_full", "px", "py", "p", "gap", "items_center", "justify_between", "justify_center", "rounded", "flex_none", "flex_1", "bg", "text_size", "text_color", "font_semibold", "border", "border_b", "border_t", "border_color", "truncate", "id", "overflow_x_scrollbar", "overflow_y_scrollbar", "relative", "absolute", "inset_0", "track_scroll", "track_focus", "spin"]) {
  Element.prototype[name] = function (...args) { this.styles[name] = args; return this; };
}
for (const name of ["on_click", "on_item_click", "on_key_down"]) {
  Element.prototype[name] = function (handler) { this.events[name] = handler; return this; };
}
function texts(element) {
  if (typeof element === "string") return [element];
  if (!(element instanceof Element)) return [];
  return element.nodes.flatMap(texts);
}

function find(element, id) {
  if (!(element instanceof Element)) return null;
  if (element.styles.id?.[0] === id) return element;
  return element.nodes.map(child => find(child, id)).find(Boolean) ?? null;
}

function probe(role, populated, status = "blocked", statusMs = 1000) {
  const calls = [];
  const timers = [];
  const afters = [];
  const store = new Map();
  const state = {};
  const program = { name: "Demo agent", icon: null };
  const agent = { address: "t1", status, title: longTitle, space: "api", space_name: "api", tab: "api-tab", tab_name: "cache", program };
  const list = populated ? [agent] : [];
  const allSpaces = populated ? [{ id: "api", name: "api", active: true, tabs: [{ id: "api-tab", name: "cache", active: true }] }] : [];
  const properties = { role, ...(populated && role === "reply" ? { title: longTitle, address: "t1", context: "api / #cache" } : {}) };
  const cx = {
    focus_handle: () => ({ focus: () => calls.push("focus-list") }),
    notify: () => calls.push("notify"), stop_propagation: () => {},
    spawn: () => {}, // Never execute asynchronous core calls or start a command loop.
    timer: {
      every: (_ms, handler) => timers.push(handler),
      after: (ms, handler) => afters.push({ ms, handler })
    }
  };
  const makeInput = options => ({
    text: options?.value ?? "", handlers: {},
    on(name, handler) { this.handlers[name] = handler; },
    focus() { calls.push("focus-input"); },
    set_value(value) { this.text = value; }, value() { return this.text; }
  });
  const Queue = runInNewContext(source, {
    ...model, View: class {}, div: () => new Element("div"), svg: () => new Element("svg"), image: () => new Element("image"),
    h_flex: () => new Element("row"), v_flex: () => new Element("column"),
    InputState: { new: makeInput }, Input: { new: () => new Element("input") },
    agents: () => list, spaces: () => allSpaces,
    terminals: () => populated ? [{ address: "t1", state: "live", status_ms: statusMs }] : [],
    focused: () => null, appWindow: () => null, props: () => properties,
    shared: key => state[key], setShared: (key, value) => { state[key] = value; },
    theme: () => new Proxy({}, { get: () => "#123456" }),
    run: (...args) => calls.push(args), setAgentOrder: () => {},
    nextCommand: () => { throw new Error("command loop must not run"); },
    exec: () => { throw new Error("a render probe must not run a program"); },
    openOverlay: () => {}, closeOverlay: () => {},
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  });
  const view = new Queue();
  view.init(properties, cx);
  const tree = view.render(cx);
  for (const tick of timers) tick(cx); // A missing/inactive window must be safe too.
  return { view, tree, text: texts(tree), calls, cx, afters };
}

for (const role of roles) {
  test(`${role}: empty spaces, null focus and zero agents render without undefined text`, () => {
    const result = probe(role, false);
    assert.ok(result.text.length > 0);
    assert.ok(result.text.every(value => !value.includes("undefined")));
    if (role === "list") assert.ok(result.text.includes("All clear. Nothing needs you."));
    if (role === "context") assert.ok(result.text.includes("No workspace / #No tab"));
    if (role === "reply") assert.ok(result.text.includes("Agent unavailable"));
  });
  test(`${role}: a 60-character title and null focused tab render safely`, () => {
    const result = probe(role, true, role === "list" ? "working" : "blocked");
    assert.ok(result.text.length > 0);
    if (role === "list" || role === "reply") assert.ok(result.text.includes(longTitle));
  });
}

test("empty list navigation and settlement do not target a terminal or tab", () => {
  const result = probe("list", false);
  for (const command of ["up", "down", "open", "next-blocked", "settle", "snooze", "space-1"]) result.view.command(command, result.cx);
  assert.equal(result.calls.filter(Array.isArray).length, 0);
});

test("ranked bands and clickable task rows are direct children of the scrolled column", () => {
  const result = probe("list", true, "working");
  const ranked = find(result.tree, "queue-ranked");
  assert.ok(ranked);
  assert.ok("overflow_y_scrollbar" in ranked.styles);
  for (const label of ["DONE", "WORKING", "IDLE", longTitle]) assert.ok(texts(ranked).includes(label));
  const row = find(ranked, "row-t1");
  assert.ok(ranked.nodes.includes(row));
  row.events.on_click();
  assert.equal(result.calls.at(-1)[0], "agent.focus");
  assert.equal(result.calls.at(-1)[1].terminal, "t1");
});

test("unknown elapsed time adds neither a question mark nor an empty age box", () => {
  for (const status of ["blocked", "working"]) {
    const result = probe("list", true, status, null);
    const row = find(result.tree, status === "blocked" ? "attention-t1" : "row-t1");
    const descendants = element => element instanceof Element ? [element, ...element.nodes.flatMap(descendants)] : [];
    assert.ok(!texts(row).includes("?"));
    assert.ok(!descendants(row).some(element => element.styles.w?.[0] === 29));
    assert.ok(!descendants(row).some(element => element.nodes.length === 1 && element.nodes[0] === ""));
  }
});

test("exit confirmation has a one-shot retry three seconds after startup", () => {
  const result = probe("list", false);
  assert.equal(result.afters.length, 1);
  assert.equal(result.afters[0].ms, 3000);
  let checks = 0;
  result.view.checkHistory = () => { checks++; };
  result.afters[0].handler(result.cx);
  assert.equal(checks, 1);
});
