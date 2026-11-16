/* Draws the player comparison to a PNG, same look as the lineups image. Sharing reuses shareImage from lineupImage. */

const W = 800;
const PAD = 24;
const CX = W / 2;
const SEC_H = 38;
const ROW_H = 42;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const HEAD = 'Rajdhani, system-ui, sans-serif';

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
/** Call once on mount so the logo is ready when the button is tapped. */
export const warmComparisonImage = () => { loadLogo(); };

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text.replace(/…$/, '');
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

// very dark team colors (BKN, MIN, NO...) vanish on black, so fall back to gray
const visible = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#6b7280';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 45 ? '#6b7280' : hex;
};

/**
 * left / right: { name, team, season, color }
 * groups: [{ label, rows: [{ label, lv, rv, inverse?, isPercent? }] }]  (same shape as statGroups in PlayerComparison)
 */
const loadImg = url => new Promise(res => {
  if (!url) return res(null);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = url;
  setTimeout(() => res(null), 4000);
});
const loadPlayerImg = async p =>
  (await loadImg(p.headshot)) || (await loadImg(p.team ? `https://a.espncdn.com/i/teamlogos/nba/500/${p.team}.png` : null));

export async function renderComparisonImage({ left, right, groups }) {
  try { await document.fonts?.ready; } catch (e) { /* fonts are optional */ }
  const logo = await loadLogo();
  const [leftImg, rightImg] = await Promise.all([loadPlayerImg(left), loadPlayerImg(right)]);

  const HEAD_H = 214;
  const FOOT_H = 64;
  const nRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const H = HEAD_H + groups.length * SEC_H + nRows * ROW_H + FOOT_H;
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
  ctx.fillText('Player Comparison', PAD, 86);
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText('Per-game averages', PAD, 106);

  // player headers: color bar + name + team/season, mirrored on the right
  const headY = 128;
  const sideW = CX - PAD - 36 - 66;
  const drawPlayer = (p, isLeft, img) => {
    const color = visible(p.color);
    const barX = isLeft ? PAD : W - PAD - 4;
    ctx.fillStyle = color;
    ctx.fillRect(barX, headY, 4, 54);
    const S = 54;
    const ix = isLeft ? PAD + 14 : W - PAD - 14 - S;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ix + S / 2, headY + S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#18181b';
    ctx.fillRect(ix, headY, S, S);
    if (img) {
      const r = Math.max(S / img.width, S / img.height);
      const w = img.width * r, h = img.height * r;
      ctx.drawImage(img, ix + (S - w) / 2, headY + (S - h) / 4, w, h);
    }
    ctx.restore();
    ctx.textAlign = isLeft ? 'left' : 'right';
    const x = isLeft ? PAD + 80 : W - PAD - 80;
    ctx.fillStyle = '#fff';
    ctx.font = `800 24px ${HEAD}`;
    ctx.fillText(fit(ctx, p.name || '', sideW - 16), x, headY + 24);
    ctx.fillStyle = '#9ca3af';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText([p.team, p.season].filter(Boolean).join('   ·   '), x, headY + 46);
    ctx.textAlign = 'left';
  };
  drawPlayer(left, true, leftImg);
  drawPlayer(right, false, rightImg);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b7280';
  ctx.font = `800 12px ${HEAD}`;
  ctx.fillText('VS', CX, headY + 33);
  ctx.textAlign = 'left';

  // stat groups
  const fmt = (v, pct) => (pct ? `${v}%` : String(v));
  let y = HEAD_H;
  groups.forEach(g => {
    // section divider: line, label, line
    ctx.font = `700 10px ${FONT}`;
    const lw = ctx.measureText(g.label).width;
    const ly = y + SEC_H / 2 + 6;
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(PAD, ly - 4, CX - PAD - lw / 2 - 12, 1);
    ctx.fillRect(CX + lw / 2 + 12, ly - 4, W - PAD - (CX + lw / 2 + 12), 1);
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText(g.label, CX, ly);
    ctx.textAlign = 'left';
    y += SEC_H;

    g.rows.forEach(r => {
      const lv = parseFloat(r.lv) || 0;
      const rv = parseFloat(r.rv) || 0;
      const tied = lv === rv;
      const lWin = !tied && (r.inverse ? lv < rv : lv > rv);
      const rWin = !tied && (r.inverse ? rv < lv : rv > lv);

      ctx.fillStyle = '#27272a';
      ctx.fillRect(PAD, y, W - PAD * 2, 1);

      const base = y + ROW_H / 2 + 7;
      ctx.font = `800 22px ${HEAD}`;
      const lt = fmt(lv, r.isPercent);
      const rt = fmt(rv, r.isPercent);

      ctx.textAlign = 'right';
      ctx.fillStyle = lWin ? '#fff' : '#6b7280';
      ctx.fillText(lt, CX - 48, base);
      if (lWin) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(CX - 48 - ctx.measureText(lt).width - 10, base - 7, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = rWin ? '#fff' : '#6b7280';
      ctx.fillText(rt, CX + 48, base);
      if (rWin) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(CX + 48 + ctx.measureText(rt).width + 10, base - 7, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#6b7280';
      ctx.font = `700 10px ${FONT}`;
      ctx.fillText(r.label, CX, base - 2);
      ctx.textAlign = 'left';

      y += ROW_H;
    });
  });

  // footer
  ctx.fillStyle = '#27272a';
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 11px ${FONT}`;


  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not create image'))), 'image/png'));
}