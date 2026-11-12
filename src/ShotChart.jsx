import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Maximize2, X } from 'lucide-react';
import { toPng } from 'html-to-image';

/* Same look as the Shots tab in TeamAdvanced: flat, small type, blue made / gray missed. */

const MUTED = '#6b7280';
const BLUE = '#3b82f6';
const ALL = 'all';
const heading = { fontFamily: 'Rajdhani, sans-serif' };

/* Court units are tenths of a foot, hoop at (250, 52.5), same as TeamAdvanced */
const CW = 500, CH = 400, HX = 250, HY = 52.5, R3 = 237.5, CORNER_X = 30;
const ARC_Y = HY + Math.sqrt(R3 ** 2 - (HX - CORNER_X) ** 2);
const THREE_PATH = `M${CORNER_X} 0 V${ARC_Y} A${R3} ${R3} 0 0 0 ${CW - CORNER_X} ${ARC_Y} V0`;

function CourtLines({ stroke = '#a1a1aa', opacity = 0.25 }) {
  const p = { fill: 'none', stroke, strokeOpacity: opacity, strokeWidth: 2 };
  return (
    <g style={{ pointerEvents: 'none' }}>
      <path d={THREE_PATH} {...p} />
      <rect x="170" y="0" width="160" height="190" {...p} />
      <circle cx={HX} cy="190" r="60" {...p} />
      <line x1="220" x2="280" y1="40" y2="40" {...p} />
      <circle cx={HX} cy={HY} r="7.5" {...p} />
    </g>
  );
}

const FT_RE = /free throw/i;
const isFT = (p) => FT_RE.test(p.type?.text || '') || FT_RE.test(p.text || '');
const validNum = (n) => typeof n === 'number' && Math.abs(n) < 1000;

/* ESPN coords: x 0-50 across, y 0-94 baseline to baseline. Fold both ends onto one half court. */
function normCoord(c, swap) {
  if (!c || !validNum(c.x) || !validNum(c.y)) return null;
  let x = swap ? c.y : c.x;
  let y = swap ? c.x : c.y;
  if (y > 47) { x = 50 - x; y = 94 - y; }
  if (x < -2 || x > 52 || y < -2 || y > 49) return null;
  return { x, y };
}

/* Rough expected FG% from distance, shot type and assist. Not tracking data. */
function estXfg(s) {
  const t = (s.type || '').toLowerCase();
  let p;
  if (s.isThree) p = 0.355;
  else if (s.dist <= 4) p = 0.64;
  else if (s.dist <= 10) p = 0.47;
  else if (s.dist <= 16) p = 0.42;
  else p = 0.4;
  if (/dunk/.test(t)) p = Math.max(p, 0.9);
  else if (/alley/.test(t)) p = Math.max(p, 0.85);
  else {
    if (/hook|floating|fadeaway|turnaround|step ?back|pull-?up|bank/.test(t)) p -= 0.04;
    if (s.assist) p += 0.04;
    else if (s.isThree) p -= 0.02;
  }
  return Math.min(0.95, Math.max(0.15, p));
}

const periodLabel = (n) => (n > 4 ? (n === 5 ? 'OT' : `${n - 4}OT`) : `Q${n}`);

function buildShots(gameDetails) {
  const plays = gameDetails?.plays || [];
  const names = {};
  const playerTeam = {};
  (gameDetails?.boxscore?.players || []).forEach((tp) => {
    const tid = String(tp.team?.id);
    (tp.statistics?.[0]?.athletes || []).forEach((a) => {
      names[a.athlete.id] = a.athlete.displayName || a.athlete.shortName;
      playerTeam[a.athlete.id] = tid;
    });
  });

  const swap = plays.some((p) => p.shootingPlay && validNum(p.coordinate?.x) && p.coordinate.x > 50.5);

  const trips = new Map();
  plays.forEach((p, i) => {
    if (!p.shootingPlay || !isFT(p)) return;
    const sid = String(p.participants?.[0]?.athlete?.id ?? '');
    const key = `${p.period?.number}-${p.clock?.displayValue}-${sid}`;
    const t = trips.get(key);
    if (t) t.count += 1;
    else trips.set(key, { count: 1, firstIdx: i, sid, teamId: String(p.team?.id ?? playerTeam[sid] ?? ''), play: p, and1: false });
  });

  const shots = [];
  plays.forEach((p, i) => {
    if (!p.shootingPlay || isFT(p)) return;
    const pos = normCoord(p.coordinate, swap);
    if (!pos) return;
    const sid = String(p.participants?.[0]?.athlete?.id ?? '');
    const text = p.text || '';
    const m = text.match(/(\d+)-foot/);
    const dist = m ? Number(m[1]) : Math.hypot(pos.x - 25, pos.y - 5.25);
    const isThree = p.pointsAttempted === 3 || /three point/i.test(text) || /three point/i.test(p.type?.text || '');
    const made = !!p.scoringPlay;
    const assist = text.match(/\(([^)]+?) assists?\)/)?.[1] || null;
    const block = text.match(/\(([^)]+?) blocks?\)/)?.[1] || null;
    const trip = trips.get(`${p.period?.number}-${p.clock?.displayValue}-${sid}`);
    const and1 = made && !!trip && trip.count === 1;
    if (and1) trip.and1 = true;
    const s = {
      id: p.id || `s${i}`,
      x: pos.x * 10,
      y: pos.y * 10,
      sid,
      teamId: String(p.team?.id ?? playerTeam[sid] ?? ''),
      name: names[sid] || text.split(/ (?:makes|misses)/)[0],
      made,
      isThree,
      pts: made ? Number(p.scoreValue ?? (isThree ? 3 : 2)) : 0,
      dist: Math.round(dist),
      type: p.type?.text || 'Shot',
      period: p.period?.number || 1,
      clock: p.clock?.displayValue || '',
      assist,
      block,
      and1,
    };
    s.xfg = estXfg(s);
    shots.push(s);
  });

  const fouls = [];
  trips.forEach((t) => {
    let pos = null;
    for (let j = t.firstIdx - 1; j >= Math.max(0, t.firstIdx - 6); j--) {
      if (/foul/i.test(plays[j].type?.text || '')) { pos = normCoord(plays[j].coordinate, swap); break; }
    }
    fouls.push({
      id: `f${t.firstIdx}`,
      kind: 'foul',
      sid: t.sid,
      teamId: t.teamId,
      name: names[t.sid] || (t.play.text || '').split(/ (?:makes|misses)/)[0],
      ftCount: t.count,
      and1: t.and1,
      period: t.play.period?.number || 1,
      clock: t.play.clock?.displayValue || '',
      x: pos ? pos.x * 10 : null,
      y: pos ? pos.y * 10 : null,
    });
  });

  return { shots, fouls };
}


const logoCache = new Map();
function useLogoData(src) {
  const [data, setData] = useState(src ? logoCache.get(src) || null : null);
  useEffect(() => {
    if (!src) return undefined;
    if (logoCache.has(src)) { setData(logoCache.get(src)); return undefined; }
    let dead = false;
    (async () => {
      try {
        const res0 = await fetch(src);
        const blob = await res0.blob();
        if (!res0.ok || !blob.type.startsWith('image/')) return; // e.g. dev server returned index.html
        const url = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        logoCache.set(src, url);
        if (!dead) setData(url);
      } catch (e) { /* capture just skips the logo */ }
    })();
    return () => { dead = true; };
  }, [src]);
  return data;
}

/* Camera: pre-render to PNG so the share sheet opens instantly (same approach as TeamAdvanced) */
function useSnap(ref, name, ready, dep, haptic) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const render = async () => {
    const opts = { pixelRatio: 3, backgroundColor: '#000' };
    await toPng(ref.current, opts); // Safari drops images/fonts on the first pass
    const url = await toPng(ref.current, opts);
    const blob = await (await fetch(url)).blob();
    return { url, file: new File([blob], `${name}.png`, { type: 'image/png' }) };
  };
  useEffect(() => {
    fileRef.current = null;
    if (!ready) return undefined;
    let dead = false;
    const id = setTimeout(() => {
      if (ref.current) render().then((r) => { if (!dead) fileRef.current = r; }).catch(() => {});
    }, 600);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, name, dep]);
  const snap = async () => {
    if (!ready || busy || !ref.current) return;
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

function TipBody({ a }) {
  return (
    <>
      <div style={{ fontWeight: 800, fontSize: 12 }}>{a.name}</div>
      {a.kind === 'foul' ? (
        <>
          <div style={{ color: '#a1a1aa' }}>Fouled · {a.ftCount} FT{a.and1 ? ' · And-1' : ''}</div>
          <div style={{ color: MUTED }}>{periodLabel(a.period)} {a.clock}</div>
        </>
      ) : (
        <>
          <div style={{ color: '#e4e4e7', fontWeight: 600 }}>
            {a.made ? 'Made' : 'Missed'} · {a.dist} ft {a.isThree ? '3PT' : '2PT'}{a.and1 ? ' · And-1' : ''}
          </div>
          <div style={{ color: '#a1a1aa' }}>{a.type}</div>
          <div style={{ color: MUTED }}>{periodLabel(a.period)} {a.clock}</div>
          {a.assist && <div style={{ color: MUTED }}>Ast: {a.assist}</div>}
          {a.block && <div style={{ color: MUTED }}>Blk: {a.block}</div>}
          <div style={{ color: MUTED, marginTop: 3 }}>Difficulty {Math.round((1 - a.xfg) * 100)}% (est.)</div>
        </>
      )}
    </>
  );
}

/* Dots + diamonds. k scales marker size so they stay readable when zoomed. */
function ShotLayer({ shown, fouls, active, onPick, k = 1 }) {
  return (
    <>
      {fouls.filter((f) => f.x != null && !f.and1).map((f) => (
        <g key={f.id} transform={`translate(${f.x} ${f.y}) scale(${k})`} onClick={(e) => onPick(f, e)} style={{ cursor: 'pointer' }}>
          <circle r="12" fill="transparent" />
          <path d="M0 -7 L7 0 L0 7 L-7 0 Z" fill="none" stroke="#a1a1aa" strokeWidth="2" />
        </g>
      ))}
      {shown.map((s) => (
        <g key={s.id} transform={`translate(${s.x} ${s.y}) scale(${k})`} onClick={(e) => onPick(s, e)} style={{ cursor: 'pointer' }}>
          <circle r="12" fill="transparent" />
          {s.made
            ? <circle r="6" fill={BLUE} fillOpacity="0.85" />
            : <path d="M-5 -5l10 10m-10 0l10-10" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />}
          {s.and1 && <circle r="10" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />}
          {active?.id === s.id && <circle r="11" fill="none" stroke="#fff" strokeWidth="2" />}
        </g>
      ))}
    </>
  );
}

function ShotFull({ shown, fouls, legend, onClose }) {
  const svgRef = useRef(null);
  const ptrs = useRef(new Map());
  const pinch = useRef(0);
  const travel = useRef(0);
  const moved = useRef(false);
  const [view, setView] = useState({ cx: CW / 2, cy: CH / 2, w: CW });
  const [active, setActive] = useState(null);
  const h = (view.w * CH) / CW;
  const k = Math.sqrt(view.w / CW);

  const perPx = () => {
    const r = svgRef.current.getBoundingClientRect();
    return 1 / Math.min(r.width / view.w, r.height / h);
  };
  const zoom = (f) => setView((v) => ({ ...v, w: Math.min(CW * 1.3, Math.max(CW / 8, v.w / f)) }));

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.01)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onDown = (e) => {
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.current.size === 1) { travel.current = 0; moved.current = false; }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = Math.hypot(a[0] - b[0], a[1] - b[1]);
      moved.current = true;
    }
  };
  const onMove = (e) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = [e.clientX, e.clientY];
    ptrs.current.set(e.pointerId, cur);
    if (ptrs.current.size === 1) {
      const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      travel.current += Math.hypot(dx, dy);
      if (travel.current > 6) moved.current = true;
      const u = perPx();
      setView((v) => ({ ...v, cx: v.cx - dx * u, cy: v.cy - dy * u }));
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch.current > 0) zoom(d / pinch.current);
      pinch.current = d;
    }
  };
  const onUp = (e) => { ptrs.current.delete(e.pointerId); pinch.current = 0; };

  return createPortal(
    <div className="fixed inset-0 bg-black text-white flex flex-col" style={{ zIndex: 200, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div style={{ ...heading, fontSize: 20, fontWeight: 700 }}>Shot chart</div>
        <div className="flex items-center gap-4">
          <button onClick={() => setView({ cx: CW / 2, cy: CH / 2, w: CW })} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer' }}><X size={22} /></button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 8px' }}>
        <svg
          ref={svgRef}
          viewBox={`${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
          onClick={() => { if (!moved.current) setActive(null); }}
        >
          <rect x={view.cx - view.w} y={view.cy - h} width={view.w * 2} height={h * 2} fill="#0a0a0a" />
          <CourtLines />
          <ShotLayer shown={shown} fouls={fouls} active={active} k={k} onPick={(s, e) => { e.stopPropagation(); if (!moved.current) setActive(s); }} />
        </svg>
      </div>
      <div style={{ minHeight: 92, padding: '8px 16px 0', fontSize: 11, lineHeight: 1.45 }}>
        {active ? <TipBody a={active} /> : <div style={{ color: MUTED, textAlign: 'center', paddingTop: 8 }}>Tap a shot for details</div>}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: MUTED, fontWeight: 600, padding: '6px 0 8px' }}>
        {legend} · Pinch or scroll to zoom · drag to pan
      </div>
    </div>,
    document.body
  );
}

function Sel({ label, value, onChange, options }) {
  return (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 text-white rounded-xl"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '8px 10px', border: '1px solid #171717' }}
      >
        <option value={ALL}>All</option>
        {options.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  );
}

export default function ShotChart({ gameDetails, side, onHaptic, logo, abbr, oppAbbr }) {
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const cardRef = useRef(null);
  const logoData = useLogoData(logo);
  const [full, setFull] = useState(false);
  const [player, setPlayer] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [active, setActive] = useState(null);

  const data = useMemo(() => buildShots(gameDetails), [gameDetails?.plays, gameDetails?.boxscore]);
  const tid = String(gameDetails?.boxscore?.teams?.[side === 'away' ? 0 : 1]?.team?.id ?? '');

  const teamShots = data.shots.filter((s) => s.teamId === tid);
  const teamFouls = data.fouls.filter((f) => f.teamId === tid);

  const count = (key, label) => {
    const m = {};
    teamShots.forEach((s) => { const k = s[key]; m[k] = m[k] || { n: 0, label: label(s) }; m[k].n++; });
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, `${v.label} (${v.n})`]);
  };
  const playerOpts = count('sid', (s) => s.name);
  const typeOpts = count('type', (s) => s.type);

  const filtered = player !== ALL || type !== ALL;
  const shown = teamShots.filter((s) => (player === ALL || s.sid === player) && (type === ALL || s.type === type));
  const foulsShown = type === ALL ? teamFouls.filter((f) => player === ALL || f.sid === player) : [];

  const fga = shown.length;
  const fgm = shown.filter((s) => s.made).length;
  const tpa = shown.filter((s) => s.isThree).length;
  const tpm = shown.filter((s) => s.isThree && s.made).length;
  const efg = fga ? ((fgm + 0.5 * tpm) / fga) * 100 : 0;
  const legend = `${fgm}-${fga} FG · ${tpm}-${tpa} 3PT · ${fga ? `${efg.toFixed(1)}%` : '–'} eFG`;

  const { snap, busy } = useSnap(cardRef, `${abbr || 'team'}-shot-chart`, fga > 0 && (!logo || !!logoData), `${player}|${type}|${fga}|${fgm}|${active?.id || ''}|${logoData ? 1 : 0}`, haptic);

  if (!tid) return null;

  const reset = () => { setPlayer(ALL); setType(ALL); setActive(null); };
  const iconBtn = { width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: MUTED };

  const tip = active && (
    <div
      style={{
        position: 'absolute', zIndex: 20, pointerEvents: 'none',
        left: `${(active.x / CW) * 100}%`, top: `${(active.y / CH) * 100}%`,
        transform: `translate(${active.x > 300 ? 'calc(-100% - 8px)' : '8px'}, ${active.y > 240 ? 'calc(-100% - 8px)' : '8px'})`,
        background: '#18181b', border: '1px solid #27272a', borderRadius: 10,
        padding: '7px 9px', fontSize: 11, lineHeight: 1.45, minWidth: 140, maxWidth: 190,
      }}
    >
      <TipBody a={active} />
    </div>
  );

  const chartBody = () => (
    <>
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${CW} ${CH}`}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#0a0a0a' }}
            onClick={() => setActive(null)}
          >
            <CourtLines />
            <ShotLayer shown={shown} fouls={foulsShown} active={active} onPick={(s, e) => { e.stopPropagation(); setActive(s); }} />
          </svg>
          {tip}
          {fga === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12, fontWeight: 600 }}>
              {filtered ? 'No shots match this filter.' : 'No shot data yet.'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', marginTop: 12, fontSize: 11, color: MUTED, fontWeight: 600 }}>
          <span style={{ color: BLUE }}>● <span style={{ color: MUTED }}>Made</span></span>
          <span>× Missed</span>
          <span>{fgm}-{fga} FG</span>
          <span>{tpm}-{tpa} 3PT</span>
          <span>{fga ? `${efg.toFixed(1)}%` : '–'} eFG</span>
          {foulsShown.length > 0 && <span>◇ {foulsShown.length} fouled</span>}
        </div>
    </>
  );

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const who = player !== ALL ? teamShots.find((x) => x.sid === player)?.name : null;
  const sub = [oppAbbr && `vs ${oppAbbr}`, who, type !== ALL && type].filter(Boolean).join(' · ');

  return (
    <div style={{ marginTop: -8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={heading}>Shot chart</h5>
        {fga > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => { haptic('light'); setFull(true); }} aria-label="Fullscreen" className="flex items-center justify-center" style={iconBtn}>
              <Maximize2 size={20} strokeWidth={2} />
            </button>
            <button onClick={snap} disabled={busy} aria-label="Share screenshot" className="flex items-center justify-center" style={{ ...iconBtn, opacity: busy ? 0.4 : 1 }}>
              <Camera size={20} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '8px 0 14px', alignItems: 'flex-end' }}>
        <Sel label="PLAYER" value={player} onChange={(v) => { setPlayer(v); setActive(null); }} options={playerOpts} />
        <Sel label="SHOT TYPE" value={type} onChange={(v) => { setType(v); setActive(null); }} options={typeOpts} />
        {filtered && (
          <button
            onClick={reset}
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 700, padding: '10px 4px', cursor: 'pointer' }}
          >
            Reset
          </button>
        )}
      </div>

      {chartBody()}

      {/* Off-screen copy with logo + title, used only for the screenshot */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: 420, pointerEvents: 'none' }}>
        <div ref={cardRef} style={{ background: '#000', border: '1px solid #171717', borderRadius: 16, padding: '16px 14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 24, padding: '0 4px' }}>
            {logoData ? <img src={logoData} alt="Slate" style={{ height: 24, width: 'auto' }} /> : <span />}
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{today}</div>
          </div>
          <div style={{ ...heading, fontSize: 20, fontWeight: 700, lineHeight: 1.15, padding: '0 4px', marginTop: 10 }}>{abbr ? `${abbr} ` : ''}Shot Chart</div>
          {sub && <div style={{ fontSize: 12, color: MUTED, padding: '0 4px', marginTop: 4 }}>{sub}</div>}
          <div style={{ marginTop: 12 }}>{chartBody()}</div>
        </div>
      </div>

      {full && <ShotFull shown={shown} fouls={foulsShown} legend={legend} onClose={() => { haptic('light'); setFull(false); }} />}
    </div>
  );
}