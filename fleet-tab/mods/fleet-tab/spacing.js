// One logical-pixel scale. Border strokes do not participate in layout rhythm.
const UNIT = 4;
export const S = Object.freeze({
  none: 0, stroke: 1, nudge: UNIT / 2, unit: UNIT,
  gap: UNIT, inset: UNIT * 2, gutter: UNIT * 3, line: UNIT * 4,
  state: UNIT * 3, icon: UNIT * 4, elapsed: UNIT * 8,
  minimalPad: UNIT, cardInset: UNIT * 2,
  minimalRadius: UNIT, cardRadius: UNIT * 2, pillRadius: UNIT * 4, tabRadius: UNIT + UNIT / 2,
  headerTop: UNIT * 2, headerBottom: UNIT,
  control: UNIT * 7, chip: UNIT * 5,
  topbar: UNIT * 11, tabbar: UNIT * 11, paneHeader: UNIT * 8, statusbar: UNIT * 7,
  topbarInset: UNIT * 4, statusGap: UNIT * 4, popupInset: UNIT * 4, menuRow: UNIT * 8,
  sidebar: UNIT * 96, sidebarNarrow: UNIT * 80, breakpoint: UNIT * 300,
  initialHeight: UNIT * 157, tabMax: UNIT * 55, macInset: UNIT * 22,
  trafficX: UNIT * 5, trafficY: UNIT * 4,
  groupWidth: UNIT * 55, groupHeight: UNIT * 46,
  activityWidth: UNIT * 70, activityHeight: UNIT * 68,
  spacesWidth: UNIT * 95, spacesHeight: UNIT * 100,
  attentionShare: 0.48
});
export const TYPE = Object.freeze({ meta: 11, body: 13, title: 14 });
export const px = value => `${value}px`;
export const titleInset = S.state + S.icon + S.gap * 2;
export const headerHeight = S.headerTop + S.line + S.headerBottom;
export const rowGap = minimal => minimal ? S.none : S.gap;
export function rowHeight(minimal, pinned = false, detail = false) {
  if (minimal) return S.minimalPad * 2 + S.line * (pinned ? 3 : 2);
  return S.cardInset * 2 + S.line + S.gap + (pinned ? S.line : S.chip) +
    (pinned || detail ? S.gap + S.line : S.none);
}
export const rowsHeight = (count, minimal, pinned = false) => count > 0
  ? count * rowHeight(minimal, pinned) + (count - 1) * rowGap(minimal) : S.none;
export function pinnedReservation(count, minimal, height) {
  const row = rowHeight(minimal, true), gap = rowGap(minimal);
  const capacity = Math.max(1, Math.floor((height * S.attentionShare + gap) / (row + gap)));
  return rowsHeight(Math.min(count, capacity), minimal, true);
}
