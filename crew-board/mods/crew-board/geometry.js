// Sheet geometry is shared by rendering and offline fit checks.
export const PHOTO_HEIGHT = width => width < 80 ? 79 : 103;
export const CARD_HEIGHT = width => PHOTO_HEIGHT(width) + 45;

export function deskCardBounds(index, columns, width, deskY) {
  const cardWidth = (width - 36 - (columns - 1) * 10) / columns;
  return { left: 18 + (index % columns) * (cardWidth + 10),
    top: deskY + 48 + Math.floor(index / columns) * 122, width: cardWidth, height: 112 };
}

export function deskStringRoute(startX, startY, index, columns, width, deskY) {
  const card = deskCardBounds(index, columns, width, deskY);
  const laneX = card.left - 6, targetX = card.left + 40;
  // Descend in the margin, then turn through the row gap to the target's top edge.
  return [[startX, startY], [startX + 12, startY + 12], [laneX, deskY - 10],
    [laneX, card.top - 4], [targetX, card.top - 4], [targetX, card.top]];
}

export function planSheets(jobs, width, pageHeight, expanded = {}) {
  const columns = Math.min(3, Math.max(1, Math.floor((width - 32) / 270)));
  const sheetWidth = (width - 32 - (columns - 1) * 14) / columns;
  function arrange(forceSmall) {
    const sheets = [];
    let rowY = 0;
    for (let i = 0; i < jobs.length; i += columns) {
      const row = jobs.slice(i, i + columns).map((job, col) => {
        const count = job.tabs.reduce((n, tab) => n + tab.crew.length, 0);
        const small = forceSmall || count > 8;
        const photoWidth = small ? 64 : 92, gap = small ? 4 : 8;
        const perRow = Math.max(1, Math.min(3, Math.floor((sheetWidth - 30 + gap) / (photoWidth + gap))));
        const captionWidth = (sheetWidth - 30 - (perRow - 1) * gap) / perRow;
        const stride = CARD_HEIGHT(photoWidth) + 4;
        let y = job.branch ? 58 : 40;
        const entries = [], badges = [];
        for (const tab of job.tabs) {
          const shown = expanded[tab.id] ? tab.crew : tab.crew.slice(0, 8);
          badges.push({ tab, y, extra: tab.crew.length - shown.length });
          y += 29;
          // A request leaves a pin, not an empty photo-sized row, in the compact sheet.
          const photos = small ? shown.filter(a => a.status !== "blocked") : shown;
          photos.forEach((a, index) => entries.push({ a, x: 15 + (index % perRow) * (captionWidth + gap),
            y: y + Math.floor(index / perRow) * stride, width: photoWidth, captionWidth, compactPin: false }));
          const photoRows = Math.ceil(photos.length / perRow);
          y += photoRows ? photoRows * stride - 4 : 0;
          if (small) {
            const pins = shown.filter(a => a.status === "blocked");
            pins.forEach((a, index) => entries.push({ a, x: 15 + (index % perRow) * (captionWidth + gap),
              y: y + Math.floor(index / perRow) * 22, width: photoWidth, captionWidth, compactPin: true }));
            y += Math.ceil(pins.length / perRow) * 22;
          }
          y += 4;
        }
        return { job, x: 16 + col * (sheetWidth + 14), y: rowY, width: sheetWidth,
          height: y + 8, entries, badges, small };
      });
      sheets.push(...row);
      rowY += Math.max(0, ...row.map(sheet => sheet.height));
      if (i + columns < jobs.length) rowY += 16;
    }
    return { sheets, totalHeight: rowY, compact: forceSmall };
  }
  const full = arrange(false);
  return full.totalHeight <= pageHeight ? full : arrange(true);
}
