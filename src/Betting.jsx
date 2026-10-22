import React, { useEffect, useMemo, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';

/* =====================================================================
   CONFIG
   ===================================================================== */
const DEBUG = false; // true → logs the first raw propBets item so field names can be verified
const MAX_CANDIDATES = 80; // players per prop type we pull game logs for (highest lines first)
const MIN_GAMES = 5;
const CONCURRENCY = 8;
const RANK_N = 10; // rankings always use L10

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const propsUrl = (id, page) =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/odds/100/propBets?lang=en&region=us&limit=1000&page=${page}`;
const gamelogUrl = (id) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog`;
const headshotUrl = (id) => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
const logoUrl = (abbr) => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

const PROP_TYPES = [
  { key: 'pts', label: 'Points', unit: 'pts', stats: ['pts'] },
  { key: 'reb', label: 'Rebounds', unit: 'reb', stats: ['reb'] },
  { key: 'ast', label: 'Assists', unit: 'ast', stats: ['ast'] },
  { key: 'pr', label: 'Pts+Reb', unit: 'pts+reb', stats: ['pts', 'reb'] },
  { key: 'pa', label: 'Pts+Ast', unit: 'pts+ast', stats: ['pts', 'ast'] },
  { key: 'pra', label: 'Pts+Reb+Ast', unit: 'PRA', stats: ['pts', 'reb', 'ast'] },
  { key: 'tpm', label: '3PM', unit: '3PM', stats: ['tpm'] },
];

/* =====================================================================
   HELPERS
   ===================================================================== */
const getJSON = async (url) => {
  const r = await fetch(url.replace(/^http:/, 'https:'));
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        await fn(items[idx], idx);
      } catch (e) {
        /* handled inside fn */
      }
    }
  });
  await Promise.all(workers);
}

const idFromRef = (ref, seg) => {
  const m = ref && String(ref).match(new RegExp(`/${seg}/(\\d+)`));
  return m ? m[1] : null;
};

const fmt = (v) => (v == null || Number.isNaN(v) ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const pct = (v) => `${Math.round(v * 100)}%`;
const sumStats = (g, stats) => stats.reduce((a, s) => a + (g[s] ?? 0), 0);

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const posGroup = (pos) => {
  const p = String(pos || '').toUpperCase();
  if (p === 'C') return 'C';
  if (p.includes('G')) return 'G';
  if (p.includes('F')) return 'F';
  return null;
};
const GROUP_NAME = { G: 'guards', F: 'forwards', C: 'centers' };

const formatDate = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const now = new Date();
  return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
};

/* propBets type name -> prop key (null = ignore milestones, alts, other stats) */
function propKeyFromName(rawName) {
  const name = String(rawName || '').toLowerCase();
  if (!name) return null;
  if (/milestone|first|to score|to record|double|triple|race|steal|block|turnover|quarter|half|\d\s*\+/.test(name))
    return null;
  const hasTpm = /3-point|3 point|three/.test(name);
  const rest = name.replace(/3-point|3 point|three[- ]point|three/g, '');
  const set = [];
  if (/point|pts/.test(rest)) set.push('pts');
  if (/rebound|reb/.test(rest)) set.push('reb');
  if (/assist|ast/.test(rest)) set.push('ast');
  if (hasTpm) return set.length ? null : 'tpm';
  if (!set.length) return null;
  const match = PROP_TYPES.find(
    (p) => p.key !== 'tpm' && p.stats.length === set.length && p.stats.every((s) => set.includes(s))
  );
  return match ? match.key : null;
}

/* Over/under side of a raw propBets item. Tolerant — adjust here if the payload differs. */
function readSide(item) {
  const cands = [
    item?.odds?.total?.alternateDisplayValue,
    item?.odds?.total?.displayValue,
    item?.odds?.total?.value,
    item?.side,
    item?.type?.name,
    item?.type?.displayName,
    item?.current?.target?.description,
  ];
  for (const c of cands) {
    const s = String(c ?? '').trim().toLowerCase();
    if (/^o(ver)?\b|^o\d|\bover\b/.test(s)) return 'over';
    if (/^u(nder)?\b|^u\d|\bunder\b/.test(s)) return 'under';
  }
  return null;
}

function readLine(item) {
  const a = item?.current?.target?.value;
  if (a != null && !Number.isNaN(Number(a))) return Number(a);
  const t = String(item?.odds?.total?.value ?? '').match(/[\d.]+/);
  return t ? Number(t[0]) : null;
}

function readPrice(item) {
  const v = item?.odds?.american?.value ?? item?.odds?.american?.displayValue;
  const n = Number(String(v ?? '').replace('+', ''));
  return Number.isNaN(n) ? null : n;
}

/* Collapse raw items into one main line per player + prop type */
function parseProps(items, gameId) {
  if (DEBUG && items[0]) console.log('[Betting] first raw propBets item', items[0]);
  const groups = new Map();
  for (const it of items) {
    const key = propKeyFromName(it?.type?.name);
    if (!key) continue;
    const ref = it?.athlete?.$ref;
    const athleteId = idFromRef(ref, 'athletes') || it?.athlete?.id;
    const line = readLine(it);
    if (!athleteId || line == null) continue;
    const gk = `${athleteId}|${key}`;
    if (!groups.has(gk)) groups.set(gk, { athleteId: String(athleteId), ref, key, lines: new Map() });
    const g = groups.get(gk);
    if (!g.lines.has(line)) g.lines.set(line, { over: null, under: null });
    const side = readSide(it);
    const price = readPrice(it);
    if (side) g.lines.get(line)[side] = price;
  }
  const out = [];
  for (const g of groups.values()) {
    const entries = [...g.lines.entries()];
    const scored = entries
      .filter(([, p]) => p.over != null && p.under != null)
      .map(([line, p]) => ({ line, p, s: Math.abs(p.over + 110) + Math.abs(p.under + 110) }))
      .sort((a, b) => a.s - b.s);
    let line, prices;
    if (scored.length) {
      line = scored[0].line;
      prices = scored[0].p;
    } else {
      const sorted = entries.sort((a, b) => a[0] - b[0]);
      [line, prices] = sorted[Math.floor(sorted.length / 2)];
    }
    out.push({
      gameId,
      athleteId: g.athleteId,
      athleteRef: g.ref,
      key: g.key,
      line,
      overPrice: prices.over,
      underPrice: prices.under,
    });
  }
  return out;
}

/* ESPN gamelog -> [{id,date,opp,oppId,pts,reb,ast,tpm}] newest first */
function parseGamelog(json) {
  const names = json?.names || json?.labels || [];
  const find = (...needles) =>
    names.findIndex((n) => needles.some((x) => String(n).toLowerCase() === x.toLowerCase()));
  const iPts = find('points', 'pts');
  const iReb = find('totalRebounds', 'rebounds', 'reb');
  const iAst = find('assists', 'ast');
  const iTpm = find('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT', 'threePointFieldGoalsMade');
  const iMin = find('minutes', 'min');
  const evMeta = json?.events || {};
  const rows = [];
  for (const st of json?.seasonTypes || []) {
    for (const cat of st?.categories || []) {
      for (const ev of cat?.events || []) {
        const s = ev.stats || [];
        const meta = evMeta[ev.eventId] || {};
        const mins = iMin >= 0 ? Number(s[iMin]) : 1;
        if (iMin >= 0 && !mins) continue; // DNP
        const num = (i) => (i >= 0 ? Number(String(s[i]).split('-')[0]) || 0 : 0);
        rows.push({
          id: ev.eventId,
          date: meta.gameDate || '',
          opp: meta.opponent?.abbreviation || '',
          oppId: meta.opponent?.id ? String(meta.opponent.id) : null,
          pts: num(iPts),
          reb: num(iReb),
          ast: num(iAst),
          tpm: num(iTpm),
        });
      }
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

/* =====================================================================
   DATA HOOKS — swap these to upgrade v1 without touching the UI
   ===================================================================== */



   const starterCache = new Map();
   async function getStarters(teamId) {
     if (starterCache.has(teamId)) return starterCache.get(teamId);
     const p = (async () => {
       const sched = await getJSON(
         `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule`
       );
       const done = (sched.events || []).filter((e) => e.competitions?.[0]?.status?.type?.completed);
       const last = done[done.length - 1];
       if (!last) return [];
       const sum = await getJSON(
         `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${last.id}`
       );
       const side = (sum.boxscore?.players || []).find((t) => String(t.team?.id) === String(teamId));
       const rows = side?.statistics?.[0]?.athletes || [];
       return rows
         .filter((r) => r.starter)
         .map((r) => ({ name: r.athlete?.displayName, pos: r.athlete?.position?.abbreviation || '' }));
     })().catch(() => []);
     starterCache.set(teamId, p);
     return p;
   }
   
   async function getPrimaryDefender(athleteId, oppTeamId, pos) {
     if (!oppTeamId) return null;
     const starters = await getStarters(oppTeamId);
     const grp = posGroup(pos);
     const match = starters.find((s) => posGroup(s.pos) === grp);
     return match ? { name: match.name, pos: match.pos, games: [] } : null;
   }

/* =====================================================================
   MAIN COMPONENT
   ===================================================================== */
export default function Betting({ sport, setSport }) {
  const { trigger } = useWebHaptics();
  const [propKey, setPropKey] = useState('pts');

  const [games, setGames] = useState([]);
  const [rawProps, setRawProps] = useState([]);
  const [defense, setDefense] = useState({});
  const [athletes, setAthletes] = useState({});
  const [logs, setLogs] = useState({});
  const [phase, setPhase] = useState('slate'); // slate | ready | error
  const [error, setError] = useState(null);

  /* 1) tonight's slate + props + team defense */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const sb = await getJSON(SCOREBOARD);
        const slate = (sb.events || [])
          .filter((e) => e.status?.type?.state !== 'post')
          .map((e) => {
            const comp = e.competitions?.[0];
            const teams = (comp?.competitors || []).map((c) => ({
              id: String(c.team.id),
              abbr: c.team.abbreviation,
              homeAway: c.homeAway,
            }));
            return { id: e.id, name: e.shortName, date: e.date, teams };
          });
        if (dead) return;
        setGames(slate);

        const all = [];
        await pool(slate, 4, async (g) => {
          try {
            const first = await getJSON(propsUrl(g.id, 1));
            let items = first.items || [];
            for (let p = 2; p <= (first.pageCount || 1); p++) {
              const next = await getJSON(propsUrl(g.id, p));
              items = items.concat(next.items || []);
            }
            all.push(...parseProps(items, g.id));
          } catch (e) {
            /* game without props yet */
          }
        });
        if (dead) return;
        setRawProps(all);
        setPhase('ready');

        try {
          const st = await getJSON(STANDINGS);
          const entries = (st.children || []).flatMap((c) => c.standings?.entries || []);
          const rows = entries
            .map((en) => {
              const s = (en.stats || []).find((x) => x.name === 'avgPointsAgainst');
              return { id: String(en.team?.id), allowed: parseFloat(s?.displayValue ?? s?.value) };
            })
            .filter((r) => !Number.isNaN(r.allowed))
            .sort((a, b) => a.allowed - b.allowed); // rank 1 = fewest allowed
          const map = {};
          rows.forEach((r, i) => (map[r.id] = { allowed: r.allowed, rank: i + 1, total: rows.length }));
          if (!dead) setDefense(map);
        } catch (e) {
          /* defense is optional */
        }
      } catch (e) {
        if (!dead) {
          setError(e.message);
          setPhase('error');
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const type = PROP_TYPES.find((p) => p.key === propKey);

  /* 2) candidates for the selected prop type */
  const candidates = useMemo(
    () =>
      rawProps
        .filter((p) => p.key === propKey)
        .sort((a, b) => b.line - a.line)
        .slice(0, MAX_CANDIDATES),
    [rawProps, propKey]
  );

  /* 3) resolve athletes + game logs (cached across prop types) */
  useEffect(() => {
    let dead = false;
    pool(
      candidates.filter((c) => !athletes[c.athleteId]),
      CONCURRENCY,
      async (c) => {
        try {
          const a = await getJSON(c.athleteRef);
          let pos = a.position?.abbreviation || '';
          if (!pos && a.position?.$ref) {
            try {
              pos = (await getJSON(a.position.$ref)).abbreviation || '';
            } catch (e) {}
          }
          const info = {
            name: a.displayName || a.fullName || 'Unknown',
            pos,
            teamId: idFromRef(a.team?.$ref, 'teams'),
          };
          if (!dead) setAthletes((s) => ({ ...s, [c.athleteId]: info }));
        } catch (e) {
          if (!dead) setAthletes((s) => ({ ...s, [c.athleteId]: 'err' }));
        }
      }
    );
    pool(
      candidates.filter((c) => !logs[c.athleteId]),
      CONCURRENCY,
      async (c) => {
        try {
          const rows = parseGamelog(await getJSON(gamelogUrl(c.athleteId)));
          if (!dead) setLogs((s) => ({ ...s, [c.athleteId]: rows }));
        } catch (e) {
          if (!dead) setLogs((s) => ({ ...s, [c.athleteId]: 'err' }));
        }
      }
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  /* position split: how far above/below their own average each position group scores against a team */
  const posSplits = useMemo(() => {
    const acc = {};
    for (const [id, log] of Object.entries(logs)) {
      const ath = athletes[id];
      if (!Array.isArray(log) || !ath || ath === 'err') continue;
      const grp = posGroup(ath.pos);
      if (!grp || log.length < MIN_GAMES) continue;
      const vals = log.map((g) => sumStats(g, type.stats));
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      log.forEach((g, i) => {
        if (!g.oppId) return;
        for (const k of [`${g.oppId}|${grp}`, `${g.oppId}|ALL`]) {
          const a = (acc[k] = acc[k] || { sum: 0, n: 0 });
          a.sum += vals[i] - avg;
          a.n += 1;
        }
      });
    }
    const byGrp = {};
    for (const [k, a] of Object.entries(acc)) {
      if (a.n < 5) continue;
      const [oppId, grp] = k.split('|');
      (byGrp[grp] = byGrp[grp] || []).push({ oppId, diff: a.sum / a.n, n: a.n });
    }
    const out = {};
    for (const [grp, rows] of Object.entries(byGrp)) {
        rows.sort((a, b) => a.diff - b.diff); // rank 1 = gives up the least
      rows.forEach((r, i) => (out[`${r.oppId}|${grp}`] = { ...r, rank: i + 1, total: rows.length }));
    }
    return out;
  }, [athletes, logs, type]);
  
  /* 4) score + rank (pure hit-rate count vs the line) */
  const { cards, pending } = useMemo(() => {
    const out = [];
    let wait = 0;
    for (const c of candidates) {
      const ath = athletes[c.athleteId];
      const log = logs[c.athleteId];
      if (!ath || !log) {
        wait++;
        continue;
      }
      if (ath === 'err' || log === 'err') continue;
      const recent = log.slice(0, RANK_N);
      if (recent.length < MIN_GAMES) continue;
      const vals = recent.map((g) => sumStats(g, type.stats));
      const overs = vals.filter((v) => v > c.line).length;
      const unders = vals.filter((v) => v < c.line).length;
      const side = overs >= unders ? 'over' : 'under';
      const hits = side === 'over' ? overs : unders;
      const game = games.find((g) => g.id === c.gameId);
      out.push({
        ...c,
        ath,
        log,
        vals,
        side,
        hits,
        n: vals.length,
        prob: hits / vals.length,
        proj: vals.reduce((a, b) => a + b, 0) / vals.length,
        opp: game?.teams.find((t) => t.id !== ath.teamId),
        mine: game?.teams.find((t) => t.id === ath.teamId),
      });
    }
    out.sort((a, b) => b.prob - a.prob || Math.abs(b.proj - b.line) - Math.abs(a.proj - a.line));
    return { cards: out.slice(0, 20), pending: wait };
}, [candidates, athletes, logs, type, games]);

  /* ============================== RENDER ============================== */
  return (
    <div
      className="min-h-screen bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-4 pt-12 pb-4">
        <div
          className="flex justify-between items-start mb-1"
          style={{ animation: 'dropIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <img src="/slate-logo.png" alt="Slate" className="h-8" />
        </div>

        <div
          className="flex justify-between items-center mt-2 mb-4"
          style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both' }}
        >
          <p className="text-gray-400 text-sm">{formatDate()}</p>
          <span className="text-gray-400 text-sm">
            Tonight • {games.length} game{games.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* NBA | MLB | Betting */}
        <div className="flex mb-1" style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both' }}>
          <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
            {['NBA', 'MLB', 'Betting'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  trigger('light');
                  localStorage.setItem('lastSport', s);
                  setSport(s);
                }}
                className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${
                  (sport || 'Betting') === s
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]'
                    : 'text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* prop-type toggle bar (replaces the date strip) */}
        <div
          className="mt-2 overflow-x-auto scrollbar-hide py-4"
          style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}
        >
          <div className="flex gap-2">
            {PROP_TYPES.map((p) => {
              const selected = p.key === propKey;
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    trigger('selection');
                    setPropKey(p.key);
                  }}
                  className={`flex flex-col items-center justify-center px-3.5 py-3 rounded-xl min-w-[70px] flex-shrink-0 transition-all ${
                    selected ? 'bg-blue-600 shadow-[0_0_25px_rgba(37,99,235,0.7)]' : 'bg-zinc-900'
                  }`}
                >
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${selected ? 'text-white' : 'text-gray-300'}`}
                  >
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 pb-8">
        {/* last-N toggle */}
        <div className="flex items-center justify-between mb-3">
  <h4
    className="text-xs font-semibold text-gray-400 uppercase tracking-widest"
    style={{ fontFamily: 'Rajdhani, sans-serif' }}
  >
    Top {type.label} Edges • L10
  </h4>
</div>

        {/* loading / empty states */}
        {phase === 'slate' && <Skeletons />}
        {phase === 'error' && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center text-red-500">
            Couldn't load the slate ({error})
          </div>
        )}
        {phase === 'ready' && games.length === 0 && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">No NBA games tonight</div>
        )}
        {phase === 'ready' && games.length > 0 && candidates.length === 0 && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
            No {type.label} lines posted yet
          </div>
        )}
        {phase === 'ready' && candidates.length > 0 && pending > 0 && (
          <div className="bg-zinc-900 rounded-2xl p-3 mb-3 flex items-center justify-center gap-2 text-gray-500 text-sm">
            <div className="w-3 h-3 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            Pulling game logs… {candidates.length - pending}/{candidates.length}
          </div>
        )}
        {phase === 'ready' && candidates.length > 0 && pending === 0 && cards.length === 0 && (
          <div className="bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
            Not enough game-log data to rank {type.label} yet
          </div>
        )}

        <div className="space-y-3">
          {cards.map((c, i) => (
            <EdgeCard
              key={`${c.athleteId}-${c.key}`}
              rank={i + 1}
              c={c}
              type={type}
            
              defense={defense}
              posSplits={posSplits}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-3">
      {[0.32, 0.39, 0.46].map((delay, i) => (
        <div
          key={i}
          className="bg-zinc-900 rounded-2xl p-4"
          style={{ animation: `fadeUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="skeleton w-12 h-12 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <div className="skeleton h-3 w-1/2 mb-2" />
              <div className="skeleton h-3 w-1/3" />
            </div>
            <div className="skeleton h-8 w-14 rounded-lg" />
          </div>
          <div className="skeleton h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
   CARD
   ===================================================================== */
   function EdgeCard({ rank, c, type, defense, posSplits, index }) {
    const { trigger } = useWebHaptics();
    const [n, setN] = useState(10);
    const isOver = c.side === 'over';
  const sideText = isOver ? 'text-green-500' : 'text-red-500';

  const vals = c.log.slice(0, n).map((g) => sumStats(g, type.stats));
const hits = vals.filter((v) => (isOver ? v > c.line : v < c.line)).length;
const proj = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
const prob = vals.length ? hits / vals.length : 0;
const chart = vals
  .map((v, i) => ({ v, opp: c.log[i]?.opp, date: c.log[i]?.date?.slice(5, 10) }))
  .reverse();
const max = Math.max(c.line, proj, ...vals) * 1.15 || 1;

const [defender, setDefender] = useState(null);
useEffect(() => {
  let dead = false;
  getPrimaryDefender(c.athleteId, c.opp?.id, c.ath.pos).then((r) => !dead && setDefender(r));
  return () => {
    dead = true;
  };
}, [c.athleteId, c.opp?.id, c.ath.pos]);
const grp = posGroup(c.ath.pos);
const posDef = c.opp && grp ? posSplits[`${c.opp.id}|${grp}`] : null;
const teamAll = c.opp ? posSplits[`${c.opp.id}|ALL`] : null;

  const team = c.opp ? defense[c.opp.id] : null;
  const vsOpp = c.opp ? c.log.filter((g) => g.oppId === c.opp.id).slice(0, n) : [];
  const vsVals = vsOpp.map((g) => sumStats(g, type.stats));
  const vsHits = vsVals.filter((v) => (isOver ? v > c.line : v < c.line)).length;

  const price = isOver ? c.overPrice : c.underPrice;

  const teamView =
    c.key === 'pts' && team
      ? {
          text: (
            <>
              Allows <span className="font-bold">{fmt(team.allowed)}</span> PPG
            </>
          ),
          rank: team.rank,
          total: team.total,
        }
      : teamAll
      ? {
          text: (
            <>
              Players score{' '}
              <span className="font-bold">
                {teamAll.diff >= 0 ? '+' : ''}
                {fmt(teamAll.diff)}
              </span>{' '}
              {type.unit} vs their avg
            </>
          ),
          rank: teamAll.rank,
          total: teamAll.total,
        }
      : null;

  return (
    <div
      className="bg-zinc-900 rounded-2xl p-4"
      style={{ animation: `fadeIn 0.5s ease-out ${Math.min(0.1 + index * 0.05, 0.6)}s both` }}
    >
      {/* header */}
      <div className="flex items-center gap-3">
        <img
          src={headshotUrl(c.athleteId)}
          alt={c.ath.name}
          className="w-12 h-12 rounded-full object-cover bg-zinc-800 flex-shrink-0"
          onError={(e) => {
            e.target.style.visibility = 'hidden';
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg leading-tight truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            <span className="text-gray-500 mr-1.5">#{rank}</span>
            {c.ath.name}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {c.mine && <img src={logoUrl(c.mine.abbr)} alt={c.mine.abbr} className="w-4 h-4" />}
            <span>
              {c.mine?.abbr || '—'} {c.opp ? (c.mine?.homeAway === 'home' ? 'vs' : '@') : ''} {c.opp?.abbr || ''}
            </span>
            {c.opp && <img src={logoUrl(c.opp.abbr)} alt={c.opp.abbr} className="w-4 h-4" />}
            {c.ath.pos && <span>• {c.ath.pos}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-2xl font-bold leading-none ${sideText}`} style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            {isOver ? 'O' : 'U'} {fmt(c.line)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {type.unit}
            {price != null && ` • ${price > 0 ? '+' : ''}${price}`}
          </div>
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
        {[
         { label: 'HIT', value: `${hits}/${vals.length}`, color: sideText },
         { label: 'HIT %', value: pct(prob), color: sideText },
         { label: 'PROJ', value: fmt(proj), color: 'text-white' },
         {
           label: 'EDGE',
           value: `${proj - c.line >= 0 ? '+' : ''}${fmt(proj - c.line)}`,
           color: 'text-white',
         },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-2 flex flex-col items-center justify-center"
          >
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* bar chart: last N games, dashed = book line, dotted blue = projection */}
      <div className="relative h-28 flex items-end gap-1">
        {chart.map((d, i) => (
          <div
            key={i}
            title={`${d.date || ''} ${d.opp ? 'vs ' + d.opp : ''}: ${d.v}`}
            className={`flex-1 rounded-t ${
              d.v > c.line ? 'bg-green-500' : d.v < c.line ? 'bg-red-500' : 'bg-zinc-600'
            }`}
            style={{ height: `${Math.max((d.v / max) * 100, 2)}%`, opacity: 0.9 }}
          />
        ))}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-white/80 pointer-events-none"
          style={{ bottom: `${(c.line / max) * 100}%` }}
        />
        <div
          className="absolute left-0 right-0 border-t-2 border-dotted border-blue-500 pointer-events-none"
          style={{ bottom: `${(proj / max) * 100}%` }}
        />
      </div>
      {chart.length <= 10 && (
        <div className="flex gap-1 mt-1">
          {chart.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[10px] text-gray-400">
              {d.v}
            </div>
          ))}
        </div>
      )}
     <div className="flex items-center justify-between mt-1">
  <div className="text-[10px] text-gray-500">
    Last {vals.length} • white = line {fmt(c.line)} • blue = proj {fmt(proj)}
  </div>
  <div className="flex bg-zinc-800 rounded-full p-0.5 gap-0.5">
    {[10, 20].map((v) => (
      <button
        key={v}
        disabled={v === 20 && c.log.length <= 10}
        onClick={() => {
          trigger('selection');
          setN(v);
        }}
        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all disabled:opacity-30 ${
          n === v ? 'bg-blue-600 text-white' : 'text-gray-400'
        }`}
      >
        L{v}
      </button>
    ))}
  </div>
</div>

      {/* opponent defense */}
      <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
        <h5
          className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          {c.opp?.abbr || 'Opponent'} Defense
        </h5>
        {teamView ? (
          <div className="flex items-center justify-between text-sm">
            <span>{teamView.text}</span>
            <span className={`text-xs font-bold ${teamView.rank <= 15 ? 'text-green-400' : 'text-red-400'}`}>
              {ordinal(teamView.rank)} of {teamView.total}
            </span>
          </div>
        ) : (
          <div className="text-xs text-gray-500">Team defense unavailable</div>
        )}
       {posDef ? (
  <div className="flex items-center justify-between text-sm mt-1">
    <span>
    <span className="capitalize">{GROUP_NAME[grp]}</span> score{' '}
      <span className="font-bold">
        {posDef.diff >= 0 ? '+' : ''}
        {fmt(posDef.diff)}
      </span>{' '}
      {type.unit} vs their avg
    </span>
    <span
      className={`text-xs font-bold ${
    posDef.rank <= 15 ? 'text-green-400' : 'text-red-400'
      }`}
    >
      {ordinal(posDef.rank)} of {posDef.total}
    </span>
  </div>
) : (
  <div className="text-xs text-gray-500 mt-1">Position split needs more games</div>
)}
      </div>

      {/* defender matchup */}
      <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
        <h5
          className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          Defender Matchup
        </h5>
        {defender ? (
          <div className="text-sm">
            <div>
              Likely matchup: <span className="font-bold">{defender.name}</span>
              {defender.pos && <span className="text-gray-400"> • {defender.pos}</span>}
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Matched by position from {c.opp?.abbr}'s last starting five
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500">No likely matchup found</div>
        )}
        <div className="text-sm mt-2 pt-2 border-t border-zinc-700">
          {vsOpp.length ? (
            <>
              <span className="text-gray-400">vs {c.opp.abbr} (last {vsOpp.length}): </span>
              <span className="font-bold">
                {vsHits}/{vsOpp.length}
              </span>{' '}
              {c.side} • avg <span className="font-bold">{fmt(vsVals.reduce((a, b) => a + b, 0) / vsVals.length)}</span>
            </>
          ) : (
            <span className="text-xs text-gray-500">No recent games vs {c.opp?.abbr || 'this opponent'}</span>
          )}
        </div>
      </div>
    </div>
  );
}