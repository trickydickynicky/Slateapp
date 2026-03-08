import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

const teamColors = {
  'ARI': '#A71930', 'ATL': '#CE1141', 'BAL': '#DF4601', 'BOS': '#BD3039',
  'CHC': '#0E3386', 'CWS': '#27251F', 'CIN': '#C6011F', 'CLE': '#00385D',
  'COL': '#33006F', 'DET': '#0C2340', 'HOU': '#002D62', 'KC': '#004687',
  'LAA': '#BA0021', 'LAD': '#005A9C', 'MIA': '#00A3E0', 'MIL': '#FFC52F',
  'MIN': '#002B5C', 'NYM': '#002D72', 'NYY': '#0C2340', 'OAK': '#003831',
  'PHI': '#E81828', 'PIT': '#FDB827', 'SD': '#2F241D', 'SF': '#FD5A1E',
  'SEA': '#0C2C56', 'STL': '#C41E3A', 'TB': '#092C5C', 'TEX': '#003278',
  'TOR': '#134A8E', 'WSH': '#AB0003',
};

const teamFullNames = {
  'ARI': 'Arizona Diamondbacks', 'ATL': 'Atlanta Braves', 'BAL': 'Baltimore Orioles',
  'BOS': 'Boston Red Sox', 'CHC': 'Chicago Cubs', 'CWS': 'Chicago White Sox',
  'CIN': 'Cincinnati Reds', 'CLE': 'Cleveland Guardians', 'COL': 'Colorado Rockies',
  'DET': 'Detroit Tigers', 'HOU': 'Houston Astros', 'KC': 'Kansas City Royals',
  'LAA': 'Los Angeles Angels', 'LAD': 'Los Angeles Dodgers', 'MIA': 'Miami Marlins',
  'MIL': 'Milwaukee Brewers', 'MIN': 'Minnesota Twins', 'NYM': 'New York Mets',
  'NYY': 'New York Yankees', 'OAK': 'Oakland Athletics', 'PHI': 'Philadelphia Phillies',
  'PIT': 'Pittsburgh Pirates', 'SD': 'San Diego Padres', 'SF': 'San Francisco Giants',
  'SEA': 'Seattle Mariners', 'STL': 'St. Louis Cardinals', 'TB': 'Tampa Bay Rays',
  'TEX': 'Texas Rangers', 'TOR': 'Toronto Blue Jays', 'WSH': 'Washington Nationals',
};

// ── Fetch MLB player stats from ESPN ──────────────────────────────────────
const fetchMLBPlayerStats = async (playerName, playerId) => {
  const response = await fetch(
    `https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${playerId}/stats`
  );
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();

  const battingCategory = data.categories?.find(cat => cat.name === 'career-batting');
  const expandedCategory = data.categories?.find(cat => cat.name === 'expanded-batting');
  const pitchingCategory = data.categories?.find(cat => cat.name?.includes('pitching'));
  const primaryCategory = battingCategory || pitchingCategory || data.categories?.[0];
  if (!primaryCategory) throw new Error('No stats data');

  const allSeasons = [];
  const seenYears = new Set();
  primaryCategory.statistics?.forEach(stat => {
    if (!seenYears.has(stat.season.year)) {
      seenYears.add(stat.season.year);
      allSeasons.push({ year: stat.season.year, displayName: stat.season.displayName });
    }
  });
  allSeasons.sort((a, b) => b.year - a.year);

  const buildSeasonData = (primaryCat, secondaryCat) => {
    if (!primaryCat) return {};
    const byYear = {};
    primaryCat.statistics?.forEach(stat => {
      const year = stat.season.year;
      const labels = primaryCat.labels || [];
      const statsObj = { year, displayName: stat.season.displayName };
      labels.forEach((label, i) => { statsObj[label.toUpperCase()] = stat.stats[i] ?? '-'; });
      byYear[year] = statsObj;
    });
    secondaryCat?.statistics?.forEach(stat => {
      const year = stat.season.year;
      if (!byYear[year]) return;
      const labels = secondaryCat.labels || [];
      labels.forEach((label, i) => { byYear[year][label.toUpperCase()] = stat.stats[i] ?? '-'; });
    });
    return byYear;
  };

  const battingByYear = buildSeasonData(battingCategory, expandedCategory);
  const pitchingByYear = buildSeasonData(pitchingCategory);
  const latestYear = allSeasons[0]?.year;

  return {
    playerName, playerId, allSeasons, battingByYear, pitchingByYear,
    currentBatting: battingByYear[latestYear] || null,
    currentPitching: pitchingByYear[latestYear] || null,
    isPitcher: !!pitchingCategory && !battingCategory,
  };
};

// ── Stat Row ──────────────────────────────────────────────────────────────
const StatRow = ({ label, leftVal, rightVal, inverse = false }) => {
  const lv = parseFloat(leftVal) || 0;
  const rv = parseFloat(rightVal) || 0;
  const leftWins = inverse ? lv < rv : lv > rv;
  const rightWins = inverse ? rv < lv : rv > lv;
  const tied = lv === rv;

  const fmt = v => {
    if (v === '-' || v === undefined || v === null) return '-';
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    return n < 10 && n % 1 !== 0 ? n.toFixed(3).replace(/^0/, '') : n % 1 !== 0 ? n.toFixed(2) : n.toString();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
        {leftWins && !tied && (
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', boxShadow: '0 0 6px #3B82F6', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1, color: leftWins && !tied ? 'white' : '#6b7280' }}>
          {fmt(leftVal)}
        </span>
      </div>
      <div style={{ width: 56, textAlign: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.12em' }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 7 }}>
        <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1, color: rightWins && !tied ? 'white' : '#6b7280' }}>
          {fmt(rightVal)}
        </span>
        {rightWins && !tied && (
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', boxShadow: '0 0 6px #3B82F6', flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
};

const SectionLabel = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 2 }}>
    <div style={{ flex: 1, height: 1, background: '#3f3f46' }} />
    <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.14em' }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: '#3f3f46' }} />
  </div>
);

// ── Player Header ─────────────────────────────────────────────────────────
const PlayerHeader = ({ player, stats, selectedSeason, onSeasonChange, side, onClear, isTarget }) => {
  const color = player ? (teamColors[player.teamAbbr] || '#3B82F6') : '#6b7280';
  const isLeft = side === 'left';

  if (!player) {
    return (
      <div style={{
        flex: 1, borderRadius: 14, height: 68,
        background: isTarget ? '#0f0f0f' : '#0a0a0a',
        border: isTarget ? '1px dashed #3B82F6' : '1px dashed #3f3f46',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Search style={{ width: 12, height: 12, color: isTarget ? '#3B82F6' : '#6b7280' }} />
        <span style={{ fontSize: 10, color: isTarget ? '#3B82F6' : '#6b7280', fontWeight: 600 }}>
          {isTarget ? 'Searching...' : 'No player'}
        </span>
      </div>
    );
  }

  const allSeasons = stats?.allSeasons || [];

  return (
    <div style={{
      flex: 1, borderRadius: 14, padding: '9px 11px',
      background: `linear-gradient(${isLeft ? '135deg' : '225deg'}, ${color}1a 0%, #080808 65%)`,
      border: `1px solid ${isTarget ? color : color + '20'}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', width: 70, height: 70, borderRadius: '50%',
        background: color, opacity: 0.06, filter: 'blur(20px)',
        top: -16, [isLeft ? 'left' : 'right']: -16, pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 9 }}>
        {player.headshot ? (
          <img
            src={player.headshot}
            alt={player.name}
            onError={e => { e.target.src = `https://a.espncdn.com/i/teamlogos/mlb/500/${player.teamAbbr}.png`; }}
            style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', border: `1.5px solid ${color}30`, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
            {player.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', color: 'white', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <img src={`https://a.espncdn.com/i/teamlogos/mlb/500/${player.teamAbbr}.png`} alt="" style={{ width: 10, height: 10 }} />
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{player.teamAbbr}</span>
          </div>
          {allSeasons.length > 0 && (
            <select
              value={selectedSeason || ''}
              onChange={e => onSeasonChange(parseInt(e.target.value))}
              style={{
                marginTop: 4, fontSize: 10, fontWeight: 700, outline: 'none', cursor: 'pointer',
                borderRadius: 6, paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
                appearance: 'none', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.04em', maxWidth: '100%',
              }}
            >
              {allSeasons.map(s => (
                <option key={s.year} value={s.year} style={{ background: '#0a0a0a', color: 'white' }}>{s.displayName}</option>
              ))}
            </select>
          )}
        </div>
        {onClear && (
          <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, alignSelf: 'flex-start' }}>
            <X style={{ width: 11, height: 11, color: '#6b7280' }} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────
export default function MLBPlayerComparison({ basePlayer, playerCache, onClose }) {
  const [leftPlayer, setLeftPlayer] = useState(basePlayer || null);
  const [rightPlayer, setRightPlayer] = useState(null);

  const [leftStats, setLeftStats] = useState(null);
  const [rightStats, setRightStats] = useState(null);
  const [loadingLeft, setLoadingLeft] = useState(!!basePlayer);
  const [loadingRight, setLoadingRight] = useState(false);

  const [leftSeason, setLeftSeason] = useState(null);
  const [rightSeason, setRightSeason] = useState(null);

  const [searchTarget, setSearchTarget] = useState('right');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const leftColor = teamColors[leftPlayer?.teamAbbr] || '#3B82F6';
  const rightColor = teamColors[rightPlayer?.teamAbbr] || '#EF4444';

  useEffect(() => {
    if (!basePlayer?.id) return;
    setLoadingLeft(true);
    fetchMLBPlayerStats(basePlayer.name, basePlayer.id)
      .then(data => { setLeftStats(data); setLeftSeason(data.allSeasons[0]?.year); })
      .catch(() => setLeftStats({ error: true }))
      .finally(() => setLoadingLeft(false));
  }, [basePlayer?.id]);

  const handleSearch = q => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) { setSearchResults([]); return; }
    const lq = q.toLowerCase();
    setSearchResults(
      Object.values(playerCache || {}).filter(p => p.strPlayer?.toLowerCase().includes(lq)).slice(0, 8)
    );
  };

  const loadStats = (p, side) => {
    const setter = side === 'left' ? setLeftStats : setRightStats;
    const loadSetter = side === 'left' ? setLoadingLeft : setLoadingRight;
    const seasonSetter = side === 'left' ? setLeftSeason : setRightSeason;
    setter(null); loadSetter(true);
    fetchMLBPlayerStats(p.name, p.id)
      .then(data => { setter(data); seasonSetter(data.allSeasons[0]?.year); })
      .catch(() => setter({ error: true }))
      .finally(() => loadSetter(false));
  };

  const selectPlayer = player => {
    setSearchQuery(''); setSearchResults([]);
    const p = {
      id: player.idPlayer, name: player.strPlayer,
      headshot: player.strThumb, teamAbbr: player.strTeamAbbr, position: player.strPosition,
    };
    if (searchTarget === 'left') {
      setLeftPlayer(p); loadStats(p, 'left');
      if (!rightPlayer) setSearchTarget('right');
    } else {
      setRightPlayer(p); loadStats(p, 'right');
    }
  };

  const clearLeft = () => {
    setLeftPlayer(null); setLeftStats(null); setLeftSeason(null);
    setSearchTarget('left'); setSearchQuery(''); setSearchResults([]);
  };
  const clearRight = () => {
    setRightPlayer(null); setRightStats(null); setRightSeason(null);
    setSearchTarget('right'); setSearchQuery(''); setSearchResults([]);
  };

  const handleLeftSeasonChange = year => {
    setLeftSeason(year);
    if (leftStats?.battingByYear?.[year] || leftStats?.pitchingByYear?.[year]) {
      setLeftStats(prev => ({
        ...prev,
        currentBatting: prev.battingByYear?.[year] || null,
        currentPitching: prev.pitchingByYear?.[year] || null,
      }));
    }
  };
  const handleRightSeasonChange = year => {
    setRightSeason(year);
    if (rightStats?.battingByYear?.[year] || rightStats?.pitchingByYear?.[year]) {
      setRightStats(prev => ({
        ...prev,
        currentBatting: prev.battingByYear?.[year] || null,
        currentPitching: prev.pitchingByYear?.[year] || null,
      }));
    }
  };

  const LB = leftStats?.currentBatting || {};
  const RB = rightStats?.currentBatting || {};
  const LP = leftStats?.currentPitching || {};
  const RP = rightStats?.currentPitching || {};

  const hasBatting = (LB['AVG'] && LB['AVG'] !== '-') || (RB['AVG'] && RB['AVG'] !== '-');
  const hasPitching = (LP['ERA'] && LP['ERA'] !== '-') || (RP['ERA'] && RP['ERA'] !== '-');

  const battingGroups = [
    { label: 'BATTING RATE', rows: [
      { label: 'AVG', lv: LB['AVG'], rv: RB['AVG'] },
      { label: 'OBP', lv: LB['OBP'], rv: RB['OBP'] },
      { label: 'SLG', lv: LB['SLG'], rv: RB['SLG'] },
      { label: 'OPS', lv: LB['OPS'], rv: RB['OPS'] },
    ]},
    { label: 'POWER & PRODUCTION', rows: [
      { label: 'HR', lv: LB['HR'], rv: RB['HR'] },
      { label: 'RBI', lv: LB['RBI'], rv: RB['RBI'] },
      { label: 'R', lv: LB['R'], rv: RB['R'] },
      { label: 'H', lv: LB['H'], rv: RB['H'] },
      { label: '2B', lv: LB['2B'], rv: RB['2B'] },
      { label: '3B', lv: LB['3B'], rv: RB['3B'] },
    ]},
    { label: 'PLATE DISCIPLINE', rows: [
      { label: 'BB', lv: LB['BB'], rv: RB['BB'] },
      { label: 'SO', lv: LB['SO'], rv: RB['SO'], inverse: true },
      { label: 'SB', lv: LB['SB'], rv: RB['SB'] },
    ]},
    { label: 'AVAILABILITY', rows: [
      { label: 'G', lv: LB['G'], rv: RB['G'] },
      { label: 'GS', lv: LB['GS'], rv: RB['GS'] },
      { label: 'AB', lv: LB['AB'], rv: RB['AB'] },
    ]},
  ];

  const pitchingGroups = [
    { label: 'CORE PITCHING', rows: [
      { label: 'ERA', lv: LP['ERA'], rv: RP['ERA'], inverse: true },
      { label: 'WHIP', lv: LP['WHIP'], rv: RP['WHIP'], inverse: true },
      { label: 'W', lv: LP['W'], rv: RP['W'] },
      { label: 'L', lv: LP['L'], rv: RP['L'], inverse: true },
      { label: 'SV', lv: LP['SV'], rv: RP['SV'] },
    ]},
    { label: 'STRIKEOUTS & WALKS', rows: [
      { label: 'SO', lv: LP['SO'], rv: RP['SO'] },
      { label: 'BB', lv: LP['BB'], rv: RP['BB'], inverse: true },
      { label: 'IP', lv: LP['IP'], rv: RP['IP'] },
    ]},
    { label: 'HITS & HR ALLOWED', rows: [
      { label: 'H', lv: LP['H'], rv: RP['H'], inverse: true },
      { label: 'HR', lv: LP['HR'], rv: RP['HR'], inverse: true },
      { label: 'GS', lv: LP['GS'], rv: RP['GS'] },
      { label: 'G', lv: LP['G'], rv: RP['G'] },
    ]},
  ];

  const showStats =
    leftPlayer && rightPlayer && !loadingLeft && !loadingRight &&
    (leftStats?.currentBatting || leftStats?.currentPitching) &&
    (rightStats?.currentBatting || rightStats?.currentPitching);

  const Spinner = ({ c }) => (
    <div style={{ width: 18, height: 18, border: `2px solid #3f3f46`, borderTopColor: c, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );

  const targetColor = searchTarget === 'left' ? leftColor : rightColor;

  return (
    <div className="fixed inset-0 bg-black z-[160] overflow-y-auto" style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}>
      <div style={{ minHeight: '100vh', padding: '48px 16px 56px', maxWidth: 500, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, position: 'sticky', top: 0, zIndex: 50, padding: '12px 0', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          <button onClick={onClose} style={{ color: '#6b7280', fontSize: 26, fontWeight: 300, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>‹</button>
          <h2 style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', margin: 0, color: 'white' }}>Compare Players</h2>
        </div>

        {/* Player Cards */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {loadingLeft ? (
            <div style={{ flex: 1, borderRadius: 14, background: '#0a0a0a', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner c={leftColor} />
            </div>
          ) : (
            <PlayerHeader player={leftPlayer} stats={leftStats} selectedSeason={leftSeason}
              onSeasonChange={handleLeftSeasonChange} side="left" onClear={clearLeft}
              isTarget={searchTarget === 'left' && !leftPlayer} />
          )}

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#6b7280', letterSpacing: '0.08em', fontFamily: 'Rajdhani, sans-serif' }}>VS</span>
          </div>

          {loadingRight ? (
            <div style={{ flex: 1, borderRadius: 14, background: '#0a0a0a', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner c={rightColor} />
            </div>
          ) : (
            <PlayerHeader player={rightPlayer} stats={rightStats} selectedSeason={rightSeason}
              onSeasonChange={handleRightSeasonChange} side="right" onClear={clearRight}
              isTarget={searchTarget === 'right' && !rightPlayer} />
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#0a0a0a', borderRadius: 12, padding: '11px 14px',
            border: `1px solid ${targetColor}33`,
          }}>
            <Search style={{ width: 14, height: 14, color: targetColor, flexShrink: 0, opacity: 0.6 }} />
            <input
              type="text"
              placeholder={searchTarget === 'left' ? 'Searching left slot...' : 'Searching right slot...'}
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              style={{ background: 'transparent', color: 'white', border: 'none', outline: 'none', flex: 1, fontSize: 13, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {['left', 'right'].map(slot => {
                const c = slot === 'left' ? leftColor : rightColor;
                const active = searchTarget === slot;
                return (
                  <button key={slot}
                    onClick={() => { setSearchTarget(slot); setSearchQuery(''); setSearchResults([]); }}
                    style={{
                      fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
                      background: active ? c : 'transparent',
                      border: `1px solid ${active ? c : '#3f3f46'}`,
                      color: active ? 'white' : '#6b7280',
                      fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.06em',
                    }}
                  >{slot === 'left' ? 'L' : 'R'}</button>
                );
              })}
            </div>
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X style={{ width: 13, height: 13, color: '#6b7280' }} />
              </button>
            )}
          </div>

          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: '#0a0a0a', borderRadius: 12, border: '1px solid #27272a',
              maxHeight: 260, overflowY: 'auto', zIndex: 50,
              boxShadow: '0 24px 60px rgba(0,0,0,0.9)',
            }}>
              {searchResults.map((player, i) => (
                <div key={player.idPlayer} onClick={() => selectPlayer(player)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid #18181b' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {player.strThumb ? (
                    <img src={player.strThumb} alt={player.strPlayer} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
                      {player.strPlayer?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'white', fontFamily: 'Rajdhani, sans-serif' }}>{player.strPlayer}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{teamFullNames[player.strTeamAbbr] || player.strTeamAbbr} · {player.strPosition}</div>
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                    background: searchTarget === 'left' ? `${leftColor}22` : `${rightColor}22`,
                    color: searchTarget === 'left' ? leftColor : rightColor,
                    border: `1px solid ${searchTarget === 'left' ? leftColor + '44' : rightColor + '44'}`,
                    fontFamily: 'Rajdhani, sans-serif',
                  }}>
                    {searchTarget === 'left' ? 'L' : 'R'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        {showStats && (
          <div style={{ background: '#0a0a0a', borderRadius: 18, border: '1px solid #27272a', overflow: 'hidden' }}>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', background: '#080808', borderBottom: '1px solid #18181b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: leftColor }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', color: 'white', lineHeight: 1 }}>
                    {leftPlayer.name?.split(' ').slice(-1)[0]}
                  </div>
                  <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginTop: 1 }}>
                    {leftStats?.currentBatting?.displayName || leftStats?.currentPitching?.displayName || ''}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.1em' }}>VS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', color: 'white', lineHeight: 1 }}>
                    {rightPlayer.name?.split(' ').slice(-1)[0]}
                  </div>
                  <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginTop: 1 }}>
                    {rightStats?.currentBatting?.displayName || rightStats?.currentPitching?.displayName || ''}
                  </div>
                </div>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: rightColor }} />
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: '0 20px 18px' }}>
              {hasBatting && battingGroups.map(group => (
                <div key={group.label}>
                  <SectionLabel label={group.label} />
                  {group.rows.map(row => (
                    <StatRow key={row.label} label={row.label} leftVal={row.lv} rightVal={row.rv} inverse={row.inverse} />
                  ))}
                </div>
              ))}
              {hasPitching && pitchingGroups.map(group => (
                <div key={group.label}>
                  <SectionLabel label={group.label} />
                  {group.rows.map(row => (
                    <StatRow key={row.label} label={row.label} leftVal={row.lv} rightVal={row.rv} inverse={row.inverse} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}