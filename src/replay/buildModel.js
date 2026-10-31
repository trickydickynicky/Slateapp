/**
 * Events (from normalizeGame) -> a replay model with precomputed snapshots.
 * Built once per data load. The UI looks state up by event index: no re-scanning on scrub.
 */
import { periodLength, periodStart } from './normalizeEspn';

export const STAT = { PTS: 0, REB: 1, OREB: 2, AST: 3, STL: 4, BLK: 5, TOV: 6, FGM: 7, FGA: 8, TPM: 9, TPA: 10, FTM: 11, FTA: 12, MIN: 13 };
export const S = 14;
export const TEAM = { PTS: 0, FGM: 1, FGA: 2, TPM: 3, TPA: 4, FTM: 5, FTA: 6, REB: 7, OREB: 8, AST: 9, STL: 10, BLK: 11, TOV: 12 };
export const TS = 13;
const BUCKET = 12;   // seconds per bar in the differential graph

/** First index whose value is > v. */
export function upperBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= v) lo = m + 1; else hi = m;
  }
  return lo;
}
/** Index of the last event at or before scrub position p (-1 if none). */
export const idxAt = (keys, p) => upperBound(keys, p) - 1;

function inferStarters(events, players, indexOf, side) {
  const out = [];
  const entered = new Set();
  const consider = id => {
    const i = indexOf.get(id);
    if (i == null || players[i].side !== side || entered.has(i) || out.includes(i) || out.length >= 5) return;
    out.push(i);
  };
  for (const ev of events) {
    if (out.length >= 5) break;
    if (ev.kind === 'sub') {
      const ii = indexOf.get(ev.inId);
      if (ii != null) entered.add(ii);
      consider(ev.outId);
    } else {
      ev.pids.forEach(consider);
    }
  }
  return out;
}

export function buildModel(game) {
  const { events } = game;
  const E = events.length;
  const players = game.players.map((p, i) => ({ ...p, i }));
  const P = players.length;
  const indexOf = new Map(players.map(p => [p.id, p.i]));
  const sIdx = side => (side === 'home' ? 1 : 0);

  const onNow = new Uint8Array(P);
  ['away', 'home'].forEach(side => {
    let st = players.filter(p => p.side === side && p.starter).map(p => p.i);
    if (st.length !== 5) st = inferStarters(events, players, indexOf, side);
    st.forEach(i => { onNow[i] = 1; });
  });
  players.forEach(p => { p.isStarter = onNow[p.i] === 1; });

  const snap = new Int16Array((E + 1) * P * S);
  const on = new Uint8Array((E + 1) * P);
  const team = new Int16Array((E + 1) * 2 * TS);
  const keys = new Float64Array(E);
  const cur = new Float64Array(P * S);
  const tcur = new Float64Array(2 * TS);
  on.set(onNow, 0);

  const bump = (p, k, n = 1) => { if (p != null) cur[p * S + k] += n; };
  const tbump = (side, k, n = 1) => { if (side) tcur[sIdx(side) * TS + k] += n; };
  const other = side => (side === 'home' ? 'away' : side === 'away' ? 'home' : null);

  let lastT = 0;
  for (let k = 0; k < E; k++) {
    const ev = events[k];
    keys[k] = ev.t + k * 1e-4;                      // strictly increasing scrub key
    const dt = ev.t - lastT;
    lastT = ev.t;
    if (dt > 0) for (let p = 0; p < P; p++) if (onNow[p]) cur[p * S + STAT.MIN] += dt;

    switch (ev.kind) {
      case 'sub': {
        const a = indexOf.get(ev.inId);
        const b = indexOf.get(ev.outId);
        if (b != null) onNow[b] = 0;
        if (a != null) onNow[a] = 1;
        break;
      }
      case 'fg': {
        const sh = indexOf.get(ev.shooter);
        bump(sh, STAT.FGA); tbump(ev.side, TEAM.FGA);
        if (ev.three) { bump(sh, STAT.TPA); tbump(ev.side, TEAM.TPA); }
        if (ev.made) {
          bump(sh, STAT.FGM); bump(sh, STAT.PTS, ev.pts); tbump(ev.side, TEAM.FGM);
          if (ev.three) { bump(sh, STAT.TPM); tbump(ev.side, TEAM.TPM); }
          if (ev.assist) { bump(indexOf.get(ev.assist), STAT.AST); tbump(ev.side, TEAM.AST); }
        } else if (ev.blocked) {
          bump(indexOf.get(ev.blockedBy), STAT.BLK);
          tbump(other(ev.side), TEAM.BLK);
        }
        break;
      }
      case 'ft': {
        const sh = indexOf.get(ev.pid);
        bump(sh, STAT.FTA); tbump(ev.side, TEAM.FTA);
        if (ev.made) { bump(sh, STAT.FTM); bump(sh, STAT.PTS); tbump(ev.side, TEAM.FTM); }
        break;
      }
      case 'reb': {
        const rb = ev.pid ? indexOf.get(ev.pid) : null;
        bump(rb, STAT.REB); tbump(ev.side, TEAM.REB);
        if (ev.off) { bump(rb, STAT.OREB); tbump(ev.side, TEAM.OREB); }
        break;
      }
      case 'tov': {
        bump(ev.pid ? indexOf.get(ev.pid) : null, STAT.TOV);
        tbump(ev.side, TEAM.TOV);
        if (ev.stolen) { bump(ev.stolenBy ? indexOf.get(ev.stolenBy) : null, STAT.STL); tbump(other(ev.side), TEAM.STL); }
        break;
      }
      default:
    }

    tcur[TEAM.PTS] = ev.away;
    tcur[TS + TEAM.PTS] = ev.home;
    const base = (k + 1) * P * S;
    for (let q = 0; q < P * S; q++) snap[base + q] = cur[q];
    on.set(onNow, (k + 1) * P);
    const tb = (k + 1) * 2 * TS;
    for (let q = 0; q < 2 * TS; q++) team[tb + q] = tcur[q];
  }

  // Shots with a valid location, in event order
  const shots = [];
  events.forEach((ev, k) => {
    if (ev.kind === 'fg' && ev.x != null && ev.side) {
      shots.push({ k, id: ev.id, side: ev.side, x: ev.x, y: ev.y, made: ev.made, three: ev.three, pid: ev.shooter });
    }
  });
  const shotKs = Int32Array.from(shots, s => s.k);

  // Period / timeline geometry
  let periods = 4;
  events.forEach(ev => { if (ev.period > periods) periods = ev.period; });
  const totalT = periodStart(periods) + periodLength(periods);
  const endKey = E ? keys[E - 1] : 0;
  const domainMax = Math.max(totalT, endKey);

  // Score differential (away - home), one bar per BUCKET seconds
  const nb = Math.ceil(totalT / BUCKET);
  const diff = new Int16Array(nb);
  const lastEventT = E ? events[E - 1].t : 0;
  let pi = 0, a = 0, h = 0, maxDiff = 10;
  for (let b = 0; b < nb; b++) {
    const end = (b + 1) * BUCKET;
    if ((b * BUCKET) >= lastEventT) break;           // nothing yet for future buckets (live games)
    while (pi < E && events[pi].t <= end) { a = events[pi].away; h = events[pi].home; pi++; }
    diff[b] = a - h;
    if (Math.abs(diff[b]) > maxDiff) maxDiff = Math.abs(diff[b]);
  }

  // Box score groups: starters, then bench by minutes played (DNP last)
  const finalMin = p => snap[(E * P + p.i) * S + STAT.MIN];
  const bySide = { away: { starters: [], bench: [] }, home: { starters: [], bench: [] } };
  players.forEach(p => { if (bySide[p.side]) (p.isStarter ? bySide[p.side].starters : bySide[p.side].bench).push(p); });
  ['away', 'home'].forEach(s => {
    bySide[s].bench.sort((x, y) => (x.dnp ? 1 : 0) - (y.dnp ? 1 : 0) || finalMin(y) - finalMin(x));
  });

  return {
    E, P, events, keys, players, bySide, snap, on, team, shots, shotKs,
    diff, nb, bucket: BUCKET, maxDiff, periods, totalT, endKey, domainMax,
    finished: !!game.finished,
  };
}

/** Dev only: compare derived totals with the official final boxscore. */
export function devVerify(model) {
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const mismatches = [];
  let checked = 0;
  model.players.forEach(p => {
    const o = p.official;
    if (!o?.stats?.length) return;
    const L = o.labels || [];
    const get = name => { const i = L.indexOf(name); return i >= 0 ? o.stats[i] : undefined; };
    const mine = key => model.snap[(model.E * model.P + p.i) * S + STAT[key]];
    const pair = name => String(get(name) || '').split('-').map(num);
    const want = {
      PTS: num(get('PTS')), REB: num(get('REB')), AST: num(get('AST')), STL: num(get('STL')), BLK: num(get('BLK')), TOV: num(get('TO')),
      FGM: pair('FG')[0], FGA: pair('FG')[1], TPM: pair('3PT')[0], TPA: pair('3PT')[1], FTM: pair('FT')[0], FTA: pair('FT')[1],
    };
    checked++;
    Object.keys(want).forEach(k => {
      if (mine(k) !== want[k]) mismatches.push({ player: p.name, stat: k, derived: mine(k), official: want[k] });
    });
  });
  // eslint-disable-next-line no-console
  console.info(`[GameReplay] derived vs official box score: ${mismatches.length} mismatches across ${checked} players`, mismatches);
}