import React, { useState, useEffect, useRef } from 'react';
import { Search, Star } from 'lucide-react';


export default function MLBApp({ sport, setSport }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  const [standings, setStandings] = useState({ american: [], national: [] });
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState('American');
  const [selectedTeamInfo, setSelectedTeamInfo] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [loadingTeamStats, setLoadingTeamStats] = useState(false);
  const [navigationStack, setNavigationStack] = useState([]);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [slideDirection, setSlideDirection] = useState('right');
  const [showSearch, setShowSearch] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [selectedTeamTab, setSelectedTeamTab] = useState('away');
  const [favoriteTeams, setFavoriteTeams] = useState(() => {
    const saved = localStorage.getItem('mlbFavoriteTeams');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedNBAPlayer, setSelectedNBAPlayer] = useState(null);
  const gameDetailScrollRef = useRef(null);
  const [leagueRankings, setLeagueRankings] = useState(() => {
    const cached = localStorage.getItem('mlbLeagueRankings');
    const cacheTime = localStorage.getItem('mlbLeagueRankings_time');
    const now = Date.now();
    if (cached && cacheTime && (now - parseInt(cacheTime)) < 86400000) {
      return JSON.parse(cached);
    }
    return null;
  });

  const teamFullNames = {
    'ARI': 'Arizona Diamondbacks',
    'ATL': 'Atlanta Braves',
    'BAL': 'Baltimore Orioles',
    'BOS': 'Boston Red Sox',
    'CHC': 'Chicago Cubs',
    'CWS': 'Chicago White Sox',
    'CIN': 'Cincinnati Reds',
    'CLE': 'Cleveland Guardians',
    'COL': 'Colorado Rockies',
    'DET': 'Detroit Tigers',
    'HOU': 'Houston Astros',
    'KC': 'Kansas City Royals',
    'LAA': 'Los Angeles Angels',
    'LAD': 'Los Angeles Dodgers',
    'MIA': 'Miami Marlins',
    'MIL': 'Milwaukee Brewers',
    'MIN': 'Minnesota Twins',
    'NYM': 'New York Mets',
    'NYY': 'New York Yankees',
    'OAK': 'Oakland Athletics',
    'PHI': 'Philadelphia Phillies',
    'PIT': 'Pittsburgh Pirates',
    'SD': 'San Diego Padres',
    'SF': 'San Francisco Giants',
    'SEA': 'Seattle Mariners',
    'STL': 'St. Louis Cardinals',
    'TB': 'Tampa Bay Rays',
    'TEX': 'Texas Rangers',
    'TOR': 'Toronto Blue Jays',
    'WSH': 'Washington Nationals',
  };

  const teamColors = {
    'ARI': '#A71930',
    'ATL': '#CE1141',
    'BAL': '#DF4601',
    'BOS': '#BD3039',
    'CHC': '#0E3386',
    'CWS': '#27251F',
    'CIN': '#C6011F',
    'CLE': '#00385D',
    'COL': '#33006F',
    'DET': '#0C2340',
    'HOU': '#002D62',
    'KC': '#004687',
    'LAA': '#BA0021',
    'LAD': '#005A9C',
    'MIA': '#00A3E0',
    'MIL': '#FFC52F',
    'MIN': '#002B5C',
    'NYM': '#002D72',
    'NYY': '#0C2340',
    'OAK': '#003831',
    'PHI': '#E81828',
    'PIT': '#FDB827',
    'SD': '#2F241D',
    'SF': '#FD5A1E',
    'SEA': '#0C2C56',
    'STL': '#C41E3A',
    'TB': '#092C5C',
    'TEX': '#003278',
    'TOR': '#134A8E',
    'WSH': '#AB0003',
  };

  const teamCities = {
    'ARI': 'Arizona', 'ATL': 'Atlanta', 'BAL': 'Baltimore', 'BOS': 'Boston',
    'CHC': 'Chicago', 'CWS': 'Chi. Sox', 'CIN': 'Cincinnati', 'CLE': 'Cleveland',
    'COL': 'Colorado', 'DET': 'Detroit', 'HOU': 'Houston', 'KC': 'Kansas City',
    'LAA': 'LA Angels', 'LAD': 'LA Dodgers', 'MIA': 'Miami', 'MIL': 'Milwaukee',
    'MIN': 'Minnesota', 'NYM': 'NY Mets', 'NYY': 'NY Yankees', 'OAK': 'Oakland',
    'PHI': 'Philadelphia', 'PIT': 'Pittsburgh', 'SD': 'San Diego', 'SF': 'San Francisco',
    'SEA': 'Seattle', 'STL': 'St. Louis', 'TB': 'Tampa Bay', 'TEX': 'Texas',
    'TOR': 'Toronto', 'WSH': 'Washington',
  };

  const espnTeamIds = {
    'ARI': '29', 'ATL': '15', 'BAL': '1', 'BOS': '2', 'CHC': '16',
    'CWS': '4', 'CIN': '17', 'CLE': '5', 'COL': '27', 'DET': '6',
    'HOU': '18', 'KC': '7', 'LAA': '3', 'LAD': '19', 'MIA': '28',
    'MIL': '21', 'MIN': '9', 'NYM': '21', 'NYY': '10', 'OAK': '11',
    'PHI': '22', 'PIT': '23', 'SD': '25', 'SF': '26', 'SEA': '12',
    'STL': '24', 'TB': '30', 'TEX': '13', 'TOR': '14', 'WSH': '20',
  };

  // Swipe to go back
  useEffect(() => {
    const cameFromHome = navigationStack.length > 0 &&
      navigationStack[navigationStack.length - 1].type === 'home';

    if (!selectedGame || !cameFromHome || selectedTeamInfo || selectedNBAPlayer) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      if (touchStartX < 100) isSwiping = true;
    };
    const handleTouchMove = (e) => {
      if (!isSwiping) return;
      const currentX = e.changedTouches[0].screenX;
      const deltaX = currentX - touchStartX;
      const deltaY = Math.abs(e.changedTouches[0].screenY - touchStartY);
      if (deltaX > 0 && deltaX > deltaY) setSwipeOffset(deltaX);
    };
    const handleTouchEnd = (e) => {
      if (!isSwiping) return;
      const swipeDistance = e.changedTouches[0].screenX - touchStartX;
      if (swipeDistance > 50) {
        setSwipeOffset(window.innerWidth);
        setTimeout(() => {
          setSelectedGame(null);
          setGameDetails(null);
          setNavigationStack([]);
          setSwipeOffset(0);
        }, 300);
      } else {
        setSwipeOffset(0);
      }
      isSwiping = false;
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [selectedGame, navigationStack, selectedTeamInfo, selectedNBAPlayer]);

  useEffect(() => {
    fetchLiveScores();
    fetchLeagueRankings();
    const interval = setInterval(fetchLiveScores, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchLiveScores();
        if (selectedGame) fetchGameDetails(selectedGame.id);
        if (showStandings && standings.american.length > 0) fetchStandings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [selectedGame, showStandings, standings.american.length]);

  const fetchLiveScores = async () => {
    try {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;

      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`
      );
      const data = await response.json();
     

      const games = data.events.map(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        const situation = competition.situation || {};

        return {
          id: event.id,
          homeTeam: homeTeam.team.abbreviation,
          awayTeam: awayTeam.team.abbreviation,
          homeScore: homeTeam.score || '0',
          awayScore: awayTeam.score || '0',
          homeRecord: homeTeam.records?.[0]?.summary || '',
          awayRecord: awayTeam.records?.[0]?.summary || '',
          status: event.status.type.description,
          period: event.status.period,    // inning number
          clock: event.status.displayClock,
          isLive: event.status.type.state === 'in',
          isPreGame: event.status.type.state === 'pre',
          isFinal: event.status.type.state === 'post',
          gameTime: event.date,
          homeLogo: homeTeam.team.logo,
          awayLogo: awayTeam.team.logo,
          // Baseball-specific
          inning: event.status.period,
          isTopInning: situation.isTopInning ?? null,
          balls: situation.balls ?? null,
          strikes: situation.strikes ?? null,
          outs: situation.outs ?? null,
          onFirst: situation.onFirst ?? false,
          onSecond: situation.onSecond ?? false,
          onThird: situation.onThird ?? false,
          broadcast: (() => {
            const broadcasts = competition.broadcasts || [];
            for (const b of broadcasts) {
              for (const name of (b.names || [])) {
                if (name && name !== 'MLB.TV') return name;
              }
            }
            return null;
          })(),
          allBroadcasts: competition.broadcasts?.flatMap(b => b.names || []).filter(n => n) || [],
        };
      });

      const sortedGames = games.sort((a, b) => {
        const aFav = favoriteTeams.includes(a.homeTeam) || favoriteTeams.includes(a.awayTeam);
        const bFav = favoriteTeams.includes(b.homeTeam) || favoriteTeams.includes(b.awayTeam);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.isPreGame && !b.isPreGame && !b.isLive) return -1;
        if (!a.isPreGame && b.isPreGame && !a.isLive) return 1;
        return 0;
      });

      setLiveGames(sortedGames);
      setLoading(false);
      setAppReady(true);
      setSelectedGame(prev => {
        if (!prev) return prev;
        const updated = sortedGames.find(g => g.id === prev.id);
        return updated ? { ...prev, ...updated } : prev;
      });
    } catch (error) {
      console.error('Error fetching MLB scores:', error);
      setLoading(false);
    }
  };

  const fetchGameDetails = async (gameId) => {
    setLoadingDetails(prev => gameDetails ? false : true);
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}`
      );
      const data = await response.json();
      console.log('=== MLB BOXSCORE PLAYERS ===', JSON.stringify(data.boxscore?.players, null, 2));

      const scrollPos = gameDetailScrollRef.current?.scrollTop || 0;
      setGameDetails(prev => {
        if (!prev) return data;
        return {
          ...prev,
          boxscore: data.boxscore,
          header: data.header,
          plays: data.plays,
          linescore: data.linescore,
        };
      });
      setTimeout(() => {
        if (gameDetailScrollRef.current) gameDetailScrollRef.current.scrollTop = scrollPos;
      }, 100);
    } catch (error) {
      console.error('Error fetching game details:', error);
    }
    setLoadingDetails(false);
  };

  const fetchStandings = async () => {
    setLoadingStandings(true);
    try {
      const response = await fetch(
        'https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings'
      );
      const data = await response.json();

      const american = [];
      const national = [];

      data.children?.forEach(league => {
        const isAL = league.name?.includes('American');
        data.children?.forEach(() => {}); // noop

        league.children?.forEach(division => {
          division.standings?.entries?.forEach(entry => {
            const team = entry.team;
            const getStat = (name) =>
              entry.stats?.find(s => s.name === name)?.displayValue || '-';

            const obj = {
              rank: parseInt(getStat('divisionRank') || '99'),
              team: team.abbreviation,
              logo: team.logos?.[0]?.href,
              division: division.name?.replace(' Division', '') || '',
              gb: getStat('gamesBehind'),
              wins: getStat('wins'),
              losses: getStat('losses'),
              pct: getStat('winPercent'),
              l10: getStat('Last Ten Games'),
              streak: getStat('streak'),
              home: getStat('Home'),
              away: getStat('Road'),
              rs: getStat('avgRuns') || getStat('runsScored'),
              ra: getStat('runsScoredAgainst') || getStat('runsAllowed'),
            };

            if (isAL) american.push(obj);
            else national.push(obj);
          });
        });
      });

      // Sort by wins descending within division grouping
      const sortByWins = arr => [...arr].sort((a, b) =>
        parseInt(b.wins) - parseInt(a.wins)
      );

      setStandings({ american: sortByWins(american), national: sortByWins(national) });
    } catch (error) {
      console.error('Error fetching MLB standings:', error);
    }
    setLoadingStandings(false);
  };

  const fetchTeamStats = async (teamAbbr) => {
    setLoadingTeamStats(true);
    try {
        const [standingsRes, teamsRes] = await Promise.all([
            fetch('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings'),
            fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams')
          ]);
          const standingsData = await standingsRes.json();
          console.log('=== STANDINGS KEYS ===', JSON.stringify(Object.keys(standingsData), null, 2));
console.log('=== STANDINGS CHILDREN ===', JSON.stringify(standingsData.children?.[0], null, 2));
const teamsData = await teamsRes.json();

const teamEntry = teamsData.sports?.[0]?.leagues?.[0]?.teams?.find(
    t => t.team.abbreviation === teamAbbr
  );
  let teamId = teamEntry?.team?.id || null;
  console.log('teamsData structure:', JSON.stringify(Object.keys(teamsData), null, 2));
  console.log('teamEntry:', JSON.stringify(teamEntry, null, 2));
  console.log('teamId:', teamId);
  let teamRecord = null;

const teamRecordsMap = {};
          standingsData.children?.forEach(league => {
            league.children?.forEach(division => {
              division.standings?.entries?.forEach(entry => {
                const abbr = entry.team.abbreviation;
                const w = entry.stats?.find(s => s.name === 'wins')?.displayValue || '0';
                const l = entry.stats?.find(s => s.name === 'losses')?.displayValue || '0';
                teamRecordsMap[abbr] = `${w}-${l}`;
              });
            });
          });
          
          standingsData.children?.forEach(league => {
            league.children?.forEach(division => {
              const entry = division.standings?.entries?.find(
                e => e.team.abbreviation === teamAbbr
              );
              if (entry) {
                if (!teamId) teamId = entry.team.id;
            const getStat = (name) =>
              entry.stats?.find(s => s.name === name)?.displayValue || '-';
            teamRecord = {
              wins: getStat('wins'),
              losses: getStat('losses'),
              pct: getStat('winPercent'),
              gb: getStat('gamesBehind'),
              home: getStat('Home'),
              away: getStat('Road'),
              l10: getStat('Last Ten Games'),
              streak: getStat('streak'),
              rs: getStat('runsScored'),
              ra: getStat('runsScoredAgainst') || getStat('runsAllowed'),
              division: division.name?.replace(' Division', '') || '',
            };
          }
        });
      });

      console.log('teamRecordsMap:', teamRecordsMap);
console.log('looking for:', teamAbbr);
console.log('teamId found:', teamId);
if (!teamId) throw new Error('Team not found');

      const [statsRes, scheduleRes] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamId}/statistics`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamId}/schedule`),
      ]);

      const statsData = await statsRes.json();
console.log('=== MLB BATTING STATS ===', JSON.stringify(statsData.results?.stats?.categories?.find(c => c.name === 'batting')?.stats?.map(s => s.name), null, 2));
console.log('=== MLB PITCHING STATS ===', JSON.stringify(statsData.results?.stats?.categories?.find(c => c.name === 'pitching')?.stats?.map(s => s.name), null, 2));
console.log('=== MLB FIELDING STATS ===', JSON.stringify(statsData.results?.stats?.categories?.find(c => c.name === 'fielding')?.stats?.map(s => s.name), null, 2));
console.log('=== STANDINGS ENTRY ===', JSON.stringify(standingsData.children?.[0]?.children?.[0]?.standings?.entries?.[0]?.stats?.map(s => s.name), null, 2));
const scheduleData = await scheduleRes.json();
console.log('=== SCHEDULE FIRST COMPLETED ===', JSON.stringify(scheduleData.events?.filter(e => e.competitions?.[0]?.status?.type?.completed)?.[0]?.competitions?.[0]?.competitors, null, 2));

      const recentGames = scheduleData.events
        ?.filter(e => e.competitions?.[0]?.status?.type?.completed)
        .slice(-10)
        .map(event => {
          try {
            const comp = event.competitions[0];
            const teamComp = comp.competitors.find(c => c.team?.id === teamId);
            const oppComp = comp.competitors.find(c => c.team?.id !== teamId);
            if (!teamComp || !oppComp) return null;
            const isHome = teamComp.homeAway === 'home';
            const teamScoreVal = parseInt(teamComp.score?.value ?? teamComp.score) || 0;
const oppScoreVal = parseInt(oppComp.score?.value ?? oppComp.score) || 0;
            return {
              gameId: event.id,
              opponent: oppComp.team.abbreviation,
              opponentLogo: oppComp.team.logo || oppComp.team.logos?.[0]?.href,
              teamAbbr: teamComp.team.abbreviation,
              teamLogo: teamComp.team.logo || teamComp.team.logos?.[0]?.href,
              isHome,
              differential: teamScoreVal - oppScoreVal,
              teamScore: teamScoreVal,
              opponentScore: oppScoreVal,
            };
          } catch { return null; }
        })
        .filter(Boolean) || [];

      const upcomingGames = scheduleData.events
        ?.filter(e => !e.competitions?.[0]?.status?.type?.completed)
        .map(event => {
          try {
            const comp = event.competitions[0];
            const teamComp = comp.competitors.find(c => c.team?.id === teamId);
            const oppComp = comp.competitors.find(c => c.team?.id !== teamId);
            if (!teamComp || !oppComp) return null;
            const isHome = teamComp.homeAway === 'home';
            const opponentAbbr = oppComp.team.abbreviation;
            return {
              gameId: event.id,
              opponent: opponentAbbr,
              opponentLogo: oppComp.team.logo || oppComp.team.logos?.[0]?.href,
              opponentRecord: teamRecordsMap[opponentAbbr] || null,
              isHome,
              date: event.date,
              time: new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              broadcast: (() => {
                for (const b of comp.broadcasts || []) {
                  for (const name of (b.names || [])) {
                    if (name && name !== 'MLB.TV') return name;
                  }
                }
                return null;
              })(),
            };
          } catch { return null; }
        })
        .filter(Boolean) || [];

      setTeamStats({
        record: teamRecord,
        stats: statsData.results?.stats?.categories || [],
        recentGames,
        upcomingGames,
      });
    } catch (error) {
        console.error('Error fetching MLB team stats:', error);
        console.log('teamId was:', teamId);
        console.log('teamAbbr was:', teamAbbr);
        setTeamStats(null);
      }
    setLoadingTeamStats(false);
  };

  const fetchLeagueRankings = async () => {
    const cacheTime = localStorage.getItem('mlbLeagueRankings_time');
    const now = Date.now();
    if (cacheTime && (now - parseInt(cacheTime)) < 86400000) return;

    const allTeamStats = {};
    const teamAbbrs = Object.keys(espnTeamIds);

    for (let i = 0; i < teamAbbrs.length; i += 5) {
      const batch = teamAbbrs.slice(i, i + 5);
      await Promise.all(batch.map(async (abbr) => {
        try {
          const id = espnTeamIds[abbr];
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${id}/statistics`);
          const data = await res.json();
          const bat = data.results?.stats?.categories?.find(c => c.name === 'batting');
          const pit = data.results?.stats?.categories?.find(c => c.name === 'pitching');
          const fld = data.results?.stats?.categories?.find(c => c.name === 'fielding');
          const getStat = (cat, name) => {
            const stat = cat?.stats?.find(s => s.name === name);
            return stat ? parseFloat(stat.displayValue) : null;
          };
          allTeamStats[abbr] = {
            avg: getStat(bat, 'avg'),
            obp: getStat(bat, 'onBasePct'),
            slg: getStat(bat, 'slugAvg'),
            ops: getStat(bat, 'OPS'),
            hr: getStat(bat, 'homeRuns'),
            rbi: getStat(bat, 'RBIs'),
            sb: getStat(bat, 'stolenBases'),
            so_bat: getStat(bat, 'strikeouts'),
            era: getStat(pit, 'ERA'),
            whip: getStat(pit, 'WHIP'),
            k9: getStat(pit, 'strikeoutsPerNineInnings'),
            bb9: getStat(pit, 'walksPerNineInnings'),
            saves: getStat(pit, 'saves'),
            qs: getStat(pit, 'qualityStarts'),
            fpct: getStat(fld, 'fieldingPct'),
            errors: getStat(fld, 'errors'),
          };
        } catch (err) {
          console.error(`Error fetching MLB stats for ${abbr}:`, err);
        }
      }));
    }

    const rankings = {};
    const statKeys = {
      avg: false, obp: false, slg: false, ops: false,
      hr: false, rbi: false, sb: false, so_bat: true,
      era: true, whip: true, k9: false, bb9: true,
      saves: false, qs: false, fpct: false, errors: true,
    };

    Object.keys(statKeys).forEach(stat => {
      const inverse = statKeys[stat];
      const sorted = Object.entries(allTeamStats)
        .filter(([, s]) => s[stat] !== null)
        .sort((a, b) => inverse ? a[1][stat] - b[1][stat] : b[1][stat] - a[1][stat]);
      sorted.forEach(([abbr], idx) => {
        if (!rankings[abbr]) rankings[abbr] = {};
        rankings[abbr][stat] = idx + 1;
      });
    });

    localStorage.setItem('mlbLeagueRankings', JSON.stringify(rankings));
    localStorage.setItem('mlbLeagueRankings_time', now.toString());
    setLeagueRankings(rankings);
  };

  const toggleFavorite = (teamAbbr) => {
    setFavoriteTeams(prev => {
      const next = prev.includes(teamAbbr) ? prev.filter(t => t !== teamAbbr) : [...prev, teamAbbr];
      localStorage.setItem('mlbFavoriteTeams', JSON.stringify(next));
      return next;
    });
  };

  const handleGameClick = (game) => {
    console.log('GAME CLICKED:', game.id);

    setNavigationStack(prev => [...prev, { type: 'home' }]);
    setSlideDirection('right');
    setSelectedGame(game);
    setSelectedTeamTab('away');
    fetchGameDetails(game.id);
  };

  const closeModal = () => {
    setSlideDirection('left');
    if (navigationStack.length > 0) {
      const previous = navigationStack[navigationStack.length - 1];
      setNavigationStack(prev => prev.slice(0, -1));
      if (previous.type === 'teamStats') {
        setSelectedTeamInfo(previous.teamInfo);
        setTeamStats(null);
        fetchTeamStats(previous.teamInfo.abbr);
        setTimeout(() => { setSelectedGame(null); setGameDetails(null); }, 50);
      } else {
        setSelectedGame(null);
        setGameDetails(null);
      }
    } else {
      setSelectedGame(null);
      setGameDetails(null);
    }
  };

  const handleTeamClick = (teamAbbr, teamLogo) => {
    if (selectedGame) {
      setNavigationStack(prev => [...prev, { type: 'game', data: selectedGame, details: gameDetails }]);
    }
    setSlideDirection('right');
    setSelectedTeamInfo({ abbr: teamAbbr, logo: teamLogo });
    setShowAllUpcoming(false);
    fetchTeamStats(teamAbbr);
  };

  const closeTeamModal = () => {
    setSlideDirection('left');
    if (navigationStack.length > 0) {
      const previous = navigationStack[navigationStack.length - 1];
      setNavigationStack(prev => prev.slice(0, -1));
      if (previous.type === 'game') {
        setSelectedGame(previous.data);
        setGameDetails(previous.details);
        setTimeout(() => { setSelectedTeamInfo(null); setTeamStats(null); }, 50);
      } else {
        setSelectedTeamInfo(null);
        setTeamStats(null);
      }
    } else {
      setSelectedTeamInfo(null);
      setTeamStats(null);
    }
  };

  const handleRecentGameClick = (recentGame) => {
    setNavigationStack(prev => [...prev, { type: 'teamStats', teamInfo: selectedTeamInfo }]);
    setSlideDirection('right');
    setSelectedTeamInfo(null);
    setTeamStats(null);
    const gameObj = {
      id: recentGame.gameId,
      awayTeam: recentGame.isHome ? recentGame.opponent : recentGame.teamAbbr,
      homeTeam: recentGame.isHome ? recentGame.teamAbbr : recentGame.opponent,
      awayLogo: recentGame.isHome ? recentGame.opponentLogo : recentGame.teamLogo,
      homeLogo: recentGame.isHome ? recentGame.teamLogo : recentGame.opponentLogo,
      awayScore: String(recentGame.isHome ? recentGame.opponentScore : recentGame.teamScore),
      homeScore: String(recentGame.isHome ? recentGame.teamScore : recentGame.opponentScore),
      awayRecord: '', homeRecord: '',
      isFinal: true, isPreGame: false, isLive: false,
    };
    setSelectedGame(gameObj);
    fetchGameDetails(recentGame.gameId);
  };

  const formatDate = () => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const now = new Date();
    return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  };

  const formatGameTime = (dateString) => {
    const d = new Date(dateString);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dh = h % 12 || 12;
    const dm = m < 10 ? `0${m}` : m;
    return `${dh}:${dm} ${ampm}`;
  };

  const abbreviateChannel = (ch) => {
    if (!ch) return null;
    const map = {
      'ESPN': 'ESPN', 'ESPN2': 'ESPN2', 'FOX': 'FOX', 'FS1': 'FS1', 'FS2': 'FS2',
      'TBS': 'TBS', 'MLB Network': 'MLBN', 'Apple TV+': 'ATVP', 'Peacock': 'PEA',
      'Amazon Prime': 'AMZN', 'NBC Sports': 'NBCS', 'CBS Sports': 'CBSS',
    };
    if (map[ch]) return map[ch];
    if (ch.length <= 5) return ch;
    return ch.split(' ').map(w => w[0].toUpperCase()).join('');
  };

  const getOrdinalSuffix = (n) => {
    const j = n % 10, k = n % 100;
    if (j === 1 && k !== 11) return n + 'st';
    if (j === 2 && k !== 12) return n + 'nd';
    if (j === 3 && k !== 13) return n + 'rd';
    return n + 'th';
  };

  const generateDateRange = () => {
    const dates = [];
    const today = new Date();
    for (let i = -3; i <= 10; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const formatDateHeader = (date) => ({
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: date.getDate(),
    dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
  });

  const isSameDay = (d1, d2) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  // Baseball base runners visual
  const BasesDisplay = ({ onFirst, onSecond, onThird }) => (
    <div className="relative w-5 h-5 flex-shrink-0">
      <div className={`absolute w-1.5 h-1.5 ${onSecond ? 'bg-yellow-400' : 'bg-zinc-700'}`}
        style={{ top: 0, left: '50%', transform: 'translateX(-50%) rotate(45deg)' }} />
      <div className={`absolute w-1.5 h-1.5 ${onThird ? 'bg-yellow-400' : 'bg-zinc-700'}`}
        style={{ bottom: '25%', left: 0, transform: 'rotate(45deg)' }} />
      <div className={`absolute w-1.5 h-1.5 ${onFirst ? 'bg-yellow-400' : 'bg-zinc-700'}`}
        style={{ bottom: '25%', right: 0, transform: 'rotate(45deg)' }} />
    </div>
  );

  // Count display (balls-strikes-outs)
  const CountDisplay = ({ balls, strikes, outs }) => (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-500">{balls}-{strikes}</span>
      <div className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < outs ? 'bg-orange-400' : 'bg-zinc-700'}`} />
        ))}
      </div>
    </div>
  );

  // Inning display
  const InningDisplay = ({ inning, isTopInning, clock }) => {
    const half = isTopInning ? '▲' : '▼';
    return (
      <span className="text-gray-400 text-xs">
        {half} {getOrdinalSuffix(inning)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>


      <div className="px-4 pt-12 pb-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-1"
          style={{ animation: 'dropIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <div>
            <img src="/slate-logo.png" alt="Slate" className="h-8" />
          </div>
        </div>

        <div className="flex justify-between items-center mt-2 mb-4"
          style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both' }}>
          <p className="text-gray-400 text-sm">{formatDate()}</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSearch(true)} className="text-gray-400 hover:text-white">
              <Search className="w-5 h-5" />
            </button>
            <button onClick={() => setShowFavorites(true)} className="text-gray-400 hover:text-white">
              <Star className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setShowStandings(true); if (standings.american.length === 0) fetchStandings(); }}
              className="text-blue-500 font-semibold text-sm hover:text-blue-400"
            >
              Standings
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="mt-2 relative bg-zinc-900 rounded-xl px-4 py-3 flex items-center">
            <Search className="w-5 h-5 text-gray-400 mr-3" />
            <input
              type="text"
              placeholder="Search for teams..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              className="bg-transparent text-white placeholder-gray-400 outline-none flex-1"
            />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-gray-400 hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* Date Picker */}
        {!selectedGame && !showStandings && !selectedTeamInfo && !selectedNBAPlayer && !showFavorites && !showSearch && (
            <div className="flex mb-1" style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both' }}>
            <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
      {['NBA', 'MLB'].map(s => (
        <button key={s} onClick={() => setSport(s)}
          className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${
            sport === s
              ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]'
              : 'text-gray-400'
          }`}>{s}</button>
      ))}
    </div>
  </div>
)}
<div className="mt-2 overflow-x-auto scrollbar-hide py-4"
          style={{ animation: 'fadeUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
          <div className="flex gap-2">
            {generateDateRange().map((date, idx) => {
              const { month, day, dayOfWeek } = formatDateHeader(date);
              const isSelected = isSameDay(date, selectedDate);
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(date)}
                  className={`flex flex-col items-center px-4 py-2 rounded-xl min-w-[70px] transition-all ${
                    isSelected ? 'bg-blue-600 shadow-[0_0_25px_rgba(37,99,235,0.7)]' : 'bg-zinc-900'
                  }`}
                >
                  <span className="text-xs text-gray-400 whitespace-nowrap">{month} {day}</span>
                  <span className={`text-base font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{dayOfWeek}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Game Cards Grid */}
      <div className="px-4 -mt-3 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            <>
              {[0.32, 0.39, 0.46, 0.53].map((delay, i) => (
                <div key={i} className="bg-zinc-900 rounded-2xl p-3"
                  style={{ animation: `fadeUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s both` }}>
                  <div className="skeleton h-3 w-2/5 mb-3" />
                  <div className="flex items-center gap-2 mb-3">
                    <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="skeleton h-3 w-1/2" />
                    <div className="skeleton h-8 w-10 rounded-lg ml-auto" />
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="skeleton h-3 w-2/5" />
                    <div className="skeleton h-8 w-10 rounded-lg ml-auto" />
                  </div>
                  <div className="skeleton h-2 w-full mt-2" />
                </div>
              ))}
            </>
          ) : liveGames.length === 0 ? (
            <div className="col-span-2 bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
              No games scheduled
            </div>
          ) : (
            liveGames.map((game, index) => (
              <div
                key={game.id}
                className={`bg-zinc-900 rounded-2xl p-3 cursor-pointer hover:bg-zinc-800 transition-colors ${
                  game.isLive ? 'border-2 border-blue-500' : ''
                }`}
                onClick={() => handleGameClick(game)}
                style={{ animation: `fadeIn 0.5s ease-out ${0.1 + index * 0.07}s both`, opacity: 0 }}
              >
                <div className="flex flex-col">
                  {/* Status Row */}
                  <div className="mb-2">
                    {game.isLive && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-red-500 text-xs font-semibold">LIVE</span>
                          <InningDisplay inning={game.inning} isTopInning={game.isTopInning} />
                        </div>
                        {/* Bases + Count */}
                        <div className="flex items-center gap-2">
                          {game.balls !== null && (
                            <CountDisplay balls={game.balls} strikes={game.strikes} outs={game.outs} />
                          )}
                          <BasesDisplay onFirst={game.onFirst} onSecond={game.onSecond} onThird={game.onThird} />
                        </div>
                      </div>
                    )}
                    {game.isPreGame && (
                      <div className="text-gray-400 text-xs">
                        {formatGameTime(game.gameTime)}{game.broadcast && ` • ${abbreviateChannel(game.broadcast)}`}
                      </div>
                    )}
                    {game.isFinal && (
                      <div className="text-gray-300 text-xs font-semibold">FINAL</div>
                    )}
                  </div>

                  {/* Teams + Scores */}
                  <div className="space-y-1 mb-3">
                    {/* Away */}
                    <div className={`flex items-center justify-between ${
                      game.isFinal && parseInt(game.awayScore) > parseInt(game.homeScore)
                        ? 'border-l-2 border-blue-500 -ml-3 pl-3' : ''
                    }`}>
                      <div className="flex items-center gap-2">
                        <img src={game.awayLogo} alt={game.awayTeam} className="w-8 h-8" />
                        <div className="flex flex-col">
                          <span className={`font-semibold text-sm ${favoriteTeams.includes(game.awayTeam) ? 'text-blue-500' : ''}`}>
                            {game.awayTeam}
                          </span>
                          {game.awayRecord && <span className="text-xs text-gray-400">{game.awayRecord}</span>}
                        </div>
                      </div>
                      {!game.isPreGame && (
                        <span className={`text-3xl font-bold ${
                          parseInt(game.awayScore) > parseInt(game.homeScore) ? 'text-white'
                          : parseInt(game.awayScore) < parseInt(game.homeScore) ? 'text-gray-500'
                          : 'text-white'
                        }`}>{game.awayScore}</span>
                      )}
                    </div>

                    {/* Home */}
                    <div className={`flex items-center justify-between ${
                      game.isFinal && parseInt(game.homeScore) > parseInt(game.awayScore)
                        ? 'border-l-2 border-blue-500 -ml-3 pl-3' : ''
                    }`}>
                      <div className="flex items-center gap-2">
                        <img src={game.homeLogo} alt={game.homeTeam} className="w-8 h-8" />
                        <div className="flex flex-col">
                          <span className={`font-semibold text-sm ${favoriteTeams.includes(game.homeTeam) ? 'text-blue-500' : ''}`}>
                            {game.homeTeam}
                          </span>
                          {game.homeRecord && <span className="text-xs text-gray-400">{game.homeRecord}</span>}
                        </div>
                      </div>
                      {!game.isPreGame && (
                        <span className={`text-3xl font-bold ${
                          parseInt(game.homeScore) > parseInt(game.awayScore) ? 'text-white'
                          : parseInt(game.homeScore) < parseInt(game.awayScore) ? 'text-gray-500'
                          : 'text-white'
                        }`}>{game.homeScore}</span>
                      )}
                    </div>
                  </div>

                  {/* Pitching matchup for pre-game */}
                  {game.isPreGame && (
                    <div className="text-xs text-gray-600 border-t border-zinc-800 pt-2">⚾ MLB</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── STANDINGS ── */}
      {showStandings && (
        <div className="fixed inset-0 bg-black bg-opacity-100 z-[150] overflow-y-auto"
          style={{ animation: 'slideInRight 0.3s ease-out' }}>
          <div className="min-h-screen px-4 pt-12 pb-8">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center mb-6">
                <button onClick={() => setShowStandings(false)}
                  className="text-gray-400 hover:text-white text-2xl font-light mr-4">‹</button>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>MLB Standings</h2>
              </div>

              <div className="flex gap-2 mb-6">
                {['American', 'National'].map(lg => (
                  <button key={lg} onClick={() => setSelectedLeague(lg)}
                    className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
                      selectedLeague === lg ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
                    }`}>{lg} League</button>
                ))}
              </div>

              {loadingStandings ? (
                <div className="text-center py-12 text-gray-400">Loading standings...</div>
              ) : (
                <div className="bg-zinc-900 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-800 sticky top-0">
                        <tr className="text-gray-400">
                          <th className="text-left py-3 px-3 sticky left-0 bg-zinc-800 z-10">#</th>
                          <th className="text-left py-3 px-3 sticky left-[40px] bg-zinc-800 z-10">Team</th>
                          <th className="text-center py-3 px-3">DIV</th>
                          <th className="text-center py-3 px-3">W-L</th>
                          <th className="text-center py-3 px-3">PCT</th>
                          <th className="text-center py-3 px-3">GB</th>
                          <th className="text-center py-3 px-3">L10</th>
                          <th className="text-center py-3 px-3">STRK</th>
                          <th className="text-center py-3 px-3">HOME</th>
                          <th className="text-center py-3 px-3">AWAY</th>
                          <th className="text-center py-3 px-3">RS</th>
                          <th className="text-center py-3 px-3">RA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedLeague === 'American' ? standings.american : standings.national).map((team, idx) => (
                          <tr key={idx}
                            onClick={() => handleTeamClick(team.team, team.logo)}
                            className="border-t border-zinc-800 hover:bg-zinc-800 cursor-pointer transition-colors">
                            <td className="py-3 px-3 sticky left-0 bg-zinc-900 font-semibold text-blue-500">{idx + 1}</td>
                            <td className="py-3 px-3 sticky left-[40px] bg-zinc-900">
                              <div className="flex items-center gap-2">
                                {team.logo && <img src={team.logo} alt={team.team} className="w-6 h-6" />}
                                <span className="font-semibold">{team.team}</span>
                              </div>
                            </td>
                            <td className="text-center py-3 px-3 text-gray-400 text-xs whitespace-nowrap">{team.division}</td>
                            <td className="text-center py-3 px-3 font-semibold">{team.wins}-{team.losses}</td>
                            <td className="text-center py-3 px-3">{team.pct}</td>
                            <td className="text-center py-3 px-3 text-gray-300">{team.gb}</td>
                            <td className="text-center py-3 px-3 whitespace-nowrap">{team.l10}</td>
                            <td className="text-center py-3 px-3">
                              <span className={team.streak?.startsWith('W') ? 'text-green-500' : 'text-red-500'}>
                                {team.streak}
                              </span>
                            </td>
                            <td className="text-center py-3 px-3">{team.home}</td>
                            <td className="text-center py-3 px-3">{team.away}</td>
                            <td className="text-center py-3 px-3">{team.rs}</td>
                            <td className="text-center py-3 px-3">{team.ra}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GAME DETAIL ── */}
      {selectedGame && (
        <div
          ref={gameDetailScrollRef}
          className={`fixed inset-0 bg-black bg-opacity-100 z-50 overflow-y-auto ${selectedTeamInfo ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{
            transform: `translateX(${selectedTeamInfo ? 0 : swipeOffset}px)`,
            animation: slideDirection === 'right' ? 'slideInRight 0.3s ease-out' : 'none',
          }}
        >
          <div className="min-h-screen px-4 pt-12 pb-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center mb-6">
                <button onClick={closeModal} className="text-gray-400 hover:text-white text-2xl font-light mr-4">‹</button>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Game Details</h2>
              </div>

              {/* Score Header */}
              <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
                <div className="flex items-start justify-between min-h-[120px]">
                  {/* Away */}
                  <div className="flex flex-col items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleTeamClick(selectedGame.awayTeam, selectedGame.awayLogo)}>
                    <img src={selectedGame.awayLogo} alt={selectedGame.awayTeam} className="w-10 h-10 mb-1" />
                    <span className="text-base font-bold whitespace-nowrap" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                      {teamCities[selectedGame.awayTeam] || selectedGame.awayTeam}
                    </span>
                    {selectedGame.awayRecord && <span className="text-xs text-gray-400">{selectedGame.awayRecord}</span>}
                    {!selectedGame.isPreGame && (
                      <span className={`text-4xl font-bold mt-3 ${
                        parseInt(selectedGame.awayScore) > parseInt(selectedGame.homeScore) ? 'text-white' : 'text-gray-500'
                      }`}>{selectedGame.awayScore}</span>
                    )}
                  </div>

                  {/* Center */}
                  <div className="flex flex-col items-center px-4 pt-2 min-w-[90px]">
                    {selectedGame.isLive && (
                      <div className="text-center">
                        <div className="flex items-center gap-1 justify-center mb-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-500 font-bold text-xs tracking-widest uppercase">Live</span>
                        </div>
                        <InningDisplay inning={selectedGame.inning} isTopInning={selectedGame.isTopInning} />
                        {selectedGame.balls !== null && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <CountDisplay balls={selectedGame.balls} strikes={selectedGame.strikes} outs={selectedGame.outs} />
                            <BasesDisplay onFirst={selectedGame.onFirst} onSecond={selectedGame.onSecond} onThird={selectedGame.onThird} />
                          </div>
                        )}
                        {selectedGame.allBroadcasts?.length > 0 && (
                          <div className="flex flex-col items-center mt-1">
                            {selectedGame.allBroadcasts.map((ch, i) => (
                              <div key={i} className="text-xs text-gray-500">{abbreviateChannel(ch)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedGame.isPreGame && (
                      <div className="text-center">
                        <div className="text-gray-300 text-sm font-semibold">{formatGameTime(selectedGame.gameTime)}</div>
                        {selectedGame.allBroadcasts?.length > 0 && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {selectedGame.allBroadcasts.map(ch => abbreviateChannel(ch)).join(' • ')}
                          </div>
                        )}
                      </div>
                    )}
                    {selectedGame.isFinal && (
                      <div className="text-center">
                        <div className="text-gray-400 text-xs font-bold tracking-widest uppercase">Final</div>
                      </div>
                    )}
                  </div>

                  {/* Home */}
                  <div className="flex flex-col items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleTeamClick(selectedGame.homeTeam, selectedGame.homeLogo)}>
                    <img src={selectedGame.homeLogo} alt={selectedGame.homeTeam} className="w-10 h-10 mb-1" />
                    <span className="text-base font-bold whitespace-nowrap" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                      {teamCities[selectedGame.homeTeam] || selectedGame.homeTeam}
                    </span>
                    {selectedGame.homeRecord && <span className="text-xs text-gray-400">{selectedGame.homeRecord}</span>}
                    {!selectedGame.isPreGame && (
                      <span className={`text-4xl font-bold mt-3 ${
                        parseInt(selectedGame.homeScore) > parseInt(selectedGame.awayScore) ? 'text-white' : 'text-gray-500'
                      }`}>{selectedGame.homeScore}</span>
                    )}
                  </div>
                </div>

 {/* Inning-by-Inning linescore */}
{!selectedGame.isPreGame && gameDetails && (
  <div className="mt-4 pt-4 border-t border-zinc-800 overflow-x-auto">
    {(() => {
      const awayComp = gameDetails.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away');
      const homeComp = gameDetails.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home');
      const awayInnings = awayComp?.linescores || [];
      const homeInnings = homeComp?.linescores || [];
      const totalInnings = Math.max(awayInnings.length, homeInnings.length, 9);

      return (
        <table className="w-full text-center text-sm min-w-[340px]">
          <thead>
            <tr className="text-gray-500 text-xs">
              <th className="text-left pb-1 w-14">Team</th>
              {Array.from({ length: totalInnings }, (_, i) => (
                <th key={i} className="pb-1 px-1">{i + 1}</th>
              ))}
              <th className="pb-1 px-2 border-l border-zinc-700">R</th>
              <th className="pb-1 px-2">H</th>
              <th className="pb-1 px-2">E</th>
            </tr>
          </thead>
          <tbody>
            {['away', 'home'].map(side => {
              const teamAbbr = side === 'away' ? selectedGame.awayTeam : selectedGame.homeTeam;
              const innings = side === 'away' ? awayInnings : homeInnings;
              const totalHits = innings.reduce((sum, inn) => sum + (inn.hits || 0), 0);
              const totalErrors = innings.reduce((sum, inn) => sum + (inn.errors || 0), 0);
              return (
                <tr key={side} className="border-t border-zinc-800">
                  <td className="text-left py-2 font-semibold">{teamAbbr}</td>
                  {Array.from({ length: totalInnings }, (_, i) => {
                    const val = innings[i]?.displayValue;
                    return (
                      <td key={i} className={`py-2 px-1 text-xs ${val !== undefined ? 'text-white' : 'text-gray-700'}`}>
                        {val !== undefined ? val : '-'}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 font-bold border-l border-zinc-700">
                    {side === 'away' ? selectedGame.awayScore : selectedGame.homeScore}
                  </td>
                  <td className="py-2 px-2 text-gray-300">{totalHits || '-'}</td>
                  <td className="py-2 px-2 text-gray-300">{totalErrors !== undefined ? totalErrors : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    })()}
  </div>
)}
</div>
              {/* Team Tabs */}
              <div className="flex gap-2 mb-3">
                {[
                  { key: 'away', label: selectedGame.awayTeam },
                  { key: 'game', label: 'Game' },
                  { key: 'home', label: selectedGame.homeTeam },
                ].map(tab => (
                  <button key={tab.key}
                    onClick={() => setSelectedTeamTab(tab.key)}
                    className={`flex-1 py-2 rounded-xl font-bold text-base transition-colors ${
                      selectedTeamTab === tab.key ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
                    }`}
                    style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {loadingDetails ? (
                <div className="text-center py-12 text-gray-400">Loading details...</div>
              ) : gameDetails ? (
                <div>
                  {/* GAME TAB — Team stat comparison bars */}
                  {selectedTeamTab === 'game' && !selectedGame.isPreGame && (
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <div className="space-y-4">
                        {(() => {
                          const awayStats = gameDetails.boxscore?.teams?.[0]?.statistics || [];
                          const homeStats = gameDetails.boxscore?.teams?.[1]?.statistics || [];
                          
                          const awaybatting = awayStats.find(c => c.name === 'batting')?.stats || [];
                          const homebatting = homeStats.find(c => c.name === 'batting')?.stats || [];
                          const awaypitching = awayStats.find(c => c.name === 'pitching')?.stats || [];
                          const homepitching = homeStats.find(c => c.name === 'pitching')?.stats || [];
                          
                          const findStat = (stats, name) => parseFloat(stats.find(s => s.name === name)?.displayValue || '0') || 0;

                          const statsToCompare = [
                            { name: 'hits', label: 'Hits', cat: 'batting' },
                            { name: 'runs', label: 'Runs', cat: 'batting' },
                            { name: 'avg', label: 'AVG', format: 'avg', cat: 'batting' },
                            { name: 'onBasePct', label: 'OBP', format: 'avg', cat: 'batting' },
                            { name: 'slugAvg', label: 'SLG', format: 'avg', cat: 'batting' },
                            { name: 'OPS', label: 'OPS', format: 'avg', cat: 'batting' },
                            { name: 'homeRuns', label: 'Home Runs', cat: 'batting' },
                            { name: 'strikeouts', label: 'Strikeouts', inverse: true, cat: 'batting' },
                            { name: 'walks', label: 'Walks', cat: 'batting' },
                            { name: 'runnersLeftOnBase', label: 'Left On Base', inverse: true, cat: 'batting' },
                            { name: 'stolenBases', label: 'Stolen Bases', cat: 'batting' },
                            { name: 'doubles', label: 'Doubles', cat: 'batting' },
                            { name: 'triples', label: 'Triples', cat: 'batting' },
                            { name: 'ERA', label: 'ERA', inverse: true, cat: 'pitching' },
                            { name: 'WHIP', label: 'WHIP', inverse: true, cat: 'pitching' },
                            { name: 'strikeouts', label: 'Pitcher K\'s', cat: 'pitching' },
                          ];

                          return statsToCompare.map((statDef, idx) => {
                            const av = findStat(statDef.cat === 'pitching' ? awaypitching : awaybatting, statDef.name);
const hv = findStat(statDef.cat === 'pitching' ? homepitching : homebatting, statDef.name);
                            const total = av + hv;
                            const ap = total > 0 ? (av / total) * 100 : 50;
                            const hp = total > 0 ? (hv / total) * 100 : 50;
                            const awayBetter = statDef.inverse ? av < hv : av > hv;
                            const homeBetter = statDef.inverse ? hv < av : hv > av;
                            const fmt = v => statDef.format === 'avg' ? v.toFixed(3).replace(/^0/, '') : v;

                            return (
                              <div key={idx}>
                                <div className="flex justify-between items-center mb-2">
                                  <span className={`text-lg font-bold ${awayBetter ? 'text-white' : 'text-gray-500'}`}>{fmt(av)}</span>
                                  <span className="text-gray-400 text-sm font-semibold">{statDef.label}</span>
                                  <span className={`text-lg font-bold ${homeBetter ? 'text-white' : 'text-gray-500'}`}>{fmt(hv)}</span>
                                </div>
                                <div className="flex h-2 rounded-full overflow-hidden">
                                  <div style={{ width: `${ap}%`, backgroundColor: teamColors[selectedGame.awayTeam] || '#3B82F6', opacity: 0.7 }} />
                                  <div style={{ width: `${hp}%`, backgroundColor: teamColors[selectedGame.homeTeam] || '#EF4444' }} />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* GAME TAB — Pre-game: injuries / probable pitchers */}
                  {selectedTeamTab === 'game' && selectedGame.isPreGame && (
                    <div className="space-y-3">
                      {/* Probable Pitchers */}
                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3"
                          style={{ fontFamily: 'Rajdhani, sans-serif' }}>Probable Pitchers</h4>
                        {gameDetails.header?.competitions?.[0]?.competitors?.map(comp => {
                          const pitcher = comp.probables?.[0];
                          if (!pitcher) return null;
                          return (
                            <div key={comp.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                              <div className="flex items-center gap-3">
                                {pitcher.athlete?.headshot?.href && (
                                  <img src={pitcher.athlete.headshot.href} alt={pitcher.athlete.displayName}
                                    className="w-10 h-10 rounded-full object-cover" />
                                )}
                                <div>
                                  <div className="font-semibold text-sm">{pitcher.athlete?.displayName}</div>
                                  <div className="text-xs text-gray-400">{comp.team?.abbreviation}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold">{pitcher.statistics?.[0]?.displayValue}</div>
                                <div className="text-xs text-gray-400">ERA: {pitcher.statistics?.[1]?.displayValue || '-'}</div>
                              </div>
                            </div>
                          );
                        })}
                        {!gameDetails.header?.competitions?.[0]?.competitors?.some(c => c.probables?.length > 0) && (
                          <div className="text-gray-400 text-xs">Probable pitchers not yet announced</div>
                        )}
                      </div>

                      {/* Injuries */}
                      {[selectedGame.awayTeam, selectedGame.homeTeam].map(teamAbbr => {
                        const isAway = teamAbbr === selectedGame.awayTeam;
                        const logo = isAway ? selectedGame.awayLogo : selectedGame.homeLogo;
                        const injuryData = gameDetails.injuries?.find(d => d.team?.abbreviation === teamAbbr);
                        return (
                          <div key={teamAbbr} className="bg-zinc-900 rounded-2xl p-3">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2"
                              style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                              <img src={logo} alt={teamAbbr} className="w-5 h-5" />
                              {teamAbbr} Injuries
                            </h4>
                            {!injuryData || injuryData.injuries?.length === 0 ? (
                              <div className="text-gray-400 text-xs">No injuries reported</div>
                            ) : (
                              <div className="space-y-1">
                                {injuryData.injuries.map((inj, i) => (
                                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
                                    <div className="flex items-center gap-2">
                                      {inj.athlete?.headshot?.href && (
                                        <img src={inj.athlete.headshot.href} alt={inj.athlete.displayName}
                                          className="w-8 h-8 rounded-full object-cover" />
                                      )}
                                      <div>
                                        <div className="font-semibold text-xs">{inj.athlete?.displayName}</div>
                                        <div className="text-xs text-gray-400">{inj.athlete?.position?.abbreviation || 'N/A'}</div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-red-500 text-xs font-semibold">{inj.status}</div>
                                      <div className="text-xs text-gray-400">{inj.details?.type || 'Injury'}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TEAM TAB (away/home) — Batting box score */}
                  {(selectedTeamTab === 'away' || selectedTeamTab === 'home') && !selectedGame.isPreGame && (
                    <div>
                      <div className="bg-zinc-900 rounded-2xl p-4 pr-0">
                        <div className="overflow-x-auto -ml-4">
                          <table className="w-full text-sm">
                            <thead>
                              {/* Team totals row */}
                              <tr className="border-b border-zinc-700">
                                <td colSpan="10" className="bg-zinc-900 pb-2 px-2">
                                  {(() => {
                                    const teamIdx = selectedTeamTab === 'away' ? 0 : 1;
                                    const players = gameDetails.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes || [];
                                    let ab=0, r=0, h=0, rbi=0, hr=0, bb=0, k=0, p=0;
                                    players.forEach(pl => {
                                      if (pl.stats) {
                                        ab += parseInt(pl.stats[1]) || 0;
                                        r  += parseInt(pl.stats[2]) || 0;
                                        h  += parseInt(pl.stats[3]) || 0;
                                        rbi+= parseInt(pl.stats[4]) || 0;
                                        hr += parseInt(pl.stats[5]) || 0;
                                        bb += parseInt(pl.stats[6]) || 0;
                                        k  += parseInt(pl.stats[7]) || 0;
                                        p  += parseInt(pl.stats[8]) || 0;
                                      }
                                    });
                                    const avg = ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.000';
                                    const obp_num = players.reduce((s, pl) => s + (parseFloat(pl.stats?.[10]) || 0), 0);
                                    const slg_num = players.reduce((s, pl) => s + (parseFloat(pl.stats?.[11]) || 0), 0);
                                    const activeCount = players.filter(pl => parseInt(pl.stats?.[1]) > 0).length || 1;
                                    const obp = (obp_num / activeCount).toFixed(3).replace(/^0/, '');
                                    const slg = (slg_num / activeCount).toFixed(3).replace(/^0/, '');
                                    return (
                                      <div className="flex items-center gap-4">
                                        <img src={selectedTeamTab === 'away' ? selectedGame.awayLogo : selectedGame.homeLogo}
                                          alt="" className="w-6 h-6 flex-shrink-0" />
                                        {[
                                          { label: 'AB', value: ab },
                                          { label: 'R', value: r },
                                          { label: 'H', value: h },
                                          { label: 'RBI', value: rbi },
                                          { label: 'HR', value: hr },
                                          { label: 'BB', value: bb },
                                          { label: 'K', value: k },
                                          { label: '#P', value: p },
                                          { label: 'AVG', value: avg },
                                          { label: 'OBP', value: obp },
                                          { label: 'SLG', value: slg },
                                        ].map(({ label, value }) => (
                                          <div key={label} className="text-center flex-shrink-0">
                                            <div className="text-[16px] font-semibold text-white -mb-1.5">{value}</div>
                                            <div className="text-[10px] text-gray-400">{label}</div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const teamIdx = selectedTeamTab === 'away' ? 0 : 1;
                                const players = gameDetails.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes || [];
                                return players
                                  .sort((a, b) => (parseInt(b.stats?.[1]) || 0) - (parseInt(a.stats?.[1]) || 0))
                                  .map((player, idx) => (
                                    <tr key={idx} className="border-b border-zinc-800 last:border-0 h-12">
                                      <td className="py-1 sticky left-0 bg-zinc-900 z-20 w-14 min-w-[56px]">
                                        <div className="flex items-center gap-0">
                                          {player.athlete?.headshot?.href ? (
                                            <img src={player.athlete.headshot.href} alt={player.athlete.shortName}
                                              className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                                          ) : (
                                            <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center text-gray-400 font-bold text-xs">
                                              {player.athlete?.shortName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                          )}
                                          <div className="absolute left-14 top-0 z-30">
                                            <div className="text-xs text-gray-400 whitespace-nowrap">
                                              {player.athlete?.shortName}
                                              {player.athlete?.position?.abbreviation && (
                                                <span className="text-gray-500"> • {player.athlete.position.abbreviation}</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      {/* AB, R, H, RBI, BB, SO, AVG, HR */}
                                      {[
  { label: 'AB', val: player.stats?.[1] },
  { label: 'R', val: player.stats?.[2] },
  { label: 'H', val: player.stats?.[3] },
  { label: 'RBI', val: player.stats?.[4] },
  { label: 'HR', val: player.stats?.[5] },
  { label: 'BB', val: player.stats?.[6] },
  { label: 'K', val: player.stats?.[7] },
  { label: '#P', val: player.stats?.[8] },
  { label: 'AVG', val: player.stats?.[9] },
  { label: 'OBP', val: player.stats?.[10] },
  { label: 'SLG', val: player.stats?.[11] },
].map(({ label, val }) => (
                                        <td key={label} className="text-center px-2 pt-2">
                                          <div className="text-[16px] font-semibold -mb-1.5">{val ?? '-'}</div>
                                          <div className="text-[10px] text-gray-400">{label}</div>
                                        </td>
                                      ))}
                                    </tr>
                                  ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pitching box score */}
                      <div className="bg-zinc-900 rounded-2xl p-4 pr-0 mt-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1"
                          style={{ fontFamily: 'Rajdhani, sans-serif' }}>Pitching</h4>
                        <div className="overflow-x-auto -ml-4">
                          <table className="w-full text-sm">
                            <tbody>
                              {(() => {
                                const teamIdx = selectedTeamTab === 'away' ? 0 : 1;
                                // Try pitching stats (index 1 in players array)
                                const pitchers = gameDetails.boxscore?.players?.[teamIdx]?.statistics?.[1]?.athletes || [];
                                if (pitchers.length === 0) return (
                                  <tr><td className="text-gray-500 text-xs p-2">No pitching data</td></tr>
                                );
                                return pitchers.map((player, idx) => (
                                  <tr key={idx} className="border-b border-zinc-800 last:border-0 h-12">
                                    <td className="py-1 sticky left-0 bg-zinc-900 z-20 w-14 min-w-[56px]">
                                      <div className="flex items-center">
                                        {player.athlete?.headshot?.href ? (
                                          <img src={player.athlete.headshot.href} alt={player.athlete.shortName}
                                            className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center text-gray-400 font-bold text-xs">
                                            {player.athlete?.shortName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                          </div>
                                        )}
                                        <div className="absolute left-14 top-0 z-30">
                                          <div className="text-xs text-gray-400 whitespace-nowrap">
                                            {player.athlete?.shortName}
                                            {player.didWin !== undefined && (
                                              <span className={`ml-1 text-[10px] font-bold ${player.didWin ? 'text-green-400' : 'text-red-400'}`}>
                                                {player.didWin ? 'W' : player.didLose ? 'L' : 'S'}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    {/* IP, H, R, ER, BB, SO, HR, ERA */}
                                    {[
                                      { label: 'IP', val: player.stats?.[0] },
                                      { label: 'H', val: player.stats?.[1] },
                                      { label: 'R', val: player.stats?.[2] },
                                      { label: 'ER', val: player.stats?.[3] },
                                      { label: 'BB', val: player.stats?.[4] },
                                      { label: 'SO', val: player.stats?.[5] },
                                      { label: 'HR', val: player.stats?.[6] },
                                      { label: 'ERA', val: player.stats?.[8] },
                                    ].map(({ label, val }) => (
                                      <td key={label} className="text-center px-2 pt-2">
                                        <div className="text-[16px] font-semibold -mb-1.5">{val ?? '-'}</div>
                                        <div className="text-[10px] text-gray-400">{label}</div>
                                      </td>
                                    ))}
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TEAM TAB — Pre-game roster */}
                  {(selectedTeamTab === 'away' || selectedTeamTab === 'home') && selectedGame.isPreGame && (
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <div className="text-gray-400 text-center py-4 text-sm">
                        Lineup not yet available
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM STATS ── */}
      {selectedTeamInfo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-100 z-[100] overflow-y-auto transition-transform duration-300 ease-out"
          style={{ animation: slideDirection === 'right' ? 'slideInRight 0.3s ease-out' : 'none' }}
        >
          <div className="min-h-screen px-4 pt-12 pb-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center mb-6">
                <button onClick={closeTeamModal} className="text-gray-400 hover:text-white text-2xl font-light mr-4">‹</button>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Team Stats</h2>
              </div>

              {loadingTeamStats ? (
                <div className="text-center py-12 text-gray-400">Loading team stats...</div>
              ) : teamStats ? (
                <div>
                  {/* Team Header Card */}
                  <div
                    className="rounded-2xl p-5 mb-4 relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${teamColors[selectedTeamInfo.abbr]}33 0%, #18181b 55%)`,
                      border: `1px solid ${teamColors[selectedTeamInfo.abbr]}55`,
                    }}
                  >
                    <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none"
                      style={{ background: teamColors[selectedTeamInfo.abbr] }} />

                    <div className="flex items-start gap-4 relative z-10 mb-4">
                      <img src={selectedTeamInfo.logo} alt={selectedTeamInfo.abbr} className="w-20 h-20 drop-shadow-lg" />
                      <div className="flex-1 pt-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-xl font-bold leading-tight" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                              {teamFullNames[selectedTeamInfo.abbr]}
                            </h3>
                            <div className="text-gray-400 text-sm mt-0.5">{teamStats.record?.division}</div>
                          </div>
                          <button onClick={() => toggleFavorite(selectedTeamInfo.abbr)}>
                            <Star className={`w-5 h-5 transition-all ${favoriteTeams.includes(selectedTeamInfo.abbr) ? 'fill-white text-white' : 'text-gray-500'}`} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-2xl font-bold">{teamStats.record?.wins}-{teamStats.record?.losses}</span>
                          <span className="text-gray-400 text-sm">{teamStats.record?.pct}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            teamStats.record?.streak?.startsWith('W') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>{teamStats.record?.streak}</span>
                        </div>
                      </div>
                    </div>

                    {/* Win bar */}
                    <div className="relative z-10 mb-3">
                      <div className="flex h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{
                            width: `${(parseInt(teamStats.record?.wins) / (parseInt(teamStats.record?.wins) + parseInt(teamStats.record?.losses))) * 100}%`,
                            backgroundColor: teamColors[selectedTeamInfo.abbr],
                          }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-500">{teamStats.record?.wins}W</span>
                        <span className="text-[10px] text-gray-500">{teamStats.record?.losses}L</span>
                      </div>
                    </div>

                    {/* Home/Away split */}
                    <div className="relative z-10 flex gap-3">
                      {[
                        { label: 'Home', val: teamStats.record?.home },
                        { label: 'Away', val: teamStats.record?.away },
                        { label: 'L10', val: teamStats.record?.l10 },
                        { label: 'GB', val: teamStats.record?.gb },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex-1 rounded-xl px-2 py-2 flex flex-col items-center bg-zinc-800 border border-zinc-700">
                          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</span>
                          <span className="text-sm font-bold">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Batting */}
<div className="bg-zinc-900 rounded-2xl p-4 mb-4">
  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Batting</h4>
  <div className="grid grid-cols-4 gap-2 mb-2">
    {(() => {
      const bat = teamStats.stats.find(c => c.name === 'batting');
      const getStat = name => bat?.stats?.find(s => s.name === name)?.displayValue || '-';
      const teamRanks = leagueRankings?.[selectedTeamInfo?.abbr] || {};
      return [
        { label: 'AVG', value: getStat('avg'), rank: teamRanks.avg },
        { label: 'OBP', value: getStat('onBasePct'), rank: teamRanks.obp },
{ label: 'SLG', value: getStat('slugAvg'), rank: teamRanks.slg },
{ label: 'OPS', value: getStat('OPS'), rank: teamRanks.ops },
      ].map(({ label, value, rank }) => (
        <div key={label} className={`rounded-xl border p-2 flex flex-col items-center justify-center ${
          !rank ? 'border-zinc-700 bg-zinc-800/50' :
          rank <= 10 ? 'border-green-500/30 bg-green-500/5' :
          rank <= 20 ? 'border-zinc-700 bg-zinc-800/50' :
          'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          {rank && (
            <div className={`text-[10px] font-bold mt-0.5 ${rank <= 10 ? 'text-green-400' : rank <= 20 ? 'text-gray-400' : 'text-red-400'}`}>
              #{rank}
            </div>
          )}
        </div>
      ));
    })()}
  </div>
  <div className="grid grid-cols-4 gap-2">
    {(() => {
      const bat = teamStats.stats.find(c => c.name === 'batting');
      const getStat = name => bat?.stats?.find(s => s.name === name)?.displayValue || '-';
      const teamRanks = leagueRankings?.[selectedTeamInfo?.abbr] || {};
      return [
        { label: 'HR', value: getStat('homeRuns'), rank: teamRanks.hr },
        { label: 'RBI', value: getStat('RBIs'), rank: teamRanks.rbi },
        { label: 'SB', value: getStat('stolenBases'), rank: teamRanks.sb },
        { label: 'SO', value: getStat('strikeouts'), rank: teamRanks.so_bat },
      ].map(({ label, value, rank }) => (
        <div key={label} className={`rounded-xl border p-2 flex flex-col items-center justify-center ${
          !rank ? 'border-zinc-700 bg-zinc-800/50' :
          rank <= 10 ? 'border-green-500/30 bg-green-500/5' :
          rank <= 20 ? 'border-zinc-700 bg-zinc-800/50' :
          'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          {rank && (
            <div className={`text-[10px] font-bold mt-0.5 ${rank <= 10 ? 'text-green-400' : rank <= 20 ? 'text-gray-400' : 'text-red-400'}`}>
              #{rank}
            </div>
          )}
        </div>
      ));
    })()}
  </div>
</div>

{/* Pitching */}
<div className="bg-zinc-900 rounded-2xl p-4 mb-4">
  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Pitching</h4>
  <div className="grid grid-cols-4 gap-2 mb-2">
    {(() => {
      const pit = teamStats.stats.find(c => c.name === 'pitching');
      const getStat = name => pit?.stats?.find(s => s.name === name)?.displayValue || '-';
      const teamRanks = leagueRankings?.[selectedTeamInfo?.abbr] || {};
      return [
        { label: 'ERA', value: getStat('ERA'), rank: teamRanks.era },
        { label: 'WHIP', value: getStat('WHIP'), rank: teamRanks.whip },
        { label: 'K/9', value: getStat('strikeoutsPerNineInnings'), rank: teamRanks.k9 },
        { label: 'BB/9', value: getStat('walksPerNineInnings'), rank: teamRanks.bb9 },
      ].map(({ label, value, rank }) => (
        <div key={label} className={`rounded-xl border p-2 flex flex-col items-center justify-center ${
          !rank ? 'border-zinc-700 bg-zinc-800/50' :
          rank <= 10 ? 'border-green-500/30 bg-green-500/5' :
          rank <= 20 ? 'border-zinc-700 bg-zinc-800/50' :
          'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          {rank && (
            <div className={`text-[10px] font-bold mt-0.5 ${rank <= 10 ? 'text-green-400' : rank <= 20 ? 'text-gray-400' : 'text-red-400'}`}>
              #{rank}
            </div>
          )}
        </div>
      ));
    })()}
  </div>
  <div className="grid grid-cols-4 gap-2">
    {(() => {
      const pit = teamStats.stats.find(c => c.name === 'pitching');
      const getStat = name => pit?.stats?.find(s => s.name === name)?.displayValue || '-';
      const teamRanks = leagueRankings?.[selectedTeamInfo?.abbr] || {};
      return [
        { label: 'SV', value: getStat('saves'), rank: teamRanks.saves },
        { label: 'QS', value: getStat('qualityStarts'), rank: teamRanks.qs },
        { label: 'HR', value: getStat('homeRunsAllowed'), rank: null },
        { label: 'SO', value: getStat('strikeouts'), rank: null },
      ].map(({ label, value, rank }) => (
        <div key={label} className={`rounded-xl border p-2 flex flex-col items-center justify-center ${
          !rank ? 'border-zinc-700 bg-zinc-800/50' :
          rank <= 10 ? 'border-green-500/30 bg-green-500/5' :
          rank <= 20 ? 'border-zinc-700 bg-zinc-800/50' :
          'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          {rank && (
            <div className={`text-[10px] font-bold mt-0.5 ${rank <= 10 ? 'text-green-400' : rank <= 20 ? 'text-gray-400' : 'text-red-400'}`}>
              #{rank}
            </div>
          )}
        </div>
      ));
    })()}
  </div>
</div>

{/* Fielding */}
<div className="bg-zinc-900 rounded-2xl p-4 mb-4">
  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Fielding</h4>
  <div className="grid grid-cols-3 gap-2">
    {(() => {
      const fld = teamStats.stats.find(c => c.name === 'fielding');
      const getStat = name => fld?.stats?.find(s => s.name === name)?.displayValue || '-';
      const teamRanks = leagueRankings?.[selectedTeamInfo?.abbr] || {};
      return [
        { label: 'FPCT', value: getStat('fieldingPct'), rank: teamRanks.fpct },
        { label: 'E', value: getStat('errors'), rank: teamRanks.errors },
        { label: 'DP', value: getStat('doublePlays'), rank: null },
      ].map(({ label, value, rank }) => (
        <div key={label} className={`rounded-xl border p-2 flex flex-col items-center justify-center ${
          !rank ? 'border-zinc-700 bg-zinc-800/50' :
          rank <= 10 ? 'border-green-500/30 bg-green-500/5' :
          rank <= 20 ? 'border-zinc-700 bg-zinc-800/50' :
          'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          {rank && (
            <div className={`text-[10px] font-bold mt-0.5 ${rank <= 10 ? 'text-green-400' : rank <= 20 ? 'text-gray-400' : 'text-red-400'}`}>
              #{rank}
            </div>
          )}
        </div>
      ));
    })()}
  </div>
</div>

                  {/* Run Differential Bars */}
                  <div className="bg-zinc-900 rounded-2xl p-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Recent Differentials</h4>
                    <div className="flex gap-2 justify-between">
                      {teamStats.recentGames.map((game, idx) => {
                        const barHeightPercent = Math.min((Math.abs(game.differential) / 15) * 50, 50);
                        return (
                          <div key={idx} className="flex flex-col items-center flex-1">
                            <div className="relative h-24 w-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => handleRecentGameClick(game)}>
                              <div className="absolute w-full h-0.5 bg-zinc-700" style={{ top: '50%' }} />
                              <div className="absolute bg-zinc-700 w-0.5"
                                style={{ bottom: '0', height: '50%', left: '50%', transform: 'translateX(-50%)' }} />
                              {game.differential > 0 ? (
                                <>
                                  <div className="absolute"
                                    style={{ bottom: '50%', height: `${barHeightPercent}%`, width: '100%', maxWidth: '32px',
                                      backgroundColor: teamColors[selectedTeamInfo.abbr] || '#3B82F6',
                                      borderTopLeftRadius: '4px', borderTopRightRadius: '4px' }} />
                                  <div className="absolute text-xs font-bold text-green-500 w-full text-center"
                                    style={{ bottom: `${50 + barHeightPercent}%`, transform: 'translateY(-4px)' }}>
                                    +{game.differential}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="absolute"
                                    style={{ top: '50%', height: `${barHeightPercent}%`, width: '100%', maxWidth: '32px',
                                      backgroundColor: '#1e3a5f',
                                      borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' }} />
                                  <div className="absolute text-xs font-bold text-red-500 w-full text-center"
                                    style={{ top: '50%', transform: 'translateY(-18px)' }}>
                                    {game.differential}
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {game.isHome ? 'vs' : '@'} {game.opponent}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Upcoming Schedule */}
                  <div className="bg-zinc-900 rounded-2xl p-4 mt-4">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Upcoming Schedule</h4>
                    <div className="space-y-2">
                      {teamStats.upcomingGames?.length > 0 ? (
                        <>
                          {teamStats.upcomingGames.slice(0, showAllUpcoming ? teamStats.upcomingGames.length : 5).map((game, idx) => (
                            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-gray-400 w-16">
                                  <div>{new Date(game.date).toLocaleDateString('en-US', { weekday: 'short' })},</div>
                                  <div>{new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-400">{game.isHome ? 'vs' : '@'}</span>
                                  <img src={game.opponentLogo} alt={game.opponent} className="w-6 h-6 cursor-pointer hover:opacity-80"
                                    onClick={e => { e.stopPropagation(); handleTeamClick(game.opponent, game.opponentLogo); }} />
                                  <span className="font-semibold cursor-pointer hover:text-blue-500 transition-colors"
                                    onClick={e => { e.stopPropagation(); handleTeamClick(game.opponent, game.opponentLogo); }}>
                                    {game.opponent}
                                  </span>
                                  {game.opponentRecord && <span className="text-sm text-gray-400">({game.opponentRecord})</span>}
                                </div>
                              </div>
                              <div className="text-sm">{game.time}</div>
                            </div>
                          ))}
                          {teamStats.upcomingGames.length > 5 && (
                            <button onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                              className="w-full py-0 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                              <span className="text-2xl font-light"
                                style={{ transform: showAllUpcoming ? 'rotate(90deg)' : 'rotate(-90deg)' }}>‹</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-400 text-sm">No upcoming games</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">Could not load team stats</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FAVORITES ── */}
      {showFavorites && (
        <div className="fixed inset-0 bg-black bg-opacity-100 z-[100] overflow-y-auto">
          <div className="min-h-screen px-4 pt-12 pb-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center mb-6">
                <button onClick={() => setShowFavorites(false)} className="text-gray-400 hover:text-white text-2xl font-light mr-4">‹</button>
                <h2 className="text-2xl font-bold">Teams</h2>
              </div>

              {favoriteTeams.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Your Favorites</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(teamFullNames).filter(([abbr]) => favoriteTeams.includes(abbr)).map(([abbr, fullName]) => (
                      <button key={abbr} onClick={() => toggleFavorite(abbr)}
                        className="bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 flex items-center gap-3 transition-colors">
                        <img src={`https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`} alt={abbr} className="w-12 h-12" />
                        <div className="text-left flex-1">
                          <div className="font-semibold">{abbr}</div>
                          <div className="text-xs text-gray-400">{fullName}</div>
                        </div>
                        <Star className="w-5 h-5 fill-white text-white" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">All Teams</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(teamFullNames).map(([abbr, fullName]) => (
                  <button key={abbr} onClick={() => toggleFavorite(abbr)}
                    className="bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 flex items-center gap-3 transition-colors">
                    <img src={`https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`} alt={abbr} className="w-12 h-12" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">{abbr}</div>
                      <div className="text-xs text-gray-400">{fullName}</div>
                    </div>
                    <Star className={`w-5 h-5 ${favoriteTeams.includes(abbr) ? 'fill-white text-white' : 'text-gray-400'}`} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}