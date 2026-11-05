/**
 * pbpstats team totals: one request returns all 30 teams.
 * Reduced to a few numbers per team and cached (memory + localStorage) for 3 hours.
 * Two flavors: Team (what a team did) and Opponent (what opponents did against it).
 */

export const ZONES = [
    { key: 'AtRim', label: 'At the rim', range: '0–4 ft', pts: 2 },
    { key: 'ShortMidRange', label: 'Short midrange', range: '4–14 ft', pts: 2 },
    { key: 'LongMidRange', label: 'Long midrange', range: '14+ ft', pts: 2 },
    { key: 'Corner3', label: 'Corner 3', range: '', pts: 3 },
    { key: 'Arc3', label: 'Above-the-break 3', range: '', pts: 3 },
  ];
  // ESPN abbreviation -> NBA tricode (only the ones that differ)
  const TRICODE = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
  const TTL = 3 * 60 * 60 * 1000;
  
  export const nbaSeason = () => {
    const d = new Date();
    const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; // new season starts in September
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };
  
  const totalsUrl = (season, type, seasonType = 'Regular Season') =>
    `https://api.pbpstats.com/get-totals/nba?Season=${season}&SeasonType=${encodeURIComponent(seasonType)}&Type=${type}`;
  // playoffs only has the teams that qualified, so the "full league" check has to relax
  const minTeams = seasonType => (seasonType === 'Playoffs' ? 8 : 20);
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  
  const toTeam = r => ({
    abbr: String(r.TeamAbbreviation || r.ShortName || r.Name || ''),
    gp: n(r.GamesPlayed),
    pts: n(r.Points), opp: n(r.OpponentPoints), offPoss: n(r.OffPoss), defPoss: n(r.DefPoss), pace: n(r.Pace),
    fg2a: n(r.FG2A), fg3a: n(r.FG3A), fg2m: n(r.FG2M), fg3m: n(r.FG3M),
    fta: n(r.FTA), ftm: n(r.FtPoints), tov: n(r.Turnovers),
    efg: n(r.EfgPct), ts: n(r.TsPct), oreb: n(r.OffFGReboundPct),
    // zone -> [makes, attempts, assists]
    z: Object.fromEntries(ZONES.map(z => [z.key, [n(r[`${z.key}FGM`]), n(r[`${z.key}FGA`]), n(r[`${z.key}Assists`])]])),
  });
  
  function makeLoader(type, cachePrefix) {
    const mem = new Map();        // season|seasonType -> { at, teams }
    const inflight = new Map();   // season|seasonType -> Promise
    return function load(season, seasonType = 'Regular Season') {
      const mk = `${season}|${seasonType}`;
      const hit = mem.get(mk);
      if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.teams);
      const key = `${cachePrefix}:${season}:${seasonType}`;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        if (raw && Date.now() - raw.at < TTL && raw.teams?.length >= minTeams(seasonType)) { mem.set(mk, raw); return Promise.resolve(raw.teams); }
      } catch (e) { /* ignore */ }
      if (inflight.has(mk)) return inflight.get(mk);
      const p = fetch(totalsUrl(season, type, seasonType))
        .then(r => { if (!r.ok) throw new Error(`pbpstats ${r.status}`); return r.json(); })
        .then(j => {
          const teams = (j?.multi_row_table_data || []).map(toTeam).filter(t => t.abbr);
          if (teams.length < minTeams(seasonType)) throw new Error('unexpected response');
          const entry = { at: Date.now(), teams };
          mem.set(mk, entry);
          try { localStorage.setItem(key, JSON.stringify(entry)); } catch (e) { /* ignore */ }
          return teams;
        })
        .finally(() => inflight.delete(mk));
      inflight.set(mk, p);
      return p;
    };
  }
  
  export const loadTeamTotals = makeLoader('Team', 'pbpTeams:v1');
  export const loadOppTotals = makeLoader('Opponent', 'pbpOpp:v1');
  
  export function findTeam(teams, espnAbbr) {
    const want = [TRICODE[espnAbbr], espnAbbr].filter(Boolean);
    return teams.find(t => want.includes(t.abbr)) || null;
  }
  /* ── League-wide extras for the Team tab ── */

const API = 'https://api.pbpstats.com';
const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`pbpstats ${r.status}`); return r.json(); });
// some stats come back as 0-1, some as 0-100: normalize to 0-1
const asFrac = rows => (Math.max(0, ...rows.map(r => r.v)) > 1.5 ? rows.map(r => ({ ...r, v: r.v / 100 })) : rows);

const scatter = (season, key) =>
  getJson(`${API}/get-scatter-plots/nba?Season=${season}&SeasonType=Regular%20Season&Xaxis=${key}&Yaxis=${key}&XaxisType=Team&YaxisType=Opponent`)
    .then(j => {
      const res = j?.results || [];
      if (res.length < 20) throw new Error('unexpected response');
      return {
        team: asFrac(res.map(r => ({ abbr: String(r.label), v: n(r.x) }))),
        opp: asFrac(res.map(r => ({ abbr: String(r.label), v: n(r.y) }))),
      };
    });

const startSummary = (season, type) =>
  getJson(`${API}/get-pace-efficiency-summary/nba?Season=${season}&SeasonType=Regular%20Season&Type=${type}`)
    .then(j => {
      const res = j?.results || [];
      if (res.length < 20) throw new Error('unexpected response');
      return res.map(r => ({
        abbr: String(r.team_name),
        ppp: n(r.ppp),
        steal: n(r.ppp_off_steal),
        missed: n(r.ppp_off_missed_fg),
        dead: n(r.ppp_off_deadball),
        made: n(r.ppp_off_made_fg),
        timeout: n(r.ppp_off_timeout),
      }));
    });

const extrasMem = new Map();
const extrasInflight = new Map();

export function loadTeamExtras(season) {
  const hit = extrasMem.get(season);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  const key = `pbpExtras:v1:${season}`;
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (raw?.data && Date.now() - raw.at < TTL) { extrasMem.set(season, raw); return Promise.resolve(raw.data); }
  } catch (e) { /* ignore */ }
  if (extrasInflight.has(season)) return extrasInflight.get(season);
  const zoneKeys = ZONES.map(z => z.key);
  const p = Promise.all([
    startSummary(season, 'Team'),
    startSummary(season, 'Opponent'),
    scatter(season, 'LiveBallTurnoverPct'),
    ...zoneKeys.map(k => scatter(season, `Off${k}ReboundPct`)),
  ])
    .then(([startTeam, startOpp, live, ...oreb]) => {
      const data = {
        start: { team: startTeam, opp: startOpp },
        live,
        oreb: Object.fromEntries(zoneKeys.map((k, i) => [k, oreb[i]])),
      };
      const entry = { at: Date.now(), data };
      extrasMem.set(season, entry);
      try { localStorage.setItem(key, JSON.stringify(entry)); } catch (e) { /* ignore */ }
      return data;
    })
    .finally(() => extrasInflight.delete(season));
  extrasInflight.set(season, p);
  return p;
}