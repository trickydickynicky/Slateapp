import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Maximize2, X } from 'lucide-react';
import { toPng } from 'html-to-image';

/* ============================================================================
   Efficiency Landscape (Net Rating "Chart" view)

   <NetRatingChart rows={rows} filterGarbage={bool} onHaptic={trigger} />

   rows = the same team rows the Net Rating table shows ({ abbr, ortg, drtg, ... }).
   x = offensive rating (right is better), y = defensive rating flipped (up is better).
   Axes cross at the league average. The dashed diagonal is net rating = 0.
============================================================================ */

const ACCENT = '#2563eb';
const MUTED = '#6b7280';
const GOOD = '#60a5fa';
const BAD = '#f87171';
const heading = { fontFamily: 'Rajdhani, sans-serif' };

const logoUrl = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${String(abbr).toLowerCase()}.png`;

/* logos -> data URLs so the screenshot keeps them (same approach as TeamAdvanced) */
const logoCache = new Map();
const toDataUrl = async url => {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
};
function useLogos(abbrs) {
  const key = abbrs.join(',');
  const pick = () => Object.fromEntries(abbrs.filter(a => logoCache.has(a)).map(a => [a, logoCache.get(a)]));
  const [st, setSt] = useState({ map: pick(), done: abbrs.length > 0 && abbrs.every(a => logoCache.has(a)) });
  useEffect(() => {
    if (!abbrs.length) { setSt({ map: {}, done: false }); return undefined; }
    let dead = false;
    Promise.all(abbrs.map(async a => {
      if (logoCache.has(a)) return;
      try { logoCache.set(a, await toDataUrl(logoUrl(a))); } catch (e) { /* skip this logo */ }
    })).then(() => { if (!dead) setSt({ map: pick(), done: true }); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return st;
}

/* the Slate logo as a data URL, so it survives the screenshot */
function useSlateLogo() {
  const [st, setSt] = useState(() => ({ src: logoCache.get('__slate') || null, done: logoCache.has('__slate') }));
  useEffect(() => {
    if (st.done) return undefined;
    let dead = false;
    toDataUrl('/slate-logo.png')
      .then(u => { logoCache.set('__slate', u); if (!dead) setSt({ src: u, done: true }); })
      .catch(() => { if (!dead) setSt({ src: null, done: true }); });   // no logo is fine, just no logo
    return () => { dead = true; };
  }, [st.done]);
  return st;
}

const loadImg = src => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

/* Adds a black strip with the Slate logo above the captured card.
   Done after the capture, so the page itself never shows it. */
   async function addLogoBand(shot, logo, ratio) {
    if (!logo) return shot;
    try {
      const [card, mark] = await Promise.all([loadImg(shot), loadImg(logo)]);
      const cut = Math.round(17 * ratio);                    // inside the card's top padding, just below the rounded corners
      const h = Math.round(card.width * 0.0325);             // same logo size as the lineups image
      const band = h + Math.round(10 * ratio);               // room for the logo plus a small gap above the title
      const bw = Math.max(1, Math.round(ratio));             // the card's 1px border
      const c = document.createElement('canvas');
      c.width = card.width;
      c.height = card.height + band;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      // top edge of the card (border + rounded corners)
      ctx.drawImage(card, 0, 0, card.width, cut, 0, 0, card.width, cut);
      // keep the side borders running down through the new gap
      ctx.fillStyle = '#171717';
      ctx.fillRect(0, cut, bw, band);
      ctx.fillRect(card.width - bw, cut, bw, band);
      // logo, lined up with the title's left edge
      ctx.drawImage(mark, Math.round(17 * ratio), cut, (mark.width / mark.height) * h, h);
      // the rest of the card, pushed down
      ctx.drawImage(card, 0, cut, card.width, card.height - cut, 0, cut + band, card.width, card.height - cut);
      return c.toDataURL('image/png');
    } catch (e) {
      return shot;   // if anything goes wrong, share the plain card
    }
  }

/* camera: pre-render the card to a PNG, then share or download */
function useSnap(cardRef, name, ready, dep, haptic) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const render = async () => {
    const opts = { pixelRatio: 4, backgroundColor: '#000' };
    await toPng(cardRef.current, opts); // Safari drops images/fonts on the first pass
    const shot = await toPng(cardRef.current, opts);
    const url = await addLogoBand(shot, logoCache.get('__slate'), opts.pixelRatio);
    const blob = await (await fetch(url)).blob();
    return { url, file: new File([blob], `${name}.png`, { type: 'image/png' }) };
  };
  useEffect(() => {
    fileRef.current = null;
    if (!ready) return undefined;
    let dead = false;
    const id = setTimeout(() => {
      if (cardRef.current) render().then(r => { if (!dead) fileRef.current = r; }).catch(() => {});
    }, 600);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, name, dep]);
  const snap = async () => {
    if (!ready || busy || !cardRef.current) return;
    haptic('light');
    setBusy(true);
    try {
      const r = fileRef.current || await render();
      if (navigator.canShare && navigator.canShare({ files: [r.file] })) {
        await navigator.share({ files: [r.file] });
      } else {
        const a = document.createElement('a');
        a.href = r.url; a.download = r.file.name; a.click();
      }
    } catch (e) { /* share sheet dismissed or capture failed */ }
    setBusy(false);
  };
  return { snap, busy };
}

/* ────────────────────────────────────────────────────────────────────────────
   Data
──────────────────────────────────────────────────────────────────────────── */

function buildLandscape(rows) {
  const list = (rows || []).filter(r => r && Number.isFinite(r.ortg) && Number.isFinite(r.drtg));
  if (list.length < 3) return null;
  const n = list.length;
  const mx = list.reduce((s, r) => s + r.ortg, 0) / n;
  const my = list.reduce((s, r) => s + r.drtg, 0) / n;
  // same half-span on both axes so the net = 0 diagonal runs corner to corner
  const half = Math.max(
    ...list.map(r => Math.abs(r.ortg - mx)),
    ...list.map(r => Math.abs(r.drtg - my)),
  ) * 1.18 || 1;

  const rankMap = (fn, high) => {
    const m = {};
    [...list].sort((a, b) => (high ? fn(b) - fn(a) : fn(a) - fn(b))).forEach((r, i) => { m[r.abbr] = i + 1; });
    return m;
  };
  const rNet = rankMap(r => r.ortg - r.drtg, true);
  const rOff = rankMap(r => r.ortg, true);
  const rDef = rankMap(r => r.drtg, false);
  const top3 = Object.keys(rNet).filter(a => rNet[a] <= 3).sort((a, b) => rNet[a] - rNet[b]);

  // captions for the extremes
  const caps = {};
  const tag = (map, rank, label, color) => {
    const abbr = Object.keys(map).find(a => map[a] === rank);
    if (abbr) (caps[abbr] = caps[abbr] || []).push({ label, color });
  };
  tag(rNet, 1, 'BEST NET', GOOD); tag(rNet, n, 'WORST TEAM', BAD);
  tag(rOff, 1, 'BEST OFFENSE', GOOD); tag(rOff, n, 'WORST OFFENSE', BAD);
  tag(rDef, 1, 'BEST DEFENSE', GOOD); tag(rDef, n, 'WORST DEFENSE', BAD);

  return {
    list, n, mx, my, rNet, rOff, rDef, top3, caps,
    base: { x0: mx - half, x1: mx + half, y0: my - half, y1: my + half },
    sig: list.map(r => `${r.abbr}${Math.round(r.ortg * 10)}${Math.round(r.drtg * 10)}`).join('|'),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The chart (used inline and fullscreen)
──────────────────────────────────────────────────────────────────────────── */

const PL = 34, PR = 14, PT = 14, PB = 36;

function Landscape({ w, h, view, d, hl, onToggle, logos, R, fs, guard, svgRef, handlers }) {
  const [bad, setBad] = useState({});
  const pw = Math.max(w - PL - PR, 1);
  const ph = Math.max(h - PT - PB, 1);
  const sx = v => PL + ((v - view.x0) / (view.x1 - view.x0)) * pw;
  const sy = v => PT + ((v - view.y0) / (view.y1 - view.y0)) * ph;   // lower DRtg (better) sits higher
  const q = { fill: '#71717a', fontSize: 11, fontFamily: 'ui-monospace, monospace' };
  const cap = { fill: '#52525b', fontSize: fs ? 12 : 11, fontWeight: 700, letterSpacing: '0.16em', fontFamily: 'ui-monospace, monospace' };
  const clipId = `nl-plot-${fs ? 'fs' : 'in'}`;

  // net rating = 0 diagonal (DRtg = ORtg)
  const ax = sx(view.x0), ay = sy(view.x0), bx = sx(view.x1), by = sy(view.x1);
  const ang = Math.atan2(by - ay, bx - ax);
  const deg = (ang * 180) / Math.PI;
  const nx = Math.sin(ang), ny = -Math.cos(ang);   // points to the positive-net side (up and right)
  let tagAt = null;
  for (const t of [0.25, 0.75, 0.5]) {
    const xv = view.x0 + t * (view.x1 - view.x0);
    const px = sx(xv), py = sy(xv);
    if (py > PT + 30 && py < h - PB - 30 && px > PL + 50 && px < w - PR - 50) { tagAt = { px, py }; break; }
  }

  const isOn = a => hl.includes(a);
  const ordered = [...d.list].sort((a, b) => isOn(a.abbr) - isOn(b.abbr));
  const sideOf = p => (sx(p.ortg) < PL + pw * 0.62 ? 1 : -1);   // which side of the logo the text goes
  const strokeTxt = { stroke: '#000', strokeWidth: 3, paintOrder: 'stroke', style: { pointerEvents: 'none' } };
  // short arrow from a label back to its logo (s = 1: label on the right, -1: label on the left)
  const arrow = (cx, cy, s, color) => {
    const tip = cx + s * (R + 3);
    const head = tip + s * 6;
    const tail = cx + s * (R + 20);
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={tail} y1={cy} x2={head} y2={cy} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <polygon points={`${tip},${cy} ${head},${cy - 3.5} ${head},${cy + 3.5}`} fill={color} />
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      width={fs ? w : undefined}
      height={fs ? h : undefined}
      style={fs ? { display: 'block', touchAction: 'none' } : { width: '100%', height: 'auto', display: 'block' }}
      {...handlers}
    >
      <defs>
        <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* axes cross at the league average */}
        <line x1={sx(d.mx)} x2={sx(d.mx)} y1={PT} y2={h - PB} stroke="#3f3f46" strokeWidth="1.5" />
        <line x1={PL} x2={w - PR} y1={sy(d.my)} y2={sy(d.my)} stroke="#3f3f46" strokeWidth="1.5" />

        {/* net = 0 */}
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#52525b" strokeDasharray="5 5" strokeWidth="1.5" />
        {tagAt && (
          <>
            <text x={tagAt.px + nx * 11} y={tagAt.py + ny * 11} textAnchor="middle" dominantBaseline="central" transform={`rotate(${deg} ${tagAt.px + nx * 11} ${tagAt.py + ny * 11})`} {...q} fontSize={fs ? 12 : 11}>Positive teams</text>
            <text x={tagAt.px - nx * 11} y={tagAt.py - ny * 11} textAnchor="middle" dominantBaseline="central" transform={`rotate(${deg} ${tagAt.px - nx * 11} ${tagAt.py - ny * 11})`} {...q} fontSize={fs ? 12 : 11}>Negative teams</text>
          </>
        )}

        {/* teams */}
        {ordered.map(p => {
          const on = isOn(p.abbr);
          const cx = sx(p.ortg), cy = sy(p.drtg);
          if (cx < PL - R || cx > w - PR + R || cy < PT - R || cy > h - PB + R) return null;
          return (
            <g key={p.abbr} onClick={() => { if (!guard()) onToggle(p.abbr); }} style={{ cursor: 'pointer' }}>
              {on && <circle cx={cx} cy={cy} r={R + 3} fill="#0a0a0a" stroke={ACCENT} strokeWidth="2.5" />}
              <circle cx={cx} cy={cy} r={R + 4} fill="transparent" />
              {bad[p.abbr] ? (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={R * 0.8} fontWeight="800" fill="#a1a1aa" style={{ pointerEvents: 'none' }}>{p.abbr}</text>
              ) : (
                <image
                  href={logos[p.abbr] || logoUrl(p.abbr)} x={cx - R} y={cy - R} width={R * 2} height={R * 2}
                  preserveAspectRatio="xMidYMid meet"
                  onError={() => setBad(b => (b[p.abbr] ? b : { ...b, [p.abbr]: 1 }))}
                >
                  <title>{p.abbr}</title>
                </image>
              )}
            </g>
          );
        })}

        {/* captions on the extremes (teams that are not selected) */}
        {ordered.filter(p => !isOn(p.abbr) && d.caps[p.abbr]).map(p => {
          const cx = sx(p.ortg), cy = sy(p.drtg), s = sideOf(p);
          const c = d.caps[p.abbr];
          const words = [];
          c.forEach((line, gi) => line.label.split(' ').forEach(word => words.push({ word, color: line.color, gi })));
          const LH = fs ? 13 : 12;
          return (
            <g key={p.abbr}>
              {arrow(cx, cy, s, c[0].color)}
              {words.map((w2, i) => (
                <text
                  key={i}
                  x={cx + s * (R + 24)}
                  y={cy + (i - (words.length - 1) / 2) * LH + (w2.gi - (c.length - 1) / 2) * 5}
                  textAnchor={s > 0 ? 'start' : 'end'} dominantBaseline="central"
                  fontSize={fs ? 12 : 11} fontWeight="800" fill={w2.color} {...strokeTxt}
                >
                  {w2.word}
                </text>
              ))}
            </g>
          );
        })}

        {/* rank call-outs for selected teams */}
        {ordered.filter(p => isOn(p.abbr)).map(p => {
          const cx = sx(p.ortg), cy = sy(p.drtg), s = sideOf(p);
          const lines = [`#${d.rNet[p.abbr]} Net`, `#${d.rOff[p.abbr]} Offense`, `#${d.rDef[p.abbr]} Defense`];
          return (
            <g key={p.abbr}>
              {arrow(cx, cy, s, '#a1a1aa')}
              {lines.map((t, i) => (
                <text
                  key={i}
                  x={cx + s * (R + 24)} y={cy + (i - 1) * 13}
                  textAnchor={s > 0 ? 'start' : 'end'} dominantBaseline="central"
                  fontSize={fs ? 12 : 11} fontWeight={i === 0 ? 800 : 700} fill={i === 0 ? '#fff' : '#d4d4d8'} {...strokeTxt}
                >
                  {t}
                </text>
              ))}
            </g>
          );
        })}
      </g>

      {/* quadrant captions (fixed to the corners) */}
      <text x={w - PR - 8} y={PT + 18} textAnchor="end" {...cap}>THE PENTHOUSE</text>
      <text x={PL + 8} y={h - PB - 10} {...cap}>THE BASEMENT</text>
      <text x={PL + 8} y={PT + 18} {...cap} fillOpacity="0.7">DEFENSE ONLY</text>
      <text x={w - PR - 8} y={h - PB - 10} textAnchor="end" {...cap} fillOpacity="0.7">OFFENSE ONLY</text>

      <text x={(PL + w - PR) / 2} y={h - 10} textAnchor="middle" {...q}>Offensive efficiency (ORtg) →</text>
      <text x="12" y={(PT + h - PB) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PT + h - PB) / 2})`} {...q}>Defensive efficiency (DRtg, flipped) →</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Fullscreen: pinch / scroll to zoom, drag to pan, tap a team to call it out
──────────────────────────────────────────────────────────────────────────── */

function LandscapeFull({ d, hl, onToggle, onClose, logos, sub }) {
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const ptrs = useRef(new Map());
  const pinch = useRef(0);
  const travel = useRef(0);
  const moved = useRef(false);
  const [size, setSize] = useState({ w: 360, h: 600 });
  const [view, setView] = useState(d.base);
  const base = d.base;

  const plotW = Math.max(size.w - PL - PR, 1);
  const plotH = Math.max(size.h - PT - PB, 1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const upd = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomAt = (f, px, py) => setView(v => {
    const nx = (v.x1 - v.x0) / f, ny = (v.y1 - v.y0) / f;
    const bx = base.x1 - base.x0, by = base.y1 - base.y0;
    if (nx > bx * 1.5 || nx < bx / 40 || ny > by * 1.5 || ny < by / 40) return v;
    const tx = (px - PL) / plotW, ty = (py - PT) / plotH;
    const fx = v.x0 + tx * (v.x1 - v.x0), fy = v.y0 + ty * (v.y1 - v.y0);
    const x0 = fx - tx * nx, y0 = fy - ty * ny;
    return { x0, x1: x0 + nx, y0, y1: y0 + ny };
  });

  const panBy = (dx, dy) => setView(v => {
    const kx = (v.x1 - v.x0) / plotW, ky = (v.y1 - v.y0) / plotH;
    return { x0: v.x0 - dx * kx, x1: v.x1 - dx * kx, y0: v.y0 - dy * ky, y1: v.y1 - dy * ky };
  });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = e => {
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.current.size === 1) { travel.current = 0; moved.current = false; }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = Math.hypot(a[0] - b[0], a[1] - b[1]);
      moved.current = true;
    }
  };
  const onPointerMove = e => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = [e.clientX, e.clientY];
    ptrs.current.set(e.pointerId, cur);
    if (ptrs.current.size === 1) {
      const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      travel.current += Math.hypot(dx, dy);
      if (travel.current > 6) moved.current = true;
      panBy(dx, dy);
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = svgRef.current.getBoundingClientRect();
      if (pinch.current > 0) zoomAt(dist / pinch.current, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      pinch.current = dist;
    }
  };
  const onPointerUp = e => { ptrs.current.delete(e.pointerId); pinch.current = 0; };

  return createPortal(
    <div className="fixed inset-0 bg-black text-white flex flex-col" style={{ zIndex: 200, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <div style={{ ...heading, fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>Efficiency Landscape</div>
          {sub && <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
        </div>
        <div className="flex items-center gap-4" style={{ flexShrink: 0 }}>
          <button onClick={() => setView(base)} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer' }}><X size={22} /></button>
        </div>
      </div>
      <div ref={boxRef} style={{ flex: 1, minHeight: 0 }}>
        <Landscape
          w={size.w} h={size.h} view={view} d={d} hl={hl} onToggle={onToggle} logos={logos} R={15} fs
          guard={() => moved.current} svgRef={svgRef}
          handlers={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave: onPointerUp }}
        />
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: MUTED, fontWeight: 600, padding: '6px 0 8px' }}>
        Pinch or scroll to zoom · drag to pan · tap a team to call it out
      </div>
    </div>,
    document.body
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Inline card
──────────────────────────────────────────────────────────────────────────── */

export default function NetRatingChart({ rows, filterGarbage, onHaptic }) {
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const d = useMemo(() => buildLandscape(rows), [rows]);
  const [picked, setPicked] = useState([]);
  const [full, setFull] = useState(false);
  const cardRef = useRef(null);

  const hl = picked;
  const toggle = abbr => {
    haptic('selection');
    setPicked(cur => (cur.includes(abbr) ? cur.filter(x => x !== abbr) : [...cur, abbr]));
  };

  const abbrs = useMemo(() => (d ? d.list.map(r => r.abbr).sort() : []), [d]);
  const logoState = useLogos(abbrs);
  const slate = useSlateLogo();
  const ready = !!d && logoState.done && slate.done;
  const { snap, busy } = useSnap(cardRef, 'efficiency-landscape', ready, `${d ? d.sig : ''}|${hl.join(',')}|${filterGarbage ? 1 : 0}`, haptic);

  if (!d) {
    return (
      <div className="rounded-2xl text-center" style={{ padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 12, fontWeight: 600 }}>
        Not enough data for the chart yet.
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sub = `Season to date · ${filterGarbage ? 'garbage time filtered' : 'all possessions'}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
          Tap a team to call out its ranks
          {hl.length > 0 && (
            <button onClick={() => { haptic('light'); setPicked([]); }} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 11, fontWeight: 700, marginLeft: 10, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </span>
        <div className="flex items-center" style={{ gap: 6 }}>
          <button
            onClick={() => { haptic('light'); setFull(true); }}
            aria-label="Fullscreen"
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
          >
            <Maximize2 size={20} strokeWidth={2} />
          </button>
          <button
            onClick={snap}
            disabled={busy || !ready}
            aria-label="Share screenshot"
            className="flex items-center justify-center"
            style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: MUTED, opacity: busy || !ready ? 0.4 : 1 }}
          >
            <Camera size={20} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div ref={cardRef} style={{ marginTop: 6, background: '#000', border: '1px solid #171717', borderRadius: 16, padding: '18px 12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '0 4px' }}>
          <div style={{ ...heading, fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>Efficiency Landscape</div>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{today}</div>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4, padding: '0 4px' }}>{sub}</div>
        <div style={{ marginTop: 10 }}>
        <Landscape w={500} h={560} view={d.base} d={d} hl={hl} onToggle={toggle} logos={logoState.map} R={13} guard={() => false} />
        </div>
        <div style={{ marginTop: 8, padding: '0 4px', fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.08em' }}>SLATE</div>
      
      </div>

      <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginTop: 14 }}>
        Right = better offense, up = better defense (DRtg is flipped so lower sits higher). Axes cross at the league average. Teams above the dashed line have a positive net rating. Ratings are points per 100 possessions.
      </p>

      {full && (
        <LandscapeFull d={d} hl={hl} onToggle={toggle} logos={logoState.map} sub={sub} onClose={() => { haptic('light'); setFull(false); }} />
      )}
    </div>
  );
}