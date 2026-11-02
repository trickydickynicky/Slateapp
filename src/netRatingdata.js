import { useEffect, useState } from 'react';
import { processGame, ENGINE_VERSION, pythag, addRanks } from './netRatingengine';

/* ============================================================================
   Net Rating data layer: fetch from ESPN, cache, process in the background.

   Cache (localStorage):
     netRating:games:v1     every processed game, kept permanently (one small record per game)
     netRating:schedule:v1  the list of completed games, 30 min TTL
     netRating:quick:v1     first-paint box-score estimate, 30 min TTL
============================================================================ */

const GAMES_KEY = 'netRating:games:v1';
const SCHED_KEY = 'netRating:schedule:v1';
const QUICK_KEY = 'netRating:quick:v1';
const TTL_MS = 30 * 60 * 1000;
const BATCH = 3;   // games processed at the same time (each summary is a big download)

const BASE = 'https://site.api.espn.com/apis';
const STANDINGS_URL = `${BASE}/v2/sports/basketball/nba/standings`;
const scheduleUrl = id => `${BASE}/site/v2/sports/basketball/nba/teams/${id}/schedule`;
const statsUrl = id => `${BASE}/site/v2/sports/basketball/nba/teams/${id}/statistics`;
const summaryUrl = id => `${BASE}/site/v2/sports/basketball/nba/summary?event=${id}`;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}
function readJson(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked: keep going without it */ }
}
/** { t, data } wrapper -> data if it is younger than the TTL, else null */
function readFresh(key) {
  const hit = readJson(key, null);
  return hit && Date.now() - hit.t < TTL_MS ? hit.data : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Schedule: which completed regular-season games exist
──────────────────────────────────────────────────────────────────────────── */

/** team schedule responses -> [{ id, date, awayAbbr, homeAbbr }] oldest first, no duplicates */
export function parseSchedules(responses) {
  const seen = new Set();
  const out = [];
  responses.forEach(json => {
    (json?.events || []).forEach(ev => {
      const comp = ev.competitions?.[0];
      if (!comp?.status?.type?.completed || seen.has(ev.id)) return;
      const st = String(ev.seasonType?.id ?? '2');
      if (st !== '2') return;   // regular season only (skips preseason, play-in, playoffs)
      const away = comp.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation;
      const home = comp.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation;
      if (!away || !home) return;
      seen.add(ev.id);
      out.push({ id: String(ev.id), date: ev.date, awayAbbr: away, homeAbbr: home });
    });
  });
  return out.sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function fetchSchedule(teamIds) {
  const lists = await Promise.all(Object.values(teamIds).map(id => getJson(scheduleUrl(id)).catch(() => null)));
  if (lists.every(l => !l)) throw new Error('schedule unavailable');
  return parseSchedules(lists);
}

/* ────────────────────────────────────────────────────────────────────────────
   First paint: season box-score stats -> estimated ratings
   possessions ≈ FGA - OREB + TOV + 0.44*FTA. Both teams have about the same number of
   possessions in a game, so one team-level estimate is used for offense and defense.
──────────────────────────────────────────────────────────────────────────── */

const statNum = (cat, re) => {
  const s = cat?.stats?.find(x => re.test(x.name));
  const n = parseFloat(s?.displayValue);
  return Number.isFinite(n) ? n : null;
};

/** standings + per-team season stats -> estimated rows (flagged estimate: true) */
export function parseQuick(standingsJson, statsById) {
  const entries = (standingsJson?.children || []).flatMap(c => c.standings?.entries || []);
  const rows = [];
  entries.forEach(e => {
    const get = name => parseFloat(e.stats?.find(s => s.name === name)?.displayValue);
    const w = get('wins');
    const l = get('losses');
    const ppg = get('avgPointsFor');
    const oppg = get('avgPointsAgainst');
    const off = statsById[e.team?.id]?.results?.stats?.categories?.find(c => c.name === 'offensive');
    const fga = statNum(off, /^avgFieldGoalsAttempted$/i);
    const fta = statNum(off, /^avgFreeThrowsAttempted$/i);
    const oreb = statNum(off, /^avgOffensiveRebounds$/i);
    const tov = statNum(off, /^avgTurnovers$/i);
    const gp = w + l;
    if (![w, l, ppg, oppg, fga, fta, oreb, tov].every(Number.isFinite) || gp <= 0) return;   // missing stats: skip the team
    const poss = fga - oreb + tov + 0.44 * fta;
    const xWin = pythag(ppg, oppg);
    const ortg = (100 * ppg) / poss;
    const drtg = (100 * oppg) / poss;
    rows.push({
      abbr: e.team.abbreviation, gp, w, estimate: true,
      ortg, drtg, net: ortg - drtg, winPct: w / gp, xWin, gap: xWin === null ? null : w - xWin * gp,
    });
  });
  return addRanks(rows);
}

async function fetchQuick() {
  const standings = await getJson(STANDINGS_URL);
  const ids = (standings.children || []).flatMap(c => c.standings?.entries || []).map(e => e.team?.id).filter(Boolean);
  const statsById = {};
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(ids.slice(i, i + 6).map(async id => {
      try { statsById[id] = await getJson(statsUrl(id)); } catch (e) { /* that team is skipped */ }
    }));
  }
  return parseQuick(standings, statsById);
}

/* ────────────────────────────────────────────────────────────────────────────
   The hook
   Returns { games, quick, progress, error }
     games     { gameId: processed record }  (grows as games are processed)
     quick     estimated rows for the first paint (or null)
     progress  { done, total } over every completed game this season (cached ones count as done)
     error     true if something couldn't be refreshed (cached data is still shown)
──────────────────────────────────────────────────────────────────────────── */

export function useNetRating(teamIds) {
  const [games, setGames] = useState(() => readJson(GAMES_KEY, {}));
  const [quick, setQuick] = useState(() => readFresh(QUICK_KEY));
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let dead = false;

    (async () => {
      // 1. quick estimate, in parallel with everything else
      if (!readFresh(QUICK_KEY)) {
        fetchQuick()
          .then(rows => { if (dead || !rows.length) return; writeJson(QUICK_KEY, { t: Date.now(), data: rows }); setQuick(rows); })
          .catch(() => { if (!dead) setError(true); });
      }

      // 2. which games exist
      let events = readFresh(SCHED_KEY);
      if (!events) {
        try {
          events = await fetchSchedule(teamIds);
          writeJson(SCHED_KEY, { t: Date.now(), data: events });
        } catch (e) {
          if (dead) return;
          setError(true);
          events = readJson(SCHED_KEY, null)?.data || [];   // stale list is better than none
        }
      }
      if (dead) return;

      // 3. process only the games we haven't cached (at this engine version)
      const have = readJson(GAMES_KEY, {});
      const todo = events.filter(ev => !(have[ev.id] && have[ev.id].v === ENGINE_VERSION));
      let done = events.length - todo.length;
      setGames({ ...have });
      setProgress({ done, total: events.length });

      for (let i = 0; i < todo.length; i += BATCH) {
        if (dead) return;
        const batch = todo.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(async ev => {
          try { return processGame(await getJson(summaryUrl(ev.id)), ev); } catch (e) { return null; }   // retried next time
        }));
        if (dead) return;
        results.forEach(r => { if (r) have[r.id] = r; });
        done += batch.length;
        writeJson(GAMES_KEY, have);
        setGames({ ...have });
        setProgress({ done, total: events.length });
      }
    })();

    return () => { dead = true; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return { games, quick, progress, error };
}