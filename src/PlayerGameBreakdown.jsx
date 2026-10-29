import React, { useEffect, useRef, useState } from 'react';
import { useSwipeBack } from './useSwipeBack';
import BackButton from './BackButton';

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

const ACCENT = '#2563eb';   // blue-600, the app accent
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const RED = '#ef4444';
const POLL_MS = 12000;
const SUMMARY_URL = id =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;

const DEFAULT_LABELS = ['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB','DREB','PF','+/-'];

const IS_DEV = (() => {
  try { if (typeof import.meta !== 'undefined' && import.meta.env) return !!import.meta.env.DEV; } catch (e) { /* ignore */ }
  try { return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'; } catch (e) { return false; }
})();

// Processed results for finished games: key = `${gameId}:${playerId}`. Never expires.
const finalCache = new Map();

/* ────────────────────────────────────────────────────────────────────────────
   Pure transform logic (exported so it can be unit tested)
──────────────────────────────────────────────────────────────────────────── */

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const splitMadeAtt = str => {
  const p = String(str ?? '0-0').split('-');
  return [num(p[0]), num(p[1])];
};

export const pctOf = (made, att) => (att > 0 ? (made / att) * 100 : null);

export const tsPct = (pts, fga, fta) => {
  const d = 2 * (fga + 0.44 * fta);
  return d > 0 ? (pts / d) * 100 : null;
};

export const fmtPct = p => (p == null ? '—' : p.toFixed(1));

export const quarterLabel = (period, maxPeriod) => {
  if (period <= 4) return `Q${period}`;
  return maxPeriod === 5 ? 'OT' : `OT${period - 4}`;
};

const playerIdOf = p => {
  const a = p?.athlete;
  if (!a) return null;
  if (a.id != null) return String(a.id);
  const m = typeof a.$ref === 'string' ? a.$ref.match(/athletes\/(\d+)/) : null;
  return m ? m[1] : null;
};

export const emptyStat = () => ({
  pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
});

const THREE_RE = /three point|three-point|3-pt|3pt/i;

/**
 * Applies one play to a stat line for `pid`. Mutates and returns `stat`.
 * participants[0] is the primary player; on an assisted make, participants[1] is the assister.
 */
export function applyPlay(stat, play, pid) {
  const parts = Array.isArray(play?.participants) ? play.participants : [];
  const ids = parts.map(playerIdOf);
  const typeText = play?.type?.text || '';
  const text = play?.text || '';
  const blob = `${typeText} ${text}`;
  const isP0 = ids[0] === pid;
  const isP1 = ids[1] === pid;
  if (!isP0 && !isP1) return stat;

  const made = !!play.scoringPlay;
  const isFT = /free throw/i.test(blob);
  const isThree = THREE_RE.test(blob);
  const isBlock = /block/i.test(typeText) || /\bblocks\b/i.test(text);

  if (isBlock) {
    // "A blocks B's shot": A (participants[0]) gets the block, B (participants[1]) the missed attempt.
    if (isP0) stat.blk += 1;
    if (isP1 && play.shootingPlay !== false) {
      stat.fga += 1;
      if (isThree) stat.tpa += 1;
    }
    return stat;
  }

  if (isP0) {
    if (play.shootingPlay || isFT) {
      if (isFT) {
        stat.fta += 1;
        if (made) { stat.ftm += 1; stat.pts += num(play.scoreValue) || 1; }
      } else {
        stat.fga += 1;
        if (isThree) stat.tpa += 1;
        if (made) {
          stat.fgm += 1;
          if (isThree) stat.tpm += 1;
          stat.pts += num(play.scoreValue) || (isThree ? 3 : 2);
        }
      }
    } else if (/rebound/i.test(typeText)) {
      if (/offensive/i.test(typeText)) stat.oreb += 1; else stat.dreb += 1;
    } else {
      if (/turnover/i.test(typeText)) stat.to += 1;
      if (/foul/i.test(typeText) && !/technical/i.test(typeText)) stat.pf += 1;
    }
  }

  if (isP1) {
    if (made && !isFT && (!text || /assist/i.test(text))) stat.ast += 1;
    if (/steal/i.test(text)) stat.stl += 1;
  }

  return stat;
}

const finalizeStat = s => ({ ...s, reb: s.oreb + s.dreb });

/** Plays -> { [periodNumber]: stat line } */
export function buildQuarterStats(plays, pid) {
  const byPeriod = {};
  let maxPeriod = 0;
  (plays || []).forEach(p => {
    const n = p?.period?.number;
    if (Number.isFinite(n) && n > maxPeriod) maxPeriod = n;
  });
  maxPeriod = Math.max(maxPeriod, 4);
  for (let i = 1; i <= maxPeriod; i++) byPeriod[i] = emptyStat();
  (plays || []).forEach(p => {
    const n = p?.period?.number;
    if (byPeriod[n]) applyPlay(byPeriod[n], p, pid);
  });
  Object.keys(byPeriod).forEach(k => { byPeriod[k] = finalizeStat(byPeriod[k]); });
  return { byPeriod, maxPeriod };
}

/** Points + assist count per teammate off this player's assists. */
export function buildAssistBreakdown(plays, pid, roster = new Map()) {
  const map = new Map();
  (plays || []).forEach(p => {
    if (!p?.scoringPlay) return;
    const parts = Array.isArray(p.participants) ? p.participants : [];
    const ids = parts.map(playerIdOf);
    const blob = `${p?.type?.text || ''} ${p?.text || ''}`;
    if (ids[1] !== pid || !ids[0] || ids[0] === pid) return;
    if (/free throw/i.test(blob)) return;
    if (p.text && !/assist/i.test(p.text)) return;
    const pts = num(p.scoreValue) || (THREE_RE.test(blob) ? 3 : 2);
    const row = map.get(ids[0]) || { id: ids[0], pts: 0, ast: 0 };
    row.pts += pts;
    row.ast += 1;
    map.set(ids[0], row);
  });
  const rows = [...map.values()]
    .map(r => ({ ...r, name: roster.get(r.id)?.name || 'Teammate', headshot: roster.get(r.id)?.headshot || null }))
    .sort((a, b) => b.pts - a.pts || b.ast - a.ast);
  return { total: rows.reduce((s, r) => s + r.pts, 0), rows };
}

const isSubPlay = p => /substitution/i.test(p?.type?.text || '') || /enters the game/i.test(p?.text || '');

/**
 * Plus/minus per period, from the running score and substitution plays.
 * Substitution participants: [0] enters, [1] leaves. `starter` says who is on court at tip-off.
 */
export function buildQuarterPlusMinus(plays, pid, isHome, starter) {
  const list = Array.isArray(plays) ? plays : [];
  const idsOf = p => (Array.isArray(p?.participants) ? p.participants : []).map(playerIdOf);

  let on;
  if (typeof starter === 'boolean') {
    on = starter;
  } else {
    const firstSub = list.find(p => isSubPlay(p) && idsOf(p).includes(pid));
    on = firstSub ? idsOf(firstSub)[1] === pid : false;
  }

  const out = {};
  let prevMy = 0;
  let prevOpp = 0;
  list.forEach(p => {
    const n = p?.period?.number;
    if (!Number.isFinite(n)) return;
    if (isSubPlay(p)) {
      const ids = idsOf(p);
      if (ids[0] === pid) on = true;
      else if (ids[1] === pid) on = false;
    }
    if (p.awayScore == null || p.homeScore == null) return;
    const my = num(isHome ? p.homeScore : p.awayScore);
    const opp = num(isHome ? p.awayScore : p.homeScore);
    if (on) out[n] = (out[n] || 0) + (my - prevMy) - (opp - prevOpp);
    prevMy = my;
    prevOpp = opp;
  });
  return out;
}

/** One boxscore athlete row -> numeric stat line (uses the labels array when ESPN provides it). */
export function parseBoxRow(row, labels) {
  const stats = row?.stats;
  if (!Array.isArray(stats) || stats.length === 0) return null;
  const L = Array.isArray(labels) && labels.length ? labels : DEFAULT_LABELS;
  const get = l => {
    const i = L.indexOf(l);
    return i >= 0 ? stats[i] : undefined;
  };
  const [fgm, fga] = splitMadeAtt(get('FG'));
  const [tpm, tpa] = splitMadeAtt(get('3PT'));
  const [ftm, fta] = splitMadeAtt(get('FT'));
  const oreb = num(get('OREB'));
  const dreb = num(get('DREB'));
  return {
    min: get('MIN') ?? '—',
    pts: num(get('PTS')), fgm, fga, tpm, tpa, ftm, fta,
    oreb, dreb, reb: get('REB') != null ? num(get('REB')) : oreb + dreb,
    ast: num(get('AST')), stl: num(get('STL')), blk: num(get('BLK')),
    to: num(get('TO')), pf: num(get('PF')),
    pm: num(get('+/-')),
  };
}

export function sumStats(list) {
  return finalizeStat(list.reduce((acc, s) => {
    Object.keys(acc).forEach(k => { acc[k] += s[k] || 0; });
    return acc;
  }, emptyStat()));
}

const CHECK_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'pf', 'fga'];

/** Returns the stats where the quarter totals don't match the box score. */
export function findTotalMismatches(box, byPeriod) {
  if (!box) return [];
  const total = sumStats(Object.values(byPeriod));
  return CHECK_KEYS
    .filter(k => num(total[k]) !== num(box[k]))
    .map(k => ({ stat: k, quarters: total[k], box: box[k] }));
}

/** Whole summary -> everything the view needs for one player. */
export function processSummary(summary, playerId, teamIdx = 0) {
  const pid = String(playerId);
  const teams = Array.isArray(summary?.boxscore?.players) ? summary.boxscore.players : [];
  const athletesOf = t => t?.statistics?.[0]?.athletes || [];
  const teamEntry =
    teams.find(t => athletesOf(t).some(a => String(a?.athlete?.id) === pid)) || teams[teamIdx] || null;
  const statBlock = teamEntry?.statistics?.[0];
  const row = athletesOf(teamEntry).find(a => String(a?.athlete?.id) === pid) || null;

  const roster = new Map();
  athletesOf(teamEntry).forEach(a => {
    const id = a?.athlete?.id;
    if (id == null) return;
    roster.set(String(id), {
      name: a.athlete.displayName || a.athlete.shortName || 'Teammate',
      headshot: a.athlete.headshot?.href || null,
    });
  });

  const box = parseBoxRow(row, statBlock?.labels);
  const plays = Array.isArray(summary?.plays) ? summary.plays : [];
  const hasPlays = plays.length > 0;

  const teamId = teamEntry?.team?.id != null ? String(teamEntry.team.id) : null;
  const competitors = summary?.header?.competitions?.[0]?.competitors || [];
  const mine = competitors.find(c => teamId && (String(c?.id) === teamId || String(c?.team?.id) === teamId));
  const isHome = mine ? mine.homeAway === 'home' : teamIdx === 1;

  let byPeriod = {};
  let maxPeriod = 4;
  let assists = { total: 0, rows: [] };
  let pmOk = false;
  if (hasPlays) {
    ({ byPeriod, maxPeriod } = buildQuarterStats(plays, pid));
    assists = buildAssistBreakdown(plays, pid, roster);

    const pmByPeriod = buildQuarterPlusMinus(plays, pid, isHome, row?.starter);
    Object.keys(byPeriod).forEach(k => { byPeriod[k].pm = pmByPeriod[k] || 0; });
    const pmSum = Object.values(byPeriod).reduce((t, s) => t + s.pm, 0);
    // Only trust quarter +/- when it adds up to the box score +/-.
    pmOk = !!box && pmSum === box.pm;
    if (IS_DEV && box && !pmOk) {
      // eslint-disable-next-line no-console
      console.warn(`[PlayerGameBreakdown] +/- mismatch: quarters sum to ${pmSum}, box score says ${box.pm}. Quarter +/- hidden.`);
    }
    if (IS_DEV) {
      findTotalMismatches(box, byPeriod).forEach(m =>
        // eslint-disable-next-line no-console
        console.warn(`[PlayerGameBreakdown] ${m.stat.toUpperCase()} mismatch: quarters sum to ${m.quarters}, box score says ${m.box}`)
      );
    }
  }

  const comp = summary?.header?.competitions?.[0];
  return {
    box,
    boxAthlete: row?.athlete || null,
    hasBoxscore: teams.length > 0,
    hasPlays,
    pmOk,
    byPeriod,
    maxPeriod,
    assists,
    completed: comp?.status?.type?.completed === true,
    inProgress: comp?.status?.type?.state === 'in',
  };
}

/* Season stats + league rank (ESPN core API, no key) */

const SEASON_STATS = [
  { label: 'PTS', names: ['avgPoints'] },
  { label: 'REB', names: ['avgRebounds'] },
  { label: 'AST', names: ['avgAssists'] },
  { label: 'STL', names: ['avgSteals'] },
  { label: 'BLK', names: ['avgBlocks'] },
  { label: 'TO', names: ['avgTurnovers'] },
  { label: '3PM', names: ['avgThreePointFieldGoalsMade'] },
  { label: 'FG%', names: ['fieldGoalPct'] },
];

export const ordinal = n => {
  const v = Math.abs(n) % 100;
  const sfx = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${sfx}`;
};

/** ESPN season statistics response -> [{ label, value, rank }]; skips anything missing. */
export function parseSeasonStats(json) {
  const byName = {};
  (json?.splits?.categories || []).forEach(c =>
    (c?.stats || []).forEach(s => { if (s?.name && !byName[s.name]) byName[s.name] = s; })
  );
  const items = [];
  SEASON_STATS.forEach(({ label, names }) => {
    const st = names.map(n => byName[n]).find(Boolean);
    const value = st?.displayValue ?? (st?.value != null ? String(st.value) : null);
    if (value == null || value === '') return;
    const rank = st.rankDisplayValue || (Number.isFinite(st.rank) ? ordinal(st.rank) : null);
    items.push({ label, value, rank });
  });
  return items;
}

const seasonCache = new Map();   // `${playerId}:${season}` -> { at, items }
const SEASON_TTL = 30 * 60 * 1000;
const nbaSeasonYear = (d = new Date()) => (d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear());
const SEASON_URL = (id, yr) =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${yr}/types/2/athletes/${id}/statistics`;

function useSeasonStats(playerId) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (playerId == null) return undefined;
    const yr = nbaSeasonYear();
    const key = `${playerId}:${yr}`;
    const hit = seasonCache.get(key);
    if (hit && Date.now() - hit.at < SEASON_TTL) { setItems(hit.items); return undefined; }
    setItems(null);
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(SEASON_URL(playerId, yr), { signal: controller.signal });
        if (!res.ok) throw new Error(`ESPN ${res.status}`);
        const parsed = parseSeasonStats(await res.json());
        seasonCache.set(key, { at: Date.now(), items: parsed });
        setItems(parsed);
      } catch (err) {
        if (err?.name !== 'AbortError') setItems([]);
      }
    })();
    return () => controller.abort();
  }, [playerId]);
  return items;
}

/* ────────────────────────────────────────────────────────────────────────────
   Data hook: reuse the loaded summary, cache finals, poll live games
──────────────────────────────────────────────────────────────────────────── */

function usePlayerBreakdown({ gameId, playerId, teamIdx, isFinal, isLive, detailsRef }) {
  const [data, setData] = useState(null);   // { key, ...processed }
  const [failed, setFailed] = useState(false);
  const key = `${gameId}:${playerId}`;

  useEffect(() => {
    if (playerId == null) return undefined;
    setFailed(false);

    const cached = finalCache.get(key);
    if (cached) { setData(cached); return undefined; }

    let ignore = false;
    let done = false;
    let timer = null;
    let controller = null;

    const clear = () => { clearTimeout(timer); timer = null; if (controller) controller.abort(); };
    const schedule = () => {
      if (ignore || done || (typeof document !== 'undefined' && document.hidden)) return;
      clearTimeout(timer);
      timer = setTimeout(load, POLL_MS);
    };
    const accept = summary => {
      const processed = { key, ...processSummary(summary, playerId, teamIdx) };
      const finished = isFinal || processed.completed;
      if (finished) {
        done = true;
        if (processed.hasPlays) finalCache.set(key, processed);
      }
      if (!ignore) setData(processed);
      return processed;
    };

    async function load() {
      if (ignore) return;
      if (gameId == null) { setFailed(true); return; }
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const res = await fetch(SUMMARY_URL(gameId), { signal: controller.signal });
        if (!res.ok) throw new Error(`ESPN ${res.status}`);
        const summary = await res.json();
        if (ignore) return;
        const processed = accept(summary);
        if (!done && (isLive || processed.inProgress)) schedule();
      } catch (err) {
        if (ignore || err?.name === 'AbortError') return;
        setFailed(true);
        if (!done && isLive) schedule();
      }
    }

    const onVisibility = () => {
      if (document.hidden) clear();
      else if (!done && isLive) load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Reuse the game detail summary if it's already loaded.
    const seed = detailsRef.current;
    if (seed?.boxscore) {
      const processed = accept(seed);
      if (processed.hasPlays) {
        if (!done && isLive) schedule();   // already have plays, so don't refetch right away
      } else {
        load();                            // boxscore only; need plays for quarters
      }
    } else {
      load();
    }

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, teamIdx, isFinal, isLive]);

  return { data: data && data.key === key ? data : null, failed };
}

/* ────────────────────────────────────────────────────────────────────────────
   Presentational pieces
──────────────────────────────────────────────────────────────────────────── */

const heading = { fontFamily: 'Rajdhani, sans-serif' };

function Initials({ name, size }) {
  return (
    <div
      className="bg-zinc-900 flex items-center justify-center text-gray-500 font-bold flex-shrink-0"
      style={{ width: size, height: size, borderRadius: size, fontSize: size * 0.3 }}
    >
      {(name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
    </div>
  );
}

function Headshot({ src, name, size, ring }) {
  if (!src) return <Initials name={name} size={size} />;
  return (
    <img
      src={src}
      alt={name}
      className="object-cover flex-shrink-0"
      style={{
        width: size, height: size, borderRadius: size, background: '#18181b',
        border: ring ? `2px solid ${ring}` : 'none',
      }}
    />
  );
}

function StatCell({ value, label, color, small }) {
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <span
        style={{
          fontSize: small ? 16 : 19, fontWeight: 800, lineHeight: 1,
          color: color || 'white', whiteSpace: 'nowrap', letterSpacing: '-0.02em',
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 8.5, color: MUTED, fontWeight: 700, letterSpacing: '0.06em', marginTop: 4 }}>
        {label}
      </span>
    </div>
  );
}

function StatGrid({ view, isAll, showPm }) {
  const fgPct = fmtPct(pctOf(view.fgm, view.fga));
  const ts = fmtPct(tsPct(view.pts, view.fga, view.fta));
  const pm = view.pm;
  const pmStr = pm == null ? '—' : pm > 0 ? `+${pm}` : `${pm}`;
  const pmColor = pm > 0 ? GREEN : pm < 0 ? RED : null;
  const pmCell = { v: pmStr, l: '+/-', c: pmColor };

  const row1 = isAll
    ? [
        { v: view.min, l: 'MIN' }, { v: view.pts, l: 'PTS' }, { v: view.reb, l: 'REB' },
        { v: view.ast, l: 'AST' }, { v: view.stl, l: 'STL' }, { v: view.blk, l: 'BLK' },
        pmCell, { v: fgPct, l: 'FG%' },
      ]
    : [
        { v: view.pts, l: 'PTS' }, { v: view.reb, l: 'REB' }, { v: view.ast, l: 'AST' },
        { v: view.stl, l: 'STL' }, { v: view.blk, l: 'BLK' },
        ...(showPm ? [pmCell] : []),
        { v: fgPct, l: 'FG%' },
      ];
  const row2 = [
    { v: `${view.fgm}-${view.fga}`, l: 'FG', s: true },
    { v: `${view.tpm}-${view.tpa}`, l: '3FG', s: true },
    { v: `${view.ftm}-${view.fta}`, l: 'FT', s: true },
    { v: view.to, l: 'TO' }, { v: view.pf, l: 'PF' },
    { v: view.oreb, l: 'OREB' }, { v: view.dreb, l: 'DREB' }, { v: ts, l: 'TS%' },
  ];

  const gridStyle = n => ({
    display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: 2, rowGap: 14,
  });

  return (
    <div style={{ marginTop: 22 }}>
      <div style={gridStyle(row1.length)}>
        {row1.map(c => <StatCell key={c.l} value={c.v} label={c.l} color={c.c} />)}
      </div>
      <div style={{ ...gridStyle(8), marginTop: 18 }}>
        {row2.map(c => <StatCell key={c.l} value={c.v} label={c.l} small={c.s} />)}
      </div>
    </div>
  );
}

function QuarterTabs({ periods, maxPeriod, tab, onChange }) {
  const items = [{ id: 'all', label: 'All' }, ...periods.map(p => ({ id: p, label: quarterLabel(p, maxPeriod) }))];
  return (
    <div className="flex" style={{ gap: 20, marginTop: 26, borderBottom: '1px solid #171717' }}>
      {items.map(({ id, label }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, padding: '0 0 8px',
              color: active ? ACCENT : MUTED,
              borderBottom: `2px solid ${active ? ACCENT : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function QuarterBars({ periods, maxPeriod, byPeriod, color, tab }) {
  const values = periods.map(p => byPeriod[p]?.pts || 0);
  const best = Math.max(...values, 0);
  const MAX_H = 84;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ ...heading, fontSize: 17, fontWeight: 800, color: 'white', marginBottom: 14 }}>
        Scoring by quarter
      </div>
      <div className="flex items-end justify-around" style={{ height: MAX_H + 40 }}>
        {periods.map((p, i) => {
          const v = values[i];
          const h = best > 0 ? Math.max(6, (v / best) * MAX_H) : 6;
          const dim = tab !== 'all' && tab !== p;
          return (
            <div key={p} className="flex flex-col items-center justify-end" style={{ width: 44, opacity: dim ? 0.4 : 1 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'white', marginBottom: 5 }}>{v}</span>
              <div style={{ width: 30, height: h, borderRadius: 10, background: v > 0 ? color : '#1f1f1f' }} />
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginTop: 6 }}>
                {quarterLabel(p, maxPeriod)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssistBreakdown({ assists }) {
  if (!assists || assists.rows.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <span style={{ ...heading, fontSize: 17, fontWeight: 800, color: 'white' }}>Assist breakdown</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{assists.total} pts</span>
      </div>
      {assists.rows.map(r => (
        <div key={r.id} className="flex items-center" style={{ gap: 12, padding: '9px 0' }}>
          <Headshot src={r.headshot} name={r.name} size={36} />
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{r.name}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{r.pts} pts</div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#a1a1aa' }}>{r.ast} ast</span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Screen
──────────────────────────────────────────────────────────────────────────── */

export default function PlayerGameBreakdown({ player, game, gameDetails, selectedTeam, onClose }) {
  const screenRef = useSwipeBack(onClose);
  const [tab, setTab] = useState('all');

  const detailsRef = useRef(gameDetails);
  detailsRef.current = gameDetails;

  const isAway = selectedTeam === 'away';
  const teamIdx = isAway ? 0 : 1;
  const teamAbbr = isAway ? game.awayTeam : game.homeTeam;
  const myLogo = isAway ? game.awayLogo : game.homeLogo;
  const color = teamColors[teamAbbr] || '#3B82F6';
  const gameId = game?.id ?? game?.gameId ?? game?.eventId ?? gameDetails?.header?.id ?? gameDetails?.id ?? null;

  const seasonStats = useSeasonStats(player?.id);

  const { data, failed } = usePlayerBreakdown({
    gameId,
    playerId: player?.id,
    teamIdx,
    isFinal: !!game?.isFinal,
    isLive: !!game?.isLive,
    detailsRef,
  });

  const periods = data?.hasPlays ? Object.keys(data.byPeriod).map(Number).sort((a, b) => a - b) : [];
  // Finished games show Q1-Q4 (+OT). Live games hide quarters that haven't started yet.
  const lastActive = (() => {
    if (!data?.hasPlays) return 1;
    let last = 1;
    periods.forEach(p => {
      const s = data.byPeriod[p];
      if (Object.keys(s).some(k => s[k] > 0)) last = p;
    });
    return last;
  })();
  const shownPeriods = game?.isFinal || data?.completed ? periods : periods.filter(p => p <= lastActive);

  useEffect(() => {
    if (tab !== 'all' && !shownPeriods.includes(tab)) setTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPeriods.length]);

  // "All" view = box score; falls back to summed plays if the player has no box row.
  const allStat = data
    ? data.box || (data.hasPlays
        ? { ...sumStats(Object.values(data.byPeriod)), min: '—', pm: null }
        : { ...emptyStat(), min: '—', pm: null })
    : null;
  const view = tab === 'all' ? allStat : data?.byPeriod?.[tab] || emptyStat();

  const athlete = data?.boxAthlete;
  const pos = player?.position?.abbreviation || player?.position
    || athlete?.position?.abbreviation || '';
  const headshot = player?.athlete?.headshot?.href || player?.headshot || athlete?.headshot?.href || null;

  const awayScore = game?.awayScore;
  const homeScore = game?.homeScore;
  const showScore = (game?.isFinal || game?.isLive) && awayScore != null && homeScore != null;
  // Final: winner bold, loser thin. Live: both medium.
  const awayWon = !!game?.isFinal && num(awayScore) > num(homeScore);
  const homeWon = !!game?.isFinal && num(homeScore) > num(awayScore);
  const awayLost = !!game?.isFinal && num(awayScore) < num(homeScore);
  const homeLost = !!game?.isFinal && num(homeScore) < num(awayScore);
  const scoreStyle = (won, lost) => ({
    fontWeight: won ? 800 : lost ? 300 : 600,
    color: won ? '#ffffff' : lost ? '#a1a1aa' : '#e4e4e7',
  });

  return (
    <div
      ref={screenRef}
      className="fixed inset-0 bg-black z-[200] overflow-y-auto"
      style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}
    >
        <div className="min-h-screen px-4 pb-14 max-w-lg mx-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>

        <BackButton onClick={onClose} />

        {/* Header */}
        <div className="flex items-center" style={{ gap: 12, marginTop: 4 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Headshot src={headshot} name={player?.name} size={60} ring={`${color}66`} />
            {myLogo && (
              <img
                src={myLogo}
                alt={teamAbbr}
                style={{
                  position: 'absolute', right: -4, bottom: -4, width: 22, height: 22,
                  borderRadius: 22, background: '#000', padding: 2, border: '1px solid #1f1f1f',
                }}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ ...heading, fontSize: 21, fontWeight: 900, lineHeight: 1.1, color: 'white' }}>
              {player?.name}
            </div>
            {pos ? <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 3 }}>{pos}</div> : null}
          </div>

          {allStat && (
            <div className="flex flex-shrink-0" style={{ gap: 12 }}>
              {[['pts', allStat.pts], ['reb', allStat.reb], ['ast', allStat.ast]].map(([l, v]) => (
                <div key={l} className="flex flex-col items-center">
                  <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 0.95, color: 'white' }}>{v}</span>
                  <span style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 4 }}>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showScore && (
          <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 18 }}>
            {game.awayLogo && <img src={game.awayLogo} alt={game.awayTeam} style={{ width: 22, height: 22 }} />}
            <span style={{ fontSize: 22, lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={scoreStyle(awayWon, awayLost)}>{awayScore}</span>
              <span style={{ color: '#52525b', fontWeight: 300 }}>-</span>
              <span style={scoreStyle(homeWon, homeLost)}>{homeScore}</span>
            </span>
            {game.homeLogo && <img src={game.homeLogo} alt={game.homeTeam} style={{ width: 22, height: 22 }} />}
          </div>
        )}

        {/* Body */}
        {!data ? (
          failed ? (
            <EmptyState text="Couldn't load this game right now. Go back and try again." />
          ) : (
            <div className="skeleton rounded-2xl" style={{ height: 180, marginTop: 24 }} />
          )
        ) : (
          <>
            {allStat && view && <StatGrid view={view} isAll={tab === 'all'} showPm={data.pmOk} />}

            {data.hasPlays ? (
              <>
                <QuarterTabs periods={shownPeriods} maxPeriod={data.maxPeriod} tab={tab} onChange={setTab} />
                <QuarterBars
                  periods={shownPeriods}
                  maxPeriod={data.maxPeriod}
                  byPeriod={data.byPeriod}
                  color={color}
                  tab={tab}
                />
                <AssistBreakdown assists={data.assists} />
              </>
            ) : (
              <EmptyState
                text={failed
                  ? "Couldn't refresh play-by-play. Showing what we have."
                  : "Play-by-play isn't available for this game yet, so quarter breakdowns can't be shown."}
              />
            )}
          </>
        )}

        <SeasonStats items={seasonStats} />
      </div>
    </div>
  );
}

function SeasonStats({ items }) {
  if (!items || items.length === 0) return null;
  const asOf = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div style={{ marginTop: 32 }}>
      <div className="flex items-baseline" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ ...heading, fontSize: 17, fontWeight: 800, color: '#a1a1aa' }}>Regular season stats</span>
        <span style={{ fontSize: 11, color: MUTED }}>as of {asOf}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: 6, rowGap: 18 }}>
        {items.map(({ label, value, rank }) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div className="flex items-baseline" style={{ gap: 3 }}>
              <span style={{ fontSize: 21, fontWeight: 800, color: '#e4e4e7', lineHeight: 1 }}>{value}</span>
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{label}</span>
            </div>
            {rank && <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{rank}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div
      className="rounded-2xl text-center"
      style={{ marginTop: 26, padding: '22px 16px', background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 12, fontWeight: 600 }}
    >
      {text}
    </div>
  );
}