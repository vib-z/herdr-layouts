import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S, TYPE, rowHeight, rowsHeight, pinnedReservation, headerHeight, titleInset } from "../mods/fleet-tab/spacing.js";
import { layoutSpec } from "../scripts/layout.mjs";
import { runtime, find, nodes, textOf } from "./runtime.mjs";

test("all UI spacing uses named tokens and the shipped layout matches their generated values", async () => {
  for (const [name, value] of Object.entries(S)) {
    if (["stroke", "nudge", "tabRadius", "attentionShare"].includes(name)) continue;
    assert.equal(value % S.unit, 0, name);
  }
  const main = await readFile(new URL("../mods/fleet-tab/main.js", import.meta.url), "utf8");
  const lengths = /\.(h|w|p|px|py|pt|pb|pl|pr|gap|min_w|max_w|min_h|max_h|size|rounded|border|line_height|text_size)\(([^)]*)\)/g;
  for (const match of main.matchAll(lengths)) assert.ok(!/\d/.test(match[2]), `Literal dimension: ${match[0]}`);
  assert.deepEqual(JSON.parse(await readFile(new URL("../layouts/fleet-tab.json", import.meta.url))), layoutSpec());
  assert.deepEqual(Object.values(TYPE), [11, 13, 14]);
});

test("rendered row heights equal their line boxes, padding, borders and gaps", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar");
  for (const minimal of [false, true]) for (const group of ["status", "host", "project"]) {
    rt.store.set("fleet-tab.minimal", minimal); rt.store.set("fleet-tab.group", group);
    const tree = sidebar.render();
    for (const row of nodes(tree).filter(n => n.idValue?.startsWith("fleet-row-"))) {
      const border = row.style.border[0], pad = row.style.py[0], gap = row.style.gap[0];
      const content = row.kids.reduce((height, child) => height + child.style.h[0], 0);
      assert.equal(row.style.h[0], content + (pad + border) * 2 + gap * (row.kids.length - 1), row.idValue);
      const title = row.kids[0], elapsed = title.kids.at(-1);
      assert.equal(title.style.h[0], S.line); assert.equal(title.style.gap[0], S.gap);
      assert.equal(elapsed.style.w[0], S.elapsed); assert.ok(elapsed.style.text_right);
      for (const text of nodes(row).filter(n => n.style.text_size)) assert.equal(text.style.line_height[0], `${S.line}px`);
      if (minimal) {
        assert.equal(border, S.none);
        assert.equal(row.kids[1].style.pl[0], titleInset);
        assert.ok([rowHeight(true), rowHeight(true, true)].includes(row.style.h[0]));
      }
    }
    if (minimal) assert.ok(textOf(find(tree, "fleet-row-t1")).includes("api / build · progress 26%"));
  }
  assert.equal(headerHeight, S.headerTop + S.line + S.headerBottom);
  assert.ok(S.headerTop > S.headerBottom);
});

test("pinned reservation fits all three blockers and clips no resting row at target window sizes", () => {
  for (const [width, height] of [[1000, 700], [1512, 882], [1600, 900]]) {
    const body = height - S.topbar - S.statusbar;
    for (const minimal of [true, false]) {
      assert.equal(pinnedReservation(0, minimal, body), 0);
      assert.equal(pinnedReservation(3, minimal, body), rowsHeight(3, minimal, true), `${width}x${height}`);
      assert.ok(rowsHeight(3, minimal, true) < body * S.attentionShare);
      const overflow = pinnedReservation(30, minimal, body);
      assert.ok(Array.from({ length: 30 }, (_, i) => rowsHeight(i + 1, minimal, true)).includes(overflow));
    }
  }
});

test("workspace gutters and short controls use the same scale as sidebar content", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar").render();
  assert.equal(sidebar.style.p[0], S.inset);
  const input = nodes(sidebar).find(n => n.kind === "input");
  assert.equal(input.style.h[0], S.control); assert.equal(input.style.line_height[0], `${S.line}px`);
  assert.equal(input.style.px[0] + input.style.border[0], S.inset);
  assert.equal(find(sidebar, "fleet-minimal").style.h[0], S.control);
  for (const role of ["tabs", "pane", "status"]) assert.equal(rt.create(role).render().style.px[0], S.gutter);
  const live = layoutSpec().children[1].children[1].children[1];
  assert.equal(live.padding[1], S.gutter);
});

test("Cards chips hug content and all Cards metadata is flush while Minimal stays title-aligned", async () => {
  const rt = await runtime(), sidebar = rt.create("sidebar");
  const cards = sidebar.render();
  for (const row of nodes(cards).filter(n => n.idValue?.startsWith("fleet-row-"))) {
    for (const metadata of row.kids.slice(1)) assert.equal(metadata.style.pl?.[0] ?? S.none, S.none);
  }
  const chips = find(cards, "fleet-row-t1").kids[1].kids;
  assert.equal(chips.length, 3);
  for (const chip of chips) {
    assert.ok(chip.style.flex_shrink_1); assert.equal(chip.style.flex_1, undefined);
    assert.equal(chip.style.min_w[0], S.none); assert.ok(chip.style.truncate);
  }
  rt.store.set("fleet-tab.minimal", true);
  for (const row of nodes(sidebar.render()).filter(n => n.idValue?.startsWith("fleet-row-")))
    for (const metadata of row.kids.slice(1)) assert.equal(metadata.style.pl[0], titleInset);
});
