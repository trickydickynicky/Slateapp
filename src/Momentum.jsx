import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';

/* =====================================================================
   CONFIG
   ===================================================================== */
const SUMMARY_URL = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;

const POLL_MS = 12000; // live games re-fetch interval
const REG_PERIOD_SECS = 720;
const OT_PERIOD_SECS = 300;
const REG_TOTAL = REG_PERIOD_SECS * 4; // 2880
const RESAMPLE_STEP = 20; // seconds per chart point

// Slate's accent fallbacks (same ones the app uses when a team color is missing)
const FALLBACK_HOME = '#3B82F6';
const FALLBACK_AWAY = '#EF4444';
const FALLBACK_ALT = '#F59E0B';
const CARD_BG = '#18181b'; // zinc-900, what the card sits on

/* =====================================================================
   PURE TRANSFORM LOGIC (exported so it can be tested)
   ===================================================================== */

/** "11:45" -> 705, "45.3" -> 45.3, anything else -> null */
export function parseClock(display) {
  if (display == null) return null;
  const s = String(display).trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    const v = Number(m) * 60 + Number(sec);
    return Number.isFinite(v) ? v : null;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Elapsed game seconds from a period number + seconds remaining on the clock. */
export function elapsedSeconds(period, clockRemaining) {
  if (!Number.isFinite(period) || period < 1 || clockRemaining == null) return null;
  if (period <= 4) {
    const rem = Math.min(Math.max(clockRemaining, 0), REG_PERIOD_SECS);
    return (period - 1) * REG_PERIOD_SECS + (REG_PERIOD_SECS - rem);
  }
  const rem = Math.min(Math.max(clockRemaining, 0), OT_PERIOD_SECS);
  return REG_TOTAL + (period - 5) * OT_PERIOD_SECS + (OT_PERIOD_SECS - rem);
}

export function periodLabel(period) {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? 'OT' : `${period - 4}OT`;
}

/** Start/end (elapsed seconds) of each period up to periodCount. */
export function periodSpans(periodCount) {
  const spans = [];
  for (let p = 1; p <= periodCount; p++) {
    const start = p <= 4 ? (p - 1) * REG_PERIOD_SECS : REG_TOTAL + (p - 5) * OT_PERIOD_SECS;
    const len = p <= 4 ? REG_PERIOD_SECS : OT_PERIOD_SECS;
    spans.push({ period: p, start, end: start + len, label: periodLabel(p) });
  }
  return spans;
}

/** Step-hold resample of the series to one point every `step` seconds, ending at the last real point. */
export function resample(series, step = RESAMPLE_STEP) {
  if (!series.length) return [];
  const lastT = series[series.length - 1].t;
  const out = [];
  let j = 0;
  for (let t = 0; t <= lastT; t += step) {
    while (j + 1 < series.length && series[j + 1].t <= t) j++;
    out.push({ t, d: series[j].d });
  }
  if (out[out.length - 1].t !== lastT) out.push({ t: lastT, d: series[series.length - 1].d });
  return out;
}

/**
 * plays (ESPN summary.plays) -> everything the chart needs.
 * d = homeScore - awayScore, t = elapsed game seconds.
 */
export function buildMomentum(plays) {
  const raw = [];
  let maxPeriod = 4;

  for (const p of Array.isArray(plays) ? plays : []) {
    const period = Number(p?.period?.number);
    const clockDisplay = p?.clock?.displayValue;
    const hs = p?.homeScore;
    const as = p?.awayScore;
    if (hs == null || as == null) continue;
    const home = Number(hs);
    const away = Number(as);
    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
    const t = elapsedSeconds(period, parseClock(clockDisplay));
    if (t == null) continue;
    if (period > maxPeriod) maxPeriod = period;
    raw.push({ t, d: home - away, home, away, period, clock: clockDisplay ?? '' });
  }

  raw.sort((a, b) => a.t - b.t); // Array.sort is stable, so same-second plays keep feed order
  const series = [{ t: 0, d: 0, home: 0, away: 0, period: 1, clock: '12:00' }, ...raw];

  // biggest lead for each side (first time it was reached)
  let home = null;
  let away = null;
  let leadChanges = 0;
  let lastSign = 0;
  for (const pt of series) {
    if (pt.d > 0 && (!home || pt.d > home.value)) home = { value: pt.d, t: pt.t, period: pt.period, clock: pt.clock };
    if (pt.d < 0 && (!away || -pt.d > away.value)) away = { value: -pt.d, t: pt.t, period: pt.period, clock: pt.clock };
    const sign = Math.sign(pt.d);
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) leadChanges++; // ties (sign 0) don't count
      lastSign = sign;
    }
  }

  const totalSeconds = REG_TOTAL + Math.max(0, maxPeriod - 4) * OT_PERIOD_SECS;
  const maxAbs = series.reduce((m, p) => Math.max(m, Math.abs(p.d)), 0);

  return {
    series,
    points: resample(series),
    totalSeconds,
    periodCount: maxPeriod,
    maxAbs,
    lastT: series[series.length - 1].t,
    hasPlays: raw.length > 0,
    biggestLeads: { home, away },
    leadChanges,
  };
}

/* =====================================================================
   SMALL HELPERS
   ===================================================================== */
const hexOk = (c) => typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim());
const norm = (c) => (c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`);
const rgb = (hex) => {
  const h = norm(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const distance = (a, b) => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
};
const visibleOnCard = (hex) => distance(hex, CARD_BG) > 60 && luminance(hex) > 0.04;

/** First candidate that's visible on the card and distinct from `avoid`. */
function pickColor(cands, fallbacks, avoid) {
  const list = [...cands.filter(hexOk).map(norm), ...fallbacks];
  for (const c of list) {
    if (visibleOnCard(c) && (!avoid || distance(c, avoid) > 70)) return c;
  }
  return fallbacks[0];
}

function readTeam(competitor) {
  const t = competitor?.team || {};
  return {
    abbr: t.abbreviation || '',
    logo: t.logo || t.logos?.[0]?.href || '',
    color: t.color || '',
    alt: t.alternateColor || '',
  };
}

function processSummary(json) {
  const comp = json?.header?.competitions?.[0];
  const state = comp?.status?.type?.state || null; // "pre" | "in" | "post"
  const comps = comp?.competitors || [];
  return {
    state,
    teams: {
      home: readTeam(comps.find((c) => c.homeAway === 'home')),
      away: readTeam(comps.find((c) => c.homeAway === 'away')),
    },
    momentum: buildMomentum(json?.plays),
  };
}

/** Fritsch–Carlson monotone cubic through [{x,y}] -> SVG path (no overshoot). */
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1);
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        t[i] = tau * a * m[i];
        t[i + 1] = tau * b * m[i];
      }
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3;
    const y1 = pts[i].y + (t[i] * dx[i]) / 3;
    const x2 = pts[i + 1].x - dx[i] / 3;
    const y2 = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += `C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/* =====================================================================
   CACHE (final games never change)
   ===================================================================== */
const finalCache = new Map();

/* =====================================================================
   CHART
   ===================================================================== */
const W = 380;
const H = 150;
const PLOT = { l: 34, r: 374, t: 10, b: 120 };
const HOLD_MS = 320; // press-and-hold time before scrubbing starts
const MOVE_CANCEL_PX = 10; // moving more than this before the hold finishes = normal scroll

/** Last series point at or before time t (the score at that moment). */
function pointAt(series, t) {
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return series[lo];
}

function Chart({ id, m, home, away, live }) {
  const { trigger } = useWebHaptics();
  const { points, series, totalSeconds, periodCount, maxAbs, lastT } = m;
  const svgRef = useRef(null);
  const press = useRef({ id: null, x0: 0, y0: 0, lastX: 0, timer: null, active: false });
  const [scrubT, setScrubT] = useState(null);

  // once scrubbing, block the page's vertical scroll (must be a non-passive native listener)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const block = (e) => {
      if (press.current.active && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('touchmove', block);
      clearTimeout(press.current.timer);
    };
  }, []);
  const plotW = PLOT.r - PLOT.l;
  const plotH = PLOT.b - PLOT.t;
  const zeroY = PLOT.t + plotH / 2;
  const yMax = Math.max(10, Math.ceil((maxAbs + 1) / 5) * 5);

  const X = (t) => PLOT.l + (t / totalSeconds) * plotW;
  const Y = (d) => zeroY - (d / yMax) * (plotH / 2);

  const timeAt = (clientX) => {
    const r = svgRef.current.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    const t = ((vx - PLOT.l) / plotW) * totalSeconds;
    return Math.min(Math.max(t, 0), lastT);
  };

  const endPress = () => {
    const p = press.current;
    clearTimeout(p.timer);
    p.id = null;
    p.active = false;
    setScrubT(null);
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = press.current;
    clearTimeout(p.timer);
    p.id = e.pointerId;
    p.x0 = e.clientX;
    p.y0 = e.clientY;
    p.lastX = e.clientX;
    p.active = false;
    const target = e.currentTarget;
    const pid = e.pointerId;
    p.timer = setTimeout(() => {
      p.active = true;
      try {
        target.setPointerCapture(pid);
      } catch (err) {}
      trigger('light');
      setScrubT(timeAt(p.lastX));
    }, HOLD_MS);
  };

  const onMove = (e) => {
    const p = press.current;
    if (p.id !== e.pointerId) return;
    p.lastX = e.clientX;
    if (!p.active) {
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > MOVE_CANCEL_PX) {
        clearTimeout(p.timer); // they're scrolling, not pressing
        p.id = null;
      }
      return;
    }
    setScrubT(timeAt(e.clientX));
  };

  const onUp = (e) => {
    if (press.current.id !== e.pointerId) return;
    endPress();
  };

  const sp = scrubT == null ? null : pointAt(series, scrubT);
  const sx = sp ? X(scrubT) : 0;

  const xy = points.map((p) => ({ x: X(p.t), y: Y(p.d) }));
  const line = monotonePath(xy);
  const area = line
    ? `${line}L${xy[xy.length - 1].x.toFixed(1)},${zeroY}L${xy[0].x.toFixed(1)},${zeroY}Z`
    : '';

  const spans = periodSpans(periodCount);
  const last = xy[xy.length - 1];
  const lastD = points[points.length - 1].d;
  const leader = lastD > 0 ? home.color : lastD < 0 ? away.color : '#a1a1aa';

  const upId = `${id}-up`;
  const dnId = `${id}-dn`;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto block select-none"
      style={{ touchAction: 'pan-y', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      role="img"
      aria-label="Score differential over the game. Press and hold to see scores."
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <defs>
        <clipPath id={upId}>
          <rect x={PLOT.l} y={PLOT.t - 4} width={plotW} height={zeroY - PLOT.t + 4} />
        </clipPath>
        <clipPath id={dnId}>
          <rect x={PLOT.l} y={zeroY} width={plotW} height={PLOT.b - zeroY + 4} />
        </clipPath>
      </defs>

      {/* period dividers + labels */}
      {spans.map((s) => (
        <g key={s.period}>
          {s.period < periodCount || s.end < totalSeconds ? (
            <line
              x1={X(s.end)}
              x2={X(s.end)}
              y1={PLOT.t}
              y2={PLOT.b}
              className="stroke-zinc-700"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          ) : null}
          <text
            x={(X(s.start) + X(s.end)) / 2}
            y={H - 12}
            textAnchor="middle"
            className="fill-gray-500"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {s.label}
          </text>
        </g>
      ))}

      {/* zero line */}
      <line x1={PLOT.l} x2={PLOT.r} y1={zeroY} y2={zeroY} className="stroke-zinc-600" strokeWidth="1" />

      {area && (
        <>
          <path d={area} fill={home.color} fillOpacity="0.28" clipPath={`url(#${upId})`} />
          <path d={area} fill={away.color} fillOpacity="0.28" clipPath={`url(#${dnId})`} />
          <path d={line} fill="none" stroke={home.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${upId})`} />
          <path d={line} fill="none" stroke={away.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${dnId})`} />
        </>
      )}

      {/* live marker */}
      {live && last && lastT < totalSeconds && (
        <circle cx={last.x} cy={last.y} r="3.5" fill={leader} className="animate-pulse" />
      )}

      {/* team logos: home on top of the axis, away on the bottom */}
      {home.logo && <image href={home.logo} x="8" y={PLOT.t} width="20" height="20" preserveAspectRatio="xMidYMid meet" />}
      {away.logo && <image href={away.logo} x="8" y={PLOT.b - 20} width="20" height="20" preserveAspectRatio="xMidYMid meet" />}

      {/* press-and-hold scrubber */}
      {sp && (
        <g pointerEvents="none">
          <line x1={sx} x2={sx} y1={PLOT.t} y2={PLOT.b} stroke="#a1a1aa" strokeOpacity="0.7" strokeWidth="2" />
          <circle cx={sx} cy={Y(sp.d)} r="3.5" fill="#ffffff" />
          <g transform={`translate(${Math.min(Math.max(sx - 40, 2), W - 82)},0)`}>
            <rect width="80" height="46" rx="8" fill="#09090b" fillOpacity="0.94" stroke="#3f3f46" strokeWidth="1" />
            <text x="8" y="13" className="fill-gray-400" style={{ fontSize: 9, fontWeight: 600 }}>
              {sp.clock} {periodLabel(sp.period)}
            </text>
            {home.logo && <image href={home.logo} x="8" y="17" width="12" height="12" />}
            <text x="26" y="27.5" className="fill-white" style={{ fontSize: 12, fontWeight: 700 }}>{sp.home}</text>
            {away.logo && <image href={away.logo} x="8" y="31" width="12" height="12" />}
            <text x="26" y="41.5" className="fill-white" style={{ fontSize: 12, fontWeight: 700 }}>{sp.away}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

/* =====================================================================
   BIGGEST LEADS
   ===================================================================== */
function LeadCell({ team, lead }) {
  return (
    <div className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 flex items-center gap-2 min-w-0">
      {team.logo ? <img src={team.logo} alt={team.abbr} className="w-5 h-5 flex-shrink-0" /> : null}
      <span className={`text-sm font-bold leading-none ${lead ? '' : 'text-gray-500'}`} style={lead ? { color: team.color } : undefined}>
        {lead ? lead.value : '–'}
      </span>
      <span className="text-[10px] text-gray-400 whitespace-nowrap truncate">
        {lead ? `at ${lead.clock} ${periodLabel(lead.period)}` : 'never led'}
      </span>
    </div>
  );
}

/* =====================================================================
   COMPONENT
   ===================================================================== */
const heading = (
  <h4
    className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3"
    style={{ fontFamily: 'Rajdhani, sans-serif' }}
  >
    Differential
  </h4>
);

/**
 * <Momentum gameId status home away />
 *  status: optional 'pre' | 'in' | 'post' (from the app's game object); the summary's state wins once loaded
 *  home/away: optional { abbr, logo, color } so logos/colors render before the fetch resolves
 */
export default function Momentum({ gameId, status, home: homeProp, away: awayProp }) {
  const { trigger } = useWebHaptics();
  const [state, setState] = useState({ gameId: null, phase: 'loading' });
  const [tick, setTick] = useState(0); // bump to retry

  useEffect(() => {
    if (!gameId) return undefined;
    let ignore = false;
    let timer = null;
    let ctrl = null;
    let live = false;
    let paused = false;

    const set = (patch) => setState({ gameId, ...patch });

    const cached = finalCache.get(gameId);
    if (cached) {
      set({ phase: 'ready', data: cached, live: false });
      return undefined;
    }
    if (status === 'pre') {
      set({ phase: 'pre' });
      return undefined;
    }

    // keep what's on screen if this is the same game (e.g. status flipped live -> final), else show skeleton
    setState((s) => (s.gameId === gameId && s.data ? s : { gameId, phase: 'loading' }));

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(onTimer, POLL_MS);
    };

    const run = async (first) => {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(SUMMARY_URL(gameId), { signal: ctrl.signal });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (ignore) return;
        const data = processSummary(json);

        if (data.state === 'pre') {
          set({ phase: 'pre', data });
          return; // no polling for scheduled games
        }
        if (data.state === 'post') {
          finalCache.set(gameId, data);
          live = false;
          set({ phase: 'ready', data, live: false });
          return; // final: render once, stop polling
        }
        live = true;
        set({ phase: 'ready', data, live: true });
        schedule();
      } catch (e) {
        if (ignore || e?.name === 'AbortError') return;
        if (first) set({ phase: 'error' });
        else schedule(); // keep the last good chart, try again next interval
      }
    };

    function onTimer() {
      if (document.hidden) {
        paused = true; // resume on visibilitychange
        return;
      }
      run(false);
    }

    const onVisible = () => {
      if (!document.hidden && paused && live && !ignore) {
        paused = false;
        run(false);
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    run(true);

    return () => {
      ignore = true;
      clearTimeout(timer);
      if (ctrl) ctrl.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [gameId, status, tick]);

  // ignore state that belongs to a previous game
  const cur = state.gameId === gameId ? state : { phase: 'loading' };
  const data = cur.data;

  const teams = useMemo(() => {
    const sum = data?.teams || {};
    const hp = homeProp || {};
    const ap = awayProp || {};
    const homeColor = pickColor(
      [hp.color, sum.home?.color, sum.home?.alt],
      [FALLBACK_HOME, FALLBACK_ALT]
    );
    const awayColor = pickColor(
      [ap.color, sum.away?.color, sum.away?.alt],
      [FALLBACK_AWAY, FALLBACK_ALT, '#A1A1AA'],
      homeColor
    );
    return {
      home: { abbr: hp.abbr || sum.home?.abbr || 'HOME', logo: hp.logo || sum.home?.logo || '', color: homeColor },
      away: { abbr: ap.abbr || sum.away?.abbr || 'AWAY', logo: ap.logo || sum.away?.logo || '', color: awayColor },
    };
  }, [data, homeProp, awayProp]);

  const card = 'bg-black rounded-2xl p-4 mb-4';

  if (!gameId) return null;

  if (cur.phase === 'loading') {
    return (
      <div className={card}>
        {heading}
        <div className="skeleton h-44 w-full rounded-xl" />
        <div className="flex gap-2 mt-4">
          <div className="skeleton h-14 flex-1 rounded-xl" />
          <div className="skeleton h-14 flex-1 rounded-xl" />
        </div>
      </div>
    );
  }

  if (cur.phase === 'pre') return null;

  if (cur.phase === 'error') {
    return (
      <div className={card}>
        {heading}
        <div className="text-center py-4">
          <div className="text-red-500 text-sm mb-3">Couldn't load momentum</div>
          <button
            onClick={() => {
              trigger('light');
              setState({ gameId, phase: 'loading' });
              setTick((n) => n + 1);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-xs font-semibold text-blue-400 transition-colors"
          >
            Tap to retry
          </button>
        </div>
      </div>
    );
  }

  const m = data?.momentum;
  if (!m || !m.hasPlays) {
    return (
      <div className={card}>
        {heading}
        <div className="text-gray-400 text-sm text-center py-6">No momentum data available</div>
      </div>
    );
  }

  const changes = m.leadChanges;

  return (
    <div className={card}>
      {heading}
      <Chart id={`mom-${gameId}`} m={m} home={teams.home} away={teams.away} live={!!cur.live} />

      <div className="text-[10px] text-gray-400 mt-2 mb-1.5">
        Biggest leads · {changes} lead {changes === 1 ? 'change' : 'changes'}
      </div>
      <div className="flex gap-2">
        <LeadCell team={teams.away} lead={m.biggestLeads.away} />
        <LeadCell team={teams.home} lead={m.biggestLeads.home} />
      </div>
    </div>
  );
}