import React, { useState, useEffect } from 'react';

// ─── NBA fetch helper — runs in the browser, bypasses Vercel IP blocks ────────
const IS_LOCAL = window.location.hostname === 'localhost';

const nbaFetch = async (endpoint, params) => {
  const queryString = new URLSearchParams(params).toString();

  let url;
  let fetchOptions = {};

  if (IS_LOCAL) {
    // Vite proxy handles this locally
    url = `/api/nba/${endpoint}?${queryString}`;
    fetchOptions = {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      },
    };
  } else {
    // allorigins fetches on our behalf — no custom headers needed
    const nbaUrl = `https://stats.nba.com/stats/${endpoint}?${queryString}`;
    url = `https://api.allorigins.win/raw?url=${encodeURIComponent(nbaUrl)}`;
    fetchOptions = {};
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) throw new Error(`NBA API ${res.status}`);
  return res.json();
};

// ─── Resolve ESPN player name → NBA.com PERSON_ID ────────────────────────────
const fetchNBAComPlayerId = async (espnId, playerName) => {
  try {
    const data = await nbaFetch('commonallplayers', {
      LeagueID: '00',
      Season: '2024-25',
      IsOnlyCurrentSeason: '0',
    });
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    const nameIdx = headers.indexOf('DISPLAY_FIRST_LAST');
    const idIdx = headers.indexOf('PERSON_ID');
    const exactMatch = rows.find(r => r[nameIdx]?.toLowerCase() === playerName?.toLowerCase());
    if (exactMatch) return exactMatch[idIdx];
    const lastName = playerName?.split(' ').slice(-1)[0]?.toLowerCase();
    const partialMatch = rows.find(r => r[nameIdx]?.toLowerCase().includes(lastName));
    if (partialMatch) return partialMatch[idIdx];
    return null;
  } catch (e) {
    console.warn('Could not resolve NBA.com player ID:', e);
    return null;
  }
};

// ─── Resolve NBA.com PERSON_ID + game date → Game_ID ─────────────────────────
const fetchNBAComGameId = async (nbaComPlayerId, gameTime) => {
  try {
    const gameDate = new Date(gameTime);
    const month = String(gameDate.getMonth() + 1).padStart(2, '0');
    const day = String(gameDate.getDate()).padStart(2, '0');
    const year = gameDate.getFullYear();

    const data = await nbaFetch('playergamelog', {
      PlayerID: nbaComPlayerId,
      Season: '2025-26',
      SeasonType: 'Regular Season',
      LeagueID: '00',
    });
    const logHeaders = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    const gameIdIdx = logHeaders.indexOf('Game_ID');
    const gameDateIdx = logHeaders.indexOf('GAME_DATE');

    const matchingGame = rows.find(r => {
      const parsed = new Date(r[gameDateIdx]);
      return (
        String(parsed.getMonth() + 1).padStart(2, '0') === month &&
        String(parsed.getDate()).padStart(2, '0') === day &&
        String(parsed.getFullYear()) === String(year)
      );
    });

    return matchingGame?.[gameIdIdx] || null;
  } catch (e) {
    console.warn('Could not resolve NBA.com game ID:', e);
    return null;
  }
};

// ─── Team colors ──────────────────────────────────────────────────────────────
const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

// ─── Stat bar ─────────────────────────────────────────────────────────────────
function StatBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Shot chart ───────────────────────────────────────────────────────────────
function ShotChart({ shots, color }) {
  if (!shots || shots.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No shot data available
      </div>
    );
  }
  const W = 280, H = 240;
  const scaleX = (x) => ((x + 250) / 500) * W;
  const scaleY = (y) => H - ((y + 52) / 470) * H;
  const makes = shots.filter(s => s.SHOT_MADE_FLAG === 1);
  const misses = shots.filter(s => s.SHOT_MADE_FLAG === 0);
  const pct = shots.length > 0 ? ((makes.length / shots.length) * 100).toFixed(1) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-2">
        <span>{shots.length} FGA</span>
        <span>{makes.length}/{shots.length} — {pct}% FG</span>
      </div>
      <div className="relative rounded-xl overflow-hidden" style={{ background: '#111' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <rect x="0" y="0" width={W} height={H} fill="#111" />
          <path d={`M ${scaleX(-220)} ${scaleY(0)} L ${scaleX(-220)} ${scaleY(90)} A ${scaleX(237.5) - scaleX(0)} ${scaleY(237.5) - scaleY(0)} 0 0 1 ${scaleX(220)} ${scaleY(90)} L ${scaleX(220)} ${scaleY(0)}`} fill="none" stroke="#333" strokeWidth="1" />
          <rect x={scaleX(-80)} y={scaleY(190)} width={scaleX(80) - scaleX(-80)} height={scaleY(0) - scaleY(190)} fill="none" stroke="#2a2a2a" strokeWidth="1" />
          <circle cx={scaleX(0)} cy={scaleY(0)} r="4" fill="none" stroke="#444" strokeWidth="1.5" />
          <line x1="0" y1={scaleY(-52)} x2={W} y2={scaleY(-52)} stroke="#2a2a2a" strokeWidth="1" />
          {misses.map((s, i) => (
            <text key={`m${i}`} x={scaleX(s.LOC_X)} y={scaleY(s.LOC_Y)} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="#ef4444" opacity="0.75">✕</text>
          ))}
          {makes.map((s, i) => (
            <circle key={`k${i}`} cx={scaleX(s.LOC_X)} cy={scaleY(s.LOC_Y)} r="4" fill={color} fillOpacity="0.75" stroke={color} strokeWidth="0.5" />
          ))}
        </svg>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="text-red-500 font-bold">✕</span> Miss</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} /> Make</span>
      </div>
    </div>
  );
}

// ─── Zone chart ───────────────────────────────────────────────────────────────
function ZoneChart({ shots, color }) {
  if (!shots || shots.length === 0) return null;
  const zones = {};
  shots.forEach(s => {
    const z = s.SHOT_ZONE_BASIC || 'Unknown';
    if (!zones[z]) zones[z] = { made: 0, total: 0 };
    zones[z].total++;
    if (s.SHOT_MADE_FLAG === 1) zones[z].made++;
  });
  return (
    <div className="space-y-2">
      {Object.entries(zones).sort((a, b) => b[1].total - a[1].total).map(([zone, data]) => {
        const pct = data.total > 0 ? (data.made / data.total) * 100 : 0;
        return (
          <div key={zone}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">{zone}</span>
              <span className="text-gray-300 font-semibold">{data.made}/{data.total} ({pct.toFixed(0)}%)</span>
            </div>
            <StatBar value={pct} max={100} color={color} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlayerGameBreakdown({ player, game, gameDetails, selectedTeam, onClose }) {
  const [shotData, setShotData] = useState(null);
  const [advancedData, setAdvancedData] = useState(null);
  const [hustleData, setHustleData] = useState(null);
  const [loadingShots, setLoadingShots] = useState(true);
  const [loadingAdvanced, setLoadingAdvanced] = useState(true);
  const [loadingHustle, setLoadingHustle] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [nbaComPlayerId, setNbaComPlayerId] = useState(null);
  const [nbaComGameId, setNbaComGameId] = useState(null);

  const teamAbbr = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
  const color = teamColors[teamAbbr] || '#3B82F6';

  const teamIdx = selectedTeam === 'away' ? 0 : 1;
  const boxscoreRow = gameDetails?.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes?.find(
    a => a.athlete.id === player.id
  );
  const stats = boxscoreRow?.stats || [];

  const gameStats = {
    min: stats[0] || '-', pts: stats[1] || '0',
    fg: stats[2] || '0-0', threePt: stats[3] || '0-0', ft: stats[4] || '0-0',
    reb: stats[5] || '0', ast: stats[6] || '0', to: stats[7] || '0',
    stl: stats[8] || '0', blk: stats[9] || '0',
    pf: stats[12] || '0', plusMinus: stats[13] || '0',
  };

  const parseSplit = (str) => {
    const parts = (str || '0-0').split('-');
    return [parseFloat(parts[0]) || 0, parseFloat(parts[1]) || 0];
  };
  const [fgm, fga] = parseSplit(gameStats.fg);
  const [tpm, tpa] = parseSplit(gameStats.threePt);
  const [ftm, fta] = parseSplit(gameStats.ft);
  const pts = parseFloat(gameStats.pts) || 0;
  const fgPct = fga > 0 ? ((fgm / fga) * 100).toFixed(1) : '–';
  const tpPct = tpa > 0 ? ((tpm / tpa) * 100).toFixed(1) : '–';
  const ftPct = fta > 0 ? ((ftm / fta) * 100).toFixed(1) : '–';
  const tsPct = (fga + 0.44 * fta) > 0 ? ((pts / (2 * (fga + 0.44 * fta))) * 100).toFixed(1) : '–';
  const efgPct = fga > 0 ? (((fgm + 0.5 * tpm) / fga) * 100).toFixed(1) : '–';

  // ── Step 1: Resolve both IDs once ────────────────────────────────────────
  useEffect(() => {
    const resolveIds = async () => {
      const nbaId = await fetchNBAComPlayerId(player.id, player.name);
      if (!nbaId) return;
      setNbaComPlayerId(nbaId);
      const gameId = await fetchNBAComGameId(nbaId, game.gameTime);
      if (gameId) setNbaComGameId(gameId);
    };
    resolveIds();
  }, [player.id, player.name, game.gameTime]);

  // ── Step 2: Shot chart ───────────────────────────────────────────────────
  useEffect(() => {
    if (!nbaComPlayerId || !nbaComGameId) return;
    const fetchShots = async () => {
      setLoadingShots(true);
      try {
        const data = await nbaFetch('shotchartdetail', {
          PlayerID: nbaComPlayerId,
          GameID: nbaComGameId,
          TeamID: '0',
          Season: '2025-26',
          SeasonType: 'Regular Season',
          ContextMeasure: 'FGA',
          Period: '0',
          LastNGames: '0',
          Month: '0',
          OpponentTeamID: '0',
          RangeType: '0',
          StartPeriod: '1',
          EndPeriod: '10',
          StartRange: '0',
          EndRange: '28800',
          LeagueID: '00',
        });
        const resultSet = data.resultSets?.[0];
        if (resultSet) {
          const headers = resultSet.headers;
          const rows = resultSet.rowSet.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });
          setShotData(rows);
        }
      } catch (e) {
        console.warn('Shot chart unavailable:', e);
        setShotData([]);
      }
      setLoadingShots(false);
    };
    fetchShots();
  }, [nbaComPlayerId, nbaComGameId]);

  // ── Step 3: Advanced box score ───────────────────────────────────────────
  useEffect(() => {
    if (!nbaComGameId || !nbaComPlayerId) return;
    const fetchAdvanced = async () => {
      setLoadingAdvanced(true);
      try {
        const data = await nbaFetch('boxscoreadvancedv3', {
          GameID: nbaComGameId,
          StartPeriod: '0',
          EndPeriod: '10',
          StartRange: '0',
          EndRange: '28800',
          RangeType: '0',
        });
        const allPlayers = [
          ...(data.boxScoreAdvanced?.homeTeam?.players || []),
          ...(data.boxScoreAdvanced?.awayTeam?.players || []),
        ];
        const found = allPlayers.find(p => String(p.personId) === String(nbaComPlayerId));
        if (found) {
          const s = found.statistics;
          setAdvancedData({
            offensiveRating: s.offensiveRating,
            defensiveRating: s.defensiveRating,
            netRating: s.netRating,
            usagePercentage: s.usagePercentage,
            pace: s.pace,
            playerImpactEstimate: s.playerImpactEstimate,
            offensiveReboundPercentage: s.offensiveReboundPercentage,
            defensiveReboundPercentage: s.defensiveReboundPercentage,
            reboundPercentage: s.reboundPercentage,
            assistPercentage: s.assistPercentage,
            turnoverPercentage: s.turnoverPercentage,
            assistToTurnover: s.assistToTurnover,
          });
        }
      } catch (e) {
        console.warn('Advanced stats unavailable:', e);
        setAdvancedData(null);
      }
      setLoadingAdvanced(false);
    };
    fetchAdvanced();
  }, [nbaComGameId, nbaComPlayerId]);

  // ── Step 4: Hustle stats ─────────────────────────────────────────────────
  useEffect(() => {
    if (!nbaComGameId || !nbaComPlayerId) return;
    const fetchHustle = async () => {
      setLoadingHustle(true);
      try {
        const data = await nbaFetch('hustlestatsboxscore', {
          GameID: nbaComGameId,
        });
        const players = data.resultSets?.find(rs => rs.name === 'PlayerStats');
        if (players) {
          const headers = players.headers;
          const row = players.rowSet.find(r => String(r[headers.indexOf('PLAYER_ID')]) === String(nbaComPlayerId));
          if (row) {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            setHustleData(obj);
          }
        }
      } catch (e) {
        console.warn('Hustle stats unavailable:', e);
        setHustleData(null);
      }
      setLoadingHustle(false);
    };
    fetchHustle();
  }, [nbaComGameId, nbaComPlayerId]);

  const headshot = player.athlete?.headshot?.href || player.headshot;
  const pmColor = parseFloat(gameStats.plusMinus) > 0 ? '#22c55e' : parseFloat(gameStats.plusMinus) < 0 ? '#ef4444' : '#6b7280';

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'shooting', label: 'Shooting' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'hustle', label: 'Hustle' },
  ];

  return (
    <div className="fixed inset-0 bg-black z-[200] overflow-y-auto" style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}>
      <div className="min-h-screen px-4 pt-12 pb-12 max-w-2xl mx-auto">

        <div className="flex items-center mb-5">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-light mr-4">‹</button>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Game Breakdown</h2>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl p-5 mb-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}30 0%, #111 60%)`, border: `1px solid ${color}44` }}>
          <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: color }} />
          <div className="flex items-center gap-4 relative z-10">
            {headshot ? (
              <img src={headshot} alt={player.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" style={{ border: `2px solid ${color}55` }} />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center text-gray-400 font-bold text-lg flex-shrink-0">
                {player.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{player.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{game.isFinal ? 'Final' : game.isLive ? 'Live' : ''} · {game.awayTeam} @ {game.homeTeam}</div>
              <div className="text-xs text-gray-500 mt-0.5">{gameStats.min} MIN</div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-bold">{gameStats.pts}</span>
              <span className="text-xs text-gray-400">PTS</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4 relative z-10">
            {[
              { v: gameStats.reb, l: 'REB' },
              { v: gameStats.ast, l: 'AST' },
              { v: gameStats.stl, l: 'STL' },
              { v: gameStats.blk, l: 'BLK' },
              { v: gameStats.to, l: 'TO' },
              { v: parseFloat(gameStats.plusMinus) >= 0 ? `+${parseFloat(gameStats.plusMinus)}` : `${parseFloat(gameStats.plusMinus)}`, l: '+/-', color: pmColor },
            ].map(({ v, l, color: c }) => (
              <div key={l} className="flex-1 rounded-xl py-2 flex flex-col items-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <span className="text-base font-bold" style={{ color: c || 'white' }}>{v}</span>
                <span className="text-[10px] text-gray-400">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 bg-zinc-900 rounded-xl p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-2xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Shooting</h4>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'FG', split: `${fgm}/${fga}`, pct: fgPct },
                  { label: '3PT', split: `${tpm}/${tpa}`, pct: tpPct },
                  { label: 'FT', split: `${ftm}/${fta}`, pct: ftPct },
                ].map(({ label, split, pct }) => (
                  <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                    <span className="text-xl font-bold">{pct}<span className="text-xs text-gray-400">%</span></span>
                    <span className="text-[10px] text-gray-500 -mt-0.5">{split}</span>
                    <span className="text-[10px] text-gray-400 mt-1">{label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'True Shooting %', value: tsPct },
                  { label: 'Eff FG %', value: efgPct },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                    <span className="text-xl font-bold">{value}<span className="text-xs text-gray-400">%</span></span>
                    <span className="text-[10px] text-gray-400 mt-1 text-center">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Full Box Score</h4>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'PTS', value: gameStats.pts },
                  { label: 'REB', value: gameStats.reb },
                  { label: 'AST', value: gameStats.ast },
                  { label: '+/-', value: parseFloat(gameStats.plusMinus) >= 0 ? `+${gameStats.plusMinus}` : gameStats.plusMinus, color: pmColor },
                  { label: 'STL', value: gameStats.stl },
                  { label: 'BLK', value: gameStats.blk },
                  { label: 'TO', value: gameStats.to },
                  { label: 'PF', value: gameStats.pf },
                  { label: 'MIN', value: gameStats.min },
                  { label: 'FG', value: gameStats.fg?.replace('-', '/') },
                  { label: '3PT', value: gameStats.threePt?.replace('-', '/') },
                  { label: 'FT', value: gameStats.ft?.replace('-', '/') },
                ].map(({ label, value, color: c }) => (
                  <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-2 flex flex-col items-center">
                    <span className="text-base font-bold whitespace-nowrap" style={{ color: c || 'white' }}>{value}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SHOOTING ── */}
        {activeTab === 'shooting' && (
          <div className="space-y-3">
            <div className="bg-zinc-900 rounded-2xl p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Shot Chart</h4>
              {loadingShots ? (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                  Loading shots…
                </div>
              ) : (
                <ShotChart shots={shotData} color={color} />
              )}
            </div>
            {!loadingShots && shotData && shotData.length > 0 && (
              <div className="bg-zinc-900 rounded-2xl p-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">By Zone</h4>
                <ZoneChart shots={shotData} color={color} />
              </div>
            )}
            {!loadingShots && shotData && shotData.length > 0 && (() => {
              const dist = { 'Paint (0–8ft)': { m: 0, t: 0 }, 'Mid-Range (8–16ft)': { m: 0, t: 0 }, 'Long 2 (16–24ft)': { m: 0, t: 0 }, '3-Point': { m: 0, t: 0 } };
              shotData.forEach(s => {
                const d = s.SHOT_DISTANCE || 0;
                const made = s.SHOT_MADE_FLAG === 1;
                let key;
                if (d <= 8) key = 'Paint (0–8ft)';
                else if (d <= 16) key = 'Mid-Range (8–16ft)';
                else if (d <= 23) key = 'Long 2 (16–24ft)';
                else key = '3-Point';
                dist[key].t++;
                if (made) dist[key].m++;
              });
              return (
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Shot Distance</h4>
                  <div className="space-y-2">
                    {Object.entries(dist).filter(([, v]) => v.t > 0).map(([range, v]) => {
                      const pct = v.t > 0 ? (v.m / v.t) * 100 : 0;
                      return (
                        <div key={range}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">{range}</span>
                            <span className="text-gray-300 font-semibold">{v.m}/{v.t} · {pct.toFixed(0)}%</span>
                          </div>
                          <StatBar value={pct} max={100} color={color} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── ADVANCED ── */}
        {activeTab === 'advanced' && (
          <div className="space-y-3">
            {loadingAdvanced ? (
              <div className="bg-zinc-900 rounded-2xl p-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                Loading advanced stats…
              </div>
            ) : advancedData ? (
              <>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Efficiency</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Off Rating', value: advancedData.offensiveRating?.toFixed(1) || '–', note: 'pts/100 poss' },
                      { label: 'Def Rating', value: advancedData.defensiveRating?.toFixed(1) || '–', note: 'pts allowed/100' },
                      { label: 'Net Rating', value: advancedData.netRating !== undefined ? (advancedData.netRating >= 0 ? `+${advancedData.netRating.toFixed(1)}` : advancedData.netRating.toFixed(1)) : '–', note: 'off − def' },
                    ].map(({ label, value, note }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center text-center">
                        <span className="text-xl font-bold">{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
                        <span className="text-[9px] text-gray-600 mt-0.5">{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Usage & Pace</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Usage %', value: advancedData.usagePercentage !== undefined ? `${(advancedData.usagePercentage * 100).toFixed(1)}%` : '–' },
                      { label: 'Pace', value: advancedData.pace?.toFixed(1) || '–' },
                      { label: 'PIE', value: advancedData.playerImpactEstimate !== undefined ? `${(advancedData.playerImpactEstimate * 100).toFixed(1)}%` : '–' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                        <span className="text-xl font-bold">{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Rebounding</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'OREB %', value: advancedData.offensiveReboundPercentage !== undefined ? `${(advancedData.offensiveReboundPercentage * 100).toFixed(1)}%` : '–' },
                      { label: 'DREB %', value: advancedData.defensiveReboundPercentage !== undefined ? `${(advancedData.defensiveReboundPercentage * 100).toFixed(1)}%` : '–' },
                      { label: 'REB %', value: advancedData.reboundPercentage !== undefined ? `${(advancedData.reboundPercentage * 100).toFixed(1)}%` : '–' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                        <span className="text-xl font-bold">{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Assist / TO</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'AST %', value: advancedData.assistPercentage !== undefined ? `${(advancedData.assistPercentage * 100).toFixed(1)}%` : '–' },
                      { label: 'TOV %', value: advancedData.turnoverPercentage !== undefined ? `${(advancedData.turnoverPercentage * 100).toFixed(1)}%` : '–' },
                      { label: 'AST/TO', value: advancedData.assistToTurnover?.toFixed(1) || '–' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                        <span className="text-xl font-bold">{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-zinc-900 rounded-2xl p-6 text-center">
                <div className="text-gray-500 text-sm mb-1">Advanced stats unavailable</div>
              </div>
            )}
          </div>
        )}

        {/* ── HUSTLE ── */}
        {activeTab === 'hustle' && (
          <div className="space-y-3">
            {loadingHustle ? (
              <div className="bg-zinc-900 rounded-2xl p-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                Loading hustle stats…
              </div>
            ) : hustleData ? (
              <>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Hustle Stats</h4>
                  <p className="text-[10px] text-gray-600 mb-3">Exclusively from NBA.com tracking — not available on ESPN</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Deflections', value: hustleData.DEFLECTIONS ?? '–' },
                      { label: 'Charges Drawn', value: hustleData.CHARGES_DRAWN ?? '–' },
                      { label: 'Loose Balls Rec', value: hustleData.LOOSE_BALLS_RECOVERED ?? '–' },
                      { label: 'Screen AST', value: hustleData.SCREEN_ASSISTS ?? '–' },
                      { label: 'Screen AST PTS', value: hustleData.SCREEN_AST_PTS ?? '–' },
                      { label: 'Box Outs', value: hustleData.BOX_OUT_PLAYER_REBS ?? '–' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center text-center">
                        <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5 leading-tight">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 rounded-2xl p-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Contested Shots</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Contested 2s', value: hustleData.CONTESTED_SHOTS_2PT ?? '–' },
                      { label: 'Contested 3s', value: hustleData.CONTESTED_SHOTS_3PT ?? '–' },
                      { label: 'Total Contested', value: (hustleData.CONTESTED_SHOTS_2PT ?? 0) + (hustleData.CONTESTED_SHOTS_3PT ?? 0) || '–' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 flex flex-col items-center">
                        <span className="text-2xl font-bold">{value}</span>
                        <span className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-zinc-900 rounded-2xl p-6 text-center">
                <div className="text-gray-500 text-sm mb-1">Hustle stats unavailable</div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}