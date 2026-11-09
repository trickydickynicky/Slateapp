import { useEffect, useState } from 'react';
import { ordinal } from './slateShared';
import { PLAYER_STATS, MIN_GP_SHARE } from './statConfig';

const TTL = 30 * 60 * 1000;
const LEAGUE_URL = (yr, page) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?region=us&lang=en&season=${yr}&seasontype=2&limit=500&page=${page}`;

const cache = new Map();   // season -> { at, rows }

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const pick = (all, names) => {
  for (const n of names || []) {
    if (n instanceof RegExp) {
      const k = Object.keys(all).find(x => n.test(x));
      if (k !== undefined) return all[k];
    } else if (n in all) return all[n];
  }
  return null;
};

export const peekLeagueRows = yr => {
  const hit = cache.get(yr);
  return hit && Date.now() - hit.at < TTL ? hit.rows : null;
};

/** Every NBA player's per-game stats for a season. Cached, shared by the player page and Leaderboards. */
export async function fetchLeagueRows(yr, signal) {
  const cached = peekLeagueRows(yr);
  if (cached) return cached;
  const getPage = p =>
    fetch(LEAGUE_URL(yr, p), { signal }).then(r => {
      if (!r.ok) throw new Error(`ESPN ${r.status}`);
      return r.json();
    });
  const first = await getPage(1);
  const pages = first?.pagination?.pages || 1;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => getPage(i + 2)));
  const defs = first?.categories || [];
  const rows = [];
  [first, ...rest].forEach(j => {
    (j?.athletes || []).forEach(a => {
      const ath = a?.athlete || {};
      if (ath.id == null) return;
      const all = {};
      defs.forEach(def => {
        const cat = (a?.categories || []).find(c => c.name === def.name);
        (def.names || []).forEach((n, i) => {
          const v = cat?.values?.[i];
          if (v !== undefined && v !== null && v !== '') all[n] = num(v);
        });
      });
      const row = {
        id: String(ath.id),
        name: ath.displayName || ath.shortName || '',
        team: ath.teamShortName || '',
        pos: ath.position?.abbreviation || '',
        headshot: ath.headshot?.href || null,
        gp: all.gamesPlayed ?? 0,
        minutes: all.minutes ?? null,       // season totals, used by Totals-mode ranks on the player page
        rebounds: all.rebounds ?? null,
        vals: {},
      };
      PLAYER_STATS.forEach(s => {
        let v = null;
        if (s.compute === 'ts') {
          const { avgFieldGoalsAttempted: fga, avgFreeThrowsAttempted: fta, avgPoints: pts } = all;
          v = [fga, fta, pts].every(Number.isFinite) && fga + 0.44 * fta > 0 ? (pts / (2 * (fga + 0.44 * fta))) * 100 : null;
        } else {
          v = pick(all, s.names);
        }
        row.vals[s.key] = v;
      });
      rows.push(row);
    });
  });
  cache.set(yr, { at: Date.now(), rows });
  return rows;
}

/** The single ranking rule. Qualified players only, ties share a rank (1, 2, 2, 4). */
export function rankPlayers(rows, stat) {
  const maxGp = rows.reduce((m, r) => Math.max(m, r.gp), 0);
  const pool = rows.filter(r => r.gp >= maxGp * MIN_GP_SHARE && Number.isFinite(r.vals[stat.key]));
  const dir = stat.lowerIsBetter ? 1 : -1;
  pool.sort((a, b) => dir * (a.vals[stat.key] - b.vals[stat.key]) || a.name.localeCompare(b.name));
  let rank = 0; let prev = null;
  return pool.map((r, i) => {
    const v = r.vals[stat.key];
    if (v !== prev) { rank = i + 1; prev = v; }
    return { ...r, value: v, rank };
  });
}

/** { pts: '3rd', ... } for one player, plus Totals-mode fallbacks under ESPN's names. */
export function leagueRanksFor(rows, playerId) {
  const id = String(playerId);
  const me = rows.find(r => r.id === id);
  if (!me) return {};
  const out = {};
  PLAYER_STATS.forEach(s => {
    const hit = rankPlayers(rows, s).find(r => r.id === id);
    if (hit) out[s.key] = ordinal(hit.rank);
  });
  ['minutes', 'rebounds'].forEach(k => {
    if (me[k] == null) return;
    out[k] = ordinal(1 + rows.filter(r => r.id !== id && (r[k] ?? 0) > me[k]).length);
  });
  return out;
}

export function useLeagueRanks(playerId, season) {
  const [ranks, setRanks] = useState(null);
  useEffect(() => {
    if (playerId == null || season == null) return undefined;
    setRanks(null);
    const controller = new AbortController();
    fetchLeagueRows(season, controller.signal)
      .then(rows => setRanks(leagueRanksFor(rows, playerId)))
      .catch(() => {});
    return () => controller.abort();
  }, [playerId, season]);
  return ranks;
}