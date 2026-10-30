import { writeFile } from "node:fs/promises";
import { CELL, FONT, ROW, STATUS, collectRows, sortRows, missingRows, gridSpec, panelSlices, truncate, elapsed } from "../mods/control-panel/model.js";
import frames from "../mods/control-panel/frames.js";
import * as demo from "../tests/fixtures.mjs";

const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
for (const [width, height, filename] of [[1600, 900, "preview.svg"], [1000, 700, "preview-compact.svg"]]) {
  const body = [], grid = gridSpec(width);
  const rect = (x, y, w, h, fill) => body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  const text = (x, y, value, fill = "#e4e4e4", right = false) => body.push(`<text x="${x}" y="${y}" fill="${fill}"${right ? ' text-anchor="end"' : ""}>${escape(value)}</text>`);
  rect(0, 0, width, height, "#191919"); rect(0, 0, width, 48, "#202020");
  text(88, 29, "CONTROL PANEL"); text(216, 29, "09 agents / 03 spaces", "#adadad");
  text(width - 320, 29, "03 need you", "#df9d89"); text(width - 208, 29, "Motion off", "#adadad"); text(width - 88, 29, "Command", "#adadad");
  let x = 24;
  ["STATE", "ADDRESS", "TASK", "SPACE / TAB", "ELAPSED", "LAST LINE"].forEach((label, i) => {
    text(i === 4 ? x + grid.columns[i] * CELL : x, 65, label, "#888888", i === 4);
    x += grid.columns[i] * CELL + grid.gap;
  });
  const live = collectRows(demo.agents, demo.terminals, demo.spaces);
  const rows = sortRows([...live, ...missingRows(demo.history, live, demo.terminals)], demo.spaces);
  const slices = panelSlices(rows, 432);
  let y = 76;
  for (const [name, slice] of [["blocked", slices.blocked], ["rest", slices.rest]]) {
    text(24, y + 21, name === "blocked" ? "NEEDS YOU" : "AGENTS", name === "blocked" ? "#df9d89" : "#adadad");
    text(name === "blocked" ? 112 : 88, y + 21, name === "blocked" ? "pinned across every space" : "all spaces, all tabs", "#888888");
    text(width - 24, y + 21, `1:${slice.rows.length} / ${slice.total}`, "#888888", true);
    y += 32;
    for (const row of slice.rows) {
      const tint = row.status === "blocked" ? "#df9d89" : ["working", "done"].includes(row.status) ? "#abc4b5" : "#888888";
      if (row.focused) rect(0, y, width, ROW, "#2d2d2d");
      x = 24;
      const values = [`${frames[row.status].still} ${STATUS[row.status]}`, row.address, row.title, `${row.space_name} / ${row.tab_name}`,
        elapsed(row.status_ms, demo.now), row.status === "dead" ? "exited (code 0)" : demo.lines[row.address]];
      values.forEach((value, i) => {
        text(i === 4 ? x + grid.columns[i] * CELL : x, y + 19, truncate(value, grid.columns[i]),
          i === 0 ? tint : i === 1 && row.focused ? "#abc4b5" : i === 2 ? "#e4e4e4" : i === 5 ? "#888888" : "#adadad", i === 4);
        x += grid.columns[i] * CELL + grid.gap;
      });
      y += ROW;
    }
  }
  text(24, 471, "Select a row to focus. Scroll each list to browse.", "#888888"); text(width - 24, 471, "screen reads every 5s", "#888888", true);
  rect(0, 480, width, 40, "#202020"); text(24, 505, "TERMINAL", "#adadad"); text(112, 505, "api / token cache"); text(width - 112, 505, "Browse tabs", "#adadad");
  rect(0, 520, width, height - 520, "#151515"); rect(0, 520, width, 28, "#202020");
  text(16, 539, "t1", "#abc4b5"); text(48, 539, "refresh token cache", "#adadad"); text(width - 24, 539, "working", "#abc4b5", true);
  ["[demo] refreshing token cache", "[demo] scanning fixtures", "[demo] validation batch ready"].forEach((line, i) => text(24, 581 + i * 20, line));
  text(width - 24, height - 16, "SCHEMATIC / OFFLINE", "#888888", true);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>Control Panel, offline schematic using demo data</title><g font-family="JetBrains Mono, monospace" font-size="${FONT}">${body.join("")}</g></svg>\n`;
  await writeFile(new URL(`../mods/control-panel/${filename}`, import.meta.url), svg);
}
console.log("Wrote labelled offline schematics at 1600x900 and 1000x700.");
