import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ZONES, findTeam, loadTeamTotals, loadOppTotals, loadTeamExtras, nbaSeason } from './pbpstatsTeams';
import { loadTeamShots, loadTeamPlays } from './espnShots';

/* ────────────────────────────────────────────────────────────────────────────
   Constants + helpers
──────────────────────────────────────────────────────────────────────────── */

const ACCENT = '#2563eb';
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const RED = '#ef4444';
const heading = { fontFamily: 'Rajdhani, sans-serif' };

const TABS = [['shots', 'Shots'], ['assists', 'Assists'], ['team', 'Team'], ['visuals', 'Visuals'], ['factors', 'Factors']];

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

const Bare = React.createContext(false);
const Note = ({ children }) => (
  React.useContext(Bare) ? null : (
    <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginTop: 16 }}>{children}</p>
  )
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

const num1 = v => String(+v.toFixed(1));
const num0 = v => String(Math.round(v));
const pct0 = v => `${Math.round(v * 100)}%`;

function useBox(teamAbbr, season) {
  const [box, setBox] = useState([]);
  useEffect(() => {
    let dead = false;
    loadTeamPlays(teamAbbr, season, d => { if (!dead) setBox(d.box); })
      .then(d => { if (!dead) setBox(d.box); })
      .catch(() => {});
    return () => { dead = true; };
  }, [teamAbbr, season]);
  return box;
}

function useExtras(season) {
  const [st, setSt] = useState({ status: 'loading', data: null });
  useEffect(() => {
    let dead = false;
    loadTeamExtras(season)
      .then(data => { if (!dead) setSt({ status: 'ready', data }); })
      .catch(() => { if (!dead) setSt({ status: 'error', data: null }); });
    return () => { dead = true; };
  }, [season]);
  return st;
}

/* Rows of the per-game table. pb = from pbpstats totals (ranked), es = from ESPN box scores (no rank). */
function buildTeamRows(teams, opp, me, oppMe, box) {
  const gp = t => Math.max(t.gp, 1);
  const fga = t => t.fg2a + t.fg3a;
  const fgm = t => t.fg2m + t.fg3m;
  const ratio = (a, b) => (b > 0 ? a / b : 0);
  const div = (a, b) => (a != null && b > 0 ? a / b : null);
  const avg = (side, key) => {
    const v = box.map(b => b[side]?.[key]).filter(Number.isFinite);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const g = { me: k => avg('m', k), op: k => avg('o', k) };
  const pb = (label, fn, fmt, better) => ({ label, fmt, better, pb: fn });
  const es = (label, fn, fmt, better) => ({ label, fmt, better, es: fn });
  const pair = k => () => [g.me(k), g.op(k)];

  const secs = [
    {
      title: 'Shooting',
      items: [
        pb('FG%', t => ratio(fgm(t), fga(t)), pct0, 'high'),
        pb('2PT made', t => t.fg2m / gp(t), num1, 'high'),
        pb('2PT attempts', t => t.fg2a / gp(t), num1, null),
        pb('2PT%', t => ratio(t.fg2m, t.fg2a), pct0, 'high'),
        pb('3PT made', t => t.fg3m / gp(t), num1, 'high'),
        pb('3PT attempts', t => t.fg3a / gp(t), num1, null),
        pb('3PT%', t => ratio(t.fg3m, t.fg3a), pct0, 'high'),
        pb('FT made', t => t.ftm / gp(t), num1, 'high'),
        pb('FT attempts', t => t.fta / gp(t), num1, null),
        pb('FT%', t => ratio(t.ftm, t.fta), pct0, 'high'),
        es('Fouls', pair('pf'), num1, 'low'),
      ],
    },
    {
      title: 'Possessions',
      items: [
        es('Rebounds', pair('reb'), num1, 'high'),
        es('Rebound %', () => {
          const a = g.me('reb'), b = g.op('reb');
          return a != null && b != null && a + b > 0 ? [a / (a + b), b / (a + b)] : [null, null];
        }, pct1, 'high'),
        es('Off. rebounds', pair('oreb'), num1, 'high'),
        pb('Assists', t => totalAst(t) / gp(t), num1, 'high'),
        pb('Assist %', t => ratio(totalAst(t), fgm(t)), pct1, 'high'),
        pb('Turnovers', t => t.tov / gp(t), num1, 'low'),
        pb('TOV %', t => ratio(t.tov, t.offPoss), pct1, 'low'),
        es('Steals', pair('stl'), num1, 'high'),
        es('Steal %', () => [div(g.me('stl'), me.defPoss / gp(me)), div(g.op('stl'), me.offPoss / gp(me))], pct1, 'high'),
        es('Blocks', pair('blk'), num1, 'high'),
        es('Block %', () => [
          div(g.me('blk'), oppMe ? oppMe.fg2a / gp(oppMe) : 0),
          div(g.op('blk'), me.fg2a / gp(me)),
        ], pct1, 'high'),
      ],
    },
    {
      title: 'Scoring',
      items: [
        es('In the paint', pair('paint'), num1, 'high'),
        es('Off turnovers', pair('offTO'), num1, 'high'),
        es('Bench points', pair('bench'), num1, 'high'),
        es('Starters points', pair('starters'), num1, 'high'),
      ],
    },
    {
      title: 'Efficiency',
      items: [
        pb('Possessions', t => t.offPoss / gp(t), num0, null),
        pb('Points per 100', t => ratio(t.pts, t.offPoss) * 100, num0, 'high'),
        pb('True shooting', t => t.ts, pct0, 'high'),
        pb('True shot att.', t => (fga(t) + 0.44 * t.fta) / gp(t), num1, null),
      ],
    },
  ];

  let wins = 0, total = 0;
  const won = [];
  const sections = secs.map(sec => {
    const rows = [];
    let w = 0, l = 0, n = 0;
    sec.items.forEach(it => {
      let a, b, rA = null, rB = null;
      if (it.pb) {
        a = it.pb(me);
        b = oppMe ? it.pb(oppMe) : null;
        rA = rank(teams, it.pb, me, it.better !== 'low');
        if (b != null && opp) rB = 1 + opp.filter(t => it.pb(t) < b).length;
      } else {
        [a, b] = it.es();
      }
      if (a == null) return;
      const row = { label: it.label, fmt: it.fmt, better: it.better, a, b, rA, rB };
      rows.push(row);
      if (it.better && b != null) {
        n++;
        const win = it.better === 'high' ? a > b : a < b;
        const loss = it.better === 'high' ? a < b : a > b;
        if (win) { w++; won.push(row); } else if (loss) l++;
      }
    });
    wins += w; total += n;
    return { title: sec.title, rows, w, l };
  });

  const chips = won
    .map(r => ({ r, rel: Math.abs(r.a - r.b) / Math.max(Math.min(Math.abs(r.a), Math.abs(r.b)), 0.01) }))
    .sort((x, y) => y.rel - x.rel)
    .slice(0, 4)
    .map(({ r }) => `${r.label} ${r.fmt(r.a)}–${r.fmt(r.b)}`);

  return { sections, wins, total, chips };
}

function StatCell({ value, rank, tone }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: rank && tone ? rankTone(rank) : MUTED, marginTop: 1, minHeight: 12 }}>
        {rank ? ordinal(rank) : ''}
      </div>
    </div>
  );
}

function TeamStatsCard({ built, teamAbbr, hasOpp, nTeams }) {
  const cols = hasOpp ? 'minmax(0, 1fr) 70px 70px' : 'minmax(0, 1fr) 70px';
  const colHead = { fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'right' };
  return (
    <div>
      <div style={{ ...heading, fontSize: 18, fontWeight: 700 }}>
        {teamAbbr} won <span style={{ color: ACCENT }}>{built.wins}</span> of {built.total} categories
      </div>
      {built.chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {built.chips.map(c => (
            <span key={c} style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', background: '#0a0a0a', border: '1px solid #171717', borderRadius: 999, padding: '4px 10px' }}>{c}</span>
          ))}
        </div>
      )}
      {built.sections.map(sec => sec.rows.length > 0 && (
        <div key={sec.title} style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle>{sec.title}</SectionTitle>
            {sec.w + sec.l > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>{teamAbbr} {sec.w}–{sec.l}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4, padding: '10px 0 6px', ...colHead }}>
            <span />
            <span>{teamAbbr}</span>
            {hasOpp && <span>OPP</span>}
          </div>
          {sec.rows.map(r => (
            <div key={r.label} style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #131313' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{r.label}</span>
              <StatCell value={r.fmt(r.a)} rank={r.rA} tone={!!r.better} />
              {hasOpp && <StatCell value={r.b != null ? r.fmt(r.b) : '—'} rank={r.rB} tone={!!r.better} />}
            </div>
          ))}
        </div>
      ))}
      <Note>
        Per game. Small numbers are the NBA rank among {nTeams} teams (OPP: 1st = fewest allowed; turnovers, TOV% and fouls: 1st = fewest). Rows without a rank are from ESPN box scores of this team's games. Rebound % = share of all rebounds. Assist % = share of made shots that were assisted. TOV % = turnovers per possession. Steal % = steals per opponent possession. Block % = share of the opponent's two-point tries blocked. True shot attempts = FGA + 0.44 × FTA.
      </Note>
    </div>
  );
}

/* Generic CLE | OPP table for the extra cards. Each cell: { text, rank } or null. */
function DualTable({ title, sub, head, rows, note }) {
  const cols = 'minmax(0, 1fr) 70px 70px';
  return (
    <div style={{ marginTop: 28 }}>
      <SectionTitle>{title}</SectionTitle>
      {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>{sub}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4, padding: '12px 0 6px', fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'right' }}>
        <span />
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #131313' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{r.label}</span>
          {[r.a, r.b].map((c, i) => (
            <StatCell key={i} value={c ? c.text : '—'} rank={c ? c.rank : null} tone />
          ))}
        </div>
      ))}
      {note && <Note>{note}</Note>}
    </div>
  );
}

function ExtraCards({ data, teams, opp, teamAbbr }) {
  // cell from an array of { abbr, [key] }; desc = rank 1 is the highest value
  const cell = (arr, key, desc, fmt, ranked = true) => {
    const mine = findTeam(arr || [], teamAbbr);
    if (!mine || mine[key] == null) return null;
    const v = mine[key];
    return { text: fmt(v), rank: ranked ? 1 + arr.filter(x => (desc ? x[key] > v : x[key] < v)).length : null };
  };
  const ppp = v => v.toFixed(2);

  const startRows = [
    ['After a steal', 'steal'],
    ['After a defensive rebound', 'missed'],
    ['After a dead-ball turnover', 'dead'],
    ['After an opponent score', 'made'],
  ].map(([label, k]) => ({ label, a: cell(data.start.team, k, true, ppp), b: cell(data.start.opp, k, false, ppp) }));

  const timeoutRows = [
    { label: 'After timeouts', a: cell(data.start.team, 'timeout', true, ppp), b: cell(data.start.opp, 'timeout', false, ppp) },
    { label: 'All possessions', a: cell(data.start.team, 'ppp', true, ppp, false), b: cell(data.start.opp, 'ppp', true, ppp, false) },
  ];

  const orebRows = ZONES.map(z => ({
    label: z.label,
    a: cell(data.oreb[z.key].team, 'v', true, pct0),
    b: cell(data.oreb[z.key].opp, 'v', false, pct0),
  }));

  const per100 = (tms, liveArr) => tms.map(t => {
    const lv = liveArr.find(x => x.abbr === t.abbr)?.v;
    if (lv == null || !(t.offPoss > 0)) return null;
    return { abbr: t.abbr, live: lv * 100, dead: Math.max(t.tov / t.offPoss - lv, 0) * 100 };
  }).filter(Boolean);
  const mineTO = per100(teams, data.live.team);
  const forcedTO = opp ? per100(opp, data.live.opp) : [];
  const toRows = [
    ['Live-ball turnovers per 100', 'live'],
    ['Dead-ball turnovers per 100', 'dead'],
  ].map(([label, k]) => ({ label, a: cell(mineTO, k, false, num1), b: cell(forcedTO, k, true, num1) }));

  return (
    <div>
      <DualTable
        title="How possessions started"
        sub="Points per possession"
        head={[teamAbbr, 'OPP']}
        rows={startRows}
        note={`Small numbers are the NBA rank among ${data.start.team.length} teams (${teamAbbr}: 1st = most points per possession; OPP: 1st = fewest allowed). Counted from rebounds, turnovers and made baskets, from pbpstats.`}
      />
      <DualTable
        title="Out of timeouts"
        sub="The first possession after each team's own timeout"
        head={[teamAbbr, 'OPP']}
        rows={timeoutRows}
        note="Points per possession on the first possession after a timeout, compared with all possessions."
      />
      <DualTable
        title="Offensive rebounds by miss"
        sub="Offensive rebound rate by where the miss came from"
        head={[`${teamAbbr} GET IT`, 'OPP GET IT']}
        rows={orebRows}
        note={`${teamAbbr} get it: their offensive rebound rate on their own misses (1st = most). Opp get it: opponents on their misses against ${teamAbbr} (1st = fewest). From pbpstats.`}
      />
      {forcedTO.length > 0 && (
        <DualTable
          title="Turnover type"
          sub="Steals feed fast breaks; dead balls let the D set"
          head={[teamAbbr, 'FORCED']}
          rows={toRows}
          note={`${teamAbbr}: 1st = fewest. Forced = what the ${teamAbbr} defense caused, 1st = most. From pbpstats.`}
        />
      )}
    </div>
  );
}

function TeamTab({ teams, opp, me, oppMe, teamAbbr, season }) {
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

  const box = useBox(teamAbbr, season);
  const built = useMemo(() => buildTeamRows(teams, opp, me, oppMe, box), [teams, opp, me, oppMe, box]);
  const extras = useExtras(season);

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

      <div style={{ marginTop: 28 }}>
        <SectionTitle>Team stats</SectionTitle>
        <div style={{ marginTop: 14 }}>
          <TeamStatsCard built={built} teamAbbr={teamAbbr} hasOpp={!!oppMe} nTeams={teams.length} />
        </div>
      </div>

      {extras.status === 'ready' && <ExtraCards data={extras.data} teams={teams} opp={opp} teamAbbr={teamAbbr} />}
      {extras.status === 'loading' && <div className="skeleton rounded-2xl" style={{ height: 160, marginTop: 28 }} />}

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

const ALL = 'all';

const zoneOf = (x, y) => {
  const d = Math.hypot(x - HX, y - HY);
  if ((x <= CORNER_X || x >= CW - CORNER_X) && y <= ARC_Y) return 'Corner3';
  if (d > R3) return 'Arc3';
  if (d < 40) return 'AtRim';
  if (d < 140) return 'ShortMidRange';
  return 'LongMidRange';
};

function buildZonesFromShots(shots, lg) {
  if (!shots.length) return null;
  const acc = Object.fromEntries(ZONES.map(z => [z.key, [0, 0]]));
  shots.forEach(([x, y, made]) => {
    const a = acc[zoneOf(x, y)];
    a[1]++;
    if (made) a[0]++;
  });
  const tot = shots.length;
  const rows = ZONES.map(z => {
    const [m, a] = acc[z.key];
    const pts = m * z.pts, exp = a * z.pts * lg[z.key];
    return {
      key: z.key, label: z.label, range: z.range, zpts: z.pts,
      fgm: m, fga: a, pct: a > 0 ? m / a : 0, share: a / tot,
      pts, exp, lgPct: lg[z.key], vsAvg: pts - exp,
      pctRank: null, shareRank: null,
    };
  });
  const pts = rows.reduce((s, r) => s + r.pts, 0);
  const exp = rows.reduce((s, r) => s + r.exp, 0);
  return { rows, opp: null, fga: tot, pts, exp, xPps: exp / tot, diff: pts - exp };
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 text-white rounded-xl"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '8px 10px', border: '1px solid #171717' }}
      >
        <option value={ALL}>All</option>
        {options.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
      </select>
    </label>
  );
}

function ShotsTab({ teams, me, oppMe, teamAbbr, season, haptic }) {
    const [view, setView] = useState('bars');
    const [dots, setDots] = useState({ status: 'idle', shots: [] });
    const [retry, setRetry] = useState(0);
    const [showFilters, setShowFilters] = useState(false);
    const [player, setPlayer] = useState(ALL);
    const [type, setType] = useState(ALL);
  
    const filtered = player !== ALL || type !== ALL;
    const needShots = view === 'dots' || showFilters || filtered;
  
    // Shot locations are the heavy part: only load for the dots view, the filter panel, or an active filter.
    useEffect(() => {
      if (!needShots) return undefined;
      let dead = false;
      setDots(d => ({ status: 'loading', shots: d.shots }));
      loadTeamShots(teamAbbr, season, shots => { if (!dead) setDots({ status: 'loading', shots }); })
        .then(shots => { if (!dead) setDots({ status: 'ready', shots }); })
        .catch(() => { if (!dead) setDots(d => ({ status: 'error', shots: d.shots })); });
      return () => { dead = true; };
    }, [needShots, teamAbbr, season, retry]);
  
    useEffect(() => { setPlayer(ALL); setType(ALL); }, [teamAbbr]);
  
    const lg = useMemo(() => leagueAvg(teams), [teams]);
    const teamZones = useMemo(() => buildZones(teams, me, oppMe), [teams, me, oppMe]);
    const shown = useMemo(
      () => dots.shots.filter(s => (player === ALL || s[3] === player) && (type === ALL || s[4] === type)),
      [dots.shots, player, type]
    );
    const t = useMemo(
      () => (filtered ? buildZonesFromShots(shown, lg) : teamZones),
      [filtered, shown, lg, teamZones]
    );
    const options = useMemo(() => {
      const count = i => {
        const m = {};
        dots.shots.forEach(s => { if (s[i] && s[i] !== '?') m[s[i]] = (m[s[i]] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
      };
      return { players: count(3), types: count(4) };
    }, [dots.shots]);
  
    if (!teamZones) return <Empty>Shot zone data isn't available yet.</Empty>;
  
    let chart;
    if (filtered && !t) {
      chart = dots.status === 'loading'
        ? <div className="skeleton rounded-2xl" style={{ height: 240 }} />
        : <Empty>No shots match this filter.</Empty>;
    } else if (view === 'bars') {
      chart = <ZoneBars t={t} teamAbbr={teamAbbr} />;
    } else if (view === 'map') {
      chart = <ZoneMap rows={t.rows} />;
    } else if (shown.length) {
      chart = <ShotDots shots={shown} loading={dots.status === 'loading'} />;
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
  
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => { haptic('light'); setShowFilters(s => !s); }}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: filtered ? ACCENT : MUTED, cursor: 'pointer' }}
          >
            {filtered ? `Filtered · ${[player !== ALL && player, type !== ALL && type].filter(Boolean).join(' · ')}` : 'Filter by player or shot type'} {showFilters ? '▴' : '▾'}
          </button>
          {showFilters && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
              <FilterSelect label="PLAYER" value={player} onChange={v => { haptic('selection'); setPlayer(v); }} options={options.players} />
              <FilterSelect label="SHOT TYPE" value={type} onChange={v => { haptic('selection'); setType(v); }} options={options.types} />
              {filtered && (
                <button
                  onClick={() => { haptic('light'); setPlayer(ALL); setType(ALL); }}
                  style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 700, padding: '10px 4px', cursor: 'pointer' }}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
  
        {chart}
  
        {t && (
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
                      <div style={{ fontSize: 10, fontWeight: 600, color: r.pctRank ? rankTone(r.pctRank) : MUTED, marginTop: 1, minHeight: 12 }}>{r.pctRank ? ordinal(r.pctRank) : ''}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{Math.round(r.share * 100)}%</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginTop: 1, minHeight: 12 }}>{r.shareRank ? ordinal(r.shareRank) : ''}</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, textAlign: 'right', color: signColor(r.vsAvg) }}>{signed(r.vsAvg)}</span>
                  </div>
                );
              })}
            </div>
  
            <Note>
              {t.pts} points on {t.fga} field goal attempts ({(t.pts / t.fga).toFixed(2)} per shot){filtered ? '' : `, ${me.gp} games`}. FG% is colored against the league average in each zone. Vs avg = points above or below what an average shooter scores on the same shots. {filtered
                ? 'Filtered view: zones are built from ESPN shot locations, so there are no NBA ranks or opponent bars. '
                : `Small numbers are the NBA rank among ${teams.length} teams (FG%: 1st = best; Share: 1st = most of their shots). `}
              Corner 3s are along the baseline, where the line is 22 ft; above-the-break 3s are every other 3.
            </Note>
          </div>
        )}
  
        {!filtered && (
          <div style={{ marginTop: 28 }}>
            <SectionTitle>Shot quality vs shot making</SectionTitle>
            <QualityScatter teams={teams} me={me} teamAbbr={teamAbbr} />
          </div>
        )}
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
   Tab: Visuals (generator: pick a visualization, set options, Show graph, snap it)
──────────────────────────────────────────────────────────────────────────── */

const f2 = v => v.toFixed(2);
const gpOf = t => Math.max(t.gp, 1);
const dv = (a, b) => (b > 0 ? a / b : null);
const x100 = v => (v == null ? null : v * 100);
const zoneTot = t => ZONES.reduce((s, z) => s + t.z[z.key][1], 0);

// To add a stat: add a row. fn gets a team-totals object (or the opponent-totals object) and returns a number or null.
const SCATTER_STATS = [
  { key: 'ortg', label: 'Offensive rating', group: 'Ratings', fmt: f1, fn: t => x100(dv(t.pts, t.offPoss)) },
  { key: 'drtg', label: 'Defensive rating', group: 'Ratings', fmt: f1, teamOnly: true, fn: t => x100(dv(t.opp, t.defPoss)) },
  { key: 'net', label: 'Net rating', group: 'Ratings', fmt: signed, teamOnly: true, fn: t => {
    const a = x100(dv(t.pts, t.offPoss)), b = x100(dv(t.opp, t.defPoss));
    return a == null || b == null ? null : a - b;
  } },
  { key: 'pace', label: 'Pace', group: 'Ratings', fmt: f1, fn: t => t.pace },
  { key: 'ppg', label: 'Points per game', group: 'Ratings', fmt: f1, fn: t => t.pts / gpOf(t) },
  { key: 'oppg', label: 'Points allowed per game', group: 'Ratings', fmt: f1, teamOnly: true, fn: t => t.opp / gpOf(t) },

  { key: 'efg', label: 'eFG%', group: 'Shooting', fmt: pct1, fn: t => t.efg },
  { key: 'ts', label: 'True shooting %', group: 'Shooting', fmt: pct1, fn: t => t.ts },
  { key: 'fg', label: 'FG%', group: 'Shooting', fmt: pct1, fn: t => dv(t.fg2m + t.fg3m, t.fg2a + t.fg3a) },
  { key: 'fg2', label: '2PT%', group: 'Shooting', fmt: pct1, fn: t => dv(t.fg2m, t.fg2a) },
  { key: 'fg3', label: '3PT%', group: 'Shooting', fmt: pct1, fn: t => dv(t.fg3m, t.fg3a) },
  { key: 'ft', label: 'FT%', group: 'Shooting', fmt: pct1, fn: t => dv(t.ftm, t.fta) },
  { key: 'fg3a', label: '3PT attempts per game', group: 'Shooting', fmt: f1, fn: t => t.fg3a / gpOf(t) },
  { key: 'fg2a', label: '2PT attempts per game', group: 'Shooting', fmt: f1, fn: t => t.fg2a / gpOf(t) },
  { key: 'fta', label: 'FT attempts per game', group: 'Shooting', fmt: f1, fn: t => t.fta / gpOf(t) },
  { key: 'rate3', label: '3PT attempt rate', group: 'Shooting', fmt: pct1, fn: t => dv(t.fg3a, t.fg2a + t.fg3a) },
  { key: 'ftrate', label: 'FT rate (FTM / FGA)', group: 'Shooting', fmt: pct1, fn: t => dv(t.ftm, t.fg2a + t.fg3a) },

  { key: 'tovp', label: 'Turnovers per possession', group: 'Possessions', fmt: pct1, fn: t => dv(t.tov, t.offPoss) },
  { key: 'tov', label: 'Turnovers per game', group: 'Possessions', fmt: f1, fn: t => t.tov / gpOf(t) },
  { key: 'ast', label: 'Assists per game', group: 'Possessions', fmt: f1, fn: t => totalAst(t) / gpOf(t) },
  { key: 'astp', label: 'Assisted FG%', group: 'Possessions', fmt: pct1, fn: t => dv(totalAst(t), t.fg2m + t.fg3m) },
  { key: 'oreb', label: 'Offensive rebound rate', group: 'Possessions', fmt: pct1, teamOnly: true, fn: t => t.oreb },

  ...ZONES.flatMap(z => [
    { key: `${z.key}-fg`, label: `${z.label} FG%`, group: 'Shot zones', fmt: pct1, fn: t => t.z && dv(t.z[z.key][0], t.z[z.key][1]) },
    { key: `${z.key}-freq`, label: `${z.label} frequency`, group: 'Shot zones', fmt: pct1, fn: t => t.z && dv(t.z[z.key][1], zoneTot(t)) },
  ]),
];

const statOf = key => SCATTER_STATS.find(s => s.key === key);
const axisLabel = (s, side) => (side === 'opp' ? `Opp ${s.label}` : s.label);

const seasonOptions = s => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s));
  if (!m) return [String(s)];
  const y = +m[1];
  return Array.from({ length: 6 }, (_, i) => `${y - i}-${String((y - i + 1) % 100).padStart(2, '0')}`);
};

const niceTicks = (lo, hi, n = 5) => {
  const span = hi - lo || 1, raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
  const out = [];
  for (let i = Math.ceil(lo / step); i * step <= hi + 1e-9; i++) out.push(+(i * step).toFixed(10));
  return out;
};

function GenSelect({ label, value, onChange, children, flex = 1 }) {
  return (
    <label style={{ flex, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 text-white rounded-xl"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '8px 10px', border: '1px solid #171717' }}
      >
        {children}
      </select>
    </label>
  );
}

function StatOptions({ side }) {
  const groups = [...new Set(SCATTER_STATS.map(s => s.group))];
  return groups.map(g => (
    <optgroup key={g} label={g}>
      {SCATTER_STATS.filter(s => s.group === g && (side === 'team' || !s.teamOnly)).map(s => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </optgroup>
  ));
}

function useLoaded(loader, abbr, season, enabled) {
  const [st, setSt] = useState({ status: 'idle', data: null });
  useEffect(() => {
    if (!enabled) return undefined;
    let dead = false;
    setSt(s => ({ status: 'loading', data: s.data }));
    loader(abbr, season, d => { if (!dead) setSt({ status: 'loading', data: d }); })
      .then(d => { if (!dead) setSt({ status: 'ready', data: d }); })
      .catch(() => { if (!dead) setSt(s => ({ status: 'error', data: s.data })); });
    return () => { dead = true; };
  }, [loader, abbr, season, enabled]);
  return st;
}

// Camera: render the card to a PNG (pre-rendered when ready so the share sheet opens instantly), then share or download.
function useSnap(cardRef, name, ready, dep, haptic) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const render = async () => {
    const opts = { pixelRatio: 2, backgroundColor: '#000' };
    await toPng(cardRef.current, opts); // Safari drops images/fonts on the first pass
    const url = await toPng(cardRef.current, opts);
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

// pbpstats uses NBA tricodes; ESPN's logo files use ESPN abbreviations
const ESPN_LOGO = { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah', WAS: 'wsh' };
const logoUrl = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${ESPN_LOGO[abbr] || String(abbr).toLowerCase()}.png`;

const logoCache = new Map(); // abbr -> data URL, kept for the session
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

function ScatterChart({ d, xLabel, yLabel, logos }) {
  const W = 500, H = 440, PL = 52, PR = 18, PT = 16, PB = 46;
  const { list, xs, ys, slope, mx, my } = d;
  const ext = k => {
    const v = list.map(p => p[k]);
    const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.1 || 0.01;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = ext('x'), [y0, y1] = ext('y');
  const sx = v => PL + ((v - x0) / (x1 - x0)) * (W - PL - PR);
  const sy = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const q = { fill: '#71717a', fontSize: 11, fontFamily: 'ui-monospace, monospace' };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs><clipPath id="sc-plot"><rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} /></clipPath></defs>
      {niceTicks(x0, x1).map(v => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={PT} y2={H - PB} stroke="#18181b" />
          <text x={sx(v)} y={H - PB + 16} textAnchor="middle" {...q}>{xs.fmt(v)}</text>
        </g>
      ))}
      {niceTicks(y0, y1).map(v => (
        <g key={`y${v}`}>
          <line x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} stroke="#18181b" />
          <text x={PL - 6} y={sy(v) + 4} textAnchor="end" {...q}>{ys.fmt(v)}</text>
        </g>
      ))}
      <line
        x1={sx(x0)} y1={sy(my + slope * (x0 - mx))} x2={sx(x1)} y2={sy(my + slope * (x1 - mx))}
        stroke="#3f3f46" strokeDasharray="4 4" clipPath="url(#sc-plot)"
      />
           {list.map(p => (logos[p.abbr] ? (
        <image
          key={p.abbr}
          href={logos[p.abbr]}
          x={sx(p.x) - 10} y={sy(p.y) - 10}
          width="20" height="20"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>{p.abbr}</title>
        </image>
      ) : (
        <circle key={p.abbr} cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill="#71717a" fillOpacity="0.85"><title>{p.abbr}</title></circle>
      )))}
      <text x={(PL + W - PR) / 2} y={H - 8} textAnchor="middle" {...q}>{xLabel} →</text>
      <text x="12" y={(PT + H - PB) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PT + H - PB) / 2})`} {...q}>{yLabel} →</text>
    </svg>
  );
}

function YoyChart({ d, yLabel, y2Label }) {
    const { seasons, series, avg, st, st2, avg2 } = d;
    const W = 500, H = 440, PL = 52, PR = avg2 ? 52 : 22, PT = 16, PB = 40;
    const RIGHT = '#f59e0b';
    const range = vals => {
      const v = vals.filter(x => x != null);
      const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.08 || 0.01;
      return [lo - pad, hi + pad];
    };
    const [y0, y1] = range(series.flatMap(s => s.vals));
    const [r0, r1] = avg2 ? range(avg2) : [0, 1];
    const n = seasons.length;
    const sx = i => PL + (n > 1 ? i / (n - 1) : 0.5) * (W - PL - PR);
    const sy = v => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
    const sr = v => PT + (1 - (v - r0) / (r1 - r0)) * (H - PT - PB);
    const q = { fill: '#71717a', fontSize: 11, fontFamily: 'ui-monospace, monospace' };
    const line = (vals, f) => {
      let out = '', pen = false;
      vals.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        out += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)} ${f(v).toFixed(1)}`;
        pen = true;
      });
      return out;
    };
    const mid = (PT + H - PB) / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {niceTicks(y0, y1).map(v => (
          <g key={`y${v}`}>
            <line x1={PL} x2={W - PR} y1={sy(v)} y2={sy(v)} stroke="#18181b" />
            <text x={PL - 6} y={sy(v) + 4} textAnchor="end" {...q}>{st.fmt(v)}</text>
          </g>
        ))}
        {avg2 && niceTicks(r0, r1).map(v => (
          <text key={`r${v}`} x={W - PR + 6} y={sr(v) + 4} textAnchor="start" {...q} fill={RIGHT} fillOpacity="0.8">{st2.fmt(v)}</text>
        ))}
        {seasons.map((s, i) => (
          <text key={s} x={sx(i)} y={H - PB + 18} textAnchor="middle" {...q}>{s}</text>
        ))}
        {series.map(s => (
          <path key={s.abbr} d={line(s.vals, sy)} fill="none" stroke="#71717a" strokeOpacity="0.35" strokeWidth="1.5" strokeLinejoin="round">
            <title>{s.abbr}</title>
          </path>
        ))}
        <path d={line(avg, sy)} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {avg.map((v, i) => v == null ? null : (
          <g key={i}>
            <circle cx={sx(i)} cy={sy(v)} r="4.5" fill={ACCENT} stroke="#000" strokeWidth="2" />
            <text x={sx(i)} y={sy(v) - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="#60a5fa">{st.fmt(v)}</text>
          </g>
        ))}
        {avg2 && <path d={line(avg2, sr)} fill="none" stroke={RIGHT} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {avg2 && avg2.map((v, i) => v == null ? null : (
          <g key={`b${i}`}>
            <circle cx={sx(i)} cy={sr(v)} r="4.5" fill={RIGHT} stroke="#000" strokeWidth="2" />
            <text x={sx(i)} y={sr(v) + 18} textAnchor="middle" fontSize="11" fontWeight="800" fill={RIGHT}>{st2.fmt(v)}</text>
          </g>
        ))}
        <text x="12" y={mid} textAnchor="middle" transform={`rotate(-90 12 ${mid})`} {...q}>{yLabel} →</text>
        {avg2 && <text x={W - 10} y={mid} textAnchor="middle" transform={`rotate(90 ${W - 10} ${mid})`} {...q} fill={RIGHT} fillOpacity="0.8">← {y2Label}</text>}
      </svg>
    );
  }

function VisualsTab({ teams, opp, teamAbbr, season, haptic }) {
  const [kind, setKind] = useState('scatter');
  const [draft, setDraft] = useState({ season: String(season), seasonType: 'Regular Season', x: 'ortg', xSide: 'team', y: 'drtg', ySide: 'team', y2: '', y2Side: 'team' });
  const [spec, setSpec] = useState(null);
  const [res, setRes] = useState({ status: 'idle' });

  const [netDraft, setNetDraft] = useState(teamAbbr);
  const [netTeam, setNetTeam] = useState(null);
  const [sel, setSel] = useState(null);
  const cardRef = useRef(null);

  const set = (k, v) => setDraft(x => ({ ...x, [k]: v }));
  const setSide = (statKey, sideKey, v) => setDraft(x => ({
    ...x,
    [sideKey]: v,
    [statKey]: v === 'opp' && statOf(x[statKey]).teamOnly ? 'efg' : x[statKey],
  }));



  const generate = async () => {
    haptic('light');
    if (kind === 'network') { setSel(null); setNetTeam(netDraft); return; }
    if (kind === 'yoy') {
        const d = { ...draft };
        setRes({ status: 'loading' });
        try {
          const seasons = seasonOptions(season).reverse(); // oldest first
          const sides = [...new Set([d.ySide, d.y2 ? d.y2Side : null].filter(Boolean))];
          const got = await Promise.all(sides.map(sd => Promise.all(
            seasons.map(s => (sd === 'opp' ? loadOppTotals : loadTeamTotals)(s, d.seasonType).catch(() => null))
          )));
          const bySide = Object.fromEntries(sides.map((sd, i) => [sd, got[i]]));
          setSpec(d);
          setRes({ status: 'ready', yoy: { seasons, bySide } });
        } catch (e) {
          setRes({ status: 'error' });
        }
        return;
      }
    const d = { ...draft };
    setRes({ status: 'loading' });
    try {
      let tms = teams, op = opp;
      if (d.season !== String(season) || d.seasonType !== 'Regular Season') {
        [tms, op] = await Promise.all([loadTeamTotals(d.season, d.seasonType), loadOppTotals(d.season, d.seasonType).catch(() => null)]);
      }
      setSpec(d);
      setRes({ status: 'ready', teams: tms, opp: op });
    } catch (e) {
      setRes({ status: 'error' });
    }
  };

  // scatter data
  const pts = useMemo(() => {
    if (res.status !== 'ready' || !spec || res.yoy) return null;
    const xs = statOf(spec.x), ys = statOf(spec.y);
    const xa = spec.xSide === 'opp' ? res.opp : res.teams;
    const ya = spec.ySide === 'opp' ? res.opp : res.teams;
    if (!xa || !ya) return { error: "Opponent data isn't available for this season." };
    const list = [];
    res.teams.forEach(t => {
      if (!(t.gp > 0)) return;
      const a = findTeam(xa, t.abbr), b = findTeam(ya, t.abbr);
      if (!a || !b) return;
      const x = xs.fn(a), y = ys.fn(b);
      if (Number.isFinite(x) && Number.isFinite(y)) list.push({ abbr: t.abbr, x, y });
    });
    if (list.length < 3) return { error: 'Not enough data for this season.' };
    const n = list.length;
    const mx = list.reduce((s, p) => s + p.x, 0) / n, my = list.reduce((s, p) => s + p.y, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    list.forEach(p => { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    return {
      list, xs, ys, mx, my,
      slope: sxx > 0 ? sxy / sxx : 0,
      r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0,
    };
  }, [res, spec]);

  const logoState = useLogos(pts && !pts.error && pts.list ? pts.list.map(p => p.abbr).sort() : []);

  // year-over-year data
  const yoy = useMemo(() => {
    if (!res.yoy || !spec) return null;
    const { seasons, bySide } = res.yoy;
    const build = (st, side) => {
      const byTeam = {};
      (bySide[side] || []).forEach((tms, i) => (tms || []).forEach(t => {
        if (!(t.gp > 0)) return;
        const v = st.fn(t);
        if (!Number.isFinite(v)) return;
        (byTeam[t.abbr] = byTeam[t.abbr] || Array(seasons.length).fill(null))[i] = v;
      }));
      const avg = seasons.map((_, i) => {
        const v = Object.values(byTeam).map(a => a[i]).filter(x => x != null);
        return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
      });
      return { byTeam, avg };
    };
    const st = statOf(spec.y);
    const L = build(st, spec.ySide);
    if (L.avg.filter(v => v != null).length < 2) return { error: 'Not enough seasons of data.' };
    const st2 = spec.y2 ? statOf(spec.y2) : null;
    const R = st2 ? build(st2, spec.y2Side) : null;
    return {
      seasons, st, avg: L.avg,
      series: Object.entries(L.byTeam).map(([abbr, vals]) => ({ abbr, vals })),
      st2, avg2: R && R.avg.filter(v => v != null).length >= 2 ? R.avg : null,
    };
  }, [res, spec]);

  // assist network data
  const plays = useLoaded(loadTeamPlays, netTeam, season, kind === 'network' && !!netTeam);
  const net = useMemo(() => buildNetwork(plays.data), [plays.data]);
  const abbrs = useMemo(() => teams.map(t => t.abbr).sort(), [teams]);

  const scatterReady = kind === 'scatter' && !!pts && !pts.error && logoState.done;
  const netReady = kind === 'network' && !!net && plays.status === 'ready';
  const yoyReady = kind === 'yoy' && !!yoy && !yoy.error;
  const ready = scatterReady || netReady || yoyReady;
  const cardKey = kind === 'scatter'
    ? `${spec ? JSON.stringify(spec) : ''}`
    : kind === 'yoy'
      ? `${spec ? JSON.stringify(spec) : ''}|yoy`
      : `${netTeam}|${sel}|${plays.data ? 1 : 0}`;
  const snapName = kind === 'scatter' ? 'scatter' : kind === 'yoy' ? 'year-over-year' : `${netTeam}-assist-network`;
  const { snap, busy } = useSnap(cardRef, snapName, ready, cardKey, haptic);

  const skeleton = <div className="skeleton rounded-2xl" style={{ height: 240, marginTop: 20 }} />;
  let result = null;
  if (kind === 'scatter') {
    if (res.status === 'loading') result = skeleton;
    else if (res.status === 'error') result = <div style={{ marginTop: 20 }}><Empty>Couldn't load that season.</Empty></div>;
    else if (pts && pts.error) result = <div style={{ marginTop: 20 }}><Empty>{pts.error}</Empty></div>;
    else if (pts) {
      const xl = axisLabel(pts.xs, spec.xSide), yl = axisLabel(pts.ys, spec.ySide);
  
      result = (
        <div ref={cardRef} style={{ marginTop: 2, background: '#000', border: '1px solid #171717', borderRadius: 16, padding: '18px 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div style={{ ...heading, fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>{yl} vs {xl}</div>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{spec.season}{spec.seasonType === 'Playoffs' ? ' · Playoffs' : ''}</div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>r = {pts.r.toFixed(2)} across {pts.list.length} teams</div>
          <div style={{ marginTop: 12 }}>
          <ScatterChart d={pts} xLabel={xl} yLabel={yl} logos={logoState.map} />
          </div>
        </div>
      );
    }
} else if (kind === 'yoy') {
    if (res.status === 'loading') result = skeleton;
    else if (res.status === 'error') result = <div style={{ marginTop: 2 }}><Empty>Couldn't load those seasons.</Empty></div>;
    else if (yoy && yoy.error) result = <div style={{ marginTop: 2 }}><Empty>{yoy.error}</Empty></div>;
    else if (yoy) {
        const yl = axisLabel(yoy.st, spec.ySide);
        const yl2 = yoy.avg2 ? axisLabel(yoy.st2, spec.y2Side) : null;
      result = (
        <div ref={cardRef} style={{ marginTop: 2, background: '#000', border: '1px solid #171717', borderRadius: 16, padding: '18px 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ ...heading, fontSize: 20, fontWeight: 700, lineHeight: 1.15 }}>{yl2 ? `${yl} & ${yl2}` : `${yl} by season`}</div>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{spec.seasonType === 'Playoffs' ? 'Playoffs' : 'Regular season'}</div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
            {yl2 ? 'League averages: left axis in blue, right axis in amber. Teams in gray (left stat).' : 'League average in blue, each team in gray'}
          </div>
          <div style={{ marginTop: 12 }}>
          <YoyChart d={yoy} yLabel={yl} y2Label={yl2} />
          </div>
        </div>
      );
    }
  } else if (netTeam) {
    if (net) {
      result = (
        <div ref={cardRef} style={{ marginTop: 20, background: '#000', border: '1px solid #171717', borderRadius: 16, padding: '18px 16px 14px' }}>
          <div style={{ ...heading, fontSize: 20, fontWeight: 700 }}>{netTeam} · Assist network</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Arrows run from passer to scorer. Number = assists given.</div>
          <NetworkGraph net={net} sel={sel} onSel={id => { haptic('selection'); setSel(id); }} />
          <div style={{ marginTop: 8, fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: '0.08em' }}>SLATE · ESPN</div>
        </div>
      );
    } else if (plays.status === 'error') {
      result = <div style={{ marginTop: 20 }}><Empty>Assist network isn't available right now.</Empty></div>;
    } else result = skeleton;
  }

  const loading = res.status === 'loading';
  return (
    <div>
      <div style={{ display: 'grid', gap: 12 }}>
        <GenSelect label="VISUALIZATION" value={kind} onChange={v => { haptic('selection'); setKind(v); }}>
          <option value="scatter">Scatter plot</option>
          <option value="network">Assist network</option>
          <option value="yoy">League year-over-year</option>
        </GenSelect>

        {kind === 'scatter' ? (
          <>
                      <div style={{ display: 'flex', gap: 8 }}>
              <GenSelect label="SEASON" value={draft.season} onChange={v => set('season', v)}>
                {seasonOptions(season).map(s => <option key={s} value={s}>{s}</option>)}
              </GenSelect>
              <GenSelect label="SEASON TYPE" value={draft.seasonType} onChange={v => set('seasonType', v)}>
                <option value="Regular Season">Regular season</option>
                <option value="Playoffs">Playoffs</option>
              </GenSelect>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <GenSelect label="X AXIS" value={draft.x} onChange={v => set('x', v)} flex={2}><StatOptions side={draft.xSide} /></GenSelect>
              <GenSelect label="X AXIS TYPE" value={draft.xSide} onChange={v => setSide('x', 'xSide', v)}>
                <option value="team">Team</option>
                <option value="opp">Opponent</option>
              </GenSelect>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <GenSelect label="Y AXIS" value={draft.y} onChange={v => set('y', v)} flex={2}><StatOptions side={draft.ySide} /></GenSelect>
              <GenSelect label="Y AXIS TYPE" value={draft.ySide} onChange={v => setSide('y', 'ySide', v)}>
                <option value="team">Team</option>
                <option value="opp">Opponent</option>
              </GenSelect>
            </div>
          </>
               ) : kind === 'yoy' ? (
                <>
                  <GenSelect label="SEASON TYPE" value={draft.seasonType} onChange={v => set('seasonType', v)}>
                    <option value="Regular Season">Regular season</option>
                    <option value="Playoffs">Playoffs</option>
                  </GenSelect>
                  <div style={{ display: 'flex', gap: 8 }}>
                  <GenSelect label="LEFT AXIS STAT" value={draft.y} onChange={v => set('y', v)} flex={2}><StatOptions side={draft.ySide} /></GenSelect>
                  <GenSelect label="LEFT AXIS TYPE" value={draft.ySide} onChange={v => setSide('y', 'ySide', v)}>
                <option value="team">Team</option>
                <option value="opp">Opponent</option>
              </GenSelect>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
            <GenSelect label="RIGHT AXIS STAT" value={draft.y2} onChange={v => set('y2', v)} flex={2}>
                <option value="">None</option>
                <StatOptions side={draft.y2Side} />
              </GenSelect>
             
            </div>
                </>
              ) : (
                <GenSelect label="TEAM" value={netDraft} onChange={setNetDraft}>
            {abbrs.map(a => <option key={a} value={a}>{a}</option>)}
          </GenSelect>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full rounded-full bg-blue-600 text-white font-bold text-sm"
          style={{ padding: '10px 0', border: 'none', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Loading…' : 'Show graph'}
        </button>
      </div>

      {result && ready && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
          {kind === 'network' ? 'Tap a player to isolate their passes' : ''}
          </span>
          <button
            onClick={snap}
            disabled={busy}
            aria-label="Share screenshot"
            className="flex items-center justify-center"
            style={{
                width: 28, height: 28, borderRadius: 14, background: 'none', border: 'none',
              cursor: 'pointer', color: MUTED, opacity: busy ? 0.4 : 1,
            }}
          >
            <Camera size={20} strokeWidth={2} />
          </button>
        </div>
      )}
      {result}
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
    body = <TeamTab teams={state.teams} opp={state.opp} me={me} oppMe={oppMe} teamAbbr={teamAbbr} season={season} />;
} else if (tab === 'visuals') {
    body = <VisualsTab teams={state.teams} opp={state.opp} me={me} oppMe={oppMe} teamAbbr={teamAbbr} season={season} haptic={haptic} />;
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