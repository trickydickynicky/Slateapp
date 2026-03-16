import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useSwipeBack } from './useSwipeBack';
import { useWebHaptics } from 'web-haptics/react';

const teamColors = {
  'ATL': '#E03A3E', 'BOS': '#007A33', 'BKN': '#000000', 'CHA': '#1D1160',
  'CHI': '#CE1141', 'CLE': '#860038', 'DAL': '#00538C', 'DEN': '#0E2240',
  'DET': '#C8102E', 'GS': '#1D428A', 'HOU': '#CE1141', 'IND': '#002D62',
  'LAC': '#C8102E', 'LAL': '#552583', 'MEM': '#5D76A9', 'MIA': '#98002E',
  'MIL': '#00471B', 'MIN': '#0C2340', 'NO': '#0C2340', 'NY': '#006BB6',
  'OKC': '#007AC1', 'ORL': '#0077C0', 'PHI': '#006BB6', 'PHX': '#1D1160',
  'POR': '#E03A3E', 'SAC': '#5A2D81', 'SA': '#C4CED4', 'TOR': '#CE1141',
  'UTAH': '#002B5C', 'WSH': '#002B5C'
};

const teamFullNames = {
  'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
  'GS': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
  'LAC': 'LA Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies',
  'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves',
  'NO': 'New Orleans Pelicans', 'NY': 'New York Knicks', 'OKC': 'Oklahoma City Thunder',
  'ORL': 'Orlando Magic', 'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SA': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors', 'UTAH': 'Utah Jazz', 'WSH': 'Washington Wizards'
};



const fetchPlayerStats = async (playerName, playerId) => {
  const response = await fetch(
    `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/stats`
  );
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();
  const averagesCategory = data.categories?.find(cat => cat.name === 'averages');
  if (!averagesCategory) throw new Error('No averages data');

  const allSeasons = [];
  const seenYears = new Set();
  averagesCategory.statistics?.forEach(stat => {
    if (!seenYears.has(stat.season.year)) {
      seenYears.add(stat.season.year);
      allSeasons.push({ year: stat.season.year, displayName: stat.season.displayName });
    }
  });
  allSeasons.sort((a, b) => b.year - a.year);

  const allSeasonsData = {};
  averagesCategory.statistics?.forEach(stat => {
    const year = stat.season.year;
    const seasonAllStats = {};
    averagesCategory.labels.forEach((label, index) => {
      const key = label
        .replace(/\%/g, '_pct').replace(/3P/g, 'three_p').replace(/\+\/-/g, 'plus_minus')
        .replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '');
      seasonAllStats[key] = stat.stats[index] || '0';
    });
    if (allSeasonsData[year]) {
      const existing = allSeasonsData[year];
      const gp1 = parseFloat(existing.gp) || 1;
      const gp2 = parseFloat(seasonAllStats.gp) || 1;
      const totalGP = gp1 + gp2;
      const avgStats = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'pf', 'min', 'or', 'dr', 'fg_pct', 'three_p_pct', 'ft_pct'];
      const combined = { ...existing };
      avgStats.forEach(key => {
        if (existing[key] !== undefined && seasonAllStats[key] !== undefined) {
          combined[key] = (((parseFloat(existing[key]) * gp1) + (parseFloat(seasonAllStats[key]) * gp2)) / totalGP).toFixed(1);
        }
      });
      combined.gp = Math.max(parseInt(existing.gp) || 0, parseInt(seasonAllStats.gp) || 0).toString();
      ['fg', 'three_pt', 'ft'].forEach(key => {
        const parts1 = (existing[key] || '0-0').split('-');
        const parts2 = (seasonAllStats[key] || '0-0').split('-');
        const m1 = parseFloat(parts1[0]) || 0, a1 = parseFloat(parts1[1]) || 0;
        const m2 = parseFloat(parts2[0]) || 0, a2 = parseFloat(parts2[1]) || 0;
        combined[key] = `${(((m1 * gp1) + (m2 * gp2)) / totalGP).toFixed(1)}-${(((a1 * gp1) + (a2 * gp2)) / totalGP).toFixed(1)}`;
      });
      allSeasonsData[year] = combined;
    } else {
      allSeasonsData[year] = { year: stat.season.year, displayName: stat.season.displayName, ...seasonAllStats };
    }
  });

  return { playerName, playerId, allSeasons, allSeasonsData, currentSeason: allSeasonsData[allSeasons[0]?.year] };
};

// ── Stat Row ───────────────────────────────────────────────────────────────
const StatRow = ({ label, leftVal, rightVal, inverse = false, isPercent = false, leftColor, rightColor }) => {
  const lv = parseFloat(leftVal) || 0;
  const rv = parseFloat(rightVal) || 0;
  const leftWins = inverse ? lv < rv : lv > rv;
  const rightWins = inverse ? rv < lv : rv > lv;
  const tied = lv === rv;
  const fmt = v => isPercent ? `${v}%` : v;

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #27272a' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
        {leftWins && !tied && (
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', boxShadow: '0 0 6px #3B82F6', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1, color: leftWins && !tied ? 'white' : '#6b7280' }}>
          {fmt(lv)}
        </span>
      </div>
      <div style={{ width: 52, textAlign: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.12em' }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 7 }}>
        <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1, color: rightWins && !tied ? 'white' : '#6b7280' }}>
          {fmt(rv)}
        </span>
        {rightWins && !tied && (
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B82F6', boxShadow: '0 0 6px #3B82F6', flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
};

// ── Section divider ────────────────────────────────────────────────────────
const SectionLabel = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 2 }}>
    <div style={{ flex: 1, height: 1, background: '#3f3f46' }} />
    <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.14em' }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: '#3f3f46' }} />
  </div>
);

// ── Slim player header ─────────────────────────────────────────────────────
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
        <img
          src={player.headshot?.href || player.headshot}
          alt={player.name}
          onError={e => { e.target.src = `https://a.espncdn.com/i/teamlogos/nba/500/${player.teamAbbr}.png`; }}
          style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', border: `1.5px solid ${color}30`, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', color: 'white', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <img src={`https://a.espncdn.com/i/teamlogos/nba/500/${player.teamAbbr}.png`} alt="" style={{ width: 10, height: 10 }} />
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{player.teamAbbr}</span>
          </div>
          {stats?.allSeasons?.length > 0 && (
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
              {stats.allSeasons.map(s => (
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

// ── Main ───────────────────────────────────────────────────────────────────
export default function PlayerComparison({ basePlayer, playerCache, onClose }) {
  const screenRef = useSwipeBack(onClose); // ← add this
  const { trigger } = useWebHaptics();

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
    fetchPlayerStats(basePlayer.name, basePlayer.id)
      .then(data => { setLeftStats(data); setLeftSeason(data.allSeasons[0]?.year); })
      .catch(() => setLeftStats({ error: true }))
      .finally(() => setLoadingLeft(false));
  }, [basePlayer?.id]);

  const handleSearch = q => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) { setSearchResults([]); return; }
    const lq = q.toLowerCase();
    setSearchResults(Object.values(playerCache || {}).filter(p => p.strPlayer?.toLowerCase().includes(lq)).slice(0, 8));
  };

  const selectPlayer = player => {
    setSearchQuery(''); setSearchResults([]);
    const p = {
      id: player.idPlayer, name: player.strPlayer,
      headshot: player.strThumb, teamAbbr: player.strTeamAbbr, position: player.strPosition,
    };

    if (searchTarget === 'left') {
      setLeftPlayer(p);
      setLeftStats(null); setLeftSeason(null);
      setLoadingLeft(true);
      fetchPlayerStats(p.name, p.id)
        .then(data => { setLeftStats(data); setLeftSeason(data.allSeasons[0]?.year); })
        .catch(() => setLeftStats({ error: true }))
        .finally(() => setLoadingLeft(false));
      if (!rightPlayer) setSearchTarget('right');
    } else {
      setRightPlayer(p);
      setRightStats(null); setRightSeason(null);
      setLoadingRight(true);
      fetchPlayerStats(p.name, p.id)
        .then(data => { setRightStats(data); setRightSeason(data.allSeasons[0]?.year); })
        .catch(() => setRightStats({ error: true }))
        .finally(() => setLoadingRight(false));
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
    if (leftStats?.allSeasonsData?.[year]) setLeftStats(prev => ({ ...prev, currentSeason: prev.allSeasonsData[year] }));
  };
  const handleRightSeasonChange = year => {
    setRightSeason(year);
    if (rightStats?.allSeasonsData?.[year]) setRightStats(prev => ({ ...prev, currentSeason: prev.allSeasonsData[year] }));
  };

  const L = leftStats?.currentSeason || {};
  const R = rightStats?.currentSeason || {};

  const calcTS = s => {
    const pts = parseFloat(s.pts) || 0, fga = parseFloat((s.fg || '0-0').split('-')[1]) || 0, fta = parseFloat((s.ft || '0-0').split('-')[1]) || 0;
    return fga + fta > 0 ? ((pts / (2 * (fga + 0.44 * fta))) * 100).toFixed(1) : '0';
  };
  const calcEFG = s => {
    const fgm = parseFloat((s.fg || '0-0').split('-')[0]) || 0, fga = parseFloat((s.fg || '0-0').split('-')[1]) || 0, tpm = parseFloat((s.three_pt || '0-0').split('-')[0]) || 0;
    return fga > 0 ? (((fgm + 0.5 * tpm) / fga) * 100).toFixed(1) : '0';
  };

  const statGroups = [
    { label: 'SCORING', rows: [
      { label: 'PTS', lv: L.pts, rv: R.pts },
      { label: 'FG%', lv: L.fg_pct, rv: R.fg_pct, isPercent: true },
      { label: '3P%', lv: L.three_p_pct, rv: R.three_p_pct, isPercent: true },
      { label: 'FT%', lv: L.ft_pct, rv: R.ft_pct, isPercent: true },
    ]},
    { label: 'PLAYMAKING', rows: [
      { label: 'AST', lv: L.ast, rv: R.ast },
      { label: 'TO', lv: L.to, rv: R.to, inverse: true },
    ]},
    { label: 'REBOUNDING', rows: [
      { label: 'REB', lv: L.reb, rv: R.reb },
      { label: 'OREB', lv: L.or, rv: R.or },
      { label: 'DREB', lv: L.dr, rv: R.dr },
    ]},
    { label: 'DEFENSE', rows: [
      { label: 'STL', lv: L.stl, rv: R.stl },
      { label: 'BLK', lv: L.blk, rv: R.blk },
      { label: 'PF', lv: L.pf, rv: R.pf, inverse: true },
    ]},
    { label: 'AVAILABILITY', rows: [
      { label: 'GP', lv: L.gp, rv: R.gp },
      { label: 'GS', lv: L.gs, rv: R.gs },
      { label: 'MIN', lv: L.min, rv: R.min },
    ]},
    { label: 'ADVANCED', rows: [
      { label: 'TS%', lv: calcTS(L), rv: calcTS(R), isPercent: true },
      { label: 'eFG%', lv: calcEFG(L), rv: calcEFG(R), isPercent: true },
    ]},
  ];

  const showStats = leftPlayer && rightPlayer && !loadingLeft && !loadingRight && leftStats?.currentSeason && rightStats?.currentSeason;

  const Spinner = ({ c }) => (
    <div style={{ width: 18, height: 18, border: `2px solid #3f3f46`, borderTopColor: c, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );

  const searchPlaceholder = searchTarget === 'left' ? 'Searching left slot...' : 'Searching right slot...';
  const targetColor = searchTarget === 'left' ? leftColor : rightColor;

  return (
    <div ref={screenRef} className="fixed inset-0 bg-black z-[160] overflow-y-auto" style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}>
     <div style={{ minHeight: '100vh', padding: '0 16px 56px', maxWidth: 500, margin: '0 auto' }}>

        {/* Header */}
<div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, position: 'sticky', top: 0, zIndex: 50, padding: '12px 0', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
<button onClick={() => { trigger('light'); onClose(); }} style={{ color: '#6b7280', fontSize: 26, fontWeight: 300, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>‹</button>
  <h2 style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', margin: 0, color: 'white' }}>Compare Players</h2>
</div>

        {/* Player Cards */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {/* LEFT */}
          {loadingLeft ? (
            <div style={{ flex: 1, borderRadius: 14, background: '#0a0a0a', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner c={leftColor} />
            </div>
          ) : (
            <PlayerHeader
              player={leftPlayer} stats={leftStats} selectedSeason={leftSeason}
              onSeasonChange={handleLeftSeasonChange} side="left"
              onClear={clearLeft}
              isTarget={searchTarget === 'left' && !leftPlayer}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#6b7280', letterSpacing: '0.08em', fontFamily: 'Rajdhani, sans-serif' }}>VS</span>
          </div>

          {/* RIGHT */}
          {loadingRight ? (
            <div style={{ flex: 1, borderRadius: 14, background: '#0a0a0a', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner c={rightColor} />
            </div>
          ) : (
            <PlayerHeader
              player={rightPlayer} stats={rightStats} selectedSeason={rightSeason}
              onSeasonChange={handleRightSeasonChange} side="right"
              onClear={clearRight}
              isTarget={searchTarget === 'right' && !rightPlayer}
            />
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
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              style={{ background: 'transparent', color: 'white', border: 'none', outline: 'none', flex: 1, fontSize: 13, fontFamily: 'inherit' }}
            />
            {/* Slot toggle buttons */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => { setSearchTarget('left'); setSearchQuery(''); setSearchResults([]); }}
                style={{
                  fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
                  background: searchTarget === 'left' ? leftColor : 'transparent',
                  border: `1px solid ${searchTarget === 'left' ? leftColor : '#3f3f46'}`,
                  color: searchTarget === 'left' ? 'white' : '#6b7280',
                  fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.06em',
                }}
              >L</button>
              <button
                onClick={() => { setSearchTarget('right'); setSearchQuery(''); setSearchResults([]); }}
                style={{
                  fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
                  background: searchTarget === 'right' ? rightColor : 'transparent',
                  border: `1px solid ${searchTarget === 'right' ? rightColor : '#3f3f46'}`,
                  color: searchTarget === 'right' ? 'white' : '#6b7280',
                  fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.06em',
                }}
              >R</button>
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
                <div
                  key={player.idPlayer}
                  onClick={() => selectPlayer(player)}
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
                  {/* Slot indicator in dropdown */}
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
        {showStats ? (
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
                    {leftStats?.currentSeason?.displayName || ''}
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
                    {rightStats?.currentSeason?.displayName || ''}
                  </div>
                </div>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: rightColor }} />
              </div>
            </div>

            {/* Rows */}
            <div style={{ padding: '0 20px 18px' }}>
              {statGroups.map(group => (
                <div key={group.label}>
                  <SectionLabel label={group.label} />
                  {group.rows.map(row => (
                    <StatRow key={row.label} label={row.label} leftVal={row.lv} rightVal={row.rv} inverse={row.inverse} isPercent={row.isPercent} leftColor={leftColor} rightColor={rightColor} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}