import { useEffect, useState } from 'react';
import { loadPlayerTotals } from './pbpstatsPlayers';

/* On-court ratings for one player, from pbpstats totals.
   ORTG = team points scored while he's on the floor per 100 possessions (PlusMinus + OpponentPoints = team points on court)
   DRTG = opponent points while he's on the floor per 100 possessions
   NET  = ORTG - DRTG
   Ranks are among players with at least QUAL_SHARE of the league's top minutes total.

   pbpstats sends the whole league (218 columns per player), which is slow. So only the 6 fields we need are kept,
   saved in localStorage for 3 hours, and one in-flight request is shared. warmOnOff() preloads it from App.jsx. */

const TTL = 3 * 60 * 60 * 1000;
const mem = new Map();
const flights = new Map();

export const QUAL_SHARE = 0.3; // share of the league's top minutes a player needs to be ranked

export const nameKey = n =>
  String(n || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

export const onOffOf = p => {
  if (!p || !(p.offPoss > 0) || !(p.defPoss > 0) || p.plusMinus == null || p.oppPts == null) return null;
  const ortg = ((p.plusMinus + p.oppPts) / p.offPoss) * 100;
  const drtg = (p.oppPts / p.defPoss) * 100;
  return { ortg, drtg, net: ortg - drtg, pm: p.gp > 0 ? p.plusMinus / p.gp : null }; // pm = plus/minus per game
};

const seasonStr = y => `${y - 1}-${String(y).slice(2)}`;
const toObj = a => ({ name: a[0], min: a[1], offPoss: a[2], defPoss: a[3], plusMinus: a[4], oppPts: a[5], gp: a[6] });

async function loadSlim(season) {
  if (mem.has(season)) return mem.get(season);
  try {
    const raw = localStorage.getItem(`onoff_v2_${season}`);
    if (raw) {
      const { at, rows } = JSON.parse(raw);
      if (Date.now() - at < TTL) { const r = rows.map(toObj); mem.set(season, r); return r; }
    }
  } catch (e) { /* ignore bad cache */ }
  if (!flights.has(season)) {
    flights.set(season, loadPlayerTotals(season).then(all => {
      const arr = all
        .filter(r => onOffOf(r))
        .map(r => [r.name, r.min, r.offPoss, r.defPoss, r.plusMinus, r.oppPts, r.gp]);
      try { localStorage.setItem(`onoff_v2_${season}`, JSON.stringify({ at: Date.now(), rows: arr })); } catch (e) { /* storage full */ }
      const r = arr.map(toObj);
      mem.set(season, r);
      return r;
    }).finally(() => flights.delete(season)));
  }
  return flights.get(season);
}

// Call once from App.jsx so the data is ready before anyone opens a player page
export function warmOnOff() {
  const d = new Date();
  const y = d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
  loadSlim(seasonStr(y)).catch(() => {});
}

// espnYear is the year the season ends (2027 -> '2026-27'), same as the rest of the player page
export function usePlayerOnOff(name, espnYear) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    setSt(null);
    if (!name || !espnYear) return undefined;
    let dead = false;
    loadSlim(seasonStr(espnYear))
      .then(rows => {
        if (dead) return;
        const me = rows.filter(r => nameKey(r.name) === nameKey(name)).sort((a, b) => b.min - a.min)[0];
        const mine = onOffOf(me);
        if (!mine) return;
        const maxMin = Math.max(...rows.map(r => r.min));
        const qualifies = me.min >= QUAL_SHARE * maxMin;
        const pool = rows.filter(r => r.min >= QUAL_SHARE * maxMin).map(onOffOf).filter(Boolean);
        const rank = (k, high) => 1 + pool.filter(o => (high ? o[k] > mine[k] : o[k] < mine[k])).length;
        setSt({
          ...mine,
          pmTotal: me.plusMinus, // season total, for the Totals view
          ranks: qualifies ? { ortg: rank('ortg', true), drtg: rank('drtg', false), net: rank('net', true), pm: rank('pm', true) } : null,
        });
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [name, espnYear]);
  return st;
}

// All players' slim rows for a season (used by the leaderboards)
export function useOnOffRows(espnYear, enabled) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!enabled || !espnYear) return undefined;
    let dead = false;
    setRows(mem.get(seasonStr(espnYear)) || null);
    loadSlim(seasonStr(espnYear)).then(r => { if (!dead) setRows(r); }).catch(() => {});
    return () => { dead = true; };
  }, [enabled, espnYear]);
  return rows;
}