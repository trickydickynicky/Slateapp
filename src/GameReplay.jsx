import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw } from 'lucide-react';
import { IS_DEV, normalizeGame, periodLength, periodStart } from './replay/normalizeEspn';
import { buildModel, devVerify, idxAt, upperBound, STAT, TEAM, S, TS } from './replay/buildModel';

/* ────────────────────────────────────────────────────────────────────────────
   Constants + small helpers
──────────────────────────────────────────────────────────────────────────── */

const SPEEDS = [4, 8, 16, 24, 60];        // game seconds per real second
const ACCENT = '#2563eb';
const MUTED = '#6b7280';
const heading = { fontFamily: 'Rajdhani, sans-serif' };
const EMPTY = [];

const SUMMARY_URL = id => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const FALLBACK_URL = id => `https://cdn.espn.com/core/nba/playbyplay?xhr=1&gameId=${id}`;
const POLL_MS = 4000;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = n => String(n).padStart(2, '0');
const mmss = s => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
};
const periodLabel = p => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);
const pct = (m, a) => (a > 0 ? `${((m / a) * 100).toFixed(1)}%` : '0.0%');

const periodAt = (p, periods) => {
  const n = p < 2880 ? Math.floor(p / 720) + 1 : 5 + Math.floor((p - 2880) / 300);
  return clamp(n, 1, periods);
};
const remainingAt = (p, period) => clamp(periodStart(period) + periodLength(period) - p, 0, periodLength(period));

/** Dark team colors disappear on black, so lighten them. */
function lift(hex) {
  try {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.18) return hex;
    const m = c => Math.round(c + (255 - c) * 0.5);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  } catch (e) {
    return '#3B82F6';
  }
}

function eventPlayerIds(ev) {
  switch (ev.kind) {
    case 'fg': return [ev.shooter, ev.assist, ev.blockedBy].filter(Boolean);
    case 'ft': case 'reb': return ev.pid ? [ev.pid] : EMPTY;
    case 'tov': return [ev.pid, ev.stolenBy].filter(Boolean);
    case 'sub': return [ev.inId, ev.outId].filter(Boolean);
    default: return EMPTY;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Data: one request on open, cached for the session. Live games poll while open.
──────────────────────────────────────────────────────────────────────────── */

const gameCache = new Map();   // gameId -> normalized game (finished games only)

async function fetchGame(gameId, signal) {
  let json;
  try {
    const res = await fetch(SUMMARY_URL(gameId), { signal });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    json = await res.json();
    if (!json?.plays?.length) throw new Error('no plays');
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    const res = await fetch(FALLBACK_URL(gameId), { signal });
    if (!res.ok) throw err;
    json = await res.json();
  }
  return normalizeGame(json);
}

const sameGame = (a, b) => {
  if (!a || !b || a.finished !== b.finished || a.events.length !== b.events.length) return false;
  const x = a.events[a.events.length - 1], y = b.events[b.events.length - 1];
  return x?.id === y?.id && x?.away === y?.away && x?.home === y?.home;
};

function useReplayData(gameId, live) {
  const [state, setState] = useState({ status: 'loading', game: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const cached = gameCache.get(gameId);
    if (cached) { setState({ status: 'ready', game: cached }); return undefined; }
    let dead = false;
    let timer = null;
    const controller = new AbortController();
    setState({ status: 'loading', game: null });

    const load = async first => {
      if (!first && document.hidden) { timer = setTimeout(() => load(false), POLL_MS); return; }
      try {
        const game = await fetchGame(gameId, controller.signal);
        if (dead) return;
        if (game.events.length === 0) {
          if (first) setState({ status: 'empty', game: null });
        } else {
          setState(prev => (sameGame(prev.game, game) ? prev : { status: 'ready', game }));
        }
        if (game.finished) {
          if (game.events.length) gameCache.set(gameId, game);
          return;
        }
      } catch (err) {
        if (dead || err?.name === 'AbortError') return;
        if (first) { setState({ status: 'error', game: null }); return; }
      }
      if (live) timer = setTimeout(() => load(false), POLL_MS);
    };
    load(true);
    return () => { dead = true; controller.abort(); clearTimeout(timer); };
  }, [gameId, live, nonce]);

  return { ...state, reload: () => setNonce(n => n + 1) };
}

/* ────────────────────────────────────────────────────────────────────────────
   Top area: scoreboard + compact line
──────────────────────────────────────────────────────────────────────────── */

const PeriodDots = memo(function PeriodDots({ period, periods }) {
  return (
    <div className="flex items-center justify-center" style={{ gap: 6 }}>
      {Array.from({ length: periods }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 6,
            background: i + 1 === period ? ACCENT : '#27272a',
            boxShadow: i + 1 === period ? '0 0 8px rgba(37,99,235,0.8)' : 'none',
          }}
        />
      ))}
    </div>
  );
});

function TeamSide({ team, score, dim }) {
  return (
    <div className="flex flex-col items-center flex-1" style={{ minWidth: 0 }}>
      {team.logo && <img src={team.logo} alt={team.abbr} style={{ width: 36, height: 36 }} />}
      <span style={{ ...heading, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{team.abbr}</span>
      <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1, marginTop: 6, color: dim ? '#6b7280' : 'white', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </span>
    </div>
  );
}

const Scoreboard = memo(function Scoreboard({ away, home, aScore, hScore, clock, period, periods }) {
  return (
    <div className="flex items-start justify-between shrink-0" style={{ minHeight: 120, padding: '6px 12px 0' }}>
      <TeamSide team={away} score={aScore} dim={aScore < hScore} />
      <div className="flex flex-col items-center" style={{ paddingTop: 14, minWidth: 96 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
        <span style={{ fontSize: 12, color: MUTED, fontWeight: 600, margin: '2px 0 8px' }}>{periodLabel(period)}</span>
        <PeriodDots period={period} periods={periods} />
      </div>
      <TeamSide team={home} score={hScore} dim={hScore < aScore} />
    </div>
  );
});

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
      {[['board', 'Score'], ['shots', 'Shots']].map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
            view === id ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'text-gray-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Shot chart (SVG, feet; basket 5.25 ft from the top baseline)
──────────────────────────────────────────────────────────────────────────── */

const Court = memo(function Court() {
  return (
    <g fill="none" stroke="#3f3f46" strokeWidth="0.3" strokeLinecap="round">
      <rect x="0" y="0" width="50" height="47" />
      <rect x="17" y="0" width="16" height="19" />
      <path d="M19 19 A6 6 0 0 0 31 19" />
      <path d="M19 19 A6 6 0 0 1 31 19" strokeDasharray="1 1" />
      <path d="M3 0 V14.2 A23.75 23.75 0 0 0 47 14.2 V0" />
      <path d="M21 5.25 A4 4 0 0 0 29 5.25" />
      <path d="M22 4 H28" />
      <circle cx="25" cy="5.25" r="0.75" />
      <path d="M19 47 A6 6 0 0 1 31 47" />
    </g>
  );
});

const Dot = memo(function Dot({ x, y, made, color }) {
  return made
    ? <circle cx={x} cy={y} r={0.95} fill={color} opacity="0.9" />
    : <circle cx={x} cy={y} r={0.85} fill="none" stroke={color} strokeWidth="0.35" />;
});

const ShotChart = memo(function ShotChart({ shots, colors }) {
  return (
    <svg viewBox="-1.5 -1.5 53 50" width="100%" preserveAspectRatio="xMidYMid meet" style={{ height: '30vh', display: 'block' }}>
      <Court />
      {shots.map(s => <Dot key={s.id} x={s.x} y={s.y} made={s.made} color={colors[s.side]} />)}
    </svg>
  );
});

function Chip({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
        active ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-gray-300'
      }`}
      style={style}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Controls + scrubber
──────────────────────────────────────────────────────────────────────────── */

function IconBtn({ onClick, disabled, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex items-center justify-center rounded-full text-gray-300 disabled:opacity-30"
      style={{ width: 40, height: 40, background: 'none', border: 'none' }}
    >
      {children}
    </button>
  );
}

function Skip({ icon: Icon, secs }) {
  return (
    <span className="relative flex items-center justify-center" style={{ width: 26, height: 26 }}>
      <Icon className="w-6 h-6" />
      <span style={{ position: 'absolute', fontSize: 8, fontWeight: 800 }}>{secs}</span>
    </span>
  );
}

const DiffGraph = memo(function DiffGraph({ diff, nb, maxDiff, awayColor, homeColor }) {
  const H = 40, mid = 20;
  const bars = [];
  for (let b = 0; b < nb; b++) {
    const v = diff[b];
    if (!v) continue;
    const h = Math.max(1, (Math.abs(v) / maxDiff) * mid);
    bars.push(<rect key={b} x={b + 0.12} width={0.76} y={v > 0 ? mid - h : mid} height={h} fill={v > 0 ? awayColor : homeColor} opacity="0.6" />);
  }
  return (
    <svg viewBox={`0 0 ${nb} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
      {bars}
    </svg>
  );
});

function Scrubber({ model, pos, awayColor, homeColor, onSeek, onDragStart, onDragEnd }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const at = e => {
    const r = ref.current.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * model.domainMax;
  };
  const end = e => {
    if (!dragging.current) return;
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    onDragEnd();
  };
  const ticks = useMemo(
    () => Array.from({ length: model.periods - 1 }, (_, i) => (periodStart(i + 2) / model.domainMax) * 100),
    [model.periods, model.domainMax]
  );
  const p = clamp(pos / model.domainMax, 0, 1) * 100;
  const liveEdge = (model.endKey / model.domainMax) * 100;

  return (
    <div className="shrink-0" style={{ padding: '0 20px' }}>
      <div
        ref={ref}
        className="relative select-none"
        style={{ height: 48, touchAction: 'none', cursor: 'pointer' }}
        onPointerDown={e => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onDragStart();
          onSeek(at(e));
        }}
        onPointerMove={e => { if (dragging.current) onSeek(at(e)); }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4 }}>
          <DiffGraph diff={model.diff} nb={model.nb} maxDiff={model.maxDiff} awayColor={awayColor} homeColor={homeColor} />
        </div>
        {ticks.map(t => (
          <span key={t} style={{ position: 'absolute', left: `${t}%`, top: 6, height: 36, width: 1, background: '#3f3f46' }} />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 3, borderRadius: 3, background: '#27272a' }} />
        <div style={{ position: 'absolute', left: 0, width: `${p}%`, top: 22, height: 3, borderRadius: 3, background: ACCENT }} />
        {!model.finished && (
          <div style={{ position: 'absolute', left: `${liveEdge}%`, right: 0, top: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
        )}
        <div
          style={{
            position: 'absolute', left: `${p}%`, top: 24, width: 18, height: 18, marginLeft: -9, marginTop: -9,
            borderRadius: 18, background: ACCENT, boxShadow: '0 0 12px rgba(37,99,235,0.8)', pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Box score (derived from snapshots) and matchup
──────────────────────────────────────────────────────────────────────────── */

const STD_COLS = [
  { l: 'MIN', w: 46, hl: false, f: g => mmss(g(STAT.MIN)) },
  { l: 'PTS', w: 42, hl: true, f: g => g(STAT.PTS) },
  { l: 'REB', w: 42, hl: true, f: g => g(STAT.REB) },
  { l: 'AST', w: 42, hl: true, f: g => g(STAT.AST) },
  { l: 'STL', w: 42, hl: true, f: g => g(STAT.STL) },
  { l: 'BLK', w: 42, hl: true, f: g => g(STAT.BLK) },
];
const SHOOT_COLS = [
  { l: 'FGM', w: 40, hl: true, f: g => g(STAT.FGM) },
  { l: 'FGA', w: 40, hl: true, f: g => g(STAT.FGA) },
  { l: 'FG%', w: 58, hl: true, f: g => pct(g(STAT.FGM), g(STAT.FGA)) },
  { l: '3PM', w: 40, hl: true, f: g => g(STAT.TPM) },
  { l: '3PA', w: 40, hl: true, f: g => g(STAT.TPA) },
  { l: 'FTM', w: 40, hl: true, f: g => g(STAT.FTM) },
  { l: 'FTA', w: 40, hl: true, f: g => g(STAT.FTA) },
];
const NAME_W = 112;

const BoxScore = memo(function BoxScore({ model, snapI, side, shooting, activeIds, activeKey, autoscroll }) {
  const cols = shooting ? SHOOT_COLS : STD_COLS;
  const rowRefs = useRef({});
  const groups = model.bySide[side];

  useEffect(() => {
    if (!autoscroll || !activeKey) return;
    for (const id of activeIds) {
      const el = rowRefs.current[id];
      if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break; }
    }
  }, [activeKey, autoscroll, activeIds]);

  if (model.P === 0) {
    return <div className="text-center text-gray-500 text-sm" style={{ padding: 24 }}>Box score isn't available for this game.</div>;
  }

  const header = title => (
    <div className="flex items-center text-gray-500" style={{ fontSize: 10, height: 30, background: '#0a0a0a' }}>
      <span className="sticky left-0 z-10 flex-shrink-0 font-semibold" style={{ width: NAME_W, paddingLeft: 12, background: '#0a0a0a' }}>{title}</span>
      {cols.map(c => <span key={c.l} className="flex-shrink-0 text-center font-semibold" style={{ width: c.w }}>{c.l}</span>)}
    </div>
  );

  const row = p => {
    const active = activeIds.has(p.id);
    const bg = active ? '#18181b' : '#000';
    const base = snapI * model.P * S + p.i * S;
    const prev = Math.max(snapI - 1, 0) * model.P * S + p.i * S;
    const gCur = k => model.snap[base + k];
    const gPrev = k => model.snap[prev + k];
    const isOn = model.on[snapI * model.P + p.i] === 1;
    return (
      <div
        key={p.id}
        ref={el => { rowRefs.current[p.id] = el; }}
        className="flex items-center border-t border-zinc-900"
        style={{ height: 40, background: bg, fontSize: 13 }}
      >
        <div className="sticky left-0 z-10 flex items-center flex-shrink-0" style={{ width: NAME_W, paddingLeft: 12, background: bg }}>
          <span style={{ width: 12, flexShrink: 0 }}>
            {isOn && <span style={{ display: 'block', width: 6, height: 6, borderRadius: 6, background: '#ef4444' }} />}
          </span>
          <span className="truncate" style={{ color: p.dnp ? '#71717a' : '#e4e4e7', fontWeight: 600 }}>{p.short || p.name}</span>
        </div>
        {p.dnp ? (
          <span className="flex-shrink-0 text-gray-500" style={{ fontSize: 12, paddingLeft: 6, whiteSpace: 'nowrap' }}>DNP – {p.dnp}</span>
        ) : (
          cols.map(c => {
            const v = c.f(gCur);
            const changed = c.hl && v !== c.f(gPrev);
            return (
              <span
                key={c.l}
                className="flex-shrink-0 text-center"
                style={{ width: c.w, fontWeight: 600, color: '#e4e4e7', background: changed ? 'rgba(37,99,235,0.3)' : 'transparent', borderRadius: 6, lineHeight: '26px' }}
              >
                {v}
              </span>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="w-max min-w-full">
        {header('STARTERS')}
        {groups.starters.map(row)}
        {header('BENCH')}
        {groups.bench.map(row)}
      </div>
    </div>
  );
});

const Matchup = memo(function Matchup({ model, snapI, colors }) {
  const t = (side, k) => model.team[(snapI * 2 + (side === 'home' ? 1 : 0)) * TS + TEAM[k]];
  const shoot = (side, m, a) => `${a > 0 ? Math.round((t(side, m) / t(side, a)) * 100) : 0}% (${t(side, m)}-${t(side, a)})`;
  const ratio = (side, m, a) => (t(side, a) > 0 ? t(side, m) / t(side, a) : 0);
  const rows = [
    { label: 'PTS', a: String(t('away', 'PTS')), h: String(t('home', 'PTS')), av: t('away', 'PTS'), hv: t('home', 'PTS') },
    { label: 'FG', a: shoot('away', 'FGM', 'FGA'), h: shoot('home', 'FGM', 'FGA'), av: ratio('away', 'FGM', 'FGA'), hv: ratio('home', 'FGM', 'FGA') },
    { label: '3PT', a: shoot('away', 'TPM', 'TPA'), h: shoot('home', 'TPM', 'TPA'), av: ratio('away', 'TPM', 'TPA'), hv: ratio('home', 'TPM', 'TPA') },
    { label: 'FT', a: shoot('away', 'FTM', 'FTA'), h: shoot('home', 'FTM', 'FTA'), av: ratio('away', 'FTM', 'FTA'), hv: ratio('home', 'FTM', 'FTA') },
    { label: 'REB (OREB)', a: `${t('away', 'REB')} (${t('away', 'OREB')})`, h: `${t('home', 'REB')} (${t('home', 'OREB')})`, av: t('away', 'REB'), hv: t('home', 'REB') },
    { label: 'AST', a: String(t('away', 'AST')), h: String(t('home', 'AST')), av: t('away', 'AST'), hv: t('home', 'AST') },
    { label: 'STL', a: String(t('away', 'STL')), h: String(t('home', 'STL')), av: t('away', 'STL'), hv: t('home', 'STL') },
    { label: 'BLK', a: String(t('away', 'BLK')), h: String(t('home', 'BLK')), av: t('away', 'BLK'), hv: t('home', 'BLK') },
    { label: 'TOV', a: String(t('away', 'TOV')), h: String(t('home', 'TOV')), av: t('away', 'TOV'), hv: t('home', 'TOV'), inverse: true },
  ];
  return (
    <div style={{ padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {rows.map(r => {
        const total = r.av + r.hv;
        const ap = total > 0 ? (r.av / total) * 100 : 50;
        const aBetter = r.inverse ? r.av < r.hv : r.av > r.hv;
        const hBetter = r.inverse ? r.hv < r.av : r.hv > r.av;
        return (
          <div key={r.label}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-lg font-bold ${aBetter ? 'text-white' : 'text-gray-500'}`}>{r.a}</span>
              <span className="text-gray-400 text-sm font-semibold">{r.label}</span>
              <span className={`text-lg font-bold ${hBetter ? 'text-white' : 'text-gray-500'}`}>{r.h}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden" style={{ background: '#18181b' }}>
              <div style={{ width: `${ap}%`, backgroundColor: colors.away, opacity: 0.6 }} />
              <div style={{ width: `${100 - ap}%`, backgroundColor: colors.home }} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Player: all playback state lives here
──────────────────────────────────────────────────────────────────────────── */

function ReplayPlayer({ model, live, away, home, onClose, haptic }) {
  const { finished } = model;
  const following = live && !finished;

  const [pos, setPos] = useState(() => (following ? model.endKey : 0));
  const posRef = useRef(pos);
  const [playing, setPlaying] = useState(!following);
  const [attached, setAttached] = useState(following);   // live: riding the live edge
  const [speedIdx, setSpeedIdx] = useState(1);   // SPEEDS[1] = 8
  const [view, setView] = useState('board');
  const [tab, setTab] = useState('away');
  const [sides, setSides] = useState({ away: true, home: true });
  const [result, setResult] = useState('all');
  const [range, setRange] = useState('fg');
  const [soFar, setSoFar] = useState(true);
  const [autoscroll, setAutoscroll] = useState(true);
  const wasPlaying = useRef(false);

  const colors = useMemo(() => ({ away: lift(away.color), home: lift(home.color) }), [away.color, home.color]);

  const seek = useCallback(p => {
    const v = clamp(p, 0, model.endKey);
    posRef.current = v;
    setPos(v);
    if (following) setAttached(v >= model.endKey - 0.5);
  }, [model.endKey, following]);

  // Playback: one rAF loop, state committed about 30 times a second
  useEffect(() => {
    if (!playing || attached) return undefined;
    let raf = 0, last = 0, acc = 0;
    const tick = ts => {
      if (!last) last = ts;
      const dt = Math.min(ts - last, 100);
      last = ts; acc += dt;
      posRef.current = Math.min(model.endKey, posRef.current + (dt / 1000) * SPEEDS[speedIdx]);
      const done = posRef.current >= model.endKey;
      if (acc >= 32 || done) { acc = 0; setPos(posRef.current); }
      if (done) { if (following) setAttached(true); setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, attached, following, speedIdx, model.endKey]);

  // Live: while riding the live edge, stay on the newest play; if the game ends, stop there
  useEffect(() => {
    if (!attached) return;
    posRef.current = model.endKey;
    setPos(model.endKey);
    if (finished) { setAttached(false); setPlaying(false); }
  }, [attached, model.endKey, finished]);

  useEffect(() => { if (IS_DEV && finished) devVerify(model); }, [model, finished]);

  const E = model.E;
  const viewPos = attached ? model.endKey : pos;
  const idx = idxAt(model.keys, viewPos);
  const snapI = idx + 1;
  const ev = idx >= 0 ? model.events[idx] : null;
  const period = periodAt(viewPos, model.periods);
  const clock = mmss(Math.ceil(remainingAt(viewPos, period)));
  const aScore = ev ? ev.away : 0;
  const hScore = ev ? ev.home : 0;
  const atStart = viewPos <= model.keys[0] + 1e-9;
  const atEnd = viewPos >= model.endKey - 1e-9;
  const skip = SPEEDS[speedIdx];

  const activeIds = useMemo(() => new Set(ev ? eventPlayerIds(ev) : EMPTY), [ev]);

  const next = () => {
    haptic('selection');
    const i = idxAt(model.keys, posRef.current);
    if (i + 1 < E) seek(model.keys[i + 1]);
  };
  const prev = () => {
    haptic('selection');
    const i = idxAt(model.keys, posRef.current);
    const target = i >= 0 && posRef.current > model.keys[i] + 1e-9 ? i : i - 1;
    seek(target >= 0 ? model.keys[target] : 0);
  };
  const showPause = playing || attached;
  const togglePlay = () => {
    haptic('light');
    if (showPause) { setPlaying(false); setAttached(false); return; }
    if (posRef.current >= model.endKey - 1e-6) {
      if (following) { setAttached(true); return; }
      seek(0);
    }
    setPlaying(true);
  };

  const visibleShots = useMemo(() => {
    const n = soFar ? upperBound(model.shotKs, idx) : model.shots.length;
    return model.shots.slice(0, n).filter(s =>
      sides[s.side]
      && (result === 'all' || (result === 'made' ? s.made : !s.made))
      && (range === 'fg' || (range === 'three' ? s.three : !s.three))
    );
  }, [model, idx, soFar, sides, result, range]);

  const cycle = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
  const toggleSide = key => {
    haptic('selection');
    setSides(s => {
      const n = { ...s, [key]: !s[key] };
      return n.away || n.home ? n : s;
    });
  };

  const shooting = view === 'shots';
  const showLive = following && !attached && model.endKey - viewPos > 3;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0 border-b border-white/5" style={{ padding: '10px 16px' }}>
        <button onClick={onClose} aria-label="Close replay" className="text-gray-400 hover:text-white text-2xl font-light" style={{ background: 'none', border: 'none' }}>‹</button>
        {shooting ? (
          <div className="flex items-center text-xs font-bold" style={{ gap: 8, fontVariantNumeric: 'tabular-nums' }}>
            <span>{away.abbr} {aScore}</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-300">{periodLabel(period)} {clock}</span>
            <span className="text-gray-600">|</span>
            <span>{hScore} {home.abbr}</span>
          </div>
        ) : (
          <span style={{ ...heading, fontSize: 16, fontWeight: 700 }}>{away.abbr} @ {home.abbr}</span>
        )}
        <ViewToggle view={view} onChange={v => { haptic('selection'); setView(v); }} />
      </div>

      {/* Scoreboard or shot chart */}
      {shooting ? (
        <div className="shrink-0" style={{ padding: '4px 8px 0' }}>
          <ShotChart shots={visibleShots} colors={colors} />
          <div className="flex overflow-x-auto" style={{ gap: 6, padding: '8px 4px 2px' }}>
            <div className="flex flex-shrink-0 bg-zinc-900 rounded-full p-0.5" style={{ gap: 2 }}>
              {[['away', away], ['home', home]].map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => toggleSide(key)}
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{ border: `1px solid ${sides[key] ? colors[key] : 'transparent'}`, color: sides[key] ? 'white' : '#6b7280', background: 'none' }}
                >
                  {t.abbr}
                </button>
              ))}
            </div>
            <Chip onClick={() => { haptic('selection'); setResult(r => cycle(['all', 'made', 'missed'], r)); }}>
              {{ all: 'All Attempts', made: 'Makes', missed: 'Misses' }[result]}
            </Chip>
            <Chip onClick={() => { haptic('selection'); setRange(r => cycle(['fg', 'three', 'two'], r)); }}>
              {{ fg: 'FGs', three: 'Threes', two: 'Twos' }[range]}
            </Chip>
            <Chip onClick={() => { haptic('selection'); setSoFar(v => !v); }}>{soFar ? 'So Far' : 'Full Game'}</Chip>
            <Chip active={autoscroll} onClick={() => { haptic('selection'); setAutoscroll(v => !v); }}>Autoscroll</Chip>
          </div>
        </div>
      ) : (
        <Scoreboard away={away} home={home} aScore={aScore} hScore={hScore} clock={clock} period={period} periods={model.periods} />
      )}

      {/* Current play */}
      <div
        className="shrink-0 text-center text-sm text-gray-300"
        style={{ padding: '8px 24px', minHeight: 48, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {ev ? ev.text : 'Tip-off'}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '2px 16px 4px' }}>
      {attached ? (
          <span
            aria-label="Live, real-time"
            className="flex items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-gray-500"
            style={{ width: 52, height: 30, fontVariantNumeric: 'tabular-nums' }}
          >
            1×
          </span>
        ) : (
          <button
            onClick={() => { haptic('selection'); setSpeedIdx(i => (i + 1) % SPEEDS.length); }}
            aria-label="Change playback speed"
            className="rounded-full bg-zinc-900 text-xs font-bold text-gray-200"
            style={{ width: 52, height: 30, border: 'none', fontVariantNumeric: 'tabular-nums' }}
          >
            {skip}×
          </button>
        )}
        <div className="flex items-center" style={{ gap: 2 }}>
          <IconBtn label="Previous play" disabled={atStart} onClick={prev}><SkipBack className="w-5 h-5" fill="currentColor" /></IconBtn>
          <IconBtn label={`Back ${skip} seconds`} disabled={atStart} onClick={() => { haptic('selection'); seek(posRef.current - skip); }}><Skip icon={RotateCcw} secs={skip} /></IconBtn>
          <button
            onClick={togglePlay}
            aria-label={showPause ? 'Pause' : 'Play'}
            className="flex items-center justify-center rounded-full bg-blue-600 text-white"
            style={{ width: 52, height: 52, margin: '0 6px', border: 'none', boxShadow: '0 0 14px rgba(37,99,235,0.6)' }}
          >
                   {showPause ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <IconBtn label={`Forward ${skip} seconds`} disabled={atEnd} onClick={() => { haptic('selection'); seek(posRef.current + skip); }}><Skip icon={RotateCw} secs={skip} /></IconBtn>
          <IconBtn label="Next play" disabled={atEnd} onClick={next}><SkipForward className="w-5 h-5" fill="currentColor" /></IconBtn>
        </div>
        {showLive ? (
          <button
            onClick={() => { haptic('light'); seek(model.endKey); }}
            aria-label="Jump to live"
            className="flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold"
            style={{ width: 52, height: 30, gap: 5, border: 'none', boxShadow: '0 0 12px rgba(37,99,235,0.7)' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 6, background: '#ef4444' }} />
            LIVE
          </button>
        ) : (
          <span style={{ width: 52 }} />
        )}
      </div>

      {/* Scrubber */}
      <div className="relative shrink-0">
       
        <Scrubber
          model={model}
          pos={viewPos}
          awayColor={colors.away}
          homeColor={colors.home}
          onSeek={seek}
          onDragStart={() => { wasPlaying.current = playing || attached; setPlaying(false); }}
          onDragEnd={() => { if (wasPlaying.current) setPlaying(true); wasPlaying.current = false; }}
        />
      </div>

      {/* Box score / matchup */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ marginTop: 6, borderTop: '1px solid #171717' }}>
        {tab === 'match' ? (
          <Matchup model={model} snapI={snapI} colors={colors} />
        ) : (
          <BoxScore
            model={model}
            snapI={snapI}
            side={tab}
            shooting={shooting}
            activeIds={activeIds}
            activeKey={ev ? ev.id : null}
            autoscroll={autoscroll && shooting}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 shrink-0" style={{ padding: '8px 16px 12px' }}>
        {[['away', away.abbr], ['match', 'Matchup'], ['home', home.abbr]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { haptic('selection'); setTab(id); }}
            className={`flex-1 py-2 rounded-xl font-bold text-base transition-colors ${tab === id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'}`}
            style={{ ...heading, border: 'none' }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Entry: loads data on mount (nothing is fetched before the button is pressed)
──────────────────────────────────────────────────────────────────────────── */

function Message({ onClose, children }) {
  return (
    <>
      <div className="flex items-center shrink-0 border-b border-white/5" style={{ padding: '10px 16px' }}>
        <button onClick={onClose} aria-label="Close replay" className="text-gray-400 hover:text-white text-2xl font-light" style={{ background: 'none', border: 'none' }}>‹</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 text-sm" style={{ padding: 24, gap: 14 }}>
        {children}
      </div>
    </>
  );
}

export default function GameReplay({ gameId, live = false, away, home, onClose, onHaptic }) {
  const haptic = useCallback(k => { if (typeof onHaptic === 'function') onHaptic(k); }, [onHaptic]);
  const { status, game, reload } = useReplayData(gameId, live);
  const model = useMemo(() => (game ? buildModel(game) : null), [game]);

  let body;
  if (status === 'ready' && model) {
    body = <ReplayPlayer model={model} live={live} away={away} home={home} onClose={onClose} haptic={haptic} />;
  } else if (status === 'error') {
    body = (
      <Message onClose={onClose}>
        <span>Couldn't load play-by-play for this game.</span>
        <button onClick={reload} className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold" style={{ border: 'none' }}>Try again</button>
      </Message>
    );
  } else if (status === 'empty') {
    body = <Message onClose={onClose}>{live ? 'Waiting for the first play…' : 'No play-by-play is available for this game.'}</Message>;
  } else {
    body = (
      <Message onClose={onClose}>
        <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
        <span>Loading replay…</span>
      </Message>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black text-white flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', animation: 'slideInRight 0.3s ease-out' }}
    >
      {body}
    </div>
  );
}