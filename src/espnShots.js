/**
 * Per-game data from ESPN (one summary request per finished game):
 *  - shots [x, y, made]: tenths of a foot, half court, hoop at (250, 52.5)
 *  - assist pairs [passerId, scorerId]
 *  - box score lines for both teams: t.m = this team, t.o = opponent
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const MEM_TTL = 10 * 60 * 1000;
const mem = new Map();    // season:abbr -> { at, data }
const jobs = new Map();   // season:abbr -> { listeners, snap, promise }

const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`espn ${r.status}`); return r.json(); });

const validCoord = c =>
  c && Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.x <= 50 && c.y >= -5 && c.y <= 99;

// Full-court frame -> one half court (rotate shots taken at the far basket).
const toHalf = ({ x, y }) => (y > 47 ? [50 - x, 94 - y] : [x, y]);

const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
const TYPES = ['Jumper', 'Pull-up', 'Step-back', 'Fadeaway', 'Floater', 'Layup', 'Driving layup', 'Hook', 'Dunk', 'Alley-oop', 'Tip-in'];

// stored as an index into TYPES to keep the localStorage cache small
function shotTypeIdx(p) {
  const m = /(?:makes|misses)\s+(.*)/i.exec(p.text || '');
  const desc = (m ? m[1] : p.text || '').replace(/\(.*?\)/g, '');
  const s = `${p.type?.text || ''} ${desc}`.toLowerCase();
  let t = 'Jumper';
  if (/alley/.test(s)) t = 'Alley-oop';
  else if (/dunk/.test(s)) t = 'Dunk';
  else if (/\btip\b|tip shot|tip-in/.test(s)) t = 'Tip-in';
  else if (/hook/.test(s)) t = 'Hook';
  else if (/floating|floater/.test(s)) t = 'Floater';
  else if (/layup|finger roll/.test(s)) t = /driving/.test(s) ? 'Driving layup' : 'Layup';
  else if (/step ?back/.test(s)) t = 'Step-back';
  else if (/pull ?up/.test(s)) t = 'Pull-up';
  else if (/fadeaway|turnaround/.test(s)) t = 'Fadeaway';
  return TYPES.indexOf(t);
}

function boxLine(team, players) {
  const st = team?.statistics || [];
  const get = (name, label) => st.find(s => s.name === name || s.label === label)?.displayValue;
  let bench = null, starters = null;
  const grp = players?.statistics?.[0];
  const pi = grp ? (grp.labels || []).indexOf('PTS') : -1;
  if (pi >= 0) {
    bench = 0; starters = 0;
    for (const e of grp.athletes || []) {
      const v = parseInt(e.stats?.[pi], 10) || 0;
      if (e.starter) starters += v; else bench += v;
    }
  }
  return {
    reb: num(get('totalRebounds', 'Rebounds')),
    oreb: num(get('offensiveRebounds', 'Offensive Rebounds')),
    stl: num(get('steals', 'Steals')),
    blk: num(get('blocks', 'Blocks')),
    pf: num(get('fouls', 'Fouls')),
    paint: num(get('pointsInPaint', 'Points in Paint')),
    offTO: num(get('turnoverPoints', 'Points Off Turnovers')),
    bench, starters,
  };
}

function extractGame(summary, teamId) {
  const s = [], a = [], names = {};
  for (const p of summary?.plays || []) {
    if (!p.shootingPlay || String(p.team?.id) !== String(teamId)) continue;
    if (/free throw/i.test(p.type?.text || '')) continue;
    if (p.scoringPlay && p.participants?.length >= 2 && /assists/i.test(p.text || '')) {
      const scorer = p.participants[0]?.athlete?.id;
      const passer = p.participants[1]?.athlete?.id;
      if (scorer && passer) a.push([String(passer), String(scorer)]);
    }
    if (!validCoord(p.coordinate)) continue;
    const [x, y] = toHalf(p.coordinate);
    const sx = Math.round(x * 10);
    const sy = Math.max(0, Math.round(y * 10));
    if (sy > 400) continue; // drop heaves
    const shooter = p.participants?.[0]?.athlete?.id;
    s.push([sx, sy, p.scoringPlay ? 1 : 0, shooter ? String(shooter) : '', shotTypeIdx(p)]);
  }
  const players = summary?.boxscore?.players || [];
  for (const t of players) {
    if (String(t.team?.id) !== String(teamId)) continue;
    for (const st of t.statistics || []) {
      for (const e of st.athletes || []) {
        const at = e.athlete;
        if (!at?.id) continue;
        names[at.id] = at.lastName || String(at.displayName || '').split(' ').slice(1).join(' ') || at.displayName || '?';
      }
    }
  }
  const teams = summary?.boxscore?.teams || [];
  const mine = teams.find(t => String(t.team?.id) === String(teamId));
  const other = teams.find(t => t !== mine);
  const pm = players.find(p => String(p.team?.id) === String(teamId));
  const po = players.find(p => p !== pm);
  const t = mine && other ? { m: boxLine(mine, pm), o: boxLine(other, po) } : null;
  return { s, a, names, t };
}

async function run(abbr, season, emit) {
  const sched = await getJson(`${BASE}/teams/${encodeURIComponent(String(abbr).toLowerCase())}/schedule?seasontype=2`);
  const teamId = sched?.team?.id;
  if (!teamId) throw new Error('no team id');
  const done = (sched.events || []).filter(e => e.competitions?.[0]?.status?.type?.completed);
  const ids = done.map(e => e.id);

  // label per game, e.g. "11/5 vs BOS" or "11/7 @ NYK"
  const labels = {};
  done.forEach(e => {
    const comp = e.competitions?.[0];
    const me = (comp?.competitors || []).find(c => String(c.team?.id) === String(teamId));
    const opp = (comp?.competitors || []).find(c => String(c.team?.id) !== String(teamId));
    const d = new Date(e.date);
    const date = Number.isNaN(+d) ? '' : `${d.getMonth() + 1}/${d.getDate()} `;
    labels[e.id] = `${date}${me?.homeAway === 'away' ? '@' : 'vs'} ${opp?.team?.abbreviation || '?'}`;
  });

    const key = `espnShots:v4:${season}:${abbr}`;
  let cache = { games: {}, names: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (raw?.games) cache = { games: raw.games, names: raw.names || {} };
  } catch (e) { /* ignore */ }

  const snap = () => ({
    shots: ids.flatMap(id => (cache.games[id]?.s || []).map(s => [...s, labels[id]])),
    pairs: ids.flatMap(id => cache.games[id]?.a || []),
    box: ids.map(id => cache.games[id]?.t).filter(Boolean),
    names: cache.names,
  });
  const todo = ids.filter(id => !cache.games[id]);
  emit(snap());

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const id = todo[next++];
      try {
        const g = extractGame(await getJson(`${BASE}/summary?event=${id}`), teamId);
        cache.games[id] = { s: g.s, a: g.a, t: g.t };
        Object.assign(cache.names, g.names);
        emit(snap());
      } catch (e) { /* retried on next visit */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));

  const pruned = { games: {}, names: cache.names };
  ids.forEach(id => { if (cache.games[id]) pruned.games[id] = cache.games[id]; });
  try { localStorage.setItem(key, JSON.stringify(pruned)); } catch (e) { /* ignore */ }
  return snap();
}

export function loadTeamPlays(abbr, season, onProgress) {
  const key = `${season}:${abbr}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < MEM_TTL) return Promise.resolve(hit.data);
  let job = jobs.get(key);
  if (!job) {
    job = { listeners: new Set(), snap: null };
    job.promise = run(abbr, season, snap => { job.snap = snap; job.listeners.forEach(f => f(snap)); })
      .then(data => {
        if (data.shots.length || data.pairs.length || data.box.length) mem.set(key, { at: Date.now(), data });
        return data;
      })
      .finally(() => jobs.delete(key));
    jobs.set(key, job);
  }
  if (onProgress) {
    job.listeners.add(onProgress);
    if (job.snap) onProgress(job.snap);
  }
  return job.promise;
}

export const loadTeamShots = (abbr, season, onProgress) => {
  const label = d => d.shots.map(([x, y, m, pid, ti, game]) => [x, y, m, d.names[pid] || (pid ? '?' : ''), TYPES[ti] || 'Jumper', game]);
    return loadTeamPlays(abbr, season, onProgress && (d => onProgress(label(d)))).then(label);
  };