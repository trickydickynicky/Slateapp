import React, { useState, lazy, Suspense } from 'react';
import { Star } from 'lucide-react';
import TeamSchedule from './TeamSchedule';

const TeamAdvanced = lazy(() => import('./TeamAdvanced'));
import { SeasonLineups } from './GameLineups';
import { teamColors, teamFullNames, logoUrl, ordinal, lift } from './slateShared';
import { TEAM_STAT_BY_LABEL } from './statConfig';
export { ordinal, lift };

/* ────────────────────────────────────────────────────────────────────────────
   Constants
──────────────────────────────────────────────────────────────────────────── */



const ACCENT = '#2563eb';   // blue-600, the app accent
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const RED = '#ef4444';
const heading = { fontFamily: 'Rajdhani, sans-serif' };   // titles only


/* ────────────────────────────────────────────────────────────────────────────
   Pure helpers (exported so they can be tested)
──────────────────────────────────────────────────────────────────────────── */

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};



/** "10-5" -> ".667" (same style as the record pct). Returns '' if it can't be parsed. */
export const pctFromRecord = str => {
    const m = /^(\d+)-(\d+)/.exec(String(str || ''));
    if (!m) return '';
    const w = Number(m[1]), l = Number(m[2]);
    if (w + l === 0) return '';
    const p = w / (w + l);
    return p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, '');
  };
  
  /** Wins/losses extrapolated to an 82-game season. Returns '' before the first game. */
  export const paceRecord = (wins, losses, season = 82) => {
    const w = Number(wins), l = Number(losses);
    const gp = w + l;
    if (!Number.isFinite(gp) || gp === 0) return '';
    const pw = Math.round((w / gp) * season);
    return `${pw}-${season - pw}`;
  };



/** Team stats response + league rankings -> the two rows of the stat grid. */
export function buildTeamCells(stats, ranks) {
  const cats = stats?.stats || [];
  const off = cats.find(c => c.name === 'offensive');
  const def = cats.find(c => c.name === 'defensive');
  const get = (cat, name) => cat?.stats?.find(s => s.name === name)?.displayValue;
  const getDef = name => get(def, name) ?? get(off, name);
  const show = v => (v === undefined || v === null || v === '' ? '—' : v);
  const r = k => (Number.isFinite(ranks?.[k]) ? ranks[k] : null);
  return {
    offense: [
      { l: 'PPG',  v: show(get(off, 'avgPoints')), rank: r('ppg') },
      { l: 'FG%',  v: show(get(off, 'fieldGoalPct')), rank: r('fgPct') },
      { l: '3P%',  v: show(get(off, 'threePointFieldGoalPct')), rank: r('threePct') },
      { l: 'FT%',  v: show(get(off, 'freeThrowPct')), rank: r('ftPct') },
      { l: 'AST',  v: show(get(off, 'avgAssists')), rank: r('ast') },
      { l: 'OREB', v: show(get(off, 'avgOffensiveRebounds')), rank: r('oreb') },
      { l: 'TO',   v: show(get(off, 'avgTurnovers')), rank: r('to') },
    ],
    defense: [
      { l: 'OPPG', v: show(stats?.record?.oppg), rank: r('oppg') },
      { l: 'DREB', v: show(getDef('avgDefensiveRebounds')), rank: r('dreb') },
      { l: 'BLK',  v: show(getDef('avgBlocks')), rank: r('blk') },
      { l: 'STL',  v: show(getDef('avgSteals')), rank: r('stl') },
    ],
  };
}

/** Two teams' stats -> head-to-head rows for offense and defense. */
export function buildCompareRows(a, b) {
  const find = (s, n) => (s?.stats || []).find(c => c.name === n);
  const get = (cat, name) => num(cat?.stats?.find(x => x.name === name)?.displayValue);
  const row = (label, v1, v2, inverse) => {
    const total = v1 + v2;
    return {
      label, v1, v2,
      better1: inverse ? v1 < v2 : v1 > v2,
      better2: inverse ? v2 < v1 : v2 > v1,
      p1: total > 0 ? (v1 / total) * 100 : 50,
      p2: total > 0 ? (v2 / total) * 100 : 50,
    };
  };
  const o1 = find(a, 'offensive'); const o2 = find(b, 'offensive');
  const d1 = find(a, 'defensive'); const d2 = find(b, 'defensive');
  return {
    offense: [
      row('PPG', get(o1, 'avgPoints'), get(o2, 'avgPoints')),
      row('FG%', get(o1, 'fieldGoalPct'), get(o2, 'fieldGoalPct')),
      row('3P%', get(o1, 'threePointFieldGoalPct'), get(o2, 'threePointFieldGoalPct')),
      row('FT%', get(o1, 'freeThrowPct'), get(o2, 'freeThrowPct')),
      row('AST', get(o1, 'avgAssists'), get(o2, 'avgAssists')),
      row('TO', get(o1, 'avgTurnovers'), get(o2, 'avgTurnovers'), true),
    ],
    defense: [
      row('OPPG', num(a?.record?.oppg), num(b?.record?.oppg), true),
      row('DREB', get(d1, 'avgDefensiveRebounds'), get(d2, 'avgDefensiveRebounds')),
      row('BLK', get(d1, 'avgBlocks'), get(d2, 'avgBlocks')),
      row('STL', get(d1, 'avgSteals'), get(d2, 'avgSteals')),
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Presentational pieces
──────────────────────────────────────────────────────────────────────────── */

function Stat({ label, value, sub, subColor, valueColor, onSubClick }) {
  const subStyle = { fontSize: 11, color: subColor || MUTED, fontWeight: subColor ? 700 : 500, marginTop: 3, minHeight: 14 };
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: valueColor || 'white', lineHeight: 1.15, marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
        {value}
      </span>
      {onSubClick && sub ? (
        <button
          onClick={onSubClick}
          aria-label={`${label} leaders`}
          className="rounded-md transition-colors active:bg-zinc-800"
          style={{ ...subStyle, lineHeight: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', margin: '-5px -10px -8px', minHeight: 0 }}
        >
          {sub}
        </button>
      ) : (
        <span style={subStyle}>{sub || ''}</span>
      )}
    </div>
  );
}

const rankTone = rank => (rank <= 10 ? GREEN : rank > 20 ? '#f87171' : null);

function RankedStat({ cell, onRankClick }) {
  const has = Number.isFinite(cell.rank);
  return (
    <Stat
      label={cell.l} value={cell.v} sub={has ? ordinal(cell.rank) : ''} subColor={has ? rankTone(cell.rank) : null}
      onSubClick={has && onRankClick ? () => onRankClick(cell) : undefined}
    />
  );
}

function SectionTitle({ children }) {
    return (
      <h5
        className="text-xs font-semibold text-gray-400 uppercase tracking-widest"
        style={heading}
      >
        {children}
      </h5>
    );
  }
  

function RecentDifferentials({ games, onGameClick }) {
  if (!games || games.length === 0) return null;
  const maxAbs = Math.max(20, ...games.map(g => Math.abs(g.differential)));
  const HALF = 54;
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ marginBottom: 14 }}><SectionTitle>Recent differentials</SectionTitle></div>
      <div className="flex" style={{ gap: 4 }}>
        {games.map(g => {
          const d = g.differential;
          const h = Math.max(4, Math.round((Math.abs(d) / maxAbs) * HALF));
          const win = d > 0;
          return (
            <button
              key={g.gameId}
              onClick={() => onGameClick(g)}
              className="flex flex-col items-center flex-1"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0 }}
            >
              <div style={{ position: 'relative', width: '100%', height: HALF * 2 + 36 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#1f1f1f' }} />
                <div
                  style={{
                    position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 20, height: h,
                    borderRadius: 7, background: win ? '#3b82f6' : '#1e3a8a',
                    ...(win ? { bottom: `calc(50% + 0px)` } : { top: '50%' }),
                  }}
                />
                <span
                  style={{
                    position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 800,
                    color: win ? GREEN : RED,
                    ...(win ? { bottom: `calc(50% + ${h + 4}px)` } : { top: `calc(50% + ${h + 4}px)` }),
                  }}
                >
                  {win ? `+${d}` : d}
                </span>
              </div>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6, lineHeight: 1.15 }}>
  <span style={{ fontSize: 9, color: '#52525b', fontWeight: 600 }}>{g.isHome ? 'vs' : '@'}</span>
  <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 700 }}>{g.opponent}</span>
</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompareSection({ title, rows, c1, c2 }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ marginBottom: 12 }}><SectionTitle>{title}</SectionTitle></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: r.better1 ? 'white' : '#6b7280', width: 56 }}>{r.v1.toFixed(1)}</span>
              <span style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{r.label}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: r.better2 ? 'white' : '#6b7280', width: 56, textAlign: 'right' }}>{r.v2.toFixed(1)}</span>
            </div>
            <div className="flex" style={{ height: 6, borderRadius: 6, overflow: 'hidden', background: '#18181b' }}>
              <div style={{ width: `${r.p1}%`, background: c1 }} />
              <div style={{ width: `${r.p2}%`, background: c2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparePicker({ currentAbbr, onPick, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-[120] overflow-y-auto">
      <div className="min-h-screen px-4 pb-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center" style={{ padding: '12px 0 18px' }}>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: MUTED, fontSize: 24, fontWeight: 300, marginRight: 14, cursor: 'pointer' }}
            >
              ✕
            </button>
            <h2 style={{ ...heading, fontSize: 24, fontWeight: 900, color: 'white', margin: 0 }}>Compare with</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(teamFullNames)
              .filter(([abbr]) => abbr !== currentAbbr)
              .map(([abbr, name]) => (
                <button
                  key={abbr}
                  onClick={() => onPick(abbr)}
                  className="bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 flex items-center gap-3 transition-colors"
                >
                  <img src={logoUrl(abbr)} alt={abbr} className="w-12 h-12" />
                  <div className="text-left min-w-0">
                    <div className="font-semibold">{abbr}</div>
                    <div className="text-xs text-gray-400 truncate">{name}</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Screen body. App.jsx keeps the fixed wrapper and the back header.
   Render with key={teamInfo.abbr} so compare state resets when the team changes.
──────────────────────────────────────────────────────────────────────────── */

export default function TeamStatsPage({
  teamInfo, stats, loading, leagueRankings,
  isFavorite, onToggleFavorite, onOpenStandings, onOpenRoster,
  onRecentGameClick, onTeamClick, loadTeamStats, onHaptic, onOpenSalary, onOpenLeaderboard,
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
  const [compareAbbr, setCompareAbbr] = useState(null);
  const [compareStats, setCompareStats] = useState(null);
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};

  const abbr = teamInfo?.abbr;
  const logo = teamInfo?.logo || (abbr ? logoUrl(abbr) : null);

  const openRank = c => {
    const cfg = TEAM_STAT_BY_LABEL[c.l];
    if (!cfg) return;
    haptic('light');
    onOpenLeaderboard && onOpenLeaderboard('teams', cfg.key, { highlightId: abbr });
  };

  const pickCompare = async other => {
    haptic('light');
    setPickerOpen(false);
    setCompareAbbr(other);
    setCompareStats(null);
    try {
      const data = loadTeamStats ? await loadTeamStats(other) : null;
      setCompareStats(data);
    } catch (e) {
      setCompareStats(null);
    }
  };
  const clearCompare = () => { haptic('light'); setCompareAbbr(null); setCompareStats(null); };

  if (loading) {
    return <div className="skeleton rounded-2xl" style={{ height: 260, marginTop: 8 }} />;
  }
  if (!stats) {
    return (
      <div className="rounded-2xl text-center" style={{ marginTop: 8, padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 13, fontWeight: 600 }}>
        Team stats are not available right now.
      </div>
    );
  }

  const rec = stats.record || {};
  const streak = rec.streak || '';
  const streakColor = streak.startsWith('W') ? GREEN : streak.startsWith('L') ? RED : null;
  const cells = buildTeamCells(stats, leagueRankings?.[abbr]);
  const strip = [
    { l: 'REC', v: `${rec.wins}-${rec.losses}`, sub: rec.pct },
    { l: 'HOME', v: rec.home, sub: pctFromRecord(rec.home) },
    { l: 'AWAY', v: rec.away, sub: pctFromRecord(rec.away) },
    { l: 'L10', v: rec.l10, sub: pctFromRecord(rec.l10) },
    { l: 'GB', v: rec.gb },
    { l: 'STRK', v: streak || '—', color: streakColor },
  ];
  const projected = paceRecord(rec.wins, rec.losses);
  const grid = (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: 2, rowGap: 6 });
  const comparing = compareAbbr && compareStats;
  const rows = comparing ? buildCompareRows(stats, compareStats) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 14 }}>
        {logo && <img src={logo} alt={abbr} style={{ width: 72, height: 72 }} className="flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div style={{ ...heading, fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: 'white' }}>
            {teamFullNames[abbr] || abbr}
          </div>
          <div className="flex items-center" style={{ gap: 10, marginTop: 7 }}>
            <button
              onClick={() => { haptic('light'); onOpenStandings && onOpenStandings(); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACCENT, fontSize: 14, fontWeight: 600 }}
            >
              {ordinal(stats.conferenceRank)} {stats.conference === 'Eastern' ? 'EC' : 'WC'} ›
            </button>
            <span style={{ color: '#3f3f46' }}>·</span>
            <button
              onClick={() => { haptic('light'); onOpenRoster && onOpenRoster(); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACCENT, fontSize: 14, fontWeight: 600 }}
            >
              Roster ›
            </button>
            <span style={{ color: '#3f3f46' }}>·</span>
            <button
              onClick={() => { haptic('light'); onOpenSalary && onOpenSalary(); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACCENT, fontSize: 14, fontWeight: 600 }}
            >
              Salary ›
            </button>
          </div>
        </div>
        <button
          onClick={() => { haptic('success'); onToggleFavorite && onToggleFavorite(); }}
          aria-label="Favorite"
          style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', padding: 4 }}
        >
          <Star className={`w-5 h-5 transition-all ${isFavorite ? 'fill-white text-white' : 'text-gray-500'}`} />
        </button>
      </div>

          {/* Record strip */}
          <div style={{ ...grid(6), marginTop: 24 }}>
        {strip.map(c => <Stat key={c.l} label={c.l} value={c.v} sub={c.sub} valueColor={c.color} />)}
      </div>
      {projected && (
        <div className="text-center" style={{ fontSize: 11, lineHeight: '13px', color: MUTED, fontWeight: 500, marginTop: 2 }}>
          Projected record: {projected}
        </div>
      )}

      {/* Title + compare */}
      <div className="flex items-center justify-between" style={{ marginTop: projected ? 13 : 28 }}>
      <SectionTitle color="#a1a1aa">{comparing ? 'Head to head' : 'Season stats'}</SectionTitle>
        {comparing ? (
          <button
            onClick={clearCompare}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 15, fontWeight: 700 }}
          >
            Clear
          </button>
        ) : (
            <div className="flex items-center" style={{ gap: 18 }}>
            <button
              onClick={() => { haptic('light'); setAdvancedOpen(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 15, fontWeight: 700 }}
            >
              Advanced ›
            </button>
            <button
              onClick={() => { haptic('light'); setPickerOpen(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 15, fontWeight: 700 }}
            >
              Compare ›
            </button>
          </div>
        )}
      </div>

      {compareAbbr && !compareStats ? (
        <div className="skeleton rounded-2xl" style={{ height: 220, marginTop: 18 }} />
      ) : comparing ? (
        <>
          <div className="flex items-center" style={{ marginTop: 20 }}>
            {[[abbr, logo, stats.record], [compareAbbr, logoUrl(compareAbbr), compareStats.record]].map(([a, l, r], i) => (
              <React.Fragment key={a}>
                {i === 1 && <span style={{ color: MUTED, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', padding: '0 12px' }}>VS</span>}
                <div className="flex flex-col items-center flex-1">
                  <img src={l} alt={a} style={{ width: 48, height: 48 }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'white', marginTop: 4 }}>{a}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>{r?.wins}-{r?.losses}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
          <CompareSection title="Offense" rows={rows.offense} c1={lift(teamColors[abbr] || '#3B82F6')} c2={lift(teamColors[compareAbbr] || '#EF4444')} />
          <CompareSection title="Defense" rows={rows.defense} c1={lift(teamColors[abbr] || '#3B82F6')} c2={lift(teamColors[compareAbbr] || '#EF4444')} />
        </>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={grid(7)}>
          {cells.offense.map(c => <RankedStat key={c.l} cell={c} onRankClick={openRank} />)}
          </div>
          <div className="flex justify-center" style={{ marginTop: 16 }}>
            {cells.defense.map(c => (
                          <div key={c.l} style={{ width: `${100 / 7}%` }}><RankedStat cell={c} onRankClick={openRank} /></div>
            ))}
          </div>
        </div>
      )}

      <RecentDifferentials
        games={stats.recentGames}
        onGameClick={g => { haptic('light'); onRecentGameClick && onRecentGameClick(g); }}
      />

<TeamSchedule games={stats.fullSchedule} onTeamClick={onTeamClick} />

      <SeasonLineups teamAbbr={abbr} schedule={stats.fullSchedule} />

      {advancedOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[120] bg-black flex items-center justify-center text-gray-400 text-sm">Loading…</div>}>
          <TeamAdvanced teamAbbr={abbr} onClose={() => setAdvancedOpen(false)} onHaptic={haptic} />
        </Suspense>
      )}

      {pickerOpen && (
        <ComparePicker currentAbbr={abbr} onPick={pickCompare} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}