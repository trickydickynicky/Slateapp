/* Draws the lineups table to a PNG and shares it (share sheet on phones, download elsewhere). */

const W = 800;
const PAD = 24;
const NAME_W = 304;
const COL_W = 56;
const ROW_H = 50;
const LABELS = ['MIN', 'PTS', 'OPP', '+/-', 'POSS', 'OFF', 'DEF', 'NET'];
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const HEAD = 'Rajdhani, system-ui, sans-serif';

const colorOf = cls =>
  cls.includes('text-green') ? '#4ade80'
    : cls.includes('text-red') ? '#f87171'
    : cls.includes('text-gray') ? '#9ca3af'
    : '#e5e7eb';

let logoP = null;
const loadLogo = () => {
  if (!logoP) {
    logoP = new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = '/slate-logo.png';
      setTimeout(() => res(null), 2500);
    });
  }
  return logoP;
};
/** Call once on mount so the logo is ready when the button is tapped (phones need the share to start quickly). */
export const warmLineupImage = () => { loadLogo(); };

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text.replace(/…$/, '');
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(ctx, text, maxW, maxLines) {
  const out = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(t).width <= maxW) cur = t;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > maxLines) {
    const keep = out.slice(0, maxLines);
    keep[maxLines - 1] = fit(ctx, `${keep[maxLines - 1]}…`, maxW);
    return keep;
  }
  return out;
}

/**
 * rows: [{ name, cells: [{ t, c }] }]  (cells = the same objects the on-screen table uses)
 * combined: cells for the Combined row, or null
 */
export async function renderLineupsImage({ title, subtitle, countText, rows, combined }) {
  try { await document.fonts?.ready; } catch (e) { /* fonts are optional */ }
  const logo = await loadLogo();

  // measure wrapped names first so the image height is known
  const m = document.createElement('canvas').getContext('2d');
  m.font = `600 14px ${FONT}`;
  const lines = rows.map(r => wrap(m, r.name, NAME_W - 12, 2));

  const HEAD_H = 150;
  const FOOT_H = 64;
  const H = HEAD_H + rows.length * ROW_H + (combined ? ROW_H : 0) + FOOT_H;
  const scale = Math.min(2, Math.floor(Math.sqrt(15e6 / (W * H)) * 100) / 100);   // stay under mobile canvas limits

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // brand + date
  if (logo) {
    const h = 26;
    ctx.drawImage(logo, PAD, 22, (logo.width / logo.height) * h, h);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `800 20px ${HEAD}`;
    ctx.fillText('SLATE', PAD, 42);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6b7280';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W - PAD, 40);
  ctx.textAlign = 'left';

  // title block
  ctx.fillStyle = '#fff';
  ctx.font = `800 30px ${HEAD}`;
  ctx.fillText(title, PAD, 86);
  ctx.fillStyle = '#d4d4d8';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(fit(ctx, subtitle, W - PAD * 2), PAD, 108);
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText(countText, PAD, 126);

  // column headers
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText('LINEUP', PAD, HEAD_H - 6);
  ctx.textAlign = 'center';
  LABELS.forEach((l, k) => ctx.fillText(l, PAD + NAME_W + k * COL_W + COL_W / 2, HEAD_H - 6));
  ctx.textAlign = 'left';

  const drawCells = (y, cells) => {
    ctx.textAlign = 'center';
    cells.forEach((c, k) => {
      ctx.fillStyle = colorOf(c.c);
      ctx.font = `${c.c.includes('font-bold') ? 800 : 600} 14px ${FONT}`;
      ctx.fillText(c.t, PAD + NAME_W + k * COL_W + COL_W / 2, y + ROW_H / 2 + 5);
    });
    ctx.textAlign = 'left';
  };

  rows.forEach((r, i) => {
    const y = HEAD_H + i * ROW_H;
    ctx.fillStyle = '#27272a';
    ctx.fillRect(PAD, y, W - PAD * 2, 1);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = `600 14px ${FONT}`;
    const top = y + (ROW_H - lines[i].length * 18) / 2 + 13;
    lines[i].forEach((ln, k) => ctx.fillText(ln, PAD, top + k * 18));
    drawCells(y, r.cells);
  });

  let y = HEAD_H + rows.length * ROW_H;
  if (combined) {
    ctx.fillStyle = '#52525b';
    ctx.fillRect(PAD, y, W - PAD * 2, 1);
    ctx.fillStyle = '#9ca3af';
    ctx.font = `800 14px ${FONT}`;
    ctx.fillText('Combined', PAD, y + ROW_H / 2 + 5);
    drawCells(y, combined);
    y += ROW_H;
  }

  // footer
  ctx.fillStyle = '#27272a';
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 11px ${FONT}`;
  ctx.fillText('OFF / DEF / NET are points scored / allowed / net per 100 possessions.', PAD, y + 24);
  ctx.fillText('Possessions estimated from ESPN play-by-play.', PAD, y + 42);

  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not create image'))), 'image/png'));
}

/** Share sheet where files are supported (iPhone/Android), otherwise a download. */
export async function shareImage(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';   // user closed the sheet
      /* anything else: fall through to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}