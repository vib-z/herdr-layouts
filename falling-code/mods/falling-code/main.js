import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, spaces, panes, props, run, theme, shared,
  setShared, setAgentOrder, window, machines, hc } from "herdr";
import { collectAgents, remember, readHistory, confirmMissing, packBands,
  precomputeFrames, firstLine, COLUMN_WIDTH } from "./model.js";

const STILL_KEY = "falling-code.still";
const ATTENTION_WIDTH = 316;
const word = status => ({ working: "WORKING", done: "DONE", blocked: "NEEDS YOU",
  idle: "IDLE", dead: "EXITED", unavailable: "UNAVAILABLE" })[status] ?? "UNREPORTED";
const text = (value, size, color) => div().text_size(size).text_color(color).child(value);
const activate = a => {
  if (a.status === "dead" || a.status === "unavailable") return;
  run(a.child ? "terminal.peek" : "agent.focus", { terminal: a.address });
};
const context = a => `${a.space_name} / ${a.tab_name}${a.child ? " / child" : ""}`;
const tip = a => `${a.address} | ${context(a)}\n${a.title}\n${word(a.status)}${a.kind ? `: ${a.kind}` : ""}${a.msg ? `\n${a.msg}` : ""}`;
const icon = (program, color) => {
  if (!program?.icon) return text(">_", 10, color).flex_none();
  return program.tint ? svg(program.icon).size(12).flex_none().text_color(color)
    : image(program.icon).w(12).h(12).flex_none();
};
const current = () => collectAgents(agents(), terminals(), spaces());

export default class FallingCode extends View {
  init(_props, cx) {
    this.size = { width: 1000, height: 280 };
    this.frameCache = new Map();
    this.hovered = null;
    this.history = [];
    this.snapshot = null;
    this.failed = true;
    this.checking = false;
    this.checkedAt = 0;
    this.historyKey = "history-v1";
    if (props()?.role !== "rain") return;
    this.history = readHistory(localStorage.getItem(this.historyKey));
    // Slow data confirmation only. Native frames do all visual animation.
    cx.timer.every(10000, cx => this.confirmExits(cx));
  }

  confirmExits(cx) {
    if (this.checking || Date.now() - this.checkedAt < 9000) return;
    const active = new Set(current().map(a => a.address));
    if (!this.history.some(a => !active.has(a.address))) return;
    this.checkedAt = Date.now();
    this.checking = true;
    cx.spawn(async cx => {
      try {
        // Inherit the app's core session.
        const result = await hc(["ls", "--all", "--json"]);
        if (result.code !== 0) throw new Error("Core history unavailable");
        const snapshot = JSON.parse(result.stdout);
        if (!Array.isArray(snapshot.terminals)) throw new Error("Invalid core history");
        this.snapshot = snapshot;
        this.failed = false;
      } catch {
        this.snapshot = null;
        this.failed = true;
      }
      this.checking = false;
      cx.notify();
    });
  }

  rainColumn(a, dimmed, height, motion, t) {
    if (!this.frameCache.has(a.address)) this.frameCache.set(a.address, precomputeFrames(a.address));
    const frames = this.frameCache.get(a.address);
    const blocked = a.status === "blocked";
    const dead = a.status === "dead";
    const color = blocked || a.status === "done" ? t.blocked
      : a.status === "working" ? t.working : a.status === "idle" ? t.idle : t.unknown;
    const glyphHeight = Math.max(54, height - 68);
    const column = v_flex().id(`column-${a.address}`).w(COLUMN_WIDTH).h(height).flex_none()
      .overflow_hidden().gap(3).px(2).py(4).border(1)
      .border_color(blocked ? t.blocked : t.border).bg(blocked ? t.selected : t.canvas)
      .opacity(dimmed ? 0.3 : 1).tooltip(tip(a))
      .on_hover((over, cx) => { this.hovered = over ? a.address : null; cx.notify(); })
      .on_click(() => activate(a));
    if (motion) column.transition("opacity", { duration: 600 });
    const address = div().relative().w_full().h(15)
      .child(text(a.address, 10, blocked ? t.blocked : t.foreground).truncate());
    if (dead) address.child(div().absolute().left(0).right(0).top(7).h(1).bg(t.unknown));
    column.child(h_flex().items_center().gap(2).child(icon(a.program, color))
      .child(text(blocked ? a.kind || "input" : a.child ? "c" : "", 10, color).truncate()));
    column.child(address);
    const body = v_flex().id(`body-${a.address}`).relative().w_full().h(glyphHeight)
      .flex_none().items_center().overflow_hidden();
    // Keep this element across unavailable -> dead so the drain has a prior top.
    const glyphs = text(frames[0], 12, color).id(`glyphs-${a.address}`)
      .absolute().left(12).top(dead ? glyphHeight + 20 : a.status === "working" ? 15 : 0)
      .opacity(["working", "idle", "dead"].includes(a.status) ? 1 : 0).line_height("15px");
    if (motion && dead) glyphs.transition("top", { duration: 900, easing: "ease-in" });
    if (motion && a.status === "working") glyphs.frames(frames, 200);
    body.child(glyphs);
    if (blocked) {
      body.child(text("PICK\nUP\n\nPICK\nUP", 11, t.blocked).line_height("15px").font_semibold());
    } else if (a.status === "done") {
      body.child(text("D\nO\nN\nE", 15, t.done).line_height("19px"));
      body.child(text("0\n1", 11, t.idle).line_height("14px"));
    } else if (a.status === "unavailable") {
      body.child(text("?", 21, t.unknown));
    } else {
      if (a.status === "working") body.child(text(frames[0][0], 12, t.foreground).h(15));
      if (dead) {
        const cursor = text("_", 16, t.unknown).absolute().bottom(4);
        if (motion) cursor.loop("opacity", { from: 0.25, to: 1, period: 1800 });
        body.child(cursor);
      }
    }
    return column.child(body).child(text(blocked ? a.msg || "PICK UP" : dead ? "EXIT" : a.status === "unavailable" ? "N/A" : word(a.status), 10, color).truncate());
  }

  attention(list, t) {
    const blocked = list.filter(a => a.status === "blocked");
    return v_flex().id("falling-code-attention").w(ATTENTION_WIDTH).h_full().flex_none()
      .bg(t.chrome).border_l(1).border_color(t.border).px(10).py(5)
      .child(h_flex().h(22).flex_none().items_center().justify_between()
        .child(text("NEEDS YOU", 12, t.blocked).font_semibold())
        .child(text(String(blocked.length).padStart(2, "0"), 15, t.blocked)))
      .child(v_flex().id("attention-list").flex_1().min_h(0).overflow_y_scrollbar().gap(4)
        .children(blocked.map(a => v_flex().id(`attention-${a.address}`).flex_none().h(60).px(8).py(4)
          .bg(t.selected).border_l(2).border_color(t.blocked).tooltip(tip(a))
          .hover(el => el.bg(t.hover)).on_click(() => activate(a))
          .child(h_flex().justify_between().gap(6)
            .child(text(a.address, 11, t.blocked).font_semibold())
            .child(text(a.kind || "needs input", 10, t.foreground).truncate()))
          .child(text(a.title || a.program?.name || "Agent", 12, t.foreground).truncate())
          .child(text(context(a), 10, t.muted).truncate())))
        .when(!blocked.length, el => el.child(text("No calls waiting.\nAll sectors stay in view.", 12, t.muted).py(16))));
  }

  rain(cx, t) {
    const live = current();
    const next = remember(this.history, live);
    const encoded = JSON.stringify(next);
    if (encoded !== JSON.stringify(this.history)) {
      this.history = next;
      localStorage.setItem(this.historyKey, encoded);
    }
    const missing = confirmMissing(this.history, live, this.snapshot, machines(), this.failed);
    if (missing.length) this.confirmExits(cx);
    const all = [...live, ...missing];
    setAgentOrder(live.map(a => a.address));
    const addresses = new Set(all.map(a => a.address));
    for (const key of this.frameCache.keys()) if (!addresses.has(key)) this.frameCache.delete(key);
    const blocked = live.filter(a => a.status === "blocked");
    const motion = shared(STILL_KEY) !== true && window()?.active === true;
    const fieldWidth = Math.max(96, this.size.width - ATTENTION_WIDTH - 24);
    const bands = packBands(all, spaces(), fieldWidth);
    const bandHeight = Math.max(156, Math.min(260, this.size.height - 66));
    const hovered = all.find(a => a.address === this.hovered);
    const field = v_flex().id("rain-bands").flex_1().min_h(0).overflow_y_scrollbar().gap(8);
    for (let i = 0; i < bands.length; i++) {
      const row = h_flex().id(`band-${i}`).h(bandHeight).flex_none();
      for (let j = 0; j < bands[i].groups.length; j++) {
        const group = bands[i].groups[j];
        const columns = h_flex().gap(4).child(div().id(`tab-select-${i}-${j}`).w(10).flex_none()
          .tooltip(group.tabName).on_click(() => {
            if (spaces().some(s => s.tabs.some(tab => tab.id === group.tab))) run("tab.select", { id: group.tab });
          })
          .child(text([...group.tabName].slice(0, 11).join("\n"), 10, t.dim).line_height("13px")))
          .children(group.agents.map(a => this.rainColumn(a, blocked.length > 0 && a.status !== "blocked", bandHeight - 28, motion, t)));
        row.child(v_flex().id(`sector-${i}-${j}`).w(group.width).h_full().flex_none()
          .px(8).gap(5).border_r(2).border_color(t.border)
          .child(div().id(`sector-select-${i}-${j}`).h(22).flex_none()
            .tooltip(`${group.name} / ${group.branch || "branch unreported"}`)
            .on_click(() => {
              if (spaces().some(s => s.id === group.space)) run("space.select", { id: group.space });
            })
            .child(text(`SECTOR ${group.name} / ${group.branch || ""}`, 11, t.muted).truncate()))
          .child(columns));
      }
      field.child(row);
    }
    if (!all.length) field.child(text("No reporting agents.\nOpen an agent in a sector to begin the rain.", 13, t.muted).p(16));
    return v_flex().id("falling-code-rain-root").size_full().min_h(0).bg(t.canvas)
      .font_family("Geist Mono").text_color(t.foreground)
      .on_size_change((size, cx) => {
        if (size.width === this.size.width && size.height === this.size.height) return;
        this.size = size; cx.notify();
      })
      .child(h_flex().h(32).flex_none().items_center().gap(12).px(12).bg(t.chrome)
        .border_b(1).border_color(t.border)
        .child(text("FALLING CODE", 13, t.foreground).font_semibold())
        .child(text(`${live.length} SIGNALS / ${spaces().length} SECTORS`, 10, t.muted))
        .child(div().flex_1())
        .child(text(motion ? "RAIN / 200ms" : "RAIN / STILL", 10, t.muted))
        .child(div().id("toggle-still").px(8).py(3).border(1).border_color(t.border)
          .tooltip("Toggle still mode. Motion also pauses while this window is inactive.")
          .hover(el => el.bg(t.hover)).on_click(() => setShared(STILL_KEY, shared(STILL_KEY) !== true))
          .child(text(shared(STILL_KEY) === true ? "Motion: off" : "Motion: on", 10, t.foreground))))
      .child(h_flex().id("rain-content").flex_1().min_h(0).items_stretch()
        .child(v_flex().id("rain-field-column").flex_1().h_full().min_w(0).min_h(0).px(12).pt(8).gap(4)
          .child(field)
          .child(text(hovered ? `${hovered.address} / ${hovered.title}` : "Select a column to focus. Hover for the full signal.", 10, t.muted).h(18).flex_none().truncate()))
        .child(this.attention(live, t)));
  }

  alert(t) {
    const live = current();
    const blocked = live.filter(a => a.status === "blocked");
    const first = blocked[0];
    const active = spaces().find(s => s.active);
    const tab = active?.tabs.find(tab => tab.active);
    return h_flex().id("falling-code-alert-root").size_full().items_center().px(12).gap(12)
      .font_family("Geist Mono").bg(first ? t.selected : t.chrome).border_y(1).border_color(t.border)
      .when(Boolean(first), el => el.tooltip(tip(first)).on_click(() => activate(first)))
      .child(text(first ? `${blocked.length} NEEDS YOU` : "LINE OPEN", 11, first ? t.blocked : t.working).flex_none())
      .child(text(first ? `${first.address} / ${context(first)} / ${first.kind || "input"}: ${first.msg || first.title}`
        : `${active?.name ?? "No sector"} / ${tab?.name ?? "No active tab"}`, 11, t.foreground).flex_1().truncate())
      .child(text(first ? "CLICK TO JACK IN >" : "LIVE TERMINALS", 10, t.muted).flex_none());
  }

  header(t) {
    const p = panes().find(p => p.pane === props()?.pane);
    if (!p) return div();
    const a = current().find(a => a.address === p.terminal);
    const title = a?.title || p.title || p.program?.name || p.terminal || "Mod pane";
    const sector = spaces().find(s => s.tabs.some(tab => tab.id === p.tab));
    const tab = sector?.tabs.find(tab => tab.id === p.tab);
    return h_flex().id(`falling-code-header-${p.pane}`).size_full().px(10).gap(8).items_center()
      .font_family("Geist Mono").bg(t.chrome).border_b(1).border_color(p.focused ? t.accent : t.border)
      .tooltip(`${p.terminal ?? "Mod pane"} / ${sector?.name ?? ""} / ${tab?.name ?? ""}\n${firstLine(title)}`)
      .on_click(() => run("pane.focus", { pane: p.pane }))
      .child(icon(p.program, t.foreground))
      .child(text(p.terminal ?? "MOD", 11, t.foreground).flex_none())
      .child(text(`${sector?.name ?? ""} / ${tab?.name ?? ""} / ${title}`, 11, t.muted).flex_1().truncate())
      .child(text(word(a?.status), 10, a?.status === "blocked" ? t.blocked : t.muted).flex_none());
  }

  render(cx) {
    const t = theme();
    if (props()?.role === "alert") return this.alert(t);
    if (props()?.role === "header") return this.header(t);
    return this.rain(cx, t);
  }
}
