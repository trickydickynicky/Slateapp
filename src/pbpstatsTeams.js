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
  
  const totalsUrl = (season, type) =>
    `https://api.pbpstats.com/get-totals/nba?Season=${season}&SeasonType=Regular%20Season&Type=${type}`;
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
    const mem = new Map();        // season -> { at, teams }
    const inflight = new Map();   // season -> Promise
    return function load(season) {
      const hit = mem.get(season);
      if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.teams);
      const key = `${cachePrefix}:${season}`;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        if (raw && Date.now() - raw.at < TTL && raw.teams?.length >= 20) { mem.set(season, raw); return Promise.resolve(raw.teams); }
      } catch (e) { /* ignore */ }
      if (inflight.has(season)) return inflight.get(season);
      const p = fetch(totalsUrl(season, type))
        .then(r => { if (!r.ok) throw new Error(`pbpstats ${r.status}`); return r.json(); })
        .then(j => {
          const teams = (j?.multi_row_table_data || []).map(toTeam).filter(t => t.abbr);
          if (teams.length < 20) throw new Error('unexpected response');
          const entry = { at: Date.now(), teams };
          mem.set(season, entry);
          try { localStorage.setItem(key, JSON.stringify(entry)); } catch (e) { /* ignore */ }
          return teams;
        })
        .finally(() => inflight.delete(season));
      inflight.set(season, p);
      return p;
    };
  }
  
  export const loadTeamTotals = makeLoader('Team', 'pbpTeams:v1');
  export const loadOppTotals = makeLoader('Opponent', 'pbpOpp:v1');
  
  export function findTeam(teams, espnAbbr) {
    const want = [TRICODE[espnAbbr], espnAbbr].filter(Boolean);
    return teams.find(t => want.includes(t.abbr)) || null;
  }