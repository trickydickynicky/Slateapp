/**
 * Player season totals from pbpstats (one row per player).
 * Field names are matched loosely (case/punctuation ignored). If a stat comes back empty,
 * open the console, find "[players] pbpstats row keys", and add the real name to ALIASES.
 */

const BASE = 'https://api.pbpstats.com';
const TTL = 10 * 60 * 1000;
const mem = new Map();

const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  gp: ['gamesplayed', 'gp', 'games'],
  min: ['minutes', 'min'],
  pts: ['points', 'pts'],
  fg2m: ['fg2m'], fg2a: ['fg2a'], fg3m: ['fg3m'], fg3a: ['fg3a'],
  ftm: ['ftm', 'ftpoints'], fta: ['fta'],
  ast: ['assists', 'ast'],
  tov: ['turnovers', 'tov'],
  reb: ['rebounds', 'totalrebounds', 'reb'],
  oreb: ['offrebounds', 'offensiverebounds', 'oreb'],
  stl: ['steals', 'stl'],
  blk: ['blocks', 'blk'],
  usg: ['usage', 'usgpct', 'usg'],
};

const toNum = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  if (v.includes(':')) {
    const [m, s] = v.split(':').map(Number);
    return Number.isFinite(m) ? m + (Number.isFinite(s) ? s / 60 : 0) : null;
  }
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : null;
};

export async function loadPlayerTotals(season, seasonType = 'Regular Season') {
  const key = `${season}|${seasonType}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;

  const qs = new URLSearchParams({ Season: String(season), SeasonType: seasonType, Type: 'Player' });
  const res = await fetch(`${BASE}/get-totals/nba?${qs}`);
  if (!res.ok) throw new Error(`pbpstats ${res.status}`);
  const json = await res.json();
  const raw = json.multi_row_table_data || [];
  if (raw[0]) console.info('[players] pbpstats row keys', Object.keys(raw[0]));

  const rows = raw.map(row => {
    const look = {};
    Object.keys(row).forEach(k => { look[norm(k)] = row[k]; });
    const num = names => { for (const n of names) { const v = toNum(look[n]); if (v != null) return v; } return null; };
    const str = names => { for (const n of names) if (look[n] != null && look[n] !== '') return String(look[n]); return ''; };
    const p = {
      id: str(['entityid', 'playerid', 'id']),
      name: str(['name', 'playername']),
      abbr: str(['teamabbreviation', 'teamabbr', 'team']),
    };
    Object.keys(ALIASES).forEach(k => { p[k] = num(ALIASES[k]); });
    return p;
  }).filter(p => p.id && p.name && p.min > 0);

  mem.set(key, { at: Date.now(), rows });
  return rows;
}