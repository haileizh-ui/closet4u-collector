/* Presentation only: persisted jobs remain untouched. */
const CollectionHistoryUI = (() => {
  function ordered(rows) {
    const unique = new Map();
    for (const row of rows) {
      const previous = unique.get(row.id);
      if (!previous || Number(row.updatedAt || 0) >= Number(previous.updatedAt || 0)) unique.set(row.id, row);
    }
    return [...unique.values()].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  }
  function render(container, rows, makeRow, {open = false, onToggle = () => {}} = {}) {
    const sorted = ordered(rows);
    for (const row of sorted.slice(0, 5)) container.append(makeRow(row));
    if (sorted.length <= 5) return;
    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
    summary.textContent = `历史记录（${sorted.length - 5}）`; summary.style.cssText = 'cursor:pointer;padding:10px 0';
    details.append(summary, body); details.open = open;
    let drawn = false;
    function draw() { if (!details.open || drawn) return; drawn = true; for (const row of sorted.slice(5)) body.append(makeRow(row)); }
    details.addEventListener('toggle', () => { if (!details.isConnected) return; draw(); onToggle(details.open); });
    draw(); container.append(details);
  }
  return {ordered, render};
})();
if (typeof module !== 'undefined') module.exports = CollectionHistoryUI;
