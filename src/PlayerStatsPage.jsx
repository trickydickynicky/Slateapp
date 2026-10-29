import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import PlayerRecentGames from './PlayerRecentGames';

/* ────────────────────────────────────────────────────────────────────────────
   Constants
──────────────────────────────────────────────────────────────────────────── */

const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

const teamFullNames = {
  ATL:'Atlanta Hawks',BOS:'Boston Celtics',BKN:'Brooklyn Nets',CHA:'Charlotte Hornets',
  CHI:'Chicago Bulls',CLE:'Cleveland Cavaliers',DAL:'Dallas Mavericks',DEN:'Denver Nuggets',
  DET:'Detroit Pistons',GS:'Golden State Warriors',HOU:'Houston Rockets',IND:'Indiana Pacers',
  LAC:'LA Clippers',LAL:'Los Angeles Lakers',MEM:'Memphis Grizzlies',MIA:'Miami Heat',
  MIL:'Milwaukee Bucks',MIN:'Minnesota Timberwolves',NO:'New Orleans Pelicans',NY:'New York Knicks',
  OKC:'Oklahoma City Thunder',ORL:'Orlando Magic',PHI:'Philadelphia 76ers',PHX:'Phoenix Suns',
  POR:'Portland Trail Blazers',SAC:'Sacramento Kings',SA:'San Antonio Spurs',TOR:'Toronto Raptors',
  UTAH:'Utah Jazz',WSH:'Washington Wizards',
};

const ACCENT = '#2563eb';   // blue-600, the app accent
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const TTL = 30 * 60 * 1000;
const IS_DEV = (() => {
  try { if (typeof import.meta !== 'undefined' && import.meta.env) return !!import.meta.env.DEV; } catch (e) { /* ignore */ }
  try { return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'; } catch (e) { return false; }
})();
const heading = { fontFamily: 'Rajdhani, sans-serif' };   // titles only

const RANKS_URL = (id, yr) =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${yr}/types/2/athletes/${id}/statistics`;
const SPLITS_URL = (id, yr) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/splits?season=${yr}`;

// Assumed column order if the splits response doesn't send its own labels.
const DEFAULT_SPLIT_LABELS = ['GP','MIN','FG','FG%','3PT','3P%','FT','FT%','OR','DR','REB','AST','BLK','STL','PF','TO','PTS'];

/* ────────────────────────────────────────────────────────────────────────────
   Pure helpers (exported so they can be tested)
──────────────────────────────────────────────────────────────────────────── */

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const has = v => v !== undefined && v !== null && v !== '' && v !== '-';
const pair = str => {
  const p = String(str ?? '0-0').split('-');
  return [num(p[0]), num(p[1])];
};

export const ordinal = n => {
  const v = Math.abs(n) % 100;
  const sfx = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${sfx}`;
};

/**
 * One season's averages (the shape App.jsx builds in nbaPlayerStats.currentSeason) -> two rows of cells.
 * `rankNames` are ESPN stat names to look the league rank up by. Totals are averages x games, rounded.
 */
export function buildSeasonCells(s, mode = 'avg') {
  if (!s) return { row1: [], row2: [] };
  const gp = num(s.gp);
  const totals = mode === 'totals';

  const rate = v => (!has(v) ? '—' : totals ? String(Math.round(num(v) * gp)) : num(v).toFixed(1));
  const pct = v => (!has(v) ? '—' : num(v).toFixed(1));

  const [fgm, fga] = pair(s.fg);
  const [tpm, tpa] = pair(s.three_pt);
  const [ftm, fta] = pair(s.ft);
  // Totals mode: made/attempted under the shooting percentages (e.g. 19/31)
  const made = (m, a) => (totals ? `${Math.round(m * gp)}/${Math.round(a * gp)}` : undefined);
  // ESPN stat name to rank by: the per-game name in Averages, the season-total name in Totals.
  // (Totals names are best guesses; a miss just shows no rank.)
  // Names can be strings or RegExps (matched against every ESPN stat name that carries a rank).
  const arr = x => (Array.isArray(x) ? x : [x]);
  const rk = (avgNames, totalNames) => arr(totals ? totalNames : avgNames);
  const rkAvg = names => (totals ? null : arr(names));   // percentages: rank only in Averages (Totals shows made/att)
  const den = 2 * (fga + 0.44 * fta);
  const ts = den > 0 ? ((num(s.pts) / den) * 100).toFixed(1) : '—';

  return {
    row1: [
      { l: 'G',   v: has(s.gp) ? String(s.gp) : '—', rank: ['gamesPlayed', /^gamesPlayed$/i] },
      { l: 'PTS', v: rate(s.pts), rank: rk('avgPoints', 'points') },
      { l: 'REB', v: rate(s.reb), rank: rk('avgRebounds', ['rebounds', 'totalRebounds', /^(total)?rebounds$/i]) },
      { l: 'AST', v: rate(s.ast), rank: rk('avgAssists', 'assists') },
      { l: 'STL', v: rate(s.stl), rank: rk('avgSteals', 'steals') },
      { l: 'BLK', v: rate(s.blk), rank: rk('avgBlocks', 'blocks') },
      { l: 'TO',  v: rate(s.to),  rank: rk('avgTurnovers', 'turnovers') },
    ],
    row2: [
      { l: 'MIN',  v: rate(s.min), rank: rk(['avgMinutes', 'minutesPerGame', /^avgMin/i], ['minutes', 'totalMinutes', /^(total)?minutes$/i]) },
      { l: 'FG%',  v: pct(s.fg_pct), rank: rkAvg('fieldGoalPct'), sub: made(fgm, fga) },
      { l: '3P%',  v: pct(s.three_p_pct), rank: rkAvg(['threePointPct', 'threePointFieldGoalPct', /^threePoint(Field)?(Goal)?Pct$/i]), sub: made(tpm, tpa) },
      { l: '3PA',  v: rate(tpa), rank: rk('avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted') },
      { l: 'FT%',  v: pct(s.ft_pct), rank: rkAvg('freeThrowPct'), sub: made(ftm, fta) },
      { l: 'FTA',  v: rate(fta), rank: rk('avgFreeThrowsAttempted', 'freeThrowsAttempted') },
      { l: 'TS%',  v: ts, rank: ['trueShootingPct'] },
    ],
  };
}

/** ESPN season statistics response -> { statName: '116th' } */
export function parseRanks(json) {
  const out = {};
  const unranked = [];
  (json?.splits?.categories || []).forEach(c =>
    (c?.stats || []).forEach(s => {
      if (!s?.name || out[s.name]) return;
      const r = s.rankDisplayValue || (Number.isFinite(s.rank) ? ordinal(s.rank) : null);
      if (r) out[s.name] = r; else unranked.push(s.name);
    })
  );
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.info('[PlayerStatsPage] ESPN stats WITH rank:', Object.keys(out), '| WITHOUT rank:', unranked);
  }
  return out;
}

/** ESPN splits response -> { cats: [{ name, splits: [{ name, stats }] }], cols: [{ label, idx }] } */
export function parseSplits(json) {
  const raw = (Array.isArray(json?.labels) && json.labels.length && json.labels)
    || json?.categories?.[0]?.labels
    || DEFAULT_SPLIT_LABELS;
  const L = raw.map(l => String(l).toUpperCase());
  const cats = (json?.splitCategories || [])
    .map(c => ({
      name: c?.displayName || c?.name || 'Splits',
      splits: (c?.splits || [])
        .filter(s => Array.isArray(s?.stats) && s.stats.length)
        .map(s => ({ name: s.displayName || s.name || '', stats: s.stats })),
    }))
    .filter(c => c.splits.length);
  const cols = ['GP', 'PTS', 'REB', 'AST', 'FG%']
    .map(label => ({ label, idx: L.indexOf(label) }))
    .filter(c => c.idx >= 0);
  return { cats, cols };
}

/* ────────────────────────────────────────────────────────────────────────────
   Data hooks (nothing loads until the page is open; ranks and splits are cached)
──────────────────────────────────────────────────────────────────────────── */

const ranksCache = new Map();    // `${id}:${year}` -> { at, data }
const splitsCache = new Map();

function useCachedFetch(cache, url, parse, enabled) {
  const [state, setState] = useState({ status: 'loading', data: null });
  useEffect(() => {
    if (!enabled || !url) return undefined;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL) { setState({ status: 'ready', data: hit.data }); return undefined; }
    setState({ status: 'loading', data: null });
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`ESPN ${res.status}`);
        const data = parse(await res.json());
        cache.set(url, { at: Date.now(), data });
        setState({ status: 'ready', data });
      } catch (err) {
        if (err?.name !== 'AbortError') setState({ status: 'error', data: null });
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);
  return state;
}

/* ────────────────────────────────────────────────────────────────────────────
   Presentational pieces
──────────────────────────────────────────────────────────────────────────── */

function Headshot({ src, name, size, ring }) {
  if (!src) {
    return (
      <div
        className="bg-zinc-900 flex items-center justify-center text-gray-500 font-bold flex-shrink-0"
        style={{ width: size, height: size, borderRadius: size, fontSize: size * 0.3 }}
      >
        {(name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="object-cover flex-shrink-0"
      style={{ width: size, height: size, borderRadius: size, background: '#18181b', border: ring ? `2px solid ${ring}` : 'none' }}
    />
  );
}

function Stat({ label, value, rank, sub }) {
  const top = rank && parseInt(rank, 10) <= 10;
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.15, marginTop: 2, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: top ? GREEN : MUTED, fontWeight: top ? 700 : 500, marginTop: 3, minHeight: 14 }}>
        {rank || sub || ''}
      </span>
    </div>
  );
}

function StatGrid({ cells, ranks }) {
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', columnGap: 2, rowGap: 6 };
  const rankOf = c => {
    if (!c.rank || !ranks) return null;
    for (const n of c.rank) {
      if (n instanceof RegExp) {
        const key = Object.keys(ranks).find(k => n.test(k));
        if (key) return ranks[key];
      } else if (ranks[n]) {
        return ranks[n];
      }
    }
    return null;
  };
  return (
    <div style={{ marginTop: 22 }}>
      <div style={grid}>
        {cells.row1.map(c => <Stat key={c.l} label={c.l} value={c.v} rank={rankOf(c)} sub={c.sub} />)}
      </div>
      <div style={{ ...grid, marginTop: 16 }}>
        {cells.row2.map(c => <Stat key={c.l} label={c.l} value={c.v} rank={rankOf(c)} sub={c.sub} />)}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex justify-center" style={{ marginTop: 18 }}>
      <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
        {[['avg', 'Averages'], ['totals', 'Totals']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${
              mode === id ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SplitsPanel({ playerId, season }) {
  const url = playerId != null && season != null ? SPLITS_URL(playerId, season) : null;
  const { status, data } = useCachedFetch(splitsCache, url, parseSplits, !!url);
  const [catIdx, setCatIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setCatIdx(0); setExpanded(false); }, [season]);

  if (status === 'loading') return <div className="skeleton rounded-2xl" style={{ height: 140, marginTop: 14 }} />;
  if (status === 'error' || !data || data.cats.length === 0 || data.cols.length === 0) {
    return (
      <div className="rounded-2xl text-center" style={{ marginTop: 14, padding: '20px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 12, fontWeight: 600 }}>
        No splits available for this season.
      </div>
    );
  }

  const cat = data.cats[Math.min(catIdx, data.cats.length - 1)];
  const LIMIT = 12;
  const rows = expanded ? cat.splits : cat.splits.slice(0, LIMIT);
  const gridCols = `minmax(0, 1fr) ${data.cols.map(() => '40px').join(' ')}`;

  return (
    <div style={{ marginTop: 16 }}>
      {data.cats.length > 1 && (
        <div className="flex flex-wrap" style={{ gap: '4px 18px', marginBottom: 12, borderBottom: '1px solid #171717' }}>
          {data.cats.map((c, i) => {
            const active = i === catIdx;
            return (
              <button
                key={c.name}
                onClick={() => { setCatIdx(i); setExpanded(false); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  padding: '0 0 8px', color: active ? ACCENT : MUTED,
                  borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`, marginBottom: -1,
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 4, padding: '0 0 6px' }}>
        <span />
        {data.cols.map(c => (
          <span key={c.label} style={{ fontSize: 10, color: MUTED, fontWeight: 600, textAlign: 'center' }}>{c.label}</span>
        ))}
      </div>
      {rows.map(s => (
        <div
          key={s.name}
          style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 4, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #131313' }}
        >
          <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{s.name}</span>
          {data.cols.map(c => (
            <span key={c.label} style={{ fontSize: 13, fontWeight: 700, color: c.label === 'PTS' ? 'white' : '#a1a1aa', textAlign: 'center' }}>
              {s.stats[c.idx] ?? '—'}
            </span>
          ))}
        </div>
      ))}
      {cat.splits.length > LIMIT && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 12, fontWeight: 700, padding: '10px 0 0', width: '100%' }}
        >
          {expanded ? 'Show less' : `Show all ${cat.splits.length}`}
        </button>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Screen body. App.jsx keeps the fixed wrapper and the back header.
──────────────────────────────────────────────────────────────────────────── */

export default function PlayerStatsPage({
  player, selectedGame, gameDetails, selectedTeam,
  stats, loading, seasons = [], season,
  onSeasonChange, onTeamClick, onCompare, onHaptic,
}) {
  const [mode, setMode] = useState('avg');
  const [showSplits, setShowSplits] = useState(false);
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};

  // Identity: same lookups the old inline header used.
  const teamAbbr = player?.teamAbbr || (selectedTeam === 'away' ? selectedGame?.awayTeam : selectedGame?.homeTeam);
  const teamLogo = player?.teamLogo || (selectedTeam === 'away' ? selectedGame?.awayLogo : selectedGame?.homeLogo)
    || (teamAbbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${teamAbbr}.png` : null);
  const color = teamColors[teamAbbr] || '#3B82F6';

  const boxscorePlayer = gameDetails?.boxscore?.players?.[selectedTeam === 'away' ? 0 : 1]?.statistics?.[0]?.athletes
    ?.find(a => a.athlete.id === player?.id);
  const roster = selectedTeam === 'away' ? gameDetails?.awayRoster : gameDetails?.homeRoster;
  const rosterPlayer = roster?.find(p => p.id === player?.id);
  const headshot = boxscorePlayer?.athlete?.headshot?.href || rosterPlayer?.headshot?.href || rosterPlayer?.headshot || player?.headshot;
  const jersey = boxscorePlayer?.athlete?.jersey || rosterPlayer?.jersey || player?.jersey;
  const position = boxscorePlayer?.athlete?.position?.abbreviation || rosterPlayer?.position?.abbreviation || player?.position;

  const current = stats?.currentSeason;
  const cells = buildSeasonCells(current, mode);

  const ranksUrl = player?.id != null && season != null ? RANKS_URL(player.id, season) : null;
  const ranksState = useCachedFetch(ranksCache, ranksUrl, parseRanks, !!ranksUrl);
  const ranks = ranksState.status === 'ready' ? ranksState.data : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 14 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Headshot src={headshot} name={player?.name} size={76} ring={`${color}66`} />
          {teamLogo && (
            <img
              src={teamLogo}
              alt={teamAbbr}
              style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 26, background: '#000', padding: 3, border: '1px solid #1f1f1f' }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ ...heading, fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: 'white' }}>
            {player?.name}
          </div>
          {teamAbbr && (
            <button
              onClick={() => { haptic('light'); onTeamClick && onTeamClick(teamAbbr, teamLogo); }}
              className="truncate block"
              style={{ background: 'none', border: 'none', padding: 0, marginTop: 5, fontSize: 14, fontWeight: 600, color: ACCENT, textAlign: 'left', maxWidth: '100%' }}
            >
              {teamFullNames[teamAbbr] || teamAbbr} ›
            </button>
          )}
          <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 3 }}>
            {[position, jersey && jersey !== '-' ? `#${jersey}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* Season + compare */}
      <div className="flex items-center justify-between" style={{ marginTop: 26 }}>
        {seasons.length > 0 ? (
          <select
            value={season || ''}
            onFocus={() => haptic('selection')}
            onChange={e => { haptic('selection'); onSeasonChange && onSeasonChange(parseInt(e.target.value, 10)); }}
            className="bg-transparent outline-none appearance-none cursor-pointer"
            style={{
              color: '#d4d4d8', fontSize: 17, fontWeight: 700, paddingRight: 16,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right center',
            }}
          >
            {seasons.map(s => (
              <option key={s.year} value={s.year} className="bg-zinc-900">{s.displayName}</option>
            ))}
          </select>
        ) : <span />}
        <button
          onClick={() => { haptic('light'); onCompare && onCompare(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 15, fontWeight: 700 }}
        >
          Compare ›
        </button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="skeleton rounded-2xl" style={{ height: 200, marginTop: 20 }} />
      ) : stats?.error ? (
        <div className="rounded-2xl text-center" style={{ marginTop: 20, padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
          {stats.error}
        </div>
      ) : current ? (
        <>
          <ModeToggle mode={mode} onChange={m => { haptic('selection'); setMode(m); }} />
          <StatGrid cells={cells} ranks={ranks} />

          <button
            onClick={() => { haptic('light'); setShowSplits(v => !v); }}
            className="w-full flex items-center justify-center bg-blue-600 text-white font-bold rounded-full"
            style={{ gap: 8, padding: '12px 0', marginTop: 24, fontSize: 15, border: 'none', cursor: 'pointer' }}
          >
            <Zap className="w-4 h-4" fill="currentColor" />
            {showSplits ? 'Hide splits' : 'Splits'}
          </button>
          {showSplits && <SplitsPanel playerId={player?.id} season={season} />}
        </>
      ) : (
        <div className="rounded-2xl text-center" style={{ marginTop: 20, padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 13, fontWeight: 600 }}>
          No stats available
        </div>
      )}

      {/* Recent performances: the existing component, unchanged */}
      <PlayerRecentGames key={player?.id} playerId={player?.id} color={color} />
    </div>
  );
}