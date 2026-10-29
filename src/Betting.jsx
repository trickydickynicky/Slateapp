import React, { useEffect, useMemo, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';
import CheatSheet from './CheatSheet';

/* =====================================================================
   CONFIG
   ===================================================================== */
const DEBUG = false; // true → logs the first raw propBets item so field names can be verified
const MAX_CANDIDATES = 80; // players per prop type we pull game logs for (highest lines first)
const MIN_GAMES = 5;
const CONCURRENCY = 8;
const RANK_N = 10; // rankings always use L10
const INJURY_MIN_PPG = 15; // teammate counts as "key" at this PPG...
const INJURY_MIN_RPG = 7; // ...or this RPG (rebound-based props)...
const INJURY_MIN_APG = 5; // ...or this APG (assist props)...
const INJURY_MIN_MPG = 25; // ...or this many minutes per game, for any prop
const SMALL_SAMPLE = 5; // "without him" games below this get a label

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const todayET = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
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
          home: meta.atVs ? meta.atVs !== '@' : null,
          pts: num(iPts),
          reb: num(iReb),
          ast: num(iAst),
          tpm: num(iTpm),
          min: iMin >= 0 ? Math.round(mins) : null,
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



   const priorSeason = () => {
    const d = new Date();
    return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; // ESPN names a season by the year it ends
  };
  const priorCache = new Map();
  function getPriorLog(athleteId) {
    if (!priorCache.has(athleteId)) {
      const y = priorSeason();
      priorCache.set(
        athleteId,
        Promise.all(
          [y, y - 1, y - 2].map((s) =>
            getJSON(`${gamelogUrl(athleteId)}?season=${s}`)
              .then(parseGamelog)
              .catch(() => [])
          )
        ).then((r) => r.flat().sort((a, b) => (a.date < b.date ? 1 : -1)))
      );
    }
    return priorCache.get(athleteId);
  }
  
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
       const stat = side?.statistics?.[0];
       const iMin = (stat?.labels || []).indexOf('MIN');
       const rows = stat?.athletes || [];
       return rows
         .map((r) => ({
           name: r.athlete?.displayName,
           pos: r.athlete?.position?.abbreviation || '',
           min: iMin >= 0 ? Number(r.stats?.[iMin]) || 0 : 0,
           starter: !!r.starter,
         }))
         .filter((r) => r.min > 0 || r.starter)
         .sort((a, b) => b.min - a.min);
     })().catch(() => []);
     starterCache.set(teamId, p);
     return p;
   }
   
   async function getPrimaryDefender(athleteId, oppTeamId, pos) {
     if (!oppTeamId) return null;
     const starters = await getStarters(oppTeamId);
     const grp = posGroup(pos);
     const matches = starters.filter((s) => posGroup(s.pos) === grp).slice(0, 2);
  return matches.length
    ? { name: matches.map((m) => m.name).join(' / '), pos: matches[0].pos, games: [] }
    : null;
   }

/* ---- Teammate injuries (swap getTeamInjuries to change the source) ---- */
const INJURIES = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
const INJURY_TTL = 10 * 60 * 1000;
let injuryCache = { at: 0, promise: null };

const injuryKind = (status) => {
  const s = String(status || '').toLowerCase();
  if (/\bout\b/.test(s)) return 'out';
  if (/doubtful|questionable|day[- ]to[- ]day/.test(s)) return 'maybe';
  return null;
};

const fmtReturn = (d) => {
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(dt.getTime()) || dt < new Date()) return null;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function loadInjuries() {
  if (!injuryCache.promise || Date.now() - injuryCache.at > INJURY_TTL) {
    injuryCache = {
      at: Date.now(),
      promise: getJSON(INJURIES)
        .then((j) => j?.injuries || [])
        .catch(() => []),
    };
  }
  return injuryCache.promise;
}

/* -> [{ id, name, status, kind: 'out' | 'maybe', returnDate }] for one team */

const injuryAthleteId = (a) =>
  (a?.id && String(a.id)) ||
  idFromRef(a?.$ref, 'athletes') ||
  (a?.links || []).map((l) => String(l.href).match(/\/id\/(\d+)/)?.[1]).find(Boolean) ||
  String(a?.headshot?.href || '').match(/\/(\d+)\.png/)?.[1] ||
  null;

/* -> [{ id, name, status, kind: 'out' | 'maybe', returnDate }] for one team */
async function getTeamInjuries(teamId) {
  if (!teamId) return [];
  const teams = await loadInjuries();
  const team = teams.find((t) => String(t.id) === String(teamId));
  return (team?.injuries || [])
    .map((i) => {
      const status = i.status || i.type?.description || '';
      return {
        id: injuryAthleteId(i.athlete),
        name: i.athlete?.displayName,
        status,
        kind: injuryKind(status),
        returnDate: i.details?.returnDate || null,
      };
    })
    .filter((i) => i.id && i.name && i.kind);
}

const mateCache = new Map();
function getTeammateLog(id) {
  if (!mateCache.has(id)) {
    mateCache.set(id, getJSON(gamelogUrl(id)).then(parseGamelog).catch(() => null));
  }
  return mateCache.get(id);
}

/* which teammate stats matter for each prop, and the bar each must clear */
const INJURY_BAR = {
  pts: ['pts'],
  reb: ['reb'],
  ast: ['ast'],
  pr: ['pts', 'reb'],
  pa: ['pts'],
  pra: ['pts', 'reb', 'ast'],
  tpm: ['pts'],
};
const INJURY_MIN = { pts: INJURY_MIN_PPG, reb: INJURY_MIN_RPG, ast: INJURY_MIN_APG };
const INJURY_UNIT = { pts: 'ppg', reb: 'rpg', ast: 'apg' };

/* injured teammates who clear the bar for this prop type, with the games they played */
async function getKeyInjuries(athleteId, teamId, propKey) {
  const bar = INJURY_BAR[propKey] || ['pts'];
  const inj = (await getTeamInjuries(teamId)).filter((i) => i.id !== String(athleteId));
  const rows = await Promise.all(
    inj.map(async (i) => {
      const log = await getTeammateLog(i.id);
      if (!log || !log.length) return null;
      const avgs = {
        pts: log.reduce((a, g) => a + g.pts, 0) / log.length,
        reb: log.reduce((a, g) => a + g.reb, 0) / log.length,
        ast: log.reduce((a, g) => a + g.ast, 0) / log.length,
      };
      const mins = log.filter((g) => g.min != null);
      const mpg = mins.length ? mins.reduce((a, g) => a + g.min, 0) / mins.length : 0;
      const hit = bar.find((s) => avgs[s] >= INJURY_MIN[s]);
      if (!hit && mpg < INJURY_MIN_MPG) return null;
      const shown = hit || bar[0]; // stat displayed in the row
      return { ...i, avg: avgs[shown], unit: INJURY_UNIT[shown], played: new Set(log.map((g) => g.id)) };
    })
  );
  return rows.filter(Boolean).sort((a, b) => b.avg - a.avg);
}

/* =====================================================================
   MAIN COMPONENT
   ===================================================================== */
   export default function Betting({ sport, setSport, onPlayerClick }) {
  const { trigger } = useWebHaptics();
  const [propKey, setPropKey] = useState('pts');
  const [gameId, setGameId] = useState('top');
  const [showCheat, setShowCheat] = useState(false);

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
        const sb = await getJSON(`${SCOREBOARD}?dates=${todayET()}&_=${Date.now()}`);
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

  const chipLabel = (g) => {
    const a = g.teams.find((t) => t.homeAway === 'away');
    const h = g.teams.find((t) => t.homeAway === 'home');
    return a && h ? `${a.abbr} @ ${h.abbr}` : g.name;
  };
  const activeGame = games.find((g) => g.id === gameId);

  /* 2) candidates for the selected prop type */
  const candidates = useMemo(() => {
    const list = rawProps
      .filter((p) => p.key === propKey && (gameId === 'top' || p.gameId === gameId))
      .sort((a, b) => b.line - a.line);
    return gameId === 'top' ? list.slice(0, MAX_CANDIDATES) : list;
  }, [rawProps, propKey, gameId]);

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
    return { cards: gameId === 'top' ? out.slice(0, 20) : out, pending: wait };
  }, [candidates, athletes, logs, type, games, gameId]);

  /* ============================== RENDER ============================== */
  return (
    <div
      className="min-h-screen bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {showCheat && <CheatSheet onClose={() => setShowCheat(false)} />}
        <div className="px-4 pt-3 pb-4">
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
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">
              Tonight • {games.length} game{games.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => {
                trigger('light');
                setShowCheat(true);
              }}
              className="text-blue-500 font-semibold text-sm hover:text-blue-400"
            >
              Cheat Sheet
            </button>
          </div>
        </div>

        {/* NBA | MLB | Betting */}
        <div className="flex mb-1" style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both' }}>
          <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
            {['NBA', 'Betting'].map((s) => (
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
        {/* game selector */}
        <div className="overflow-x-auto scrollbar-hide pb-3">
          <div className="flex gap-2">
            {[{ id: 'top', label: 'Top Edges' }, ...games.map((g) => ({ id: g.id, label: chipLabel(g) }))].map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  trigger('selection');
                  setGameId(c.id);
                }}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  gameId === c.id
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]'
                    : 'bg-zinc-900 text-gray-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

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
               No {type.label} lines posted yet{activeGame ? ` for ${chipLabel(activeGame)}` : ''}
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
              onPlayerClick={onPlayerClick}
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
   function EdgeCard({ rank, c, type, defense, posSplits, index, onPlayerClick }) {
    const { trigger } = useWebHaptics();
    const [n, setN] = useState(10);
    const [prior, setPrior] = useState([]);
    useEffect(() => {
      let dead = false;
      getPriorLog(c.athleteId).then((r) => !dead && setPrior(r));
      return () => {
        dead = true;
      };
    }, [c.athleteId]);
    const full = [...c.log, ...prior];
    const isOver = c.side === 'over';
  const sideText = isOver ? 'text-green-500' : 'text-red-500';

  const vals = full.slice(0, n).map((g) => sumStats(g, type.stats));
const hits = vals.filter((v) => (isOver ? v > c.line : v < c.line)).length;
const proj = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
const prob = vals.length ? hits / vals.length : 0;
const chart = vals
.map((v, i) => ({ v, opp: full[i]?.opp, date: full[i]?.date?.slice(5, 10) }))
  .reverse();
const max = Math.max(c.line, proj, ...vals) * 1.15 || 1;

const [defender, setDefender] = useState(null);
const [showVs, setShowVs] = useState(false);

useEffect(() => {
  let dead = false;
  getPrimaryDefender(c.athleteId, c.opp?.id, c.ath.pos).then((r) => !dead && setDefender(r));
  return () => {
    dead = true;
  };
}, [c.athleteId, c.opp?.id, c.ath.pos]);

const [keyInj, setKeyInj] = useState([]);
useEffect(() => {
  let dead = false;
  getKeyInjuries(c.athleteId, c.mine?.id, c.key)
  .then((r) => !dead && setKeyInj(r))
  .catch(() => {});
return () => {
  dead = true;
};
}, [c.athleteId, c.mine?.id, c.key]);
const grp = posGroup(c.ath.pos);
const posDef = c.opp && grp ? posSplits[`${c.opp.id}|${grp}`] : null;
const teamAll = c.opp ? posSplits[`${c.opp.id}|ALL`] : null;

  const team = c.opp ? defense[c.opp.id] : null;
  const vsOpp = c.opp ? full.filter((g) => g.oppId === c.opp.id).slice(0, n) : [];
  const vsVals = vsOpp.map((g) => sumStats(g, type.stats));
  const vsHits = vsVals.filter((v) => (isOver ? v > c.line : v < c.line)).length;

  const isHome = c.mine?.homeAway === 'home';
  const avgOf = (rows) =>
    rows.length ? rows.reduce((a, g) => a + sumStats(g, type.stats), 0) / rows.length : null;
  const sameLoc = c.log.filter((g) => g.home === isHome);
  const otherLoc = c.log.filter((g) => g.home === !isHome);
  const locHits = sameLoc.filter((g) => {
    const v = sumStats(g, type.stats);
    return isOver ? v > c.line : v < c.line;
  }).length;
  const locAvg = avgOf(sameLoc);
  const otherAvg = avgOf(otherLoc);

  const injRows = keyInj.map((t) => {
    const without = c.log.filter((g) => !t.played.has(g.id));
    const withHim = c.log.filter((g) => t.played.has(g.id));
    return { ...t, without, withoutAvg: avgOf(without), withAvg: avgOf(withHim) };
  });
  const injNames = keyInj.map((t) => t.name).join(' & ');

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
          className="w-12 h-12 rounded-full object-cover bg-zinc-800 flex-shrink-0 cursor-pointer active:opacity-70 transition-opacity"
          onClick={() => {
            trigger('light');
            onPlayerClick?.(
              c.ath.name,
              c.athleteId,
              headshotUrl(c.athleteId),
              c.mine?.abbr || null,
              c.mine ? logoUrl(c.mine.abbr) : null,
              null,
              c.ath.pos
            );
          }}
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
          {injRows.length > 0 && (
            <span className="inline-block mt-1 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              ⚠ Key teammate out
            </span>
          )}
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
         { label: 'AVG', value: fmt(proj), color: 'text-white' },
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
      {injRows.length > 0 && (
        <div className="text-[10px] text-gray-500 -mt-1.5 mb-3">
          Stats include games with {injNames} active.
        </div>
      )}

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
      <div className="flex gap-1 mt-1">
        {chart.map((d, i) => (
          <div
            key={i}
            className={`flex-1 min-w-0 text-center text-gray-400 ${chart.length > 10 ? 'text-[8px]' : 'text-[10px]'}`}
          >
            {d.v}
          </div>
        ))}
      </div>
     <div className="flex items-center justify-between mt-1">
  <div className="text-[10px] text-gray-500">
    Last {vals.length} • white = line {fmt(c.line)} • blue = proj {fmt(proj)}
  </div>
  <div className="flex bg-zinc-800 rounded-full p-0.5 gap-0.5">
    {[10, 20].map((v) => (
      <button
        key={v}
        disabled={v === 20 && full.length <= 10}
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

         {/* teammate injuries */}
         {injRows.length > 0 && (
        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
          <h5
            className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2"
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            Teammate Injuries
          </h5>
          {injRows.map((t, i) => {
            const ret = t.returnDate ? fmtReturn(t.returnDate) : null;
            return (
              <div key={t.id} className={i ? 'mt-2 pt-2 border-t border-zinc-700' : ''}>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className={`text-xs uppercase ${t.kind === 'out' ? 'text-red-400' : 'text-amber-400'}`}>
                      {t.status}
                      {ret && `, est. return ${ret}`}
                    </div>
                  </div>
                  <span className="whitespace-nowrap flex-shrink-0">
                  <span className="font-bold">{t.avg.toFixed(1)}</span>{' '}
                  <span className="text-gray-400 text-xs">{t.unit}</span>
                  </span>
                </div>
                {t.without.length > 0 && t.withoutAvg != null && (
                  <div className="text-xs text-gray-400 mt-1">
                    {c.ath.name} without him: <span className="font-bold text-white">{t.without.length}</span> game
                    {t.without.length === 1 ? '' : 's'}, avg{' '}
                    <span className="font-bold text-white">{fmt(t.withoutAvg)}</span> {type.unit}
                    {t.withAvg != null && ` (${fmt(t.withAvg)} with him)`}
                    {t.without.length < SMALL_SAMPLE && <span className="text-gray-500"> • small sample</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
            {c.opp?.abbr}'s top players at his position by minutes last game
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500">No likely matchup found</div>
        )}
        <div className="text-sm mt-2 pt-2 border-t border-zinc-700">
          {vsOpp.length ? (
                   <>
                   <button
                     onClick={() => {
                       trigger('selection');
                       setShowVs((s) => !s);
                     }}
                     className="w-full flex items-center justify-between text-left"
                   >
                     <span>
                       <span className="text-gray-400">vs {c.opp.abbr} (last {vsOpp.length}): </span>
                       <span className="font-bold">
                         {vsHits}/{vsOpp.length}
                       </span>{' '}
                       {c.side} • avg{' '}
                       <span className="font-bold">{fmt(vsVals.reduce((a, b) => a + b, 0) / vsVals.length)}</span>
                     </span>
                     <span className="text-gray-500 text-xs ml-2">{showVs ? '▲' : '▼'}</span>
                   </button>
                   {showVs && (
                     <div className="mt-2 text-xs">
          <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 text-[10px] text-gray-500 mb-1">
                         <span>DATE</span>
                         <span className="text-center">PTS</span>
                         <span className="text-center">REB</span>
                         <span className="text-center">AST</span>
                         <span className="text-center">3PM</span>
                         <span className="text-center">MIN</span>
                         <span className="text-center">{type.unit.toUpperCase()}</span>
                       </div>
                       {vsOpp.map((g) => {
                         const v = sumStats(g, type.stats);
                         const hit = isOver ? v > c.line : v < c.line;
                         return (
                            <div key={g.id} className="grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-1 py-0.5 border-t border-zinc-800">
                                  <span className="text-gray-400">
                          {g.date ? `${g.date.slice(5, 7)}-${g.date.slice(8, 10)}-${g.date.slice(2, 4)}` : '–'}
                        </span>
                             <span className="text-center">{g.pts}</span>
                             <span className="text-center">{g.reb}</span>
                             <span className="text-center">{g.ast}</span>
                             <span className="text-center">{g.tpm}</span>
                             <span className="text-center text-gray-400">{g.min ?? '–'}</span>
                             <span className={`text-center font-bold ${hit ? 'text-green-400' : 'text-red-400'}`}>{v}</span>
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </>
          ) : (
            <span className="text-xs text-gray-500">No recent games vs {c.opp?.abbr || 'this opponent'}</span>
        )}
      </div>
      <div className="text-sm mt-2 pt-2 border-t border-zinc-700">
        {locAvg != null ? (
          <>
            <span className="text-gray-400">
              {isHome ? 'At home' : 'On road'} ({sameLoc.length} g):{' '}
            </span>
            <span className="font-bold">
              {locHits}/{sameLoc.length}
            </span>{' '}
            {c.side} • avg <span className="font-bold">{fmt(locAvg)}</span>
            {otherAvg != null && (
              <span className="text-gray-400">
                {' '}
                (vs {fmt(otherAvg)} {isHome ? 'road' : 'home'})
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-500">No home/away data</span>
        )}
      </div>
      </div>
    </div>
  );
}