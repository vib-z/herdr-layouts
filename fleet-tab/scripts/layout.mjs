import { S, TYPE } from "../mods/fleet-tab/spacing.js";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const mod = role => ({ mod: "fleet-tab", props: { role } });
export function layoutSpec() {
  return {
    id: "fleet-tab-root", type: "column", titlebar: "none", traffic_lights: [S.trafficX, S.trafficY],
    theme: "fleet-tab", font: "Geist Mono", font_size: TYPE.body, ui_font: "Geist Mono",
    terminal_padding: [S.inset, S.gutter], background: "canvas", resizable: false,
    children: [
      { id: "fleet-tab-topbar", type: "block", size: { px: S.topbar }, window_drag: true, content: mod("topbar") },
      { id: "fleet-tab-body", type: "row", resizable: false, divider: { width: S.stroke, color: "border" }, children: [
        { id: "sidebar", type: "block", size: { px: S.sidebar }, min: S.sidebarNarrow, content: mod("sidebar") },
        { id: "fleet-tab-work", type: "column", resizable: false, children: [
          { id: "fleet-tab-tabs", type: "block", size: { px: S.tabbar }, content: mod("tabs") },
          { id: "fleet-tab-live", type: "block", padding: [S.none, S.gutter], content: { tab: "active", pane: {
            gap: S.inset, radius: S.none, background: "background", lone: true,
            border: { width: S.stroke, color: "border" }, focus: { width: S.stroke, color: "accent" },
            header: { content: mod("pane"), height: S.paneHeader, position: "top", reveal: "always" }
          } } }
        ] }
      ] },
      { id: "fleet-tab-status", type: "block", size: { px: S.statusbar }, content: mod("status") }
    ]
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await writeFile(new URL("../layouts/fleet-tab.json", import.meta.url), JSON.stringify(layoutSpec(), null, 2) + "\n");
