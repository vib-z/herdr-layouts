import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, spaces, panes, props, run, theme, shared, setShared,
  setAgentOrder, window, exec } from "herdr";
import { collectAgents, loadHistory, remember, confirmHistory, historyRows } from "./model.js";

const ART = "mods/noir/";
const RED_GLASS = "#482221";
const RED_INK = "#ffe2df";
const MOTION_KEY = "noir.still";
const HISTORY_KEY = "noir-history-v1";
const CLOSED = ["C", "CA", "CAS", "CASE", "CASE ", "CASE C", "CASE CL",
  "CASE CLO", "CASE CLOS", "CASE CLOSE", "CASE CLOSED", ...Array(24).fill("CASE CLOSED.")];
const LABEL = { working: "ON THE CASE", blocked: "NEEDS YOU", done: "CASE CLOSED.",
  idle: "OUT TO LUNCH" };

function liveAgents() { return collectAgents(agents(), terminals()); }
function moving() { return shared(MOTION_KEY) !== true && window()?.active; }
function text(value, fallback = "") { return String(value || fallback); }
function openAgent(a) {
  run(a.child ? "terminal.peek" : "agent.focus", { terminal: a.address });
}
function rule(color) { return div().h(1).w_full().flex_none().bg(color); }

export default class Noir extends View {
  init(_props, cx) {
    this.size = { width: 180, height: 700 };
    this.history = [];
    this.checking = false;
    this.lastSave = "";
    if ((props()?.role || "hallway") !== "hallway") return;
    this.history = loadHistory(localStorage.getItem(HISTORY_KEY), Date.now());
    this.track();
    this.checkHistory(cx);
    // Data polling only. Native motion has no animation timer.
    cx.timer.every(8000, (cx) => {
      if (window()?.active) this.checkHistory(cx);
    });
  }

  saveHistory() {
    const serialized = JSON.stringify(this.history);
    if (serialized !== this.lastSave) {
      localStorage.setItem(HISTORY_KEY, serialized);
      this.lastSave = serialized;
    }
  }

  track() {
    this.history = remember(this.history, liveAgents(), Date.now());
    this.saveHistory();
  }

  checkHistory(cx) {
    if (this.checking) return;
    this.track();
    const live = new Set(terminals().map(t => t.address));
    const missing = this.history.filter(a => !live.has(a.address));
    if (!missing.length) return;
    this.checking = true;
    cx.spawn(async (cx) => {
      try {
        let records = null;
        try {
          // Inherit the app's core session; ls includes machine-qualified remote records.
          const result = await exec("hc", ["ls", "--all", "--json"]);
          if (result.code === 0) records = historyRows(result.stdout);
        } catch { /* Offline/malformed history stays unavailable, never VACANT. */ }
        const current = new Set(terminals().map(t => t.address));
        this.history = confirmHistory(this.history, current, records);
        this.saveHistory();
      } finally {
        this.checking = false;
        cx.notify();
      }
    });
  }

  fan(status, t, size = 22) {
    const fan = svg(ART + "fan.svg").size(size).flex_none()
      .text_color(t[status] || t.dim);
    if (status === "working" && moving()) fan.spin(3000);
    return fan;
  }

  pulse(id, t) {
    const line = div().id(id).h(2).w_full().flex_none().bg(t.blocked);
    if (moving()) line.loop("opacity", { from: 0.4, to: 1, period: 1200 });
    return line;
  }

  caller(a, t) {
    return v_flex().id(`caller-${a.address}`).w_full().h(66).flex_none().gap(2)
      .px(8).py(6).bg(RED_GLASS).border(1).border_color(t.blocked)
      .hover(s => s.bg("#5c2a28"))
      .on_click(() => openAgent(a))
      .child(h_flex().w_full().gap(4).items_center()
        .child(div().flex_none().text_color(t.blocked).font_bold().child("!"))
        .child(div().flex_1().min_w(0).truncate().text_color(RED_INK).font_semibold().text_size(11).child(text(a.title, a.address))))
      .child(div().truncate().text_size(10).text_color("#e8b3af").child(`${a.space_name} / ${a.tab_name}`))
      .child(div().truncate().text_size(10).text_color(RED_INK).child(`${a.address}${a.child ? " / child, peek" : " / focus"}`));
  }

  door(s, list, t) {
    const mine = list.filter(a => a.space === s.id);
    const blocked = s.status === "blocked" || mine.some(a => a.status === "blocked");
    const ink = blocked ? RED_INK : t.foreground;
    return v_flex().id(`door-${s.id}`).w_full().h(s.machine ? 90 : 74).flex_none()
      .bg(blocked ? RED_GLASS : s.active ? "#414141" : "#303030")
      .border(1).border_color(blocked ? t.blocked : s.active ? "#aaaaaa" : "#606060")
      .hover(el => el.bg(blocked ? "#5c2a28" : "#464646"))
      .on_click(() => run("space.select", { id: s.id }))
      .child(div().h(3).bg(blocked ? t.blocked : "#777777"))
      .child(v_flex().relative().p(8).gap(4)
        .child(image(ART + "frost.svg").absolute().size_full())
        .child(h_flex().relative().gap(6).items_center()
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_size(15).line_height("20px").text_color(ink).child(s.name))
          .child(div().text_size(10).text_color(blocked ? t.blocked : t.dim).child(s.active ? "IN" : "")))
        .when(Boolean(s.machine), el => el.child(div().relative().truncate().text_size(10)
          .text_color(blocked ? "#e8b3af" : t.muted).child(`REMOTE / ${s.machine}`)))
        .child(h_flex().relative().gap(5).items_center().children(mine.map(a =>
          div().id(`mail-${a.address}`).w(12).h(5).flex_none().bg(a.status === "blocked" ? t.blocked : t[a.status] || t.dim)
            .on_click((_e, cx) => { cx.stop_propagation(); openAgent(a); }))))
        .child(div().relative().truncate().text_size(10).text_color(blocked ? RED_INK : t.muted)
          .child(`${mine.length} ${mine.length === 1 ? "agent" : "agents"} / ${s.tabs.length} cases`)));
  }

  archive(a, t) {
    const dead = a.state === "dead";
    return v_flex().id(`vacant-${a.address}`).w_full().h(92).flex_none().gap(3).p(8)
      .bg(t.surface).border(1).border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(svg(ART + "vacant.svg").size(18).flex_none().text_color(t.dim))
        .child(div().text_size(10).text_color(t.muted).child(dead ? "VACANT" : "unavailable")))
      .child(div().relative().h(14).w_full()
        .child(div().truncate().text_size(10).text_color(t.dim).child(a.title))
        .when(dead, el => el.child(div().absolute().top(7).left(0).w_full().h(1).bg(t.dim))))
      .child(div().truncate().text_size(10).text_color(t.dim).child(`${a.space_name} / ${a.tab_name}`))
      .child(div().truncate().text_size(10).text_color(t.muted)
        .child(`${a.address} / ${dead ? `${a.reason}${a.exit_code == null ? "" : ` ${a.exit_code}`}` : "unconfirmed"}`));
  }

  hallway(t) {
    const list = liveAgents();
    this.track();
    const needs = list.filter(a => a.status === "blocked");
    const gone = this.history.filter(a => !terminals().some(k => k.address === a.address));
    setAgentOrder([...needs, ...list.filter(a => a.status !== "blocked")].map(a => a.address));
    const maxCallers = Math.max(132, Math.min(222, this.size.height * 0.32));
    return v_flex().id("noir-hallway-root").size_full().overflow_hidden().bg(t.chrome).text_color(t.foreground)
      .line_height("14px")
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .child(v_flex().id("noir-masthead").h(112).flex_none().px(12).py(12).gap(2)
        .child(div().text_size(10).text_color(t.muted).child("HERDR / EST. 1947"))
        .child(div().text_size(18).line_height("22px").font_bold().child("THE NOIR"))
        .child(div().text_size(18).line_height("22px").font_bold().child("OFFICE"))
        .child(div().text_size(10).text_color(t.dim).child("PRIVATE INVESTIGATIONS")))
      .child(rule(t.border))
      // This area is outside the doors' scroll container, never folded or filtered.
      .child(v_flex().id("noir-attention").flex_none().px(10).py(8).gap(6)
        .child(h_flex().h(20).flex_none().justify_between().items_center()
          .child(div().text_size(10).font_bold().text_color(needs.length ? t.blocked : t.muted).child("CLIENTS WAITING"))
          .child(div().text_size(13).font_bold().text_color(needs.length ? t.blocked : t.muted).child(String(needs.length))))
        .child(v_flex().id("noir-callers").w_full().max_h(maxCallers).overflow_y_scrollbar().gap(5)
          .children(needs.map(a => this.caller(a, t)))
          .when(!needs.length, el => el.child(div().py(8).text_size(10).text_color(t.dim).child("No clients waiting.")))))
      .child(rule(t.border))
      .child(v_flex().id("noir-doors").flex_1().min_h(0).w_full().overflow_y_scrollbar().px(10).py(8).gap(8)
        .child(div().h(16).flex_none().text_size(10).text_color(t.dim).child("HALLWAY / ALL SPACES"))
        .children(spaces().map(s => this.door(s, list, t)))
        .when(!spaces().length, el => el.child(div().text_size(11).text_color(t.muted).child("The office is quiet.")))
        .when(gone.length > 0, el => el
          .child(div().h(20).flex_none().text_size(10).text_color(t.dim).child("VACANCIES / RECENT"))
          .children(gone.map(a => this.archive(a, t)))))
      .child(rule(t.border))
      .child(h_flex().flex_none().h(36).px(10).items_center().justify_between()
        .child(div().text_size(10).text_color(t.dim).child("SILENT OFFICE"))
        .child(div().id("noir-still-toggle").px(5).py(4).border(1).border_color(t.border)
          .text_size(10).text_color(t.muted).hover(el => el.bg(t.hover))
          .on_click(() => setShared(MOTION_KEY, shared(MOTION_KEY) !== true))
          .child(shared(MOTION_KEY) === true ? "STILL: ON" : "STILL: OFF")));
  }

  folders(t) {
    const space = spaces().find(s => s.active);
    const list = liveAgents();
    return v_flex().id("noir-folder-root").size_full().overflow_hidden().bg(t.chrome).line_height("14px")
      .child(h_flex().h(23).flex_none().px(16).gap(12).justify_between().items_center()
        .child(div().flex_1().truncate().text_size(10).text_color(t.muted).child(`CASE FILES / ${space?.name || "NO SPACE"}`))
        .child(div().flex_none().text_size(10).text_color(t.dim).child("CONFIDENTIAL")))
      .child(h_flex().id("noir-folder-scroll").flex_1().min_h(0).w_full().overflow_x_scrollbar().px(14).gap(6).items_center()
        .children((space?.tabs || []).map(tab => {
          const blocked = tab.status === "blocked" || list.some(a => a.tab === tab.id && a.status === "blocked");
          const on = tab.active;
          return v_flex().id(`folder-${tab.id}`).w(190).h(39).flex_none()
            .bg(blocked ? RED_GLASS : on ? "#c6c6c6" : "#535353")
            .border(1).border_color(blocked ? t.blocked : on ? "#eeeeee" : "#777777")
            .on_click(() => run("tab.select", { id: tab.id }))
            .child(blocked ? this.pulse(`folder-alert-${tab.id}`, t) : div().h(2).bg(on ? "#eeeeee" : "#777777"))
            .child(h_flex().flex_1().px(10).gap(7).items_center()
              .child(svg(ART + "folder.svg").size(14).flex_none().text_color(blocked ? RED_INK : on ? "#303030" : "#dddddd"))
              .child(v_flex().flex_1().min_w(0).gap(1)
                .child(div().truncate().text_size(11).font_semibold().text_color(blocked ? RED_INK : on ? "#202020" : "#eeeeee")
                  .child(`CASE ${tab.index}: ${tab.name}`))
                .child(div().truncate().text_size(10).text_color(blocked ? "#e8b3af" : on ? "#454545" : "#bbbbbb")
                  .child(blocked ? "A CLIENT IS WAITING" : tab.settled ? "FILED / SETTLED" : tab.status ? LABEL[tab.status] : "UNREPORTED"))));
        })));
  }

  header(t) {
    const p = panes().find(p => p.pane === props()?.pane);
    if (!p) return div();
    const a = liveAgents().find(a => a.address === p.terminal);
    const raw = terminals().find(k => k.address === p.terminal);
    const status = a?.status || p.status;
    const blocked = status === "blocked";
    const ink = blocked ? RED_INK : status === "idle" ? t.idle : t.foreground;
    const glass = blocked ? RED_GLASS : p.focused ? "#444444" : "#343434";
    const title = a?.title || raw?.report?.title || p.program?.name || p.terminal || p.mod || "Terminal";
    const statusText = status === "blocked" ? "A CLIENT IS WAITING" :
      status === "working" ? "PRIVATE INVESTIGATIONS" :
      status === "done" ? "PRIVATE INVESTIGATIONS" :
      status === "idle" ? "OUT TO LUNCH" : p.mod ? "OFFICE FILE" : "UNREPORTED TERMINAL";
    let line = div().truncate().text_size(10).text_color(blocked ? RED_INK : t.muted);
    if (status === "done") {
      line.child("CASE CLOSED.");
      if (moving()) line.frames(CLOSED, 115);
    } else line.child(blocked ? text(raw?.report?.msg, "Needs you. Open this terminal to respond.") : title);
    return v_flex().id(`glass-${p.pane}`).relative().size_full().overflow_hidden().bg(glass)
      .on_click(() => a ? run("agent.focus", { terminal: p.terminal }) : run("pane.focus", { pane: p.pane }))
      .child(image(ART + "frost.svg").absolute().size_full())
      .child(blocked ? this.pulse(`header-alert-${p.pane}`, t) : div().relative().h(2).bg(p.focused ? "#dddddd" : "#747474"))
      .child(h_flex().relative().flex_1().px(13).gap(10).items_center()
        .child(svg(ART + "hat.svg").size(26).flex_none().text_color(ink))
        .child(v_flex().flex_1().min_w(0).gap(5)
          .child(div().truncate().text_size(12).font_semibold().text_color(ink)
            .child(`${text(p.terminal, "FILE").toUpperCase()} . ${statusText}`))
          .child(line))
        .child(this.fan(status, t, 23)));
  }

  render() {
    const t = theme();
    // Opening/checking the mod without layout props exercises the actual empty hallway.
    switch (props()?.role || "hallway") {
      case "hallway": return this.hallway(t);
      case "folders": return this.folders(t);
      case "header": return this.header(t);
      default: return div().text_color(t.muted).child("The Noir Office");
    }
  }
}
