import React, { useEffect, useState } from 'react';
import { fetchLeagueRows, peekLeagueRows } from './leagueRanks';

// ESPN's season year is the year the season ends; a new season starts in October.
const seasonYear = (d = new Date()) => (d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear());
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// Tiny id -> PPG map kept in localStorage so rosters can be sorted on the very first render
let memMap = null;
const MAP_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
function readPpgMap(year) {
  if (memMap && memMap.year === year) return memMap.map;
  try {
    const raw = localStorage.getItem(`ppgmap_v1_${year}`);
    if (raw) {
      const o = JSON.parse(raw);
      if (Date.now() - o.at < MAP_MAX_AGE) {
        memMap = { year, map: new Map(Object.entries(o.m)) };
        return memMap.map;
      }
    }
  } catch (e) { /* ignore a bad cache */ }
  return null;
}
function savePpgMap(year, rows) {
  const m = {};
  rows.forEach(r => { if (Number.isFinite(r.vals?.pts)) m[r.id] = +r.vals.pts.toFixed(1); });
  memMap = { year, map: new Map(Object.entries(m)) };
  try { localStorage.setItem(`ppgmap_v1_${year}`, JSON.stringify({ at: Date.now(), m })); } catch (e) { /* storage full */ }
}

// One shared league-wide request, however many rows ask at once
let pending = null;
let pendingYear = null;
const load = year => {
  if (!pending || pendingYear !== year) {
    pendingYear = year;
    pending = fetchLeagueRows(year).then(r => { savePpgMap(year, r); return r; }).finally(() => { if (pendingYear === year) pending = null; });
  }
  return pending;
};

// Fallback for players the league list doesn't carry: their own season-by-season averages
const athleteCache = new Map();   // `${id}:${year}` -> Promise<{ pts, reb, ast } | null>
function loadFromAthlete(id, year) {
  const key = `${id}:${year}`;
  if (!athleteCache.has(key)) {
    athleteCache.set(
      key,
      fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/stats`)
        .then(r => { if (!r.ok) throw new Error(`ESPN ${r.status}`); return r.json(); })
        .then(json => {
          const cat = json?.categories?.find(c => c.name === 'averages');
          const labels = (cat?.labels || []).map(l => String(l).toUpperCase());
          const at = (e, l) => num(e?.stats?.[labels.indexOf(l)]);
          const entries = (cat?.statistics || []).filter(s => s?.season?.year === year);
          if (!entries.length) return null;
          // traded players have one entry per team: weight by games played
          let gp = 0; let pts = 0; let reb = 0; let ast = 0;
          entries.forEach(e => {
            const g = at(e, 'GP') || 0;
            gp += g; pts += (at(e, 'PTS') || 0) * g; reb += (at(e, 'REB') || 0) * g; ast += (at(e, 'AST') || 0) * g;
          });
          return gp > 0 ? { pts: pts / gp, reb: reb / gp, ast: ast / gp } : null;
        })
        .catch(() => { athleteCache.delete(key); return null; })
    );
  }
  return athleteCache.get(key);
}

export default function PlayerAverages({ playerId, dim }) {
  const year = seasonYear();
  const id = String(playerId);
  const [rows, setRows] = useState(() => {
    try { return peekLeagueRows(year) || null; } catch (e) { return null; }
  });
  const [extra, setExtra] = useState(null);

  useEffect(() => {
    if (rows) return undefined;
    let dead = false;
    load(year).then(r => { if (!dead) setRows(r); }).catch(() => {});
    return () => { dead = true; };
  }, [year, rows]);

  const me = rows ? rows.find(r => r.id === id) : null;
  const have = Number.isFinite(me?.vals?.pts);

  useEffect(() => {
    if (!rows || have) return undefined;
    let dead = false;
    loadFromAthlete(id, year).then(v => { if (!dead) setExtra(v); });
    return () => { dead = true; };
  }, [rows, have, id, year]);

  const src = have ? me.vals : extra;
  const vals = [['PPG', src?.pts], ['RPG', src?.reb], ['APG', src?.ast]];

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
      {vals.map(([label, v]) => (
        <div key={label} className="text-center w-[30px]">
          <div className={`text-[14px] font-semibold leading-none tracking-tight ${dim ? 'text-gray-500' : 'text-white'}`}>
            {Number.isFinite(v) ? v.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}
/** Sort a roster by season PPG (highest first). Players the league list doesn't carry keep their order, at the end. */
export function sortByAverages(players) {
  const year = seasonYear();
  let ppg = null;
  try {
    const rows = peekLeagueRows(year);
    if (rows) {
      if (!memMap || memMap.year !== year) savePpgMap(year, rows);
      ppg = new Map(rows.map(r => [r.id, r.vals?.pts]));
    }
  } catch (e) { /* not loaded yet */ }
  if (!ppg) ppg = readPpgMap(year);
  if (!ppg) return players;
    const score = p => { const v = ppg.get(String(p.id)); return Number.isFinite(v) ? v : -1; };
    return players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => score(b.p) - score(a.p) || a.i - b.i)
      .map(x => x.p);
  }
  
  // Warm the cache shortly after the app loads so a roster is already sortable the first time it opens
  if (typeof window !== 'undefined') {
    setTimeout(() => { load(seasonYear()).catch(() => {}); }, 3000);
  }