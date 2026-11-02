import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZONES, findTeam, loadTeamTotals, loadOppTotals, nbaSeason } from './pbpstatsTeams';
import { loadTeamShots, loadTeamPlays } from './espnShots';

/* ────────────────────────────────────────────────────────────────────────────
   Constants + helpers
──────────────────────────────────────────────────────────────────────────── */

const ACCENT = '#2563eb';
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const RED = '#ef4444';
const heading = { fontFamily: 'Rajdhani, sans-serif' };

const TABS = [['shots', 'Shots'], ['assists', 'Assists'], ['team', 'Team'], ['factors', 'Factors']];

const ordinal = n => {
  const v = Math.abs(n) % 100;
  const sfx = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${sfx}`;
};
const rankTone = r => (r <= 10 ? GREEN : r > 20 ? '#f87171' : MUTED);
const f1 = v => v.toFixed(1);
const pct1 = v => `${(v * 100).toFixed(1)}%`;
const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const signColor = v => (v > 0 ? GREEN : v < 0 ? RED : 'white');

/** 1 + the number of teams strictly better than `me` on fn. */
const rank = (teams, fn, me, high = true) => {
  const v = fn(me);
  return 1 + teams.filter(t => (high ? fn(t) > v : fn(t) < v)).length;
};

const grid = n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: 2, rowGap: 16 });

/* ────────────────────────────────────────────────────────────────────────────
   Small pieces (same look as the team page)
──────────────────────────────────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={heading}>{children}</h5>
  );
}

function Stat({ label, value, rank: r, tone = true, valueColor }) {
  const colored = !!r && tone;
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: valueColor || 'white', lineHeight: 1.15, marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: colored ? rankTone(r) : MUTED, fontWeight: colored ? 700 : 500, marginTop: 3, minHeight: 14 }}>
        {r ? ordinal(r) : ''}
      </span>
    </div>
  );
}

function Box({ value, valueColor, label }) {
  return (
    <div className="rounded-2xl" style={{ background: '#0a0a0a', border: '1px solid #171717', padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: valueColor || 'white', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 3 }}>{label}</div>
    </div>
  );
}

const Note = ({ children }) => (
  <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginTop: 16 }}>{children}</p>
);

function Empty({ children }) {
  return (
    <div className="rounded-2xl text-center" style={{ padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 12, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function TabToggle({ tab, onChange }) {
  return (
    <div className="flex" style={{ marginBottom: 16 }}>
    <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
      {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all ${
              tab === id ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tab: Team (ratings and pace)
──────────────────────────────────────────────────────────────────────────── */

function TeamTab({ teams, me }) {
  const rows = useMemo(() => {
    const ortg = t => (t.offPoss > 0 ? (t.pts / t.offPoss) * 100 : 0);
    const drtg = t => (t.defPoss > 0 ? (t.opp / t.defPoss) * 100 : 0);
    const net = t => ortg(t) - drtg(t);
    const ppg = t => (t.gp > 0 ? t.pts / t.gp : 0);
    const oppg = t => (t.gp > 0 ? t.opp / t.gp : 0);
    const cell = (label, fn, high, fmt, opts = {}) => ({ label, value: fmt(fn(me)), rank: rank(teams, fn, me, high), ...opts });
    return [
      [cell('ORTG', ortg, true, f1), cell('DRTG', drtg, false, f1), cell('NET', net, true, signed, { color: signColor(net(me)) })],
      [cell('PACE', t => t.pace, true, f1, { tone: false }), cell('PPG', ppg, true, f1), cell('OPPG', oppg, false, f1)],
    ];
  }, [teams, me]);

  return (
    <div>
      <SectionTitle>Ratings</SectionTitle>
      <div style={{ ...grid(3), marginTop: 18 }}>
        {rows[0].map(c => <Stat key={c.label} label={c.label} value={c.value} rank={c.rank} valueColor={c.color} />)}
      </div>
      <div style={{ ...grid(3), marginTop: 18 }}>
        {rows[1].map(c => <Stat key={c.label} label={c.label} value={c.value} rank={c.rank} tone={c.tone} />)}
      </div>
      <Note>
        {me.gp} games. Ratings are points per 100 possessions, with possessions counted by pbpstats. Pace is possessions per 48 minutes. Small numbers are the NBA rank among {teams.length} teams (DRTG and OPPG: 1st = fewest allowed).
      </Note>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tab: Factors (offense)
──────────────────────────────────────────────────────────────────────────── */

function FactorsTab({ teams, me }) {
  const cells = useMemo(() => {
    const fga = t => t.fg2a + t.fg3a;
    const tovPct = t => { const d = fga(t) + 0.44 * t.fta + t.tov; return d > 0 ? t.tov / d : 0; };
    const ftRate = t => (fga(t) > 0 ? t.ftm / fga(t) : 0);
    const cell = (label, fn, high) => ({ label, value: pct1(fn(me)), rank: rank(teams, fn, me, high) });
    return [
      cell('EFG%', t => t.efg, true),
      cell('TOV%', tovPct, false),
      cell('OREB%', t => t.oreb, true),
      cell('FT RATE', ftRate, true),
    ];
  }, [teams, me]);

  return (
    <div>
      <SectionTitle>Offense</SectionTitle>
      <div style={{ ...grid(4), marginTop: 18 }}>
        {cells.map(c => <Stat key={c.label} label={c.label} value={c.value} rank={c.rank} />)}
      </div>
      <Note>
        eFG% = (FGM + 0.5 × 3PM) ÷ FGA. TOV% = turnovers ÷ (FGA + 0.44 × FTA + turnovers). OREB% is the offensive rebound rate from pbpstats. FT rate = free throws made ÷ FGA. Small numbers are the NBA rank among {teams.length} teams (TOV%: 1st = fewest). Offense only for now.
      </Note>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tab: Shots (zones: FG%, share, points vs league average)
──────────────────────────────────────────────────────────────────────────── */

const ZONE_GRID = 'minmax(0, 1fr) 64px 50px 46px 50px';
const OPP_COLOR = '#71717a';
const VIEWS = [['bars', 'Bars'], ['map', 'Zones'], ['dots', 'Shots']];

/* color helpers: opaque mixes so overlapping court zones don't bleed through each other */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const zoneFill = r => {
  if (r.fga < 3) return '#18181b';
  const d = r.pct - r.lgPct;
  if (Math.abs(d) < 0.005) return '#27272a';
  return mix('#0a0a0a', d > 0 ? GREEN : RED, 0.22 + Math.min(Math.abs(d) / 0.08, 1) * 0.4);
};

function leagueAvg(teams) {
  const lg = {};
  ZONES.forEach(z => {
    let m = 0, a = 0;
    teams.forEach(t => { m += t.z[z.key][0]; a += t.z[z.key][1]; });
    lg[z.key] = a > 0 ? m / a : 0;
  });
  return lg;
}

export function buildZones(teams, me, oppMe) {
  const lg = leagueAvg(teams);
  const rowsFor = t => {
    const tot = ZONES.reduce((s, z) => s + t.z[z.key][1], 0);
    return ZONES.map(z => {
      const [m, a] = t.z[z.key];
      return {
        key: z.key, label: z.label, range: z.range, zpts: z.pts, fgm: m, fga: a,
        pct: a > 0 ? m / a : 0,
        share: tot > 0 ? a / tot : 0,
        pts: m * z.pts,
        exp: a * z.pts * lg[z.key],   // points an average shooter scores on the same shots
      };
    });
  };
  const all = teams.map(rowsFor);
  const mine = rowsFor(me);
  const fga = mine.reduce((s, r) => s + r.fga, 0);
  if (fga === 0) return null;
  const rows = mine.map((r, zi) => ({
    ...r,
    lgPct: lg[r.key],
    vsAvg: r.pts - r.exp,
    pctRank: 1 + all.filter(rs => rs[zi].pct > r.pct).length,
    shareRank: 1 + all.filter(rs => rs[zi].share > r.share).length,
  }));
  const opp = oppMe
    ? ZONES.map(z => {
        const [m, a] = oppMe.z[z.key];
        return { fgm: m, fga: a, pct: a > 0 ? m / a : 0, pts: m * z.pts, pot: a * z.pts };
      })
    : null;
  const pts = rows.reduce((s, r) => s + r.pts, 0);
  const exp = rows.reduce((s, r) => s + r.exp, 0);
  return { rows, opp, fga, pts, exp, xPps: exp / fga, diff: pts - exp };
}

function Pills({ items, value, onChange }) {
  return (
    <div className="flex" style={{ margin: '12px 0 14px' }}>
      <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
        {items.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-3 py-0.5 rounded-full text-[11px] font-bold transition-all ${value === id ? 'bg-zinc-700 text-white' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Bars: points scored vs missed, team vs opponents ── */

function BarLine({ label, color, pts, pot, max, fgm, fga, pct }) {
  const w = v => `${Math.min(v / max, 1) * 100}%`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) 58px', columnGap: 8, alignItems: 'center', marginTop: 6 }}>
      <span style={{ ...heading, fontSize: 13, fontWeight: 700, color: '#e4e4e7' }}>{label}</span>
      <div style={{ position: 'relative', height: 22 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w(pot), borderRadius: 4, background: `repeating-linear-gradient(135deg, ${color}66 0 3px, transparent 3px 6px)` }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w(pts), borderRadius: 4, background: color, display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 11, fontWeight: 800 }}>
          {pts / max > 0.1 ? pts : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{fga > 0 ? `${Math.round(pct * 100)}%` : '—'}</div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{fgm}-{fga}</div>
      </div>
    </div>
  );
}

function ZoneBars({ t, teamAbbr }) {
  const max = Math.max(1, ...t.rows.map(r => r.fga * r.zpts), ...(t.opp ? t.opp.map(o => o.pot) : []));
  const swatch = (color, hatched) => (
    <i style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6, verticalAlign: -1,
      background: hatched ? `repeating-linear-gradient(135deg, ${color}99 0 2px, transparent 2px 4px)` : color,
    }} />
  );
  return (
    <div>
      {t.rows.map((r, i) => (
        <div key={r.key} style={{ marginTop: i ? 14 : 0 }}>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{r.label}</div>
          <BarLine label={teamAbbr} color={ACCENT} pts={r.pts} pot={r.fga * r.zpts} max={max} fgm={r.fgm} fga={r.fga} pct={r.pct} />
          {t.opp && <BarLine label="OPP" color={OPP_COLOR} pts={t.opp[i].pts} pot={t.opp[i].pot} max={max} fgm={t.opp[i].fgm} fga={t.opp[i].fga} pct={t.opp[i].pct} />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 11, color: MUTED, fontWeight: 600 }}>
        <span>{swatch(ACCENT, false)}Points scored</span>
        <span>{swatch(ACCENT, true)}Missed</span>
      </div>
    </div>
  );
}

/* ── Court drawing (shared by the zone map and the shot dots). Units: tenths of a foot, hoop at (250, 52.5). ── */

const CW = 500, CH = 400, HX = 250, HY = 52.5, R3 = 237.5, CORNER_X = 30;
const ARC_Y = HY + Math.sqrt(R3 ** 2 - (HX - CORNER_X) ** 2);
const THREE_PATH = `M${CORNER_X} 0 V${ARC_Y} A${R3} ${R3} 0 0 0 ${CW - CORNER_X} ${ARC_Y} V0`;

function CourtLines({ stroke = '#a1a1aa', opacity = 0.35 }) {
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

function ZoneLabel({ x, y, row, size = 20, rotate }) {
  const pct = row.fga > 0 ? `${Math.round(row.pct * 100)}%` : '—';
  const base = { fill: '#fff', textAnchor: 'middle', fontWeight: 800, paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 3, style: { pointerEvents: 'none' } };
  if (rotate) {
    return (
      <text x={x} y={y} fontSize={size} dominantBaseline="central" transform={`rotate(${rotate} ${x} ${y})`} {...base}>
        {row.fgm}-{row.fga} · {pct}
      </text>
    );
  }
  return (
    <g>
      <text x={x} y={y} fontSize={size} {...base}>{row.fgm}-{row.fga}</text>
      <text x={x} y={y + size * 0.95} fontSize={size * 0.85} {...base}>{pct}</text>
    </g>
  );
}

function ZoneMap({ rows }) {
  const r = Object.fromEntries(rows.map(x => [x.key, x]));
  const edge = { stroke: '#000', strokeWidth: 3 };
  return (
    <div>
      <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#0a0a0a' }}>
        <rect width={CW} height={CH} fill={zoneFill(r.Arc3)} />
        <rect x="0" y="0" width={CORNER_X} height={ARC_Y} fill={zoneFill(r.Corner3)} {...edge} />
        <rect x={CW - CORNER_X} y="0" width={CORNER_X} height={ARC_Y} fill={zoneFill(r.Corner3)} {...edge} />
        <path d={`${THREE_PATH} Z`} fill={zoneFill(r.LongMidRange)} {...edge} />
        <circle cx={HX} cy={HY} r="140" fill={zoneFill(r.ShortMidRange)} {...edge} />
        <circle cx={HX} cy={HY} r="40" fill={zoneFill(r.AtRim)} {...edge} />
        <CourtLines />
        <ZoneLabel x={HX} y={78} row={r.AtRim} size={14} />
        <ZoneLabel x={HX} y={140} row={r.ShortMidRange} />
        <ZoneLabel x={HX} y={232} row={r.LongMidRange} />
        <ZoneLabel x={HX} y={335} row={r.Arc3} />
        <ZoneLabel x={15} y={71} row={r.Corner3} size={13} rotate={-90} />
        <ZoneLabel x={CW - 15} y={71} row={r.Corner3} size={13} rotate={-90} />
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: MUTED, fontWeight: 600 }}>
        <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6, background: GREEN }} />Better than league avg</span>
        <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 6, background: RED }} />Worse</span>
      </div>
      <Note>Each zone: makes-attempts and FG%. Shade deepens with the gap to the league average there. Fewer than 3 shots stays gray.</Note>
    </div>
  );
}

/* ── Shot dots ── */

function ShotDots({ shots, loading }) {
  const made = shots.filter(s => s[2]);
  const missD = shots.filter(s => !s[2]).map(([x, y]) => `M${x - 5} ${y - 5}l10 10m-10 0l10-10`).join('');
  return (
    <div>
      <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16, background: '#0a0a0a' }}>
        <CourtLines opacity={0.25} />
        <path d={missD} fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" />
        {made.map((s, i) => <circle key={i} cx={s[0]} cy={s[1]} r="6" fill="#3b82f6" fillOpacity="0.85" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 12, fontSize: 11, color: MUTED, fontWeight: 600 }}>
        <span style={{ color: '#3b82f6' }}>● <span style={{ color: MUTED }}>Made</span></span>
        <span>× Missed</span>
        <span>{made.length}-{shots.length} FG{loading ? ' · loading…' : ''}</span>
      </div>
    </div>
  );
}

/* ── Shot quality vs shot making (all teams) ── */

function QualityScatter({ teams, me, teamAbbr }) {
  const d = useMemo(() => {
    const lg = leagueAvg(teams);
    const stat = t => {
      let fga = 0, exp = 0, pts = 0;
      ZONES.forEach(z => { const [m, a] = t.z[z.key]; fga += a; exp += a * z.pts * lg[z.key]; pts += m * z.pts; });
      return fga > 0 ? { abbr: t.abbr, x: exp / (2 * fga), y: pts / (2 * fga) } : null;
    };
    const all = teams.map(stat).filter(Boolean);
    const mine = stat(me);
    if (!mine || all.length < 10) return null;
    const mean = k => all.reduce((s, p) => s + p[k], 0) / all.length;
    return {
      all, mine, mx: mean('x'), my: mean('y'),
      xRank: 1 + all.filter(p => p.x > mine.x).length,
      yRank: 1 + all.filter(p => p.y > mine.y).length,
    };
  }, [teams, me]);
  if (!d) return null;

  const W = 500, H = 420, PL = 34, PR = 16, PT = 16, PB = 36;
  const ext = k => {
    const v = d.all.map(p => p[k]);
    const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.12 || 0.01;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = ext('x'), [y0, y1] = ext('y');
  const sx = v => PL + ((v - x0) / (x1 - x0)) * (W - PL - PR);
  const sy = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const q = { fill: '#52525b', fontSize: 12, fontFamily: 'ui-monospace, monospace' };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 12 }}>
        <line x1={sx(d.mx)} x2={sx(d.mx)} y1={PT} y2={H - PB} stroke="#3f3f46" strokeDasharray="3 4" />
        <line x1={PL} x2={W - PR} y1={sy(d.my)} y2={sy(d.my)} stroke="#3f3f46" strokeDasharray="3 4" />
        <text x={PL + 8} y={PT + 14} {...q}>tough shots, made them</text>
        <text x={W - PR - 8} y={PT + 14} textAnchor="end" {...q}>good shots, made them</text>
        <text x={PL + 8} y={H - PB - 8} {...q}>tough shots, missed</text>
        <text x={W - PR - 8} y={H - PB - 8} textAnchor="end" {...q}>good shots, missed</text>
        <text x={(PL + W - PR) / 2} y={H - 10} textAnchor="middle" {...q}>Shot quality (expected eFG%) →</text>
        <text x="12" y={(PT + H - PB) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PT + H - PB) / 2})`} {...q}>Actual eFG% →</text>
        {d.all.filter(p => p.abbr !== me.abbr).map(p => (
          <circle key={p.abbr} cx={sx(p.x)} cy={sy(p.y)} r="5" fill="#71717a" fillOpacity="0.8"><title>{p.abbr}</title></circle>
        ))}
        <circle cx={sx(d.mine.x)} cy={sy(d.mine.y)} r="7.5" fill={ACCENT} stroke="#fff" strokeWidth="2" />
        <text x={sx(d.mine.x) + 13} y={sy(d.mine.y) + 4} fontSize="13" fontWeight="800" fill="#60a5fa">{teamAbbr}</text>
      </svg>
      <div style={{ ...grid(2), marginTop: 14 }}>
        <Stat label="SHOT QUALITY" value={pct1(d.mine.x)} rank={d.xRank} />
        <Stat label="ACTUAL EFG%" value={pct1(d.mine.y)} rank={d.yRank} />
      </div>
      <Note>
        Shot quality = expected eFG%: what a league-average shooter would score on this team's shots, zone by zone. Actual eFG% = points ÷ (2 × FGA) on the same shots. Dotted lines are the league average. Small numbers are the NBA rank among {teams.length} teams (1st = highest).
      </Note>
    </div>
  );
}

function ShotsTab({ teams, me, oppMe, teamAbbr, season, haptic }) {
  const t = useMemo(() => buildZones(teams, me, oppMe), [teams, me, oppMe]);
  const [view, setView] = useState('bars');
  const [dots, setDots] = useState({ status: 'idle', shots: [] });
  const [retry, setRetry] = useState(0);

  // Shot locations are the heavy part, so they only load when the Shots view is opened.
  useEffect(() => {
    if (view !== 'dots') return undefined;
    let dead = false;
    setDots(d => ({ status: 'loading', shots: d.shots }));
    loadTeamShots(teamAbbr, season, shots => { if (!dead) setDots({ status: 'loading', shots }); })
      .then(shots => { if (!dead) setDots({ status: 'ready', shots }); })
      .catch(() => { if (!dead) setDots(d => ({ status: 'error', shots: d.shots })); });
    return () => { dead = true; };
  }, [view, teamAbbr, season, retry]);

  if (!t) return <Empty>Shot zone data isn't available yet.</Empty>;

  let chart;
  if (view === 'bars') {
    chart = <ZoneBars t={t} teamAbbr={teamAbbr} />;
  } else if (view === 'map') {
    chart = <ZoneMap rows={t.rows} />;
  } else if (dots.shots.length) {
    chart = <ShotDots shots={dots.shots} loading={dots.status === 'loading'} />;
  } else if (dots.status === 'error') {
    chart = (
      <Empty>
        <div>Shot locations aren't available right now.</div>
        <button
          onClick={() => { haptic('light'); setRetry(n => n + 1); }}
          style={{ marginTop: 12, background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Try again
        </button>
      </Empty>
    );
  } else if (dots.status === 'ready') {
    chart = <Empty>No shot locations yet.</Empty>;
  } else {
    chart = <div className="skeleton rounded-2xl" style={{ height: 240 }} />;
  }

  return (
    <div>
      <SectionTitle>Shot chart</SectionTitle>
      <Pills items={VIEWS} value={view} onChange={v => { haptic('selection'); setView(v); }} />
      {chart}

      <div style={{ marginTop: 28 }}>
        <SectionTitle>By zone</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
          <Box value={t.xPps.toFixed(2)} label={`xPts per shot · ${t.fga} FGA`} />
          <Box value={signed(t.diff)} valueColor={signColor(t.diff)} label={`${t.pts} pts vs ${t.exp.toFixed(1)} exp.`} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: ZONE_GRID, columnGap: 4, paddingBottom: 8, fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>
            <span>ZONE</span>
            <span style={{ textAlign: 'center' }}>FG</span>
            <span style={{ textAlign: 'center' }}>FG%</span>
            <span style={{ textAlign: 'center' }}>SHARE</span>
            <span style={{ textAlign: 'right' }}>VS AVG</span>
          </div>
          {t.rows.map(r => {
            const d = r.pct - r.lgPct;
            const pctColor = d > 0.015 ? GREEN : d < -0.015 ? RED : 'white';
            return (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: ZONE_GRID, columnGap: 4, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #131313' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{r.label}</div>
                  {r.range && <div style={{ fontSize: 10, fontWeight: 500, color: MUTED, marginTop: 1 }}>{r.range}</div>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.fgm}-{r.fga}</span>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: pctColor }}>{r.fga > 0 ? `${Math.round(r.pct * 100)}%` : '—'}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: rankTone(r.pctRank), marginTop: 1 }}>{ordinal(r.pctRank)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{Math.round(r.share * 100)}%</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginTop: 1 }}>{ordinal(r.shareRank)}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'right', color: signColor(r.vsAvg) }}>{signed(r.vsAvg)}</span>
              </div>
            );
          })}
        </div>

        <Note>
          {t.pts} points on {t.fga} field goal attempts ({(t.pts / t.fga).toFixed(2)} per shot), {me.gp} games. FG% is colored against the league average in each zone. Vs avg = points above or below what an average shooter scores on the same shots. Small numbers are the NBA rank among {teams.length} teams (FG%: 1st = best; Share: 1st = most of their shots). Corner 3s are along the baseline, where the line is 22 ft; above-the-break 3s are every other 3.
        </Note>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionTitle>Shot quality vs shot making</SectionTitle>
        <QualityScatter teams={teams} me={me} teamAbbr={teamAbbr} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Tab: Assists (by zone)
──────────────────────────────────────────────────────────────────────────── */

const totalAst = t => ZONES.reduce((s, z) => s + t.z[z.key][2], 0);

export function buildAssists(teams, me) {
  const rowsFor = t => {
    const tot = totalAst(t);
    return ZONES.map(z => {
      const [m, , a] = t.z[z.key];
      return { key: z.key, label: z.label, ast: a, fgm: m, share: tot > 0 ? a / tot : 0, pct: m > 0 ? a / m : 0 };
    });
  };
  if (totalAst(me) === 0) return null;
  const all = teams.map(rowsFor);
  const rows = rowsFor(me).map((r, zi) => ({
    ...r,
    shareRank: 1 + all.filter(rs => rs[zi].share > r.share).length,
    pctRank: 1 + all.filter(rs => rs[zi].pct > r.pct).length,
  }));
  const apg = t => (t.gp > 0 ? totalAst(t) / t.gp : 0);
  const assistedPct = t => { const m = t.fg2m + t.fg3m; return m > 0 ? totalAst(t) / m : 0; };
  return {
    rows,
    apg: apg(me), apgRank: rank(teams, apg, me, true),
    assisted: assistedPct(me), assistedRank: rank(teams, assistedPct, me, true),
  };
}

/* ── Assist network: who set up whom ── */

function buildNetwork(d) {
    if (!d || !d.pairs.length) return null;
    const cnt = {}, given = {}, got = {};
    let max = 1;
    d.pairs.forEach(([p, s]) => {
      if (p === s) return;
      const row = (cnt[p] = cnt[p] || {});
      row[s] = (row[s] || 0) + 1;
      if (row[s] > max) max = row[s];
      given[p] = (given[p] || 0) + 1;
      got[s] = (got[s] || 0) + 1;
    });
    const ids = [...new Set([...Object.keys(given), ...Object.keys(got)])];
    if (!ids.length) return null;
    const nodes = [...ids].sort((a, b) => (given[b] || 0) - (given[a] || 0) || (got[b] || 0) - (got[a] || 0));
    const cols = [...ids].sort((a, b) => (got[b] || 0) - (got[a] || 0) || (given[b] || 0) - (given[a] || 0));
    return { cnt, given, got, max, nodes, cols, rows: nodes.filter(id => given[id]), name: id => d.names[id] || '?' };
  }
  
  function NetworkGraph({ net, sel, onSel }) {
    const W = 500, H = 450, cx = 250, cy = 225, R = 150;
    const f = v => v.toFixed(1);
    const N = net.nodes.length;
    const maxGiven = Math.max(1, net.given[net.nodes[0]] || 1);
    const P = {};
    net.nodes.forEach((id, i) => {
      const ang = -Math.PI / 2 + (i / N) * Math.PI * 2;
      P[id] = { ang, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), r: 9 + 13 * Math.sqrt((net.given[id] || 0) / maxGiven) };
    });
  
    const edges = [];
    Object.entries(net.cnt).forEach(([p, row]) => Object.entries(row).forEach(([s, c]) => {
      const A = P[p], B = P[s];
      if (!A || !B) return;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      // bulge to the left of travel so A->B and B->A curve to opposite sides
      const mx = (A.x + B.x) / 2 - uy * d * 0.16, my = (A.y + B.y) / 2 + ux * d * 0.16;
      const sl = Math.hypot(mx - A.x, my - A.y) || 1;
      const sx = A.x + ((mx - A.x) / sl) * (A.r + 1), sy = A.y + ((my - A.y) / sl) * (A.r + 1);
      const el = Math.hypot(B.x - mx, B.y - my) || 1;
      const tx = (B.x - mx) / el, ty = (B.y - my) / el;
      const w = Math.min(0.8 + c * 0.8, 6);
      const h = 5 + w * 1.3;
      const tipX = B.x - tx * (B.r + 2), tipY = B.y - ty * (B.r + 2);
      const bx = tipX - tx * h, by = tipY - ty * h;
      edges.push({
        p, s, c, w,
        d: `M${f(sx)} ${f(sy)} Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`,
        head: `${f(tipX)},${f(tipY)} ${f(bx - ty * h * 0.5)},${f(by + tx * h * 0.5)} ${f(bx + ty * h * 0.5)},${f(by - tx * h * 0.5)}`,
      });
    }));
  
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}>
        {edges.map(e => {
          const hot = sel && (e.p === sel || e.s === sel);
          const op = sel ? (hot ? 0.9 : 0.05) : 0.18 + 0.55 * (e.c / net.max);
          return (
            <g key={`${e.p}-${e.s}`} opacity={op} style={{ pointerEvents: 'none' }}>
              <path d={e.d} fill="none" stroke="#3b82f6" strokeWidth={e.w} strokeLinecap="round" />
              <polygon points={e.head} fill="#3b82f6" />
            </g>
          );
        })}
        {net.nodes.map(id => {
          const n = P[id];
          const on = sel === id;
          const cosA = Math.cos(n.ang), sinA = Math.sin(n.ang);
          const off = n.r + 8 + 7 * Math.abs(sinA);
          const anchor = cosA > 0.3 ? 'start' : cosA < -0.3 ? 'end' : 'middle';
          return (
            <g key={id} onClick={() => onSel(on ? null : id)} style={{ cursor: 'pointer' }} opacity={sel && !on ? 0.5 : 1}>
              <circle cx={n.x} cy={n.y} r={n.r + 6} fill="transparent" />
              <circle cx={n.x} cy={n.y} r={n.r} fill="#0a0a0a" stroke={on ? '#fff' : ACCENT} strokeWidth="2" />
              {net.given[id] ? (
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="800" fill="#60a5fa">{net.given[id]}</text>
              ) : null}
              <text x={cx + (R + off) * cosA} y={cy + (R + off) * sinA} textAnchor={anchor} dominantBaseline="central" fontSize="13" fontWeight="700" fill={on ? '#fff' : '#e4e4e7'}>
                {net.name(id)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }
  
  function AssistMatrix({ net }) {
    const head = { position: 'sticky', left: 0, background: '#000', zIndex: 1 };
    return (
      <div style={{ overflowX: 'auto', marginTop: 18 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left', fontSize: 9, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', padding: '0 10px 6px 0', verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>
                PASSER ↓<br />SCORER →
              </th>
              {net.cols.map(id => (
                <th key={id} style={{ padding: '0 0 6px', verticalAlign: 'bottom' }}>
                  <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap', margin: '0 auto' }}>
                    {net.name(id).toUpperCase()}
                  </div>
                </th>
              ))}
              <th style={{ fontSize: 9, color: MUTED, fontWeight: 600, padding: '0 0 6px 10px', verticalAlign: 'bottom', textAlign: 'right' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {net.rows.map(p => (
              <tr key={p} style={{ borderTop: '1px solid #131313' }}>
                <td style={{ ...head, fontSize: 13, fontWeight: 700, padding: '6px 10px 6px 0', whiteSpace: 'nowrap' }}>{net.name(p)}</td>
                {net.cols.map(s => {
                  const c = net.cnt[p]?.[s] || 0;
                  return (
                    <td key={s} style={{ minWidth: 26, width: 26, height: 28, textAlign: 'center', fontWeight: 700, color: c ? 'white' : '#27272a', background: c ? `rgba(37,99,235,${0.14 + 0.6 * (c / net.max)})` : 'transparent' }}>
                      {c || '·'}
                    </td>
                  );
                })}
                <td style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', paddingLeft: 10 }}>{net.given[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  function AssistNetwork({ teamAbbr, season, haptic }) {
    const [st, setSt] = useState({ status: 'loading', data: null });
    const [retry, setRetry] = useState(0);
    const [sel, setSel] = useState(null);
  
    useEffect(() => {
      let dead = false;
      setSt(s => ({ status: 'loading', data: s.data }));
      loadTeamPlays(teamAbbr, season, data => { if (!dead) setSt({ status: 'loading', data }); })
        .then(data => { if (!dead) setSt({ status: 'ready', data }); })
        .catch(() => { if (!dead) setSt(s => ({ status: 'error', data: s.data })); });
      return () => { dead = true; };
    }, [teamAbbr, season, retry]);
  
    const net = useMemo(() => buildNetwork(st.data), [st.data]);
  
    let body;
    if (net) {
      body = (
        <div>
          <NetworkGraph net={net} sel={sel} onSel={id => { haptic('selection'); setSel(id); }} />
          <AssistMatrix net={net} />
          <Note>
            {st.status === 'loading' ? 'Loading more games… ' : ''}
            Arrows run from passer to scorer; thicker means more assists. The number in each circle is assists given. Tap a player to isolate their passes. Built from ESPN play-by-play, assisted made field goals only.
          </Note>
        </div>
      );
    } else if (st.status === 'error') {
      body = (
        <Empty>
          <div>Assist network isn't available right now.</div>
          <button
            onClick={() => { haptic('light'); setRetry(n => n + 1); }}
            style={{ marginTop: 12, background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Try again
          </button>
        </Empty>
      );
    } else if (st.status === 'ready') {
      body = <Empty>No assist data yet.</Empty>;
    } else {
      body = <div className="skeleton rounded-2xl" style={{ height: 240 }} />;
    }
  
    return (
      <div style={{ marginTop: 28 }}>
        <SectionTitle>Assist network</SectionTitle>
        {body}
      </div>
    );
  }

const AST_GRID = 'minmax(0, 1fr) 44px 58px 64px';

function AssistsTab({ teams, me, teamAbbr, season, haptic }) {
  const t = useMemo(() => buildAssists(teams, me), [teams, me]);
  if (!t) return <Empty>Assist data isn't available yet.</Empty>;
  return (
    <div>
      <div style={{ ...grid(2), marginTop: 2 }}>
        <Stat label="AST/G" value={f1(t.apg)} rank={t.apgRank} />
        <Stat label="ASSISTED FG%" value={pct1(t.assisted)} rank={t.assistedRank} />
      </div>

      <div style={{ marginTop: 22 }}>
        <SectionTitle>By zone</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: AST_GRID, columnGap: 4, padding: '14px 0 8px', fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>
          <span>ZONE</span>
          <span style={{ textAlign: 'center' }}>AST</span>
          <span style={{ textAlign: 'center' }}>SHARE</span>
          <span style={{ textAlign: 'right' }}>ASSISTED</span>
        </div>
        {t.rows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: AST_GRID, columnGap: 4, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #131313' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#a1a1aa', textAlign: 'center' }}>{r.ast}</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{Math.round(r.share * 100)}%</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginTop: 1 }}>{ordinal(r.shareRank)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{r.fgm > 0 ? `${Math.round(r.pct * 100)}%` : '—'}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: rankTone(r.pctRank), marginTop: 1 }}>{ordinal(r.pctRank)}</div>
            </div>
          </div>
        ))}
      </div>

      <Note>
      AST is assists on made shots in each zone. Share is the zone's part of the team's assists. Assisted is the share of the zone's made shots that were assisted. Small numbers are the NBA rank among {teams.length} teams (1st = highest).
      </Note>

      <AssistNetwork teamAbbr={teamAbbr} season={season} haptic={haptic} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Page: opened from the team page. Same overlay pattern as the roster and compare screens.
──────────────────────────────────────────────────────────────────────────── */

export default function TeamAdvanced({ teamAbbr, onClose, onHaptic }) {
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const season = useMemo(nbaSeason, []);
  const [tab, setTab] = useState('shots');
  const [state, setState] = useState({ status: 'loading', teams: null, opp: null });
  const [nonce, setNonce] = useState(0);
  const rootRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let dead = false;
    setState({ status: 'loading', teams: null, opp: null });
    Promise.all([loadTeamTotals(season), loadOppTotals(season).catch(() => null)])
      .then(([teams, opp]) => { if (!dead) setState({ status: 'ready', teams, opp }); })
      .catch(() => { if (!dead) setState({ status: 'error', teams: null, opp: null }); });
    return () => { dead = true; };
  }, [season, nonce]);

  const me = useMemo(() => (state.teams ? findTeam(state.teams, teamAbbr) : null), [state.teams, teamAbbr]);
  const oppMe = useMemo(() => (state.opp ? findTeam(state.opp, teamAbbr) : null), [state.opp, teamAbbr]);

  // Edge swipe to go back (same gesture as the other screens). Touches here never reach the team page's own handler.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    let startX = null, startY = null, dragging = false;
    const onStart = e => {
      e.stopPropagation();
      if (e.touches[0].clientX > 30) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; dragging = false;
    };
    const onMove = e => {
      if (startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) > Math.abs(dx)) { startX = null; return; }
        if (dx > 10) dragging = true;
      }
      if (dragging) {
        e.preventDefault();
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = `${1 - Math.min(dx / window.innerWidth, 1) * 0.3}`;
      }
    };
    const onEnd = e => {
      if (!dragging) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx / window.innerWidth > 0.35) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease';
        el.style.transform = 'translateX(100%)';
        el.style.opacity = '0';
        setTimeout(() => closeRef.current && closeRef.current(), 250);
      } else {
        el.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
        setTimeout(() => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; }, 320);
      }
      startX = null; dragging = false;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  let body;
  if (state.status === 'loading') {
    body = <div className="skeleton rounded-2xl" style={{ height: 240 }} />;
  } else if (state.status === 'error') {
    body = (
      <Empty>
        <div>Advanced stats aren't available right now.</div>
        <button
          onClick={() => { haptic('light'); setNonce(n => n + 1); }}
          style={{ marginTop: 12, background: 'none', border: 'none', color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Try again
        </button>
      </Empty>
    );
  } else if (!me || me.gp === 0) {
    body = <Empty>No games played yet this season.</Empty>;
  } else if (tab === 'team') {
    body = <TeamTab teams={state.teams} me={me} />;
  } else if (tab === 'factors') {
    body = <FactorsTab teams={state.teams} me={me} />;
  } else if (tab === 'shots') {
    body = <ShotsTab teams={state.teams} me={me} oppMe={oppMe} teamAbbr={teamAbbr} season={season} haptic={haptic} />;
  } else {
    body = <AssistsTab teams={state.teams} me={me} teamAbbr={teamAbbr} season={season} haptic={haptic} />;
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 bg-black z-[120] overflow-y-auto"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      <div className="min-h-screen px-4 pb-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto">
          <div
            className="flex items-center mb-3 sticky top-0 z-50 py-2 px-1 backdrop-blur-md border-b border-white/5"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)' }}
          >
            <button
              onClick={() => { haptic('light'); onClose && onClose(); }}
              className="text-gray-400 hover:text-white text-2xl font-light mr-4"
              aria-label="Back"
            >
              ‹
            </button>
            <h2 className="text-2xl font-bold" style={heading}>{teamAbbr} Advanced</h2>
          </div>

          <TabToggle tab={tab} onChange={t => { haptic('selection'); setTab(t); }} />
          {body}
        </div>
      </div>
    </div>
  );
}