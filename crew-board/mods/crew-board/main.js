import { View, div, image, svg, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, terminals, spaces, panes, props, run, theme, window as appWindow,
  shared, setShared, setAgentOrder, hc, openOverlay, closeOverlay } from "herdr";
import { crewRole, collectCrew, remember, missingCrew, confirmExits, elapsed, groupJobs } from "./model.js";
import { planSheets, PHOTO_HEIGHT, CARD_HEIGHT, deskStringRoute } from "./geometry.js";

const ASSET = "mods/crew-board/";
const PAPER = "#f0e5c9", INK = "#302e28", CHALK = "#dce9df";
const COPY = { working: "ON THE JOB", done: "GOT THE GOODS", blocked: "NEEDS YOU", idle: "LAYING LOW", dead: "BUSTED", unavailable: "UNAVAILABLE" };
const motion = () => shared("crew-board.still") !== true && appWindow().active;
const liveCrew = () => collectCrew(agents(), terminals(), spaces());
const color = status => status === "dead" ? theme().blocked : theme()[status] ?? theme().muted;
const dot = (c, size = 7) => div().size(size).rounded(size).bg(c).flex_none();
const label = (text, size = 11, c = CHALK) => div().text_size(Math.max(10, size)).text_color(c).child(String(text));
const identity = a => `${a.title}\n${a.space_name} / ${a.tab_name}\n${a.address}${a.child ? ' (child, opens peek)' : ''}`;
const focus = a => run(a.child ? "terminal.peek" : "agent.focus", { terminal: a.address });
const selectTab = (space, tab) => {
  if (!spaces().some(s => s.id === space && s.tabs.some(t => t.id === tab))) return;
  run("space.select", { id: space }); run("tab.select", { id: tab });
};
const icon = (p, size = 26) => p?.icon
  ? (p.tint ? svg(p.icon).text_color(INK) : image(p.icon)).size(size).flex_none()
  : svg(ASSET + "silhouette.svg").size(size).text_color(INK).flex_none();
function button(id, text, click, light = false) {
  return div().id(id).px(9).h(26).flex_none().flex().items_center().rounded(3)
    .text_size(10).font_semibold().bg(light ? PAPER : theme().raised)
    .text_color(light ? INK : theme().foreground).cursor_pointer()
    .hover(s => s.opacity(0.8)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); click(e, cx); }).child(text);
}
function readHistory() {
  try { const value = JSON.parse(localStorage.getItem("crew-history") ?? "[]"); return Array.isArray(value) ? value.slice(0, 128) : []; }
  catch (_) { return []; }
}

export default class CrewBoard extends View {
  init(_p, cx) {
    this.size = { width: 920, height: 820 };
    this.history = readHistory();
    this.historyKey = "";
    this.pending = false;
    this.checkLabel = "Exit check pending";
    this.folded = false;
    this.page = 0;
    this.expanded = {};
    this.responsive = null;
    this.lastStore = "";
    this.wheelDistance = 0;
    if ((props()?.role ?? "wall") === "wall") {
      cx.timer.every(5000, cx => this.checkExits(cx));
      cx.timer.every(60000, cx => { if (appWindow().active) cx.notify(); });
    }
  }
  persist() {
    const text = JSON.stringify(this.history);
    if (text !== this.lastStore) { localStorage.setItem("crew-history", text); this.lastStore = text; }
  }
  rememberLive(live) {
    const key = JSON.stringify(live.map(a => [a.address, a.status, a.title, a.space, a.tab, a.space_name, a.tab_name, a.program]));
    if (key !== this.historyKey) { this.history = remember(this.history, live, Date.now()); this.historyKey = key; this.persist(); }
    const burn = shared("crew-board.burn");
    if (burn?.address && burn.at !== this.burnedAt && this.history.some(a => a.address === burn.address && a.exit?.state === "finished")) {
      this.burnedAt = burn.at;
      this.history = this.history.filter(a => a.address !== burn.address); this.persist();
    }
  }
  checkExits(cx) {
    if (this.pending || !appWindow().active) return;
    const missing = missingCrew(this.history, liveCrew(), terminals()).filter(a => a.status === "unavailable");
    if (!missing.length) return;
    this.pending = true;
    cx.spawn(async cx => {
      try {
        const reply = await hc(["ls", "--all", "--json"]);
        if (reply.code !== 0) throw new Error("Core unavailable");
        const present = new Set(terminals().map(t => t.address));
        this.history = confirmExits(this.history, JSON.parse(reply.stdout), present);
        this.checkLabel = "Exit records checked";
        this.persist();
      } catch (_) { this.checkLabel = "Exit check unavailable"; }
      this.pending = false;
      cx.notify();
    });
  }
  topbar(list) {
    const blocked = list.filter(a => a.status === "blocked");
    const narrow = this.size.width < 1200;
    const phone = label(blocked.length ? "RING" : "LINE CLEAR", 10, blocked.length ? theme().blocked : theme().muted)
      .id("burner-text").w(narrow ? 62 : 78);
    if (blocked.length && motion()) phone.frames(["RING", "RING RING"], 1600);
    return h_flex().id("crew-topbar").size_full().pl(appWindow().platform === "macos" ? 86 : 20).pr(18).gap(15)
      .items_center().bg(theme().chrome).border_b(1).border_color(theme().border)
      .on_size_change((size, cx) => {
        this.size = size;
        const compact = size.width < 1200;
        if (compact !== this.responsive) {
          this.responsive = compact;
          run("layout.resize", compact ? { id: "crew-wall", px: 340 } : { id: "crew-wall", weight: 3 });
        }
        cx.notify();
      })
      .child(svg(ASSET + "pin.svg").size(16).text_color(theme().accent))
      .child(label("THE CREW BOARD", narrow ? 13 : 16, theme().foreground).font_semibold())
      .when(!narrow, el => el.child(label(`${spaces().length} JOBS  /  ${list.length} CREW`, 10, theme().muted)))
      .child(div().flex_1())
      .child(h_flex().id("burner-phone").h(31).px(10).gap(9).items_center().rounded(4).bg(theme().background)
        .tooltip(blocked.length ? `${blocked.length} need you. Open the first call.` : "Nobody needs you")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => { if (blocked[0]) focus(blocked[0]); })
        .child(svg(ASSET + "phone.svg").size(17).text_color(blocked.length ? theme().blocked : theme().muted))
        .child(phone).child(label(String(blocked.length).padStart(2, "0"), 13, theme().foreground)))
      .child(button("still", shared("crew-board.still") === true ? "STILL: ON" : "STILL: OFF", () => setShared("crew-board.still", shared("crew-board.still") !== true)))
      .when(appWindow().buttons, el => el.children([
        button("minimize", "_", () => run("window.minimize")),
        button("maximize", "[]", () => run("window.maximize")),
        button("close", "X", () => run("window.close"))]));
  }
  header() {
    const p = props();
    if (p.pane) {
      const pane = panes().find(a => a.pane === p.pane);
      const address = pane?.terminal;
      const crew = liveCrew().find(a => a.address === address);
      return h_flex().id(`tape-${p.pane}`).size_full().px(12).gap(8).items_center().bg(PAPER)
        .tooltip(crew?.title || pane?.title || pane?.program?.name || address || "Terminal")
        .text_color(INK).text_size(10).on_click(() => run("pane.focus", { pane: p.pane }))
        .child(icon(pane?.program, 14))
        .child(div().flex_1().min_w(0).truncate().child(address ? `${address}  .  ${pane?.status ? crewRole(address) : "THE VAN"}` : pane?.title ?? "THE VAN"))
        .child(dot(pane?.status ? color(pane.status) : "#8d8a77"))
        .child(label(pane?.status ? COPY[pane.status] ?? pane.status : "SHELL", 10, INK));
    }
    const space = spaces().find(s => s.active), tab = space?.tabs.find(t => t.active);
    return h_flex().size_full().px(17).gap(12).items_center().bg(theme().chrome)
      .child(label("THE VAN", 12, theme().accent).font_semibold())
      .child(div().w(1).h(16).bg(theme().border))
      .child(label(`${space?.name ?? "No job"} / ${tab?.name ?? "No tab"}`, 11, theme().muted).truncate())
      .child(div().flex_1()).child(label("LIVE", 10, theme().done));
  }
  photo(a, width, height, desk = false) {
    const state = a.status, idle = state === "idle", dead = state === "dead";
    const frame = div().relative().w(width).h(height).flex_none()
      .child(image(ASSET + (idle ? "card-back.svg" : dead ? "photo-dead.svg" : "photo.svg")).absolute().size_full());
    if (idle) {
      frame.child(v_flex().absolute().left(7).right(7).top(17).gap(7)
        .child(label(a.address, width < 80 ? 10 : 12, INK).truncate())
        .when(width >= 80, el => el.child(label("LAYING LOW", 10, "#6d685a"))));
    } else {
      frame.child(div().absolute().top(10).left(8).right(8).h(height * 0.60).flex().items_center().justify_center()
        .child(icon(a.program, width < 80 ? 22 : 34)))
        .child(label(a.address, width < 80 ? 10 : 11, INK).absolute().left(8).right(6).bottom(9).truncate());
      if (dead) frame.child(image(ASSET + "busted.svg").absolute().left(5).top(6).w(width - 10).h(height - 12));
      const stamp = image(ASSET + "clean.svg").id(`stamp-${desk ? "desk" : "wall"}-${a.address}`)
        .absolute().left(3).top(state === "done" ? height * 0.35 : 2).w(width - 6).h(34).opacity(state === "done" ? 1 : 0);
      if (motion()) stamp.transition("top", { duration: 420, easing: "ease-out" }).transition("opacity", 420);
      frame.child(stamp);
    }
    if (state === "unavailable") frame.opacity(0.55);
    if (state === "working" && motion() && !desk) frame.id(`sway-${a.address}`).loop("left", { from: -1, to: 1, period: 2400 });
    return frame;
  }
  card(a, x, y, width, captionWidth = width) {
    const h = PHOTO_HEIGHT(width);
    const dead = a.status === "dead", unavailable = a.status === "unavailable";
    return v_flex().id(`crew-${a.address}`).absolute().left(x).top(y).w(captionWidth).gap(2)
      .tooltip(`${identity(a)}\n${crewRole(a.address)}\n${COPY[a.status]}${a.exit ? `: ${a.exit.reason}` : ''}`)
      .cursor_pointer().on_click(() => { if (!dead && !unavailable) focus(a); })
      .on_mouse_down("right", (_e, cx) => {
        if (!dead) return;
        cx.stop_propagation();
        openOverlay({ mod: "crew-board", props: { role: "burn", address: a.address, title: a.title }, kind: "popup", width: 250 });
      })
      .child(div().w(width).h(h).flex_none())
      .child(label(crewRole(a.address), 10, CHALK).line_height("13px").h(13).truncate())
      .child(label(a.title, 10, CHALK).line_height("13px").h(13).truncate())
      .child(label(COPY[a.status], 10, color(a.status)).line_height("13px").h(13).truncate().font_semibold());
  }
  travelingPhoto(a, x, y, width, height, desk = false) {
    const photo = div().id(`travel-${a.address}`).absolute().left(x).top(y).w(width).h(height)
      .tooltip(identity(a)).cursor_pointer()
      .on_click(() => { if (a.status !== "dead" && a.status !== "unavailable") focus(a); })
      .on_mouse_down("right", (_e, cx) => {
        if (a.status !== "dead") return;
        cx.stop_propagation();
        openOverlay({ mod: "crew-board", props: { role: "burn", address: a.address, title: a.title }, kind: "popup", width: 250 });
      }).child(this.photo(a, width, height, desk));
    if (motion()) photo.spring("left").spring("top");
    return photo;
  }
  compactRow(a) {
    return h_flex().id(`compact-${a.address}`).w_full().min_w(0).h(26).gap(7).flex_none()
      .tooltip(identity(a)).cursor_pointer()
      .on_click(() => { if (a.status !== "dead" && a.status !== "unavailable") focus(a); })
      .on_mouse_down("right", (_e, cx) => {
        if (a.status !== "dead") return;
        cx.stop_propagation();
        openOverlay({ mod: "crew-board", props: { role: "burn", address: a.address, title: a.title }, kind: "popup", width: 250 });
      })
      .child(dot(color(a.status), 5)).child(label(a.address, 10, PAPER).max_w(65).truncate())
      .child(label(a.title, 10, PAPER).flex_1().min_w(0).truncate())
      .child(label(COPY[a.status], 10, color(a.status)).flex_none());
  }
  deskRow(a, width, compact, traveling) {
    const age = elapsed(a.status_ms, Date.now());
    return h_flex().id(`request-${a.address}`).w(width).h(compact ? 94 : 112).flex_none().gap(11).px(10).py(8)
      .bg(theme().surface).border(1).border_color(theme().blocked).rounded(3).cursor_pointer()
      .tooltip(`${identity(a)}\n${a.report?.kind ?? 'Needs input'}: ${a.report?.msg || 'Open the terminal to review the request.'}`)
      .on_click(() => focus(a))
      .when(!compact, el => el.child(traveling ? div().w(60).h(76).flex_none() : this.photo(a, 60, 76, true)))
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(h_flex().gap(7).items_center()
          .child(label(a.address, 11, theme().foreground).max_w(compact ? 135 : 165).truncate().font_semibold())
          .child(label(a.child ? "CHILD" : compact ? "NEEDS YOU" : crewRole(a.address), 10, theme().blocked).truncate())
          .child(div().flex_1()).when(Boolean(age), el => el.child(label(age, 10, theme().muted).id(`age-${a.address}`))))
        .child(label(a.title, 12, theme().foreground).truncate().font_semibold())
        .child(label(`${a.space_name} / ${a.tab_name}`, 10, theme().muted).truncate())
        .child(label(`${(a.report?.kind || "request").toUpperCase()}: ${a.report?.msg || "Open the terminal to review"}`, 10, theme().blocked).truncate())
        .when(!compact, el => el.child(label("ANSWER THE PHONE  >", 10, theme().accent))));
  }
  // This desk is part of the wall View, never a separate layout block.
  desk(blocked, y, height, width, traveling) {
    const compact = width < 500, columns = width >= 760 ? 2 : 1;
    const rowWidth = (width - 36 - (columns - 1) * 10) / columns;
    const header = h_flex().h(48).flex_none().px(18).items_center().gap(10)
      .child(dot(theme().blocked, 8)).child(label("THE BOSS'S DESK", compact ? 13 : 17, theme().foreground).font_semibold())
      .child(div().flex_1()).child(label(`${blocked.length} NEED YOU`, 10, theme().blocked));
    const rows = [];
    for (let i = 0; i < blocked.length; i += columns) rows.push(h_flex().gap(10).flex_none().children(blocked.slice(i, i + columns).map(a => this.deskRow(a, rowWidth, compact, traveling))));
    return v_flex().id("boss-desk").absolute().left(0).top(y).w(width).h(height).bg(theme().chrome)
      .border_t(2).border_color(theme().blocked).child(header)
      .child(v_flex().id("boss-calls").flex_1().min_h(0).px(18).pb(10).gap(10).overflow_y_scrollbar().children(rows)
        .when(!blocked.length, el => el.child(h_flex().gap(14).items_center().py(16)
          .child(svg(ASSET + "phone.svg").size(30).text_color(theme().dim))
          .child(v_flex().gap(5).child(label("The line is quiet.", 17, theme().foreground))
            .child(label("Every request lands here, from every job and tab.", 11, theme().muted))))));
  }
  blueprint(job, x, y, width, height, entries, badges) {
    return div().id(`blueprint-sheet-${job.id}`).absolute().left(x).top(y).w(width).h(height).overflow_hidden()
      .bg("#243e49").border(1).border_color("#7a999d")
      .child(image(ASSET + "blueprint.svg").absolute().left(6).top(6).w(width - 12).h(height - 12))
      .child(v_flex().absolute().left(14).right(14).top(13).gap(4)
        .child(h_flex().gap(8).items_center().child(dot("#c3a05c", 8))
          .child(label(job.name.toUpperCase(), 17, CHALK).truncate().font_semibold()))
        .when(Boolean(job.branch), el => el.child(label(job.branch, 10, "#9bb4b6").truncate())))
      .children(badges.map(({ tab, y: ty, extra }) => h_flex().id(`tab-${tab.id}`).absolute().left(13).right(13).top(ty)
        .h(25).px(8).gap(6).bg(PAPER).cursor_pointer().tooltip(`${job.name} / ${tab.name}${tab.settled ? ' (settled)' : ''}`)
        .on_click(() => selectTab(job.id, tab.id))
        .child(dot(tab.active ? "#ad863c" : "#918e7c", 6))
        .child(label(tab.name, 11, INK).flex_1().min_w(0).truncate())
        .when(tab.settled, el => el.child(label("FILED", 10, "#756b57")))
        .when(extra > 0, el => el.child(button(`expand-${tab.id}`, `+${extra}`, (_e, cx) => { this.expanded[tab.id] = true; cx.notify(); }, true)))))
      .children(entries.map(({ a, x: ax, y: ay, width: aw, captionWidth, compactPin }) => {
        if (a.status !== "blocked") return this.card(a, ax, ay, aw, captionWidth);
        if (compactPin) return h_flex().absolute().left(ax).top(ay).w(captionWidth).h(22).gap(5).items_center()
          .child(dot(theme().blocked, 8)).child(label(`${a.address} AT DESK`, 10, CHALK).truncate());
        return v_flex().absolute().left(ax).top(ay).w(captionWidth).h(CARD_HEIGHT(aw)).items_center().gap(10).pt(7)
          .child(dot(theme().blocked, 8)).child(label(a.address, 10, CHALK).truncate())
          .child(label("AT THE DESK", 10, "#b4bdb0"));
      }));
  }
  wall(list, cx) {
    this.rememberLive(list);
    const missing = missingCrew(this.history, list, terminals());
    const all = [...list, ...missing], blocked = list.filter(a => a.status === "blocked");
    setAgentOrder([...blocked, ...list.filter(a => a.status !== "blocked")].map(a => a.address));
    const width = Math.max(280, this.size.width), height = Math.max(320, this.size.height);
    const compact = width < 500;
    const columns = width >= 760 ? 2 : 1;
    const requestHeight = compact ? 94 : 112;
    const deskHeight = Math.min(height - 155, Math.max(blocked.length ? 190 : 156, 70 + Math.ceil(blocked.length / columns) * (requestHeight + 10)));
    const deskY = height - deskHeight;
    const sceneHeight = deskY - 56;
    const folded = compact || this.folded || sceneHeight < 200;
    const traveling = !folded && Math.ceil(blocked.length / columns) * 122 + 58 <= deskHeight;
    const jobs = groupJobs(spaces(), all);
    const root = div().id("crew-wall-root").relative().size_full().overflow_hidden()
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .child(h_flex().absolute().top(0).left(0).right(0).h(52).px(17).gap(10).items_center()
        .child(label("THE JOBS", 11, PAPER).font_semibold()).child(label(`${jobs.length} PINNED`, 10, PAPER))
        .child(div().flex_1())
        .when(!compact, el => el.child(button("fold-wall", this.folded ? "UNFOLD WALL" : "FOLD WALL", (_e, cx) => { this.folded = !this.folded; this.page = 0; cx.notify(); }))))
      .child(this.desk(blocked, deskY, deskHeight, width, traveling));
    if (folded) {
      const foldedJobs = jobs.map(job => {
        const tabs = job.tabs.map(tab => v_flex().gap(3)
          .child(button(`folded-${tab.id}`, `${tab.name} (${tab.crew.length})`, () => selectTab(job.id, tab.id), true))
          .children(tab.crew.filter(a => a.status !== "blocked").map(a => this.compactRow(a))));
        return v_flex().gap(3).flex_none().child(label(job.name, 12, PAPER).font_semibold()).children(tabs);
      });
      root.child(v_flex().id("folded-jobs").absolute().top(52).left(16).right(16).h(Math.max(40, sceneHeight - 10))
        .gap(6).overflow_y_scrollbar().children(foldedJobs));
      return root;
    }
    const pageHeight = Math.max(120, sceneHeight - 35);
    const { sheets, totalHeight } = planSheets(jobs, width, pageHeight, this.expanded);
    // Overlap by a full card so a photo crossing a page edge is whole on the next page.
    const pageStep = Math.max(40, pageHeight - 160);
    const pages = 1 + Math.ceil(Math.max(0, totalHeight - pageHeight) / pageStep);
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const offset = this.page * pageStep;
    const scene = div().id("blueprints").absolute().top(52).left(0).w(width).h(pageHeight).overflow_hidden()
      .on_scroll_wheel((event, cx) => {
        this.wheelDistance += event.delta.y;
        if (Math.abs(this.wheelDistance) < 100) return;
        this.page = Math.max(0, Math.min(pages - 1, this.page + (this.wheelDistance < 0 ? 1 : -1)));
        this.wheelDistance = 0; cx.notify();
      });
    for (const sheet of sheets) scene.child(this.blueprint(sheet.job, sheet.x, sheet.y - offset, sheet.width, sheet.height, sheet.entries, sheet.badges));
    root.child(scene);
    // Paths only join visible anchors to non-scrolling desk photos.
    for (const sheet of sheets) for (const entry of sheet.entries) {
      if (entry.a.status !== "blocked" || !traveling) continue;
      const anchorY = 52 + sheet.y - offset + entry.y + 11;
      if (anchorY < 60 || anchorY > 52 + pageHeight - 14) continue;
      const target = blocked.findIndex(a => a.address === entry.a.address);
      const startX = sheet.x + entry.x + (entry.compactPin ? 4 : entry.captionWidth / 2);
      const route = deskStringRoute(startX, anchorY, target, columns, width, deskY);
      const path = PathBuilder.stroke(1.5).move_to(...route[0]);
      for (const point of route.slice(1)) path.line_to(...point);
      root.child(window.paint_path(path.build(), theme().blocked).absolute().left(0).top(0).w(width).h(height));
    }
    for (const sheet of sheets) for (const entry of sheet.entries) {
      if (entry.a.status === "blocked") continue;
      const y = 52 + sheet.y - offset + entry.y, h = PHOTO_HEIGHT(entry.width);
      if (y < 52 || y + h > 52 + pageHeight) continue;
      root.child(this.travelingPhoto(entry.a, sheet.x + entry.x, y, entry.width, h));
    }
    if (traveling) blocked.forEach((a, index) => root.child(this.travelingPhoto(a,
      28 + (index % columns) * ((width - 26) / columns),
      deskY + 56 + Math.floor(index / columns) * 122, 60, 76, true)));
    root.child(h_flex().absolute().left(17).right(17).top(deskY - 32).h(26).gap(8).items_center()
      .child(label(missing.some(a => a.status === "unavailable") ? this.checkLabel : "PINNED ACROSS EVERY SPACE", 10, PAPER)).child(div().flex_1())
      .when(pages > 1, el => el.child(button("page-up", "<", (_e, cx) => { this.page = Math.max(0, this.page - 1); cx.notify(); }))
        .child(label(`${this.page + 1}/${pages}`, 10, PAPER))
        .child(button("page-down", ">", (_e, cx) => { this.page = Math.min(pages - 1, this.page + 1); cx.notify(); }))));
    return root;
  }
  render(cx) {
    const role = props()?.role ?? "wall";
    if (role === "topbar") return this.topbar(liveCrew());
    if (role === "header") return this.header();
    if (role === "burn") return v_flex().p(12).gap(10).bg(theme().surface)
      .child(label(props().title || props().address || "No remembered card selected", 12, theme().foreground)
        .truncate().tooltip(props().title || props().address || "No remembered card selected"))
      .when(Boolean(props().address), el => el
        .child(label("Remove this remembered exit card.", 10, theme().muted))
        .child(button("burn-card", "BURN IT", () => { setShared("crew-board.burn", { address: props().address, at: Date.now() }); closeOverlay(props().overlay); })));
    return this.wall(liveCrew(), cx);
  }
}
