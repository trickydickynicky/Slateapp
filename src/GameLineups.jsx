import React, { useEffect, useMemo, useState } from 'react';

const SUMMARY_URL = id => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const memCache = new Map();
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

const clockSecs = v => {
  const p = String(v || '0:00').split(':');
  return p.length === 2 ? parseFloat(p[0]) * 60 + parseFloat(p[1]) : parseFloat(p[0]) || 0;
};
// seconds since tip-off
const elapsed = (period, clock) => {
  const n = period || 1;
  const before = n <= 4 ? (n - 1) * 720 : 4 * 720 + (n - 5) * 300;
  return before + ((n > 4 ? 300 : 720) - clockSecs(clock));
};
const fmtMin = s => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const sg = v => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
const pmCls = v => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400');

/** ESPN summary JSON -> [{ id, abbr, players: {id: lastName}, lineups: [{ key, ids, sec, pts, opp, poss }] }] */
export function computeLineups(j) {
  const sorted = [...(j?.plays || [])].sort((a, b) => num(a.sequenceNumber) - num(b.sequenceNumber));
  const teamOf = {};
  const teams = {};
  const starters = {};

  (j?.boxscore?.players || []).forEach(t => {
    const tid = String(t.team?.id);
    teams[tid] = { id: tid, abbr: t.team?.abbreviation || tid, players: {}, stints: {} };
    starters[tid] = [];
    (t.statistics?.[0]?.athletes || []).forEach(a => {
      const id = String(a.athlete?.id);
      teamOf[id] = tid;
      teams[tid].players[id] = String(a.athlete?.displayName || id).split(' ').slice(1).join(' ') || a.athlete?.displayName || id;
      if (a.starter) starters[tid].push(id);
    });
  });

  // Fallback if the box score doesn't flag exactly 5 starters: first five players seen on the floor
  Object.keys(teams).forEach(tid => {
    if (starters[tid].length === 5) return;
    const seen = new Set(), entered = new Set();
    for (const p of sorted) {
      if (seen.size >= 5) break;
      const isSub = p.type?.text === 'Substitution';
      (p.participants || []).forEach((pt, i) => {
        const id = String(pt.athlete?.id);
        if (teamOf[id] !== tid) return;
        if (isSub && i === 0) { entered.add(id); return; }
        if (!entered.has(id) && seen.size < 5) seen.add(id);
      });
    }
    starters[tid] = [...seen];
  });

  // Which team is home/away, read from the first scoring play of each team
  const side = {};
  let pa = 0, ph = 0;
  for (const p of sorted) {
    const a = num(p.awayScore), h = num(p.homeScore);
    const tid = p.team?.id != null ? String(p.team.id) : null;
    if (p.scoringPlay && tid && !side[tid]) side[tid] = a > pa ? 'away' : h > ph ? 'home' : undefined;
    pa = a; ph = h;
  }
  const tids = Object.keys(teams);
  if (tids.length === 2) {
    if (side[tids[0]] && !side[tids[1]]) side[tids[1]] = side[tids[0]] === 'away' ? 'home' : 'away';
    if (side[tids[1]] && !side[tids[0]]) side[tids[0]] = side[tids[1]] === 'away' ? 'home' : 'away';
  }

  // Running possession ingredients per team: FGA, FTA, offensive rebounds, turnovers
  const ctr = {};
  tids.forEach(tid => { ctr[tid] = { fga: 0, fta: 0, oreb: 0, to: 0 }; });
  const possOf = tid => ctr[tid].fga + 0.44 * ctr[tid].fta - ctr[tid].oreb + ctr[tid].to;
  const oppOf = tid => tids.find(x => x !== tid);
  const playTeam = p => {
    const t = p.team?.id != null ? String(p.team.id) : null;
    if (t && ctr[t]) return t;
    const a = p.participants?.[0]?.athlete?.id;
    return a != null ? teamOf[String(a)] : null;
  };
  const tally = p => {
    const type = String(p.type?.text || '');
    const tid = playTeam(p);
    if (!tid || !ctr[tid]) return;
    if (/^free throw/i.test(type)) ctr[tid].fta++;
    else if (/turnover/i.test(type)) ctr[tid].to++;
    else if (/^offensive rebound/i.test(type)) ctr[tid].oreb++;
    else if (p.shootingPlay && num(p.pointsAttempted) > 0) ctr[tid].fga++;
  };

  const state = {};
  tids.forEach(tid => { state[tid] = { on: new Set(starters[tid]) }; });

  const open = (tid, t, a, h) => {
    const s = state[tid];
    s.t0 = t; s.a0 = a; s.h0 = h;
    s.pm0 = possOf(tid);
    s.po0 = possOf(oppOf(tid));
  };
  tids.forEach(tid => open(tid, 0, 0, 0));

  const close = (tid, t, a, h) => {
    const s = state[tid];
    if (s.on.size !== 5 || s.t0 == null) return;
    const away = side[tid] === 'away';
    const mine = away ? a - s.a0 : h - s.h0;
    const opp = away ? h - s.h0 : a - s.a0;
    const dur = t - s.t0;
    // possessions in this stint = average of both teams' counts while this lineup was on
    const dp = ((possOf(tid) - s.pm0) + (possOf(oppOf(tid)) - s.po0)) / 2;
    if (dur <= 0 && !mine && !opp && dp <= 0) return;
    const ids = [...s.on].sort();
    const key = ids.join('-');
    const e = teams[tid].stints[key] || (teams[tid].stints[key] = { key, ids, sec: 0, pts: 0, opp: 0, poss: 0 });
    e.sec += Math.max(dur, 0); e.pts += mine; e.opp += opp; e.poss += Math.max(dp, 0);
  };

  let last = { t: 0, a: 0, h: 0 };
  for (const p of sorted) {
    const t = elapsed(p.period?.number, p.clock?.displayValue);
    const a = num(p.awayScore), h = num(p.homeScore);
    last = { t, a, h };
    if (p.type?.text !== 'Substitution') { tally(p); continue; }
    const [inn, out] = p.participants || [];
    const tid = teamOf[String(inn?.athlete?.id)];
    if (!tid || !state[tid]) continue;
    const s = state[tid];
    close(tid, t, a, h);
    if (out) s.on.delete(String(out.athlete?.id));
    if (inn) s.on.add(String(inn.athlete?.id));
    if (s.on.size === 5) open(tid, t, a, h); else s.t0 = null;
  }
  tids.forEach(tid => close(tid, last.t, last.a, last.h));

  return tids.map(tid => ({
    id: tid,
    abbr: teams[tid].abbr,
    players: teams[tid].players,
    lineups: Object.values(teams[tid].stints).sort((x, y) => y.sec - x.sec),
  }));
}

const COLS = [['MIN', 44], ['PTS', 40], ['OPP', 40], ['+/-', 44], ['POSS', 46], ['OFF', 44], ['DEF', 44], ['NET', 46]];
const NAME_W = 168;

const statCells = (sec, pts, opp, poss) => {
  const pm = pts - opp;
  const off = poss >= 1 ? Math.round((pts / poss) * 100) : null;
  const def = poss >= 1 ? Math.round((opp / poss) * 100) : null;
  const net = off != null && def != null ? off - def : null;
  return [
    { t: fmtMin(sec), c: 'text-gray-400' },
    { t: String(pts), c: '' },
    { t: String(opp), c: '' },
    { t: sg(pm), c: `font-bold ${pmCls(pm)}` },
    { t: poss >= 1 ? String(Math.round(poss)) : '–', c: 'text-gray-400' },
    { t: off == null ? '–' : String(off), c: '' },
    { t: def == null ? '–' : String(def), c: '' },
    { t: sg(net), c: `font-bold ${net == null ? 'text-gray-400' : pmCls(net)}` },
  ];
};

export default function GameLineups({ gameId }) {
  const [data, setData] = useState(null);      // null = loading, [] = failed
  const [teamIdx, setTeamIdx] = useState(0);
  const [filter, setFilter] = useState({});    // playerId -> 'in' | 'out'
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!gameId) return undefined;
    let dead = false;
    setData(null); setFilter({}); setTeamIdx(0); setShowAll(false);
    const key = `lineups:v2:${gameId}`;
    if (memCache.has(key)) { setData(memCache.get(key)); return undefined; }
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const d = JSON.parse(raw); memCache.set(key, d); setData(d); return undefined; }
    } catch (e) { /* ignore */ }
    fetch(SUMMARY_URL(gameId))
      .then(r => r.json())
      .then(j => {
        const d = computeLineups(j);
        const done = j?.header?.competitions?.[0]?.status?.type?.completed === true;
        if (done && d.length) {
          memCache.set(key, d);
          try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { /* ignore */ }
        }
        if (!dead) setData(d);
      })
      .catch(() => { if (!dead) setData([]); });
    return () => { dead = true; };
  }, [gameId]);

  const team = data?.[teamIdx];

  const chips = useMemo(() => {
    if (!team) return [];
    const sec = {};
    team.lineups.forEach(l => l.ids.forEach(id => { sec[id] = (sec[id] || 0) + l.sec; }));
    return Object.keys(sec).sort((a, b) => sec[b] - sec[a]);
  }, [team]);

  const rows = useMemo(() => {
    if (!team) return [];
    const f = Object.entries(filter);
    return team.lineups.filter(l => f.every(([id, m]) => (m === 'in' ? l.ids.includes(id) : !l.ids.includes(id))));
  }, [team, filter]);

  const cycle = id => setFilter(f => {
    const n = { ...f };
    if (!f[id]) n[id] = 'in'; else if (f[id] === 'in') n[id] = 'out'; else delete n[id];
    return n;
  });

  const active = Object.keys(filter).length > 0;
  const LIMIT = 15;
  const shown = showAll ? rows : rows.slice(0, LIMIT);
  const tot = rows.reduce(
    (t, l) => ({ sec: t.sec + l.sec, pts: t.pts + l.pts, opp: t.opp + l.opp, poss: t.poss + l.poss }),
    { sec: 0, pts: 0, opp: 0, poss: 0 }
  );

  const renderCells = cells =>
    cells.map((c, i) => (
      <span key={i} className={`flex-shrink-0 text-center ${c.c}`} style={{ width: COLS[i][1] }}>{c.t}</span>
    ));

  return (
    <div className="bg-black rounded-2xl p-4 mt-3">
      <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
        Lineups
      </h5>

      {data === null ? (
        <div className="skeleton rounded-2xl" style={{ height: 160 }} />
      ) : data.length === 0 || !team || team.lineups.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-4">Lineup data isn't available for this game</div>
      ) : (
        <>
          {data.length > 1 && (
            <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5 mb-3 w-max">
              {data.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { setTeamIdx(i); setFilter({}); setShowAll(false); }}
                  className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${i === teamIdx ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                >
                  {t.abbr}
                </button>
              ))}
            </div>
          )}

          <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4">
            {chips.map(id => {
              const m = filter[id];
              return (
                <button
                  key={id}
                  onClick={() => cycle(id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${
                    m === 'in' ? 'bg-blue-600 border-blue-600 text-white'
                      : m === 'out' ? 'bg-red-950 border-red-800 text-red-300 line-through'
                      : 'bg-zinc-900 border-zinc-700 text-gray-300'
                  }`}
                >
                  {team.players[id] || id}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-gray-500 mb-3">Tap once for lineups with him, twice for lineups without him, three times to clear.</div>

          {rows.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4 border-t border-zinc-800">No lineups match</div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4">
                <div className="w-max min-w-full">
                  <div className="flex items-center text-[10px] text-gray-500 mb-1">
                    <span className="sticky left-0 z-10 bg-black flex-shrink-0" style={{ width: NAME_W }}>LINEUP</span>
                    {COLS.map(([label, w]) => (
                      <span key={label} className="flex-shrink-0 text-center" style={{ width: w }}>{label}</span>
                    ))}
                  </div>

                  {shown.map(l => (
                    <div key={l.key} className="flex items-center py-2 border-t border-zinc-800 text-xs">
                      <span className="sticky left-0 z-10 bg-black flex-shrink-0 pr-2 text-gray-200 leading-snug" style={{ width: NAME_W }}>
                        {l.ids.map(id => team.players[id] || id).join(', ')}
                      </span>
                      {renderCells(statCells(l.sec, l.pts, l.opp, l.poss))}
                    </div>
                  ))}

                  {active && (
                    <div className="flex items-center py-2 border-t border-zinc-700 text-xs font-bold">
                      <span className="sticky left-0 z-10 bg-black flex-shrink-0 text-gray-400" style={{ width: NAME_W }}>Combined</span>
                      {renderCells(statCells(tot.sec, tot.pts, tot.opp, tot.poss))}
                    </div>
                  )}
                </div>
              </div>
              {rows.length > LIMIT && (
                <button onClick={() => setShowAll(v => !v)} className="w-full text-xs font-bold text-blue-500 pt-3">
                  {showAll ? 'Show less' : `Show all ${rows.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}