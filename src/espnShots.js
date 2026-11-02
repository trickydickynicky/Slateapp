/**
 * Shots + assist pairs from ESPN play-by-play (one summary request per finished game).
 * Shots are [x, y, made] in tenths of a foot on a half court:
 * x 0-500 across, y 0-400 from the baseline, hoop at (250, 52.5).
 * Assist pairs are [passerId, scorerId].
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
    s.push([sx, sy, p.scoringPlay ? 1 : 0]);
  }
  for (const t of summary?.boxscore?.players || []) {
    if (String(t.team?.id) !== String(teamId)) continue;
    for (const st of t.statistics || []) {
      for (const e of st.athletes || []) {
        const at = e.athlete;
        if (!at?.id) continue;
        names[at.id] = at.lastName || String(at.displayName || '').split(' ').slice(1).join(' ') || at.displayName || '?';
      }
    }
  }
  return { s, a, names };
}

async function run(abbr, season, emit) {
  const sched = await getJson(`${BASE}/teams/${encodeURIComponent(String(abbr).toLowerCase())}/schedule?seasontype=2`);
  const teamId = sched?.team?.id;
  if (!teamId) throw new Error('no team id');
  const ids = (sched.events || [])
    .filter(e => e.competitions?.[0]?.status?.type?.completed)
    .map(e => e.id);

  const key = `espnShots:v2:${season}:${abbr}`;
  let cache = { games: {}, names: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (raw?.games) cache = { games: raw.games, names: raw.names || {} };
  } catch (e) { /* ignore */ }

  const snap = () => ({
    shots: ids.flatMap(id => cache.games[id]?.s || []),
    pairs: ids.flatMap(id => cache.games[id]?.a || []),
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
        cache.games[id] = { s: g.s, a: g.a };
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
        if (data.shots.length || data.pairs.length) mem.set(key, { at: Date.now(), data });
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

export const loadTeamShots = (abbr, season, onProgress) =>
  loadTeamPlays(abbr, season, onProgress && (d => onProgress(d.shots))).then(d => d.shots);