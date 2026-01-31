import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import logo from './assets/slate-logo.png';

export default function SportsApp() {
  // Store API key safely (in production, use environment variables)
  const BETSTACK_API_KEY = '7f0e1495b778d1694a4a81ecabf836057f6d82d2f941e2306ff167c366ee3164';
  
  const [activeFilter, setActiveFilter] = useState('All');
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bettingOdds, setBettingOdds] = useState(() => {
    // Load cached odds from localStorage on initial load
    const cached = localStorage.getItem('bettingOdds');
    return cached ? JSON.parse(cached) : {};
  });
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('away');
  const [showStandings, setShowStandings] = useState(false);
  const [standings, setStandings] = useState({ eastern: [], western: [] });
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [selectedConference, setSelectedConference] = useState('Eastern');
  const [selectedTeamInfo, setSelectedTeamInfo] = useState(null);
  const [teamStats, setTeamStats] = useState(null);
  const [loadingTeamStats, setLoadingTeamStats] = useState(false);
  const [previousTeamInfo, setPreviousTeamInfo] = useState(null);
  const [navigationStack, setNavigationStack] = useState([]); // NEW: Track navigation history
  const [isSwipeClosing, setIsSwipeClosing] = useState(false);
const [swipeOffset, setSwipeOffset] = useState(0);

// Swipe to go back functionality
useEffect(() => {
  let touchStartX = 0;
  let touchStartY = 0;
  let currentX = 0;
  let isSwiping = false;
  
  const handleTouchStart = (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    if (touchStartX < 100) {
      isSwiping = true;
    }
  };
  
  const handleTouchMove = (e) => {
    if (!isSwiping) return;
    
    currentX = e.changedTouches[0].screenX;
    const deltaX = currentX - touchStartX;
    const deltaY = Math.abs(e.changedTouches[0].screenY - touchStartY);
    
    // Only track horizontal swipes
    if (deltaX > 0 && deltaX > deltaY) {
      setSwipeOffset(deltaX);
    }
  };
  
  const handleTouchEnd = (e) => {
    if (!isSwiping) return;
    
    const touchEndX = e.changedTouches[0].screenX;
    const swipeDistance = touchEndX - touchStartX;
    
    // If swiped more than 50px, close with animation
    if (swipeDistance > 50) {
      setIsSwipeClosing(true);
      setSwipeOffset(window.innerWidth); // Snap to full width immediately
      setTimeout(() => {
        if (selectedGame) {
          closeModal();
        } else if (selectedTeamInfo) {
          closeTeamModal();
        } else if (selectedPlayer) {
          closePlayerModal();
        } else if (showStandings) {
          closeStandings();
        }
        setIsSwipeClosing(false);
        setSwipeOffset(0);
      }, 300); // Match transition duration
    } else {
      // Snap back
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
}, [selectedGame, selectedTeamInfo, selectedPlayer, showStandings]);

  
  const filters = [
    { name: 'All', emoji: '🏀' },
    { name: 'Football', emoji: '🏈' },
    { name: 'Basketball', emoji: '🏀' },
    { name: 'Baseball', emoji: '⚾' },
    { name: 'Hockey', emoji: '🏒' },
    { name: 'Soccer', emoji: '⚽' }
  ];
  
  const teamFullNames = {
    'ATL': 'Atlanta Hawks',
    'BOS': 'Boston Celtics',
    'BKN': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets',
    'CHI': 'Chicago Bulls',
    'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks',
    'DEN': 'Denver Nuggets',
    'DET': 'Detroit Pistons',
    'GS': 'Golden State Warriors',
    'HOU': 'Houston Rockets',
    'IND': 'Indiana Pacers',
    'LAC': 'LA Clippers',
    'LAL': 'Los Angeles Lakers',
    'MEM': 'Memphis Grizzlies',
    'MIA': 'Miami Heat',
    'MIL': 'Milwaukee Bucks',
    'MIN': 'Minnesota Timberwolves',
    'NO': 'New Orleans Pelicans',
    'NY': 'New York Knicks',
    'OKC': 'Oklahoma City Thunder',
    'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia 76ers',
    'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers',
    'SAC': 'Sacramento Kings',
    'SA': 'San Antonio Spurs',
    'TOR': 'Toronto Raptors',
    'UTAH': 'Utah Jazz',
    'WSH': 'Washington Wizards'
  };

  const teamColors = {
    'ATL': '#E03A3E',
    'BOS': '#007A33',
    'BKN': '#000000',
    'CHA': '#1D1160',
    'CHI': '#CE1141',
    'CLE': '#860038',
    'DAL': '#00538C',
    'DEN': '#0E2240',
    'DET': '#C8102E',
    'GS': '#1D428A',
    'HOU': '#CE1141',
    'IND': '#002D62',
    'LAC': '#C8102E',
    'LAL': '#552583',
    'MEM': '#5D76A9',
    'MIA': '#98002E',
    'MIL': '#00471B',
    'MIN': '#0C2340',
    'NO': '#0C2340',
    'NY': '#006BB6',
    'OKC': '#007AC1',
    'ORL': '#0077C0',
    'PHI': '#006BB6',
    'PHX': '#1D1160',
    'POR': '#E03A3E',
    'SAC': '#5A2D81',
    'SA': '#C4CED4',
    'TOR': '#CE1141',
    'UTAH': '#002B5C',
    'WSH': '#002B5C'
  };
  
  // Add this line RIGHT BEFORE your useEffects
  const hasFetchedOdds = React.useRef(false);

  // Handle app visibility changes - refresh data when user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to the app - refresh everything
        console.log('App became visible - refreshing data');
        fetchLiveScores();
        fetchBettingOdds();
        
        // If game details modal is open, refresh that too
        if (selectedGame) {
          fetchGameDetails(selectedGame.id);
        }
        
        // If standings are open, refresh those
        if (showStandings && standings.eastern.length > 0) {
          fetchStandings();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also handle focus event (for when app comes to foreground)
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [selectedGame, showStandings, standings.eastern.length]);

  useEffect(() => {
    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 30000);
    return () => clearInterval(interval);
  }, [selectedDate]);
// Updated betting odds useEffect with duplicate prevention
useEffect(() => {
  if (!hasFetchedOdds.current) {
    hasFetchedOdds.current = true;
    fetchBettingOdds();
    const oddsInterval = setInterval(fetchBettingOdds, 60000);
    return () => clearInterval(oddsInterval);
  }
}, []);
  const fetchLiveScores = async () => {
    try {
       // Use local timezone date, not UTC
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`);
    const data = await response.json();
      
      const games = data.events.map(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        
// ADD THIS DEBUG LOG
console.log('Event data for game:', event);
console.log('Broadcasts:', competition.broadcasts);
        
        return {
          id: event.id,
          homeTeam: homeTeam.team.abbreviation,
          awayTeam: awayTeam.team.abbreviation,
          homeScore: homeTeam.score,
          awayScore: awayTeam.score,
          homeRecord: homeTeam.records?.[0]?.summary || '',
          awayRecord: awayTeam.records?.[0]?.summary || '',
          status: event.status.type.description,
          period: event.status.period,
          clock: event.status.displayClock,
          isLive: event.status.type.state === 'in',
          isPreGame: event.status.type.state === 'pre',
          isFinal: event.status.type.state === 'post',
          gameTime: event.date,
          homeLogo: homeTeam.team.logo,
          awayLogo: awayTeam.team.logo,
          broadcast: (() => {
            const broadcasts = competition.broadcasts || [];
            for (const broadcast of broadcasts) {
              const channelName = broadcast.names?.[0];
              if (channelName && channelName !== 'NBA League Pass') {
                return channelName;
              }
            }
            return null;
          })(),
          allBroadcasts: competition.broadcasts?.flatMap(b => b.names || []).filter(name => name) || []
        };
      });
      
      // SORT GAMES: Live first, then Pre-game, then Final
      const sortedGames = games.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.isPreGame && !b.isPreGame && !b.isLive) return -1;
        if (!a.isPreGame && b.isPreGame && !a.isLive) return 1;
        if (a.isFinal && !b.isFinal) return 1;
        if (!a.isFinal && b.isFinal) return -1;
        return 0;
      });
      
      setLiveGames(sortedGames);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scores:', error);
      setLoading(false);
    }
  };
  
// fetchBettingOdds is a SEPARATE function - NOT inside fetchLiveScores
const fetchBettingOdds = async () => {
  try {
    // Check if we fetched recently (within last 60 seconds)
    const lastFetch = localStorage.getItem('lastOddsFetch');
    const now = Date.now();
    if (lastFetch && (now - parseInt(lastFetch)) < 60000) {
      console.log('Using cached odds (fetched less than 60 seconds ago)');
      return; // Use cached odds
    }

    const linesResponse = await fetch('https://api.betstack.dev/api/v1/lines', {
      headers: {
        'X-API-Key': BETSTACK_API_KEY
      }
    });
    
    if (!linesResponse.ok) {
      console.log('Lines API Response Status:', linesResponse.status);
      return;
    }
    
    const lines = await linesResponse.json();

// ADD THESE LINES HERE:
console.log('=== DEBUGGING TOTALS ===');
if (lines.length > 0) {
  console.log('First line example:', lines[0]);
  console.log('Does it have total?', lines[0].total);
  console.log('Does it have totals?', lines[0].totals);
  console.log('Full line object keys:', Object.keys(lines[0]));
}

console.log('Lines data:', lines);
    
    console.log('Lines data:', lines);
    
    // Check for rate limit error
    if (lines.error === 'rate_limit_exceeded') {
      console.log('Rate limited. Using cached odds.');
      return;
    }
    
    const oddsMap = {};
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const yesterdayStr = yesterday.toDateString();
const todayStr = today.toDateString();
const tomorrowStr = tomorrow.toDateString();
    
   // Filter for NBA games only and process
lines.forEach(line => {
  if (line.event?.league?.key === 'basketball_nba' && line.spread?.home) {
    console.log('NBA Game found:', line.event.away_team, '@', line.event.home_team, 'Total:', line.total?.number);
    const gameDate = new Date(line.event.commence_time);
    const gameDateStr = gameDate.toDateString();
        
        console.log(`API Game: ${line.event.away_team} @ ${line.event.home_team} on ${gameDateStr}`);

        // Only include today's and tomorrow's games
        // Include yesterday's, today's, and tomorrow's games
if (gameDateStr === yesterdayStr || gameDateStr === todayStr || gameDateStr === tomorrowStr) {
  const homeAbbr = getTeamAbbreviation(line.event.home_team);
  const awayAbbr = getTeamAbbreviation(line.event.away_team);
  
  console.log('Spread structure:', line.spread);
  console.log('Spread home:', line.spread.home);
  console.log('Spread away:', line.spread.away);
  
  const gameKey = `${awayAbbr}-${homeAbbr}`;
  const homeSpread = parseFloat(line.spread.home.point);
          const spread = Math.abs(homeSpread);
          const favoriteTeam = homeSpread < 0 ? homeAbbr : awayAbbr;
          
          console.log('About to store odds for', gameKey);
          console.log('line.total:', line.total);
          console.log('line.total?.number:', line.total?.number);

          oddsMap[gameKey] = {
            favoriteTeam,
            spread,
            homeSpread,
            awaySpread: parseFloat(line.spread.away.point),
            total: line.total?.number ? parseFloat(line.total.number) : null
          };
          console.log('Created odds for', gameKey, ':', oddsMap[gameKey]);

        }
      }
    });
    
    console.log('Odds Map:', oddsMap);
    setBettingOdds(oddsMap);
    
    // Cache odds in localStorage
    localStorage.setItem('bettingOdds', JSON.stringify(oddsMap));
    localStorage.setItem('lastOddsFetch', now.toString());
  } catch (error) {
    console.error('Error fetching betting odds:', error);
  }
};

// Helper function to convert full team name to abbreviation
const getTeamAbbreviation = (fullName) => {
  const teamMap = {
    'Atlanta Hawks': 'ATL',
    'Boston Celtics': 'BOS',
    'Brooklyn Nets': 'BKN',
    'Charlotte Hornets': 'CHA',
    'Chicago Bulls': 'CHI',
    'Cleveland Cavaliers': 'CLE',
    'Dallas Mavericks': 'DAL',
    'Denver Nuggets': 'DEN',
    'Detroit Pistons': 'DET',
    'Golden State Warriors': 'GS',
    'Houston Rockets': 'HOU',
    'Indiana Pacers': 'IND',
    'Los Angeles Clippers': 'LAC',
    'LA Clippers': 'LAC',
    'Los Angeles Lakers': 'LAL',
    'Memphis Grizzlies': 'MEM',
    'Miami Heat': 'MIA',
    'Milwaukee Bucks': 'MIL',
    'Minnesota Timberwolves': 'MIN',
    'New Orleans Pelicans': 'NO',
    'New York Knicks': 'NY',
    'Oklahoma City Thunder': 'OKC',
    'Orlando Magic': 'ORL',
    'Philadelphia 76ers': 'PHI',
    'Phoenix Suns': 'PHX',
    'Portland Trail Blazers': 'POR',
    'Sacramento Kings': 'SAC',
    'San Antonio Spurs': 'SA',
    'Toronto Raptors': 'TOR',
    'Utah Jazz': 'UTAH',
    'Washington Wizards': 'WSH'
  };
  
  return teamMap[fullName] || fullName;
};

// Convert betting odds to win probability with live game adjustments
const calculateWinProbability = (spread, favoriteTeam, team, game) => {
  if (!spread) return null;
  
  // Determine if this team is the favorite
  const isFavorite = favoriteTeam === team;
  
  // More accurate spread-to-probability conversion
  // This formula is closer to what sportsbooks use
  let baseProbability;
  
  if (isFavorite) {
    // Formula: 50 + (spread^0.85 * 3.3)
    // This creates a more realistic curve where larger spreads don't linearly increase probability
    baseProbability = 50 + Math.pow(spread, 0.85) * 3.3;
    baseProbability = Math.min(baseProbability, 98);
  } else {
    // Underdog is inverse
    baseProbability = 50 - Math.pow(spread, 0.85) * 3.3;
    baseProbability = Math.max(baseProbability, 2);
  }
  
  // If game is live or final, adjust based on current score differential
  if (game && !game.isPreGame) {
    const awayScore = parseInt(game.awayScore) || 0;
    const homeScore = parseInt(game.homeScore) || 0;
    const scoreDiff = team === game.awayTeam ? (awayScore - homeScore) : (homeScore - awayScore);
    
    // More aggressive adjustments for live games
    let timeMultiplier = 1.0;
    if (game.period === 1) timeMultiplier = 0.4;
    else if (game.period === 2) timeMultiplier = 0.6;
    else if (game.period === 3) timeMultiplier = 1.2;
    else if (game.period === 4) timeMultiplier = 2.0;
    
    const scoreAdjustment = scoreDiff * 2.8 * timeMultiplier;
    baseProbability += scoreAdjustment;
    
    // Clamp between 1% and 99%
    baseProbability = Math.max(1, Math.min(99, baseProbability));
  }
  
  return Math.round(baseProbability);
};


  const searchPlayers = async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    try {
      const response = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const nbaPlayers = data.player?.filter(player => {
        return player.strSport === 'Basketball' && (player.strLeague === 'NBA' || player.strTeam);
      }) || [];
      
      setSearchResults(nbaPlayers);
    } catch (error) {
      console.error('Error searching players:', error);
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (window.searchTimeout) clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      searchPlayers(query);
    }, 300);
  };

  const fetchPlayerStats = async (player) => {
    setLoadingPlayer(true);
    
    try {
      const statsResponse = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupplayer.php?id=${player.idPlayer}`);
      const statsData = await statsResponse.json();
      
      setPlayerStats(statsData.players?.[0] || player);
    } catch (error) {
      console.error('Error fetching player stats:', error);
      setPlayerStats(player);
    }
    
    setLoadingPlayer(false);
  };

  const handlePlayerClick = (player) => {
    setShowSearchResults(false);
    setSearchQuery('');
    setSelectedPlayer(player);
    fetchPlayerStats(player);
  };

  const formatDate = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date();
    return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  };

  const formatGameTime = (dateString) => {
    const gameDate = new Date(dateString);
    const hours = gameDate.getHours();
    const minutes = gameDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const abbreviateChannel = (channel) => {
    if (!channel) return null;
    
    // Exact matches - return as-is or with specific abbreviation
    const exactMatches = {
      'ESPN': 'ESPN',
      'TNT': 'TNT',
      'ABC': 'ABC',
      'NBA TV': 'NBATV',
      'TBS': 'TBS',
      'MSG': 'MSG',
      'NBC Sports Bay Area': 'NBCS',
      'NBC Sports California': 'NBCS',
      'NBC Sports': 'NBCS',
      'FOX Sports': 'FS',
      'CBS Sports': 'CBSS',
      'FanDuel Sports Network - Indiana': 'FDSI',
      'FanDuel Sports Network - Sun': 'FDSS',
      'FanDuel SN Sun': 'FDSS',
      'FanDuel Sports Network - Southeast': 'FDSS',
      'KFAA-TV': 'KFAA',
      'Prime Video': 'AMZN',
      'FanDuel SN SE': 'FDSS',
      'MNMT': 'SN-LA',
      'KUNP 16': 'KUNP',
      'Altitude Sports': 'ALT',
      'NBA League Pass': 'NBALP',
      'Peacock': 'PEA',
      'ALT2/KTVD': 'ALT2',
      'KJZZ-TV': 'KJZZ',
      'Jazz+': 'JAZZ+'
    };
    
    // Check for exact match first
    if (exactMatches[channel]) {
      return exactMatches[channel];
    }
    
    // Check if channel contains key phrases
    if (channel.includes('FanDuel') && channel.includes('Sun')) return 'FDSS';
    if (channel.includes('FanDuel') && channel.includes('Southeast')) return 'FDSS';
    if (channel.includes('FanDuel') && channel.includes('Indiana')) return 'FDSI';
    if (channel.includes('NBC Sports')) return 'NBCS';
    if (channel.includes('MSG')) return 'MSG';
    
    // If it's already short (3 chars or less), return as-is
    if (channel.length <= 4) return channel;
    
    // Otherwise, take initials from each word
    return channel
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  };

  const getOrdinalSuffix = (num) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + 'st';
    if (j === 2 && k !== 12) return num + 'nd';
    if (j === 3 && k !== 13) return num + 'rd';
    return num + 'th';
  };

  const fetchGameDetails = async (gameId) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`);
      const data = await response.json();
      
      const homeTeamId = data.boxscore?.teams?.[1]?.team?.id;
      const awayTeamId = data.boxscore?.teams?.[0]?.team?.id;
      
      let homeRoster = null;
      let awayRoster = null;
      
      if (homeTeamId) {
        const homeResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/roster`);
        const homeData = await homeResponse.json();
        homeRoster = homeData.athletes;
      }
      
      if (awayTeamId) {
        const awayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/roster`);
        const awayData = await awayResponse.json();
        awayRoster = awayData.athletes;
      }
      
      // ADD THESE DEBUG LOGS
      console.log('=== INJURY DEBUG ===');
      console.log('Full game data injuries:', data.injuries);
      console.log('Away team abbr:', data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation);
      console.log('Home team abbr:', data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation);
      console.log('Away roster IDs:', awayRoster?.map(p => p.id));
      console.log('Home roster IDs:', homeRoster?.map(p => p.id));
      
      setGameDetails({
        ...data,
        homeRoster,
        awayRoster
      });
    } catch (error) {
      console.error('Error fetching game details:', error);
    }
    setLoadingDetails(false);
  };
  const handleGameClick = (game) => {
    // Add current state to navigation stack
    setNavigationStack(prev => [...prev, { type: 'home' }]);
    
    setSelectedGame(game);
    setSelectedTeam('away');
    fetchGameDetails(game.id);
  };

  const closeModal = () => {
    if (navigationStack.length > 0) {
      // Go back to previous state
      const previous = navigationStack[navigationStack.length - 1];
      setNavigationStack(prev => prev.slice(0, -1)); // Pop from stack
      
      if (previous.type === 'teamStats') {
        // Go back to team stats - set team info FIRST
        setSelectedTeamInfo(previous.teamInfo);
        fetchTeamStats(previous.teamInfo.abbr);
        setSelectedGame(null);
        setGameDetails(null);
      } else if (previous.type === 'home') {
        // Go back to home
        setSelectedGame(null);
        setGameDetails(null);
      }
    } else {
      // No history, just close
      setSelectedGame(null);
      setGameDetails(null);
    }
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
  };

  const fetchStandings = async () => {
    setLoadingStandings(true);
    try {
      const response = await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
      const data = await response.json();
      
      const eastern = [];
      const western = [];
      
      data.children.forEach(conference => {
        const isEastern = conference.name === 'Eastern Conference';
        const targetArray = isEastern ? eastern : western;
        
        conference.standings.entries.forEach((entry, index) => {
          const team = entry.team;
          const stats = entry.stats;
          
          const getStat = (name) => {
            const stat = stats.find(s => s.name === name);
            return stat ? stat.displayValue : '-';
          };
          
          targetArray.push({
            rank: conference.standings.entries.length - index, // Reverse the rank
            team: team.abbreviation,
            logo: team.logos?.[0]?.href,
            gb: getStat('gamesBehind'),
            wins: getStat('wins'),
            losses: getStat('losses'),
            pct: getStat('winPercent'),
            l10: getStat('Last Ten Games'),
            streak: getStat('streak'),
            home: getStat('Home'),
            away: getStat('Road'),
            ppg: getStat('avgPointsFor'),
            oppg: getStat('avgPointsAgainst')
          });
        });
      });
      
      // Sort by rank (ascending)
      eastern.sort((a, b) => a.rank - b.rank);
      western.sort((a, b) => a.rank - b.rank);
      
      setStandings({ eastern, western });
    } catch (error) {
      console.error('Error fetching standings:', error);
    }
    setLoadingStandings(false);
  };
  
  const openStandings = () => {
    setShowStandings(true);
    if (standings.eastern.length === 0) {
      fetchStandings();
    }
  };
  
  const closeStandings = () => {
    setShowStandings(false);
  };

  const handleTeamClick = (teamAbbr, teamLogo) => {
    // Add current game to navigation stack
    if (selectedGame) {
      setNavigationStack(prev => [...prev, { type: 'game', data: selectedGame, details: gameDetails }]);
    }
    
    setSelectedTeamInfo({ abbr: teamAbbr, logo: teamLogo });
    fetchTeamStats(teamAbbr);
    setSelectedGame(null);
    setGameDetails(null);
  };
  
  const fetchTeamStats = async (teamAbbr) => {
    setLoadingTeamStats(true);
    try {
      const fullName = teamFullNames[teamAbbr];
      
      const standingsResponse = await fetch('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings');
      const standingsData = await standingsResponse.json();
      
      let teamId = null;
      let teamRecord = null;
      let conference = null;
      let conferenceRank = null;
      
      // First, find which conference and get all teams in that conference
      standingsData.children.forEach(conf => {
        const teamEntry = conf.standings.entries.find(entry => entry.team.abbreviation === teamAbbr);
        
        if (teamEntry) {
          teamId = teamEntry.team.id;
          conference = conf.name.replace(' Conference', '');
          
          // Sort all teams in this conference by wins (descending)
          const sortedTeams = [...conf.standings.entries].sort((a, b) => {
            const aWins = parseInt(a.stats.find(s => s.name === 'wins')?.displayValue || 0);
            const bWins = parseInt(b.stats.find(s => s.name === 'wins')?.displayValue || 0);
            return bWins - aWins;
          });
          
          // Find the rank by position in sorted array
          conferenceRank = sortedTeams.findIndex(entry => entry.team.abbreviation === teamAbbr) + 1;
          
          const getStat = (name) => {
            const stat = teamEntry.stats.find(s => s.name === name);
            return stat ? stat.displayValue : '-';
          };
          
          teamRecord = {
            wins: getStat('wins'),
            losses: getStat('losses'),
            pct: getStat('winPercent'),
            gb: getStat('gamesBehind'),
            home: getStat('Home'),
            away: getStat('Road'),
            l10: getStat('Last Ten Games'),
            streak: getStat('streak'),
            oppg: getStat('avgPointsAgainst')
          };
        }
      });
      
      if (!teamId) {
        console.error('Team not found');
        setLoadingTeamStats(false);
        return;
      }
      
      // Fetch team statistics
      const statsResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/statistics`);
      const statsData = await statsResponse.json();
  
      // Fetch recent games for differentials
      const scheduleResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule`);
      const scheduleData = await scheduleResponse.json();
  
      // Get last 10 completed games - with better error handling
      const recentGames = scheduleData.events
  .filter(event => event.competitions?.[0]?.status?.type?.completed)
  .slice(-10)
  .map(event => {
    try {
      const competition = event.competitions[0];
      const teamScore = competition.competitors.find(c => c.team?.id === teamId);
      const opponentScore = competition.competitors.find(c => c.team?.id !== teamId);
      
      if (!teamScore || !opponentScore) {
        console.log('Could not find team or opponent in:', competition);
        return null;
      }
      
      const opponent = opponentScore.team.abbreviation;
      const isHome = teamScore.homeAway === 'home';
      
      // Try to get score from different possible locations
      const teamScoreValue = teamScore.score?.value || teamScore.score || 0;
      const opponentScoreValue = opponentScore.score?.value || opponentScore.score || 0;
      const differential = parseInt(teamScoreValue) - parseInt(opponentScoreValue);
      
      // Get logos - they should be in the team object
      const teamLogo = teamScore.team?.logo || teamScore.team?.logos?.[0]?.href || null;
      const opponentLogo = opponentScore.team?.logo || opponentScore.team?.logos?.[0]?.href || null;
      
      return {
        gameId: event.id,
        opponent,
        opponentLogo,
        teamAbbr: teamScore.team.abbreviation,
        teamLogo,
        isHome,
        differential,
        teamScore: teamScoreValue,
        opponentScore: opponentScoreValue
      };
    } catch (err) {
      console.error('Error processing game:', err, event);
      return null;
    }
  })
  .filter(game => game !== null);
  
      setTeamStats({
        record: teamRecord,
        conference,
        conferenceRank,
        stats: statsData.results?.stats?.categories || [],
        recentGames
      });
    } catch (error) {
      console.error('Error fetching team stats:', error);
    }
    setLoadingTeamStats(false);
  };
  
  const closeTeamModal = () => {
    if (navigationStack.length > 0) {
      // Go back to previous state
      const previous = navigationStack[navigationStack.length - 1];
      setNavigationStack(prev => prev.slice(0, -1)); // Pop from stack
      
      if (previous.type === 'game') {
        // Go back to game - set game FIRST before closing team modal
        setSelectedGame(previous.data);
        setGameDetails(previous.details);
        setSelectedTeamInfo(null);
        setTeamStats(null);
      } else if (previous.type === 'home') {
        // Go back to home
        setSelectedTeamInfo(null);
        setTeamStats(null);
      }
    } else {
      // No history, just close
      setSelectedTeamInfo(null);
      setTeamStats(null);
    }
  };
  
  const handleRecentGameClick = (recentGame) => {
    // Add current team stats to navigation stack
    setNavigationStack(prev => [...prev, { type: 'teamStats', teamInfo: selectedTeamInfo }]);
    
    // Close team stats
    setSelectedTeamInfo(null);
    setTeamStats(null);
    
    // Create and open game
    const gameObj = {
      id: recentGame.gameId,
      awayTeam: recentGame.isHome ? recentGame.opponent : recentGame.teamAbbr,
      homeTeam: recentGame.isHome ? recentGame.teamAbbr : recentGame.opponent,
      awayLogo: recentGame.isHome ? recentGame.opponentLogo : recentGame.teamLogo,
      homeLogo: recentGame.isHome ? recentGame.teamLogo : recentGame.opponentLogo,
      awayScore: String(recentGame.isHome ? recentGame.opponentScore : recentGame.teamScore),
      homeScore: String(recentGame.isHome ? recentGame.teamScore : recentGame.opponentScore),
      awayRecord: '',
      homeRecord: '',
      period: 4,
      isFinal: true,
      isPreGame: false,
      isLive: false
    };
    
    setSelectedGame(gameObj);
    fetchGameDetails(recentGame.gameId);
  };
  
  const generateDateRange = () => {
    const dates = [];
    const today = new Date();
    for (let i = -3; i <= 10; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const formatDateHeader = (date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
    return { month, day, dayOfWeek };
  };

  const isSameDay = (date1, date2) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 pt-12 pb-4">
      <div className="flex justify-between items-start mb-1">
  <div>
  <img 
      
      src="/slate-logo.png" 
      alt="Slate" 
      className="h-8"
    
    />
  </div>
</div>

<div className="flex justify-between items-center mt-2 mb-4">
  <p className="text-gray-400 text-sm">{formatDate()}</p>
  <button
    onClick={openStandings}
    className="text-blue-500 font-semibold text-sm hover:text-blue-400"
  >
    Standings
  </button>
</div>

<div className="mt-2 relative">
  <div className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center">
            <Search className="w-5 h-5 text-gray-400 mr-3" />
            <input 
              type="text" 
              placeholder="Search for players..." 
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchQuery && setShowSearchResults(true)}
              className="bg-transparent text-white placeholder-gray-400 outline-none flex-1"
            />
          </div>

          {showSearchResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 rounded-xl max-h-96 overflow-y-auto z-50 shadow-lg border border-zinc-800">
              {isSearching ? (
                <div className="p-4 text-center text-gray-400">Searching...</div>
              ) : searchResults.length > 0 ? (
                <div className="py-2">
                  {searchResults.map((player) => (
                    <div
                      key={player.idPlayer}
                      className="px-4 py-3 hover:bg-zinc-800 cursor-pointer flex items-center gap-3"
                      onClick={() => handlePlayerClick(player)}
                    >
                      {player.strThumb && (
                        <img 
                          src={player.strThumb} 
                          alt={player.strPlayer}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-semibold">{player.strPlayer}</div>
                        <div className="text-sm text-gray-400">
                          {player.strTeam} • {player.strPosition}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="p-4 text-center text-gray-400">No players found</div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-2">
            {generateDateRange().map((date, idx) => {
              const { month, day, dayOfWeek } = formatDateHeader(date);
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <button
                key={idx}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center px-4 py-2 rounded-xl min-w-[70px] transition-colors ${
                  isSelected ? 'bg-blue-600' : 'bg-zinc-900'
                }`}
              >
             <span className="text-xs text-gray-400 whitespace-nowrap">{month} {day}</span>
                <span className={`text-base font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {dayOfWeek}
                </span>
              </button>
              );
            })}
          </div>
        </div>
      </div>

      {showSearchResults && !selectedPlayer && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowSearchResults(false)}
        />
      )}

<div className="px-4 mt-0 pb-8">
  

  <div className="grid grid-cols-2 gap-3">
  {loading ? (
  <div className="col-span-2 bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
    Loading games...
  </div>
) : liveGames.length === 0 ? (
  <div className="col-span-2 bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
    No live games right now
  </div>
    ) : (
      liveGames.map(game => (
        <div 
          key={game.id} 
          className="bg-zinc-900 rounded-2xl p-3 cursor-pointer hover:bg-zinc-800 transition-colors"
          onClick={() => handleGameClick(game)}
        >
          <div className="flex flex-col">
            {/* TOP: Status/Time - Left aligned above teams */}
            <div className="mb-2">
            {game.isLive && (
  <div className="flex items-center gap-2">
    <span className="text-red-500 text-xs font-semibold">LIVE</span>
    <span className="text-gray-400 text-xs">
      {game.clock === '0.0' || game.clock === '0:00' 
        ? (game.period === 2 ? 'Half' : `End Q${game.period}`)
        : `${game.period}Q ${game.clock}`}
    </span>
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
      
            {/* MIDDLE: Teams + Scores in rows */}
            <div className="space-y-1 mb-3">
            {/* Away Team Row */}
<div className={`flex items-center justify-between ${
  game.isFinal && parseInt(game.awayScore) > parseInt(game.homeScore) 
    ? 'border-l-2 border-blue-500 -ml-3 pl-3' 
    : ''
}`}>
 <div className="flex items-center gap-2">
 <img src={game.awayLogo} alt={game.awayTeam} className="w-8 h-8" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{game.awayTeam}</span>
                    {game.awayRecord && (
                      <span className="text-xs text-gray-400">{game.awayRecord}</span>
                    )}
                  </div>
                </div>
                <span className={`text-3xl font-bold ${
                  !game.isPreGame && parseInt(game.awayScore) > parseInt(game.homeScore) 
                    ? 'text-white' 
                    : !game.isPreGame && parseInt(game.awayScore) < parseInt(game.homeScore)
                    ? 'text-gray-500'
                    : 'text-white'
                }`}>
                  {game.awayScore}
                </span>
              </div>
      
            {/* Home Team Row */}
<div className={`flex items-center justify-between ${
  game.isFinal && parseInt(game.homeScore) > parseInt(game.awayScore) 
    ? 'border-l-2 border-blue-500 -ml-3 pl-3' 
    : ''
}`}>
<div className="flex items-center gap-2">
<img src={game.homeLogo} alt={game.homeTeam} className="w-8 h-8" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{game.homeTeam}</span>
                    {game.homeRecord && (
                      <span className="text-xs text-gray-400">{game.homeRecord}</span>
                    )}
                  </div>
                </div>
                <span className={`text-3xl font-bold ${
                  !game.isPreGame && parseInt(game.homeScore) > parseInt(game.awayScore) 
                    ? 'text-white' 
                    : !game.isPreGame && parseInt(game.homeScore) < parseInt(game.awayScore)
                    ? 'text-gray-500'
                    : 'text-white'
                }`}>
                  {game.homeScore}
                </span>
              </div>
            </div>
      
            {/* BOTTOM: Betting Odds - Below teams */}
{(() => {
  const gameKey = `${game.awayTeam}-${game.homeTeam}`;
  const odds = bettingOdds[gameKey];
  
  if (odds && odds.spread) {
    console.log('Game:', game.awayTeam, '@', game.homeTeam, 'Odds object:', odds);
    
    const awayProb = calculateWinProbability(odds.spread, odds.favoriteTeam, game.awayTeam, game);
    const homeProb = calculateWinProbability(odds.spread, odds.favoriteTeam, game.homeTeam, game);
    
    return (
      <div className="flex items-start justify-between text-xs pt-2 border-t border-zinc-800">
        <div className="flex flex-col text-orange-400">
          <span>{odds.favoriteTeam} by {odds.spread}</span>
          {odds.total && <span>o{odds.total}</span>}
        </div>
        <div className="flex flex-col items-end">
          <span className={awayProb > homeProb ? 'text-green-500' : 'text-red-500'}>
            {game.awayTeam} {awayProb}%
          </span>
          <span className={homeProb > awayProb ? 'text-green-500' : 'text-red-500'}>
            {game.homeTeam} {homeProb}%
          </span>
        </div>
      </div>
    );
  }
  return null;
})()}
          </div>
        </div>
      ))
    )}
  </div>
</div>

{selectedPlayer && (
  <div 
    className="fixed inset-0 bg-black bg-opacity-95 z-[100] overflow-y-auto transition-transform duration-300 ease-out"
    style={{ transform: `translateX(${swipeOffset}px)` }}
  >
          <div className="min-h-screen px-4 py-8">
            <div className="max-w-2xl mx-auto">
            <div className="flex items-center mb-6">
  <button 
    onClick={closePlayerModal}
    className="text-gray-400 hover:text-white text-2xl font-light mr-4"
  >
    ‹
  </button>
  <h2 className="text-2xl font-bold">Player Stats</h2>
</div>

              {loadingPlayer ? (
                <div className="text-center py-12 text-gray-400">Loading player data...</div>
              ) : playerStats ? (
                <div>
                  <div className="bg-zinc-900 rounded-2xl p-6 mb-6 flex items-center gap-6">
                    {playerStats.strThumb && (
                      <img 
                        src={playerStats.strThumb} 
                        alt={playerStats.strPlayer}
                        className="w-24 h-24 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-1">{playerStats.strPlayer}</h3>
                      <div className="text-gray-400">
                        <div>{playerStats.strTeam}</div>
                        <div className="text-sm mt-1">
                          {playerStats.strPosition} • #{playerStats.strNumber}
                        </div>
                        <div className="text-sm">
                          Height: {playerStats.strHeight} • Weight: {playerStats.strWeight}
                        </div>
                      </div>
                    </div>
                  </div>

                  

                  {playerStats.strDescriptionEN && (
                    <div className="bg-zinc-900 rounded-2xl p-6">
                      <h4 className="text-xl font-bold mb-4">About</h4>
                      <p className="text-gray-300 text-sm leading-relaxed">
                        {playerStats.strDescriptionEN}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
     {showStandings && (
  <div 
    className="fixed inset-0 bg-black bg-opacity-95 z-[100] overflow-y-auto transition-transform duration-300 ease-out"
    style={{ transform: `translateX(${swipeOffset}px)` }}
  >
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto">
      <div className="flex items-center mb-6">
  <button 
    onClick={closeStandings}
    className="text-gray-400 hover:text-white text-2xl font-light mr-4"
  >
    ‹
  </button>
  <h2 className="text-2xl font-bold">NBA Standings</h2>
</div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSelectedConference('Eastern')}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
              selectedConference === 'Eastern' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
            }`}
          >
            Eastern
          </button>
          <button
            onClick={() => setSelectedConference('Western')}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
              selectedConference === 'Western' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
            }`}
          >
            Western
          </button>
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
                    <th className="text-center py-3 px-3">GB</th>
                    <th className="text-center py-3 px-3">W-L</th>
                    <th className="text-center py-3 px-3">PCT</th>
                    <th className="text-center py-3 px-3">L10</th>
                    <th className="text-center py-3 px-3">STRK</th>
                    <th className="text-center py-3 px-3">HOME</th>
                    <th className="text-center py-3 px-3">AWAY</th>
                    <th className="text-center py-3 px-3">PPG</th>
                    <th className="text-center py-3 px-3">OPPG</th>
                  </tr>
                </thead>
                <tbody>
  {(selectedConference === 'Eastern' ? standings.eastern : standings.western).map((team, idx) => (
  <tr 
    key={idx} 
    onClick={() => handleTeamClick(team.team, team.logo)}
    className={`border-t hover:bg-zinc-800 cursor-pointer transition-colors ${
      idx === 6 || idx === 10 ? 'border-gray-400 border-dashed'
   : 'border-zinc-800'
    }`}
  >
                      <td className="py-3 px-3 sticky left-0 bg-zinc-900 font-semibold text-blue-500">{idx + 1}</td>
                      <td className="py-3 px-3 sticky left-[40px] bg-zinc-900">
                        <div className="flex items-center gap-2">
                          {team.logo && (
                            <img src={team.logo} alt={team.team} className="w-6 h-6" />
                          )}
                          <span className="font-semibold">{team.team}</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3 text-gray-300">{team.gb}</td>
                      <td className="text-center py-3 px-3 font-semibold">{team.wins}-{team.losses}</td>
                      <td className="text-center py-3 px-3">{team.pct}</td>
                  <td className="text-center py-3 px-3 whitespace-nowrap">{team.l10}</td>
                      <td className="text-center py-3 px-3">
                        <span className={team.streak.startsWith('W') ? 'text-green-500' : 'text-red-500'}>
                          {team.streak}
                        </span>
                      </td>
                      <td className="text-center py-3 px-3">{team.home}</td>
                      <td className="text-center py-3 px-3">{team.away}</td>
                      <td className="text-center py-3 px-3">{team.ppg}</td>
                      <td className="text-center py-3 px-3">{team.oppg}</td>
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

{selectedGame && (
  <div 
    className="fixed inset-0 bg-black bg-opacity-95 z-50 overflow-y-auto transition-transform duration-300 ease-out"
    style={{ transform: `translateX(${swipeOffset}px)` }}
  >
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6">
                <button 
                  onClick={closeModal}
                  className="text-gray-400 hover:text-white text-2xl font-light mr-4"
                >
                  ‹
                </button>
                <h2 className="text-2xl font-bold">Game Details</h2>
              </div>
              <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
              <div className="flex items-start justify-between min-h-[120px]">
    {/* AWAY TEAM - LEFT SIDE */}
    <div 
  className="flex flex-col items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
  onClick={() => handleTeamClick(selectedGame.awayTeam, selectedGame.awayLogo)}
>
  <img src={selectedGame.awayLogo} alt={selectedGame.awayTeam} className="w-10 h-10 mb-1" />
  <span className="text-base font-bold">{selectedGame.awayTeam}</span>
  {selectedGame.awayRecord && (
    <span className="text-xs text-gray-400">{selectedGame.awayRecord}</span>
  )}
      <span className={`text-4xl font-bold mt-3 ${
        !selectedGame.isPreGame && parseInt(selectedGame.awayScore) > parseInt(selectedGame.homeScore) 
          ? 'text-white' 
          : !selectedGame.isPreGame && parseInt(selectedGame.awayScore) < parseInt(selectedGame.homeScore)
          ? 'text-gray-500'
          : 'text-white'
      }`}>
        {selectedGame.awayScore}
      </span>
    </div>

 {/* CENTER - TIME/LIVE/ODDS */}
<div className="flex flex-col items-center px-6 pt-2">
  {selectedGame.isLive && (
    <div className="text-center">
      <span className="text-red-500 font-semibold text-sm">LIVE</span>
      <div className="text-sm text-gray-400">
  {selectedGame.clock === '0.0' || selectedGame.clock === '0:00'
    ? (selectedGame.period === 2 ? 'Half' : `End Q${selectedGame.period}`)
    : `${selectedGame.period}Q • ${selectedGame.clock}`}
</div>
      
     {/* Betting Odds FOR LIVE GAMES */}
{(() => {
  const gameKey = `${selectedGame.awayTeam}-${selectedGame.homeTeam}`;
  const odds = bettingOdds[gameKey];
  
  if (odds && odds.spread) {
    const awayProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.awayTeam, selectedGame);
    const homeProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.homeTeam, selectedGame);
    
    return (
      <div className="mt-2">
        <div className="text-xs text-orange-400">
          {odds.favoriteTeam} by {odds.spread}
        </div>
        {odds.total && (
          <div className="text-xs text-orange-400">
            o{odds.total}
          </div>
        )}
        <div className="text-xs mt-1">
          <div className={awayProb > homeProb ? 'text-green-500' : 'text-red-500'}>
            {selectedGame.awayTeam} {awayProb}%
          </div>
          <div className={homeProb > awayProb ? 'text-green-500' : 'text-red-500'}>
            {selectedGame.homeTeam} {homeProb}%
          </div>
        </div>
      </div>
    );
  }
  return null;
})()}
    </div>
  )}
  
  {selectedGame.isPreGame && (
  <div className="text-center">
    <div className="text-gray-400">{formatGameTime(selectedGame.gameTime)}</div>
    {selectedGame.allBroadcasts && selectedGame.allBroadcasts.length > 0 && (
      <div className="text-xs text-gray-500 mt-1">
        {selectedGame.allBroadcasts.map(ch => abbreviateChannel(ch)).join(' • ')}
      </div>
    )}

      {(() => {
        const gameKey = `${selectedGame.awayTeam}-${selectedGame.homeTeam}`;
        const odds = bettingOdds[gameKey];
        
        if (odds && odds.spread) {
          const awayProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.awayTeam);
          const homeProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.homeTeam);
          
          return (
            <div className="mt-1">
              <div className="text-xs text-orange-400">
                {odds.favoriteTeam} by {odds.spread}
              </div>
              {odds.total && (
                <div className="text-xs text-orange-400">
                  o{odds.total}
                </div>
              )}
              <div className="text-xs mt-1">
                <div className={awayProb > homeProb ? 'text-green-500' : 'text-red-500'}>
                  {selectedGame.awayTeam} {awayProb}%
                </div>
                <div className={homeProb > awayProb ? 'text-green-500' : 'text-red-500'}>
                  {selectedGame.homeTeam} {homeProb}%
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  )}
  
  {selectedGame.isFinal && (
    <div className="text-gray-400 font-semibold">FINAL</div>
  )}
</div>

  {/* HOME TEAM - RIGHT SIDE */}
<div 
  className="flex flex-col items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
  onClick={() => handleTeamClick(selectedGame.homeTeam, selectedGame.homeLogo)}
>
  <img src={selectedGame.homeLogo} alt={selectedGame.homeTeam} className="w-10 h-10 mb-1" />
  <span className="text-base font-bold">{selectedGame.homeTeam}</span>
  {selectedGame.homeRecord && (
    <span className="text-xs text-gray-400">{selectedGame.homeRecord}</span>
  )}
  <span className={`text-4xl font-bold mt-3 ${
    !selectedGame.isPreGame && parseInt(selectedGame.homeScore) > parseInt(selectedGame.awayScore) 
      ? 'text-white' 
      : !selectedGame.isPreGame && parseInt(selectedGame.homeScore) < parseInt(selectedGame.awayScore)
      ? 'text-gray-500'
      : 'text-white'
  }`}>
    {selectedGame.homeScore}
  </span>
</div>
  </div>
</div>

{/* Quarter-by-Quarter Breakdown */}
{!selectedGame.isPreGame && gameDetails?.header?.competitions?.[0]?.competitors && (
  <div className="bg-transparent rounded-2xl px-2 py-0..5 mb-4">

    <table className="w-full text-center">
      <thead>
        <tr className="text-gray-400 text-sm">
          <th className="text-left pb-1 w-20">Team</th>
          <th className="pb-1 w-1/5">1st</th>
          <th className="pb-1 w-1/5">2nd</th>
          <th className="pb-1 w-1/5">3rd</th>
          <th className="pb-1 w-1/5">4th</th>
        </tr>
      </thead>
      <tbody>
        {/* Away Team Row */}
        <tr className="border-t border-zinc-800">
          <td className="text-left py-1">
            <span className="font-semibold">{selectedGame.awayTeam}</span>
          </td>
          {(() => {
            const awayTeam = gameDetails.header.competitions[0].competitors.find(c => c.homeAway === 'away');
            const quarters = awayTeam?.linescores || [];
            const currentPeriod = selectedGame.period;
            
            return (
              <>
                {[1, 2, 3, 4].map((quarterNum) => (
                  <td key={`away-q${quarterNum}`} className="text-lg font-semibold py-3">
                    {quarterNum <= currentPeriod && quarters[quarterNum - 1]?.displayValue 
                      ? quarters[quarterNum - 1].displayValue 
                      : '-'}
                  </td>
                ))}
              </>
            );
          })()}
        </tr>

        {/* Home Team Row */}
        <tr className="border-t border-zinc-800">
          <td className="text-left py-2">
            <span className="font-semibold">{selectedGame.homeTeam}</span>
          </td>
          {(() => {
            const homeTeam = gameDetails.header.competitions[0].competitors.find(c => c.homeAway === 'home');
            const quarters = homeTeam?.linescores || [];
            const currentPeriod = selectedGame.period;
            
            return (
              <>
                {[1, 2, 3, 4].map((quarterNum) => (
                  <td key={`home-q${quarterNum}`} className="text-lg font-semibold py-2">
                    {quarterNum <= currentPeriod && quarters[quarterNum - 1]?.displayValue 
                      ? quarters[quarterNum - 1].displayValue 
                      : '-'}
                  </td>
                ))}
              </>
            );
          })()}
        </tr>
      </tbody>
    </table>
  </div>
)}
{/* Team Selection Tabs */}
<div className="flex gap-2 mb-3">
<button
onClick={() => setSelectedTeam('away')}
className={`flex-1 py-2 rounded-xl font-bold text-base transition-colors ${
selectedTeam === 'away' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
}`}
>
{selectedGame.awayTeam}
</button>
<button
onClick={() => setSelectedTeam('game')}
className={`flex-1 py-2 rounded-xl font-bold text-base transition-colors ${
selectedTeam === 'game' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
}`}
>
    Game
</button>
<button
onClick={() => setSelectedTeam('home')}
className={`flex-1 py-2 rounded-xl font-bold text-base transition-colors ${
selectedTeam === 'home' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
}`}
>
{selectedGame.homeTeam}
</button>
</div>
              

{loadingDetails ? (
  <div className="text-center py-12 text-gray-400">Loading details...</div>
) : gameDetails ? (
  <div>
    {selectedTeam === 'game' && !selectedGame.isPreGame ? (
      /* TEAM COMPARISON VIEW */
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="space-y-4">
          {(() => {
          const awayStats = gameDetails.boxscore?.teams?.[0]?.statistics || [];
          const homeStats = gameDetails.boxscore?.teams?.[1]?.statistics || [];
          
          // DEBUG: Log all stat names so we can see what's available
          console.log('=== ALL AVAILABLE STAT NAMES ===');
          awayStats.forEach(stat => {
            console.log(`Stat name: "${stat.name}" = ${stat.displayValue}`);
          });
          
         // Helper to find stat by name
const findStat = (stats, name) => {
  const stat = stats.find(s => s.name === name);
  return stat ? stat.displayValue : '0';
};

// ADD THIS NEW FUNCTION - Calculate Offensive Efficiency
const calculateOffensiveEfficiency = (stats, teamIndex) => {
  // Get FGA from the combined stat "fieldGoalsMade-fieldGoalsAttempted" (e.g., "43-93")
  const fgCombined = findStat(stats, 'fieldGoalsMade-fieldGoalsAttempted');
  const fga = parseFloat(fgCombined.split('-')[1]) || 0;
  
  // Get FTA from the combined stat "freeThrowsMade-freeThrowsAttempted" (e.g., "20-25")
  const ftCombined = findStat(stats, 'freeThrowsMade-freeThrowsAttempted');
  const fta = parseFloat(ftCombined.split('-')[1]) || 0;
  
  const oreb = parseFloat(findStat(stats, 'offensiveRebounds')) || 0;
  const turnovers = parseFloat(findStat(stats, 'turnovers')) || 0;
  
  // Get points from the game - use selectedGame scores
  const points = teamIndex === 0 
    ? parseFloat(selectedGame.awayScore) || 0 
    : parseFloat(selectedGame.homeScore) || 0;
  
  // Calculate possessions: FGA + 0.44*FTA - OffensiveRebounds + Turnovers
  const possessions = fga + (0.44 * fta) - oreb + turnovers;
  
  // Calculate offensive efficiency: (Points / Possessions) * 100
  const efficiency = possessions > 0 ? (points / possessions) * 100 : 0;
  
  return efficiency.toFixed(1);
};

// Calculate Defensive Efficiency (points allowed per 100 possessions)
const calculateDefensiveEfficiency = (stats, teamIndex) => {
  // For defensive efficiency, we need the OPPONENT's offensive stats
  // Team 0's defense = Team 1's offense, and vice versa
  const opponentStats = teamIndex === 0 ? homeStats : awayStats;
  
  // Get opponent's FGA from the combined stat
  const fgCombined = findStat(opponentStats, 'fieldGoalsMade-fieldGoalsAttempted');
  const fga = parseFloat(fgCombined.split('-')[1]) || 0;
  
  // Get opponent's FTA from the combined stat
  const ftCombined = findStat(opponentStats, 'freeThrowsMade-freeThrowsAttempted');
  const fta = parseFloat(ftCombined.split('-')[1]) || 0;
  
  // Get opponent's offensive rebounds and turnovers
  const oreb = parseFloat(findStat(opponentStats, 'offensiveRebounds')) || 0;
  const turnovers = parseFloat(findStat(opponentStats, 'turnovers')) || 0;
  
  // Get opponent's points (points this team allowed)
  const points = teamIndex === 0 
    ? parseFloat(selectedGame.homeScore) || 0 
    : parseFloat(selectedGame.awayScore) || 0;
  
  // Calculate opponent's possessions
  const possessions = fga + (0.44 * fta) - oreb + turnovers;
  
  // Calculate defensive efficiency: (Points Allowed / Possessions) * 100
  const efficiency = possessions > 0 ? (points / possessions) * 100 : 0;
  
  return efficiency.toFixed(1);
};

// Helper to parse made/attempted and get percentage
const parseShootingStat = (stats, pctName, combinedName) => {
            const pct = parseFloat(findStat(stats, pctName)) || 0;
            const combined = findStat(stats, combinedName); // e.g., "26-65"
            
            // Split the "26-65" format into made and attempted
            const parts = combined.split('-');
            const made = parts[0] || '0';
            const attempted = parts[1] || '0';
            
            return { pct, made, attempted };
          };

       // Define stats to compare (matching the image order)
const statsToCompare = [
  
  { type: 'shooting', pctName: 'fieldGoalPct', combinedName: 'fieldGoalsMade-fieldGoalsAttempted', label: 'FG' },
          { type: 'shooting', pctName: 'threePointFieldGoalPct', combinedName: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', label: '3FG' },
          { type: 'shooting', pctName: 'freeThrowPct', combinedName: 'freeThrowsMade-freeThrowsAttempted', label: 'FTS' },
          { name: 'turnovers', label: 'Turnovers', format: 'number', inverse: true },
          { name: 'totalRebounds', label: 'Rebounds', format: 'number' },
          { name: 'assists', label: 'Assists', format: 'number' },
          { name: 'blocks', label: 'Blocks', format: 'number' },
          { name: 'defensiveRebounds', label: 'Defensive rebounds', format: 'number' },
          { name: 'offensiveRebounds', label: 'Offensive rebounds', format: 'number' },
          { name: 'turnoverPoints', label: 'Points off turnovers', format: 'number' },
          { name: 'pointsInPaint', label: 'Points-in-paint', format: 'number' },
          { name: 'fastBreakPoints', label: 'Fastbreak points', format: 'number' },
          { name: 'steals', label: 'Steals', format: 'number' },
          { name: 'fouls', label: 'Personal fouls', format: 'number', inverse: true },
          { name: 'largestLead', label: 'Largest lead', format: 'number' },
          { name: 'leadPercentage', label: 'Time leading', format: 'percentage' },
          { type: 'efficiency', label: 'Offensive Efficiency' },
          { type: 'defEfficiency', label: 'Defensive Efficiency' },
          { name: 'leadChanges', label: 'Lead changes', format: 'number' }
        ];

        return statsToCompare.map((statDef, idx) => {
          if (statDef.type === 'efficiency') {
            // Handle offensive efficiency
            console.log('gameDetails.boxscore:', gameDetails.boxscore);
            console.log('Team 0 score:', gameDetails.boxscore?.teams?.[0]?.team?.score);
            console.log('Team 1 score:', gameDetails.boxscore?.teams?.[1]?.team?.score);
            const awayEff = parseFloat(calculateOffensiveEfficiency(awayStats, 0));
            const homeEff = parseFloat(calculateOffensiveEfficiency(homeStats, 1));
            
            const awayBetter = awayEff > homeEff;
            const homeBetter = homeEff > awayEff;
            
            const total = awayEff + homeEff;
            const awayBarPercent = total > 0 ? (awayEff / total) * 100 : 50;
            const homeBarPercent = total > 0 ? (homeEff / total) * 100 : 50;
            
            return (
              <div key={idx}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-lg font-bold ${awayBetter ? 'text-white' : 'text-gray-500'}`}>
                    {awayEff}
                  </span>
                  <span className="text-gray-400 text-sm font-semibold">{statDef.label}</span>
                  <span className={`text-lg font-bold ${homeBetter ? 'text-white' : 'text-gray-500'}`}>
                    {homeEff}
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden">
  <div 
    style={{ 
      width: `${awayBarPercent}%`,
      backgroundColor: teamColors[selectedGame.awayTeam] || '#CA8A04'
    }}
  />
  <div 
    style={{ 
      width: `${homeBarPercent}%`,
      backgroundColor: teamColors[selectedGame.homeTeam] || '#1E3A8A'
    }}
  />
</div>
              </div>
        );
      } else if (statDef.type === 'defEfficiency') {
        // Handle defensive efficiency (LOWER is better)
        const awayDefEff = parseFloat(calculateDefensiveEfficiency(awayStats, 0));
        const homeDefEff = parseFloat(calculateDefensiveEfficiency(homeStats, 1));
        
        const awayBetter = awayDefEff < homeDefEff; // Lower is better for defense
        const homeBetter = homeDefEff < awayDefEff;
        
        const total = awayDefEff + homeDefEff;
        const awayBarPercent = total > 0 ? (awayDefEff / total) * 100 : 50;
        const homeBarPercent = total > 0 ? (homeDefEff / total) * 100 : 50;
        
        return (
          <div key={idx}>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-lg font-bold ${awayBetter ? 'text-white' : 'text-gray-500'}`}>
                {awayDefEff}
              </span>
              <span className="text-gray-400 text-sm font-semibold">{statDef.label}</span>
              <span className={`text-lg font-bold ${homeBetter ? 'text-white' : 'text-gray-500'}`}>
                {homeDefEff}
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden">
  <div 
    style={{ 
      width: `${awayBarPercent}%`,
      backgroundColor: teamColors[selectedGame.awayTeam] || '#CA8A04'
    }}
  />
  <div 
    style={{ 
      width: `${homeBarPercent}%`,
      backgroundColor: teamColors[selectedGame.homeTeam] || '#1E3A8A'
    }}
  />
</div>
          </div>
        );
      } else if (statDef.type === 'shooting') {
                // Handle shooting stats (FG, 3FG, FTS)
                const away = parseShootingStat(awayStats, statDef.pctName, statDef.combinedName);
                const home = parseShootingStat(homeStats, statDef.pctName, statDef.combinedName);
                
                // Log to see what data we're getting
                console.log(`${statDef.label} - Away:`, away, 'Home:', home);
                console.log('All away stats:', awayStats);
                
                const awayBetter = away.pct > home.pct;
                const homeBetter = home.pct > away.pct;
                
                const total = away.pct + home.pct;
                const awayBarPercent = total > 0 ? (away.pct / total) * 100 : 50;
                const homeBarPercent = total > 0 ? (home.pct / total) * 100 : 50;

                return (
                  <div key={idx}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-lg font-bold ${awayBetter ? 'text-white' : 'text-gray-500'}`}>
                        {away.made}/{away.attempted} <span className="text-sm ml-1">{away.pct.toFixed(1)}%</span>
                      </span>
                      <span className="text-gray-400 text-sm font-semibold">{statDef.label}</span>
                      <span className={`text-lg font-bold ${homeBetter ? 'text-white' : 'text-gray-500'}`}>
                        <span className="text-sm mr-1">{home.pct.toFixed(1)}%</span> {home.made}/{home.attempted}
                      </span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden">
  <div 
    style={{ 
      width: `${awayBarPercent}%`,
      backgroundColor: teamColors[selectedGame.awayTeam] || '#CA8A04'
    }}
  />
  <div 
    style={{ 
      width: `${homeBarPercent}%`,
      backgroundColor: teamColors[selectedGame.homeTeam] || '#1E3A8A'
    }}
  />
</div>
                  </div>
                );
              } else {
                // Handle regular number stats
                const awayValue = parseFloat(findStat(awayStats, statDef.name)) || 0;
                const homeValue = parseFloat(findStat(homeStats, statDef.name)) || 0;
                const total = awayValue + homeValue;
                const awayPercent = total > 0 ? (awayValue / total) * 100 : 50;
                const homePercent = total > 0 ? (homeValue / total) * 100 : 50;

                const awayBetter = statDef.inverse ? awayValue < homeValue : awayValue > homeValue;
                const homeBetter = statDef.inverse ? homeValue < awayValue : homeValue > awayValue;

                return (
                  <div key={idx}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-lg font-bold ${awayBetter ? 'text-white' : 'text-gray-500'}`}>
                        {statDef.format === 'percentage' ? `${awayValue.toFixed(0)}%` : awayValue}
                      </span>
                      <span className="text-gray-400 text-sm font-semibold">{statDef.label}</span>
                      <span className={`text-lg font-bold ${homeBetter ? 'text-white' : 'text-gray-500'}`}>
                        {statDef.format === 'percentage' ? `${homeValue.toFixed(0)}%` : homeValue}
                      </span>
                      </div>
                    <div className="flex h-2 rounded-full overflow-hidden">
                      <div 
                        style={{ 
                          width: `${awayPercent}%`,
                          backgroundColor: teamColors[selectedGame.awayTeam] || '#CA8A04'
                        }}
                      />
                      <div 
                        style={{ 
                          width: `${homePercent}%`,
                          backgroundColor: teamColors[selectedGame.homeTeam] || '#1E3A8A'
                        }}
                      />
                    </div>
                  </div>
                );
              }
            });
          })()}
        </div>
      </div>
   ) : selectedTeam === 'game' && selectedGame.isPreGame ? (
    <div className="space-y-3">
      {/* Away Team Injuries */}
      <div className="bg-zinc-900 rounded-2xl p-3">
        <h3 className="text-base font-bold mb-2 flex items-center gap-2">
          <img src={selectedGame.awayLogo} alt={selectedGame.awayTeam} className="w-5 h-5" />
          {selectedGame.awayTeam} Injuries
        </h3>
        {(() => {
          const awayInjuries = gameDetails?.injuries?.find(
            injData => injData.team?.abbreviation === selectedGame.awayTeam
          );
          
          if (!awayInjuries || awayInjuries.injuries.length === 0) {
            return <div className="text-gray-400 text-xs">No injuries reported</div>;
          }
          
          return (
            <div className="space-y-1">
              {awayInjuries.injuries.map((inj, idx) => (
                <div key={idx} className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2">
                    {inj.athlete.headshot && (
                      <img 
                      src={inj.athlete.headshot.href} 
                      alt={inj.athlete.displayName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    )}
                    <div>
                      <div className="font-semibold text-xs">{inj.athlete.displayName}</div>
                      <div className="text-xs text-gray-400">
                        {inj.athlete.position?.abbreviation || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-red-500 text-xs font-semibold">{inj.status}</div>
                    <div className="text-xs text-gray-400">{inj.details?.type || 'Injury'}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
  
      {/* Home Team Injuries */}
      <div className="bg-zinc-900 rounded-2xl p-3">
        <h3 className="text-base font-bold mb-2 flex items-center gap-2">
          <img src={selectedGame.homeLogo} alt={selectedGame.homeTeam} className="w-5 h-5" />
          {selectedGame.homeTeam} Injuries
        </h3>
        {(() => {
          const homeInjuries = gameDetails?.injuries?.find(
            injData => injData.team?.abbreviation === selectedGame.homeTeam
          );
          
          if (!homeInjuries || homeInjuries.injuries.length === 0) {
            return <div className="text-gray-400 text-xs">No injuries reported</div>;
          }
          
          return (
            <div className="space-y-1">
              {homeInjuries.injuries.map((inj, idx) => (
                <div key={idx} className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2">
                    {inj.athlete.headshot && (
                    <img 
                    src={inj.athlete.headshot.href} 
                    alt={inj.athlete.displayName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                    )}
                    <div>
                      <div className="font-semibold text-xs">{inj.athlete.displayName}</div>
                      <div className="text-xs text-gray-400">
                        {inj.athlete.position?.abbreviation || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-red-500 text-xs font-semibold">{inj.status}</div>
                    <div className="text-xs text-gray-400">{inj.details?.type || 'Injury'}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
    ) : selectedGame.isPreGame ? (
      <div>
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="space-y-2">
        {(() => {
  // Get the current team abbreviation and roster
  const currentTeamAbbr = selectedTeam === 'away' ? selectedGame.awayTeam : selectedGame.homeTeam;
  const roster = selectedTeam === 'away' ? gameDetails.awayRoster : gameDetails.homeRoster;
  
  // Find the injury data for this specific team
  const teamInjuryData = gameDetails.injuries?.find(
    injData => injData.team?.abbreviation === currentTeamAbbr
  );
  
  // Create a Set of player IDs already in the roster
  const rosterPlayerIds = new Set(roster?.map(p => p.id) || []);
  
  // Add injured players who aren't in the roster
  const injuredOnlyPlayers = teamInjuryData?.injuries
    ?.filter(inj => !rosterPlayerIds.has(inj.athlete.id))
    .map(inj => ({
      id: inj.athlete.id,
      displayName: inj.athlete.displayName,
      jersey: inj.athlete.jersey || '-',
      position: { abbreviation: inj.athlete.position?.abbreviation || '-' },
      isInjuredOnly: true,
      injury: inj
    })) || [];
  
// Combine roster with injured-only players and sort
const fullRoster = [...(roster || []), ...injuredOnlyPlayers].sort((a, b) => {
  // Get injury status for both players
  const aInjury = teamInjuryData?.injuries?.find(inj => inj.athlete.id === a.id);
  const bInjury = teamInjuryData?.injuries?.find(inj => inj.athlete.id === b.id);
  
  // If one is injured/out and the other isn't, injured goes to bottom
  if (aInjury && !bInjury) return 1;
  if (!aInjury && bInjury) return -1;
  
  // Both injured or both healthy - maintain original order
  return 0;
});
  
  if (fullRoster.length === 0) {
    return <div className="text-gray-400 text-center py-4">Roster not available</div>;
  }
  
  return fullRoster.map((player, idx) => {
    // Find injury for this specific player
    const playerInjury = teamInjuryData?.injuries?.find(
      inj => inj.athlete.id === player.id
    );
    
    // Find stats for this player if game is not pre-game
    let playerStats = null;
    if (!selectedGame.isPreGame) {
      playerStats = gameDetails.boxscore?.players?.[selectedTeam === 'away' ? 0 : 1]?.statistics?.[0]?.athletes?.find(
        athlete => athlete.athlete.id === player.id
      );
    }
    
    return (
      <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-gray-400 text-sm w-6">{player.jersey}</span>
          <div className="flex flex-col flex-1">
            <span className={player.isInjuredOnly ? 'text-gray-500' : ''}>
              {player.displayName}
            </span>
            {playerInjury && (
              <span className="text-xs text-red-500">
                {playerInjury.status} - {playerInjury.details?.type || 'Injury'}
              </span>
            )}
          </div>
          <span className="text-gray-400 text-sm">{player.position?.abbreviation}</span>
        </div>
        {!selectedGame.isPreGame && playerStats && (
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">MIN: {playerStats.stats?.[0] || '0'}</span>
            <span className="font-semibold">PTS: {playerStats.stats?.[1] || '0'}</span>
            <span className="text-gray-400">REB: {playerStats.stats?.[5] || '0'}</span>
            <span className="text-gray-400">AST: {playerStats.stats?.[6] || '0'}</span>
          </div>
        )}
      </div>
    );
  });
})()}
        </div>
      </div>
    </div>
                ) : (
                  <div>
  <div className="bg-zinc-900 rounded-2xl p-4 pr-0">
  <div className="overflow-x-auto -ml-4">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 border-b border-zinc-800">
        <th className="text-left py-2 sticky left-0 bg-zinc-900 min-w-[60px]">
  <img 
    src={selectedTeam === 'away' ? selectedGame.awayLogo : selectedGame.homeLogo} 
    alt={selectedTeam === 'away' ? selectedGame.awayTeam : selectedGame.homeTeam}
    className="w-6 h-6 mx-auto"
  />
</th>
          <th className="text-center py-2 px-2">MIN</th>
          <th className="text-center py-2 px-2">PTS</th>
          <th className="text-center py-2 px-2">REB</th>
          <th className="text-center py-2 px-2">AST</th>
      
          <th className="text-center py-2 px-2">+/-</th>
          <th className="text-center py-2 px-2">FG</th>
          <th className="text-center py-2 px-2">FG%</th>
          <th className="text-center py-2 px-2">3PT</th>
<th className="text-center py-2 px-2">3PT%</th>
<th className="text-center py-2 px-2">FT</th>
<th className="text-center py-2 px-2">STL</th>
<th className="text-center py-2 px-2">BLK</th>
          <th className="text-center py-2 px-2">TO</th>
          <th className="text-center py-2 px-2">PF</th>
        </tr>
      </thead>
      <tbody>
{(() => {
    // Get players from boxscore
    const boxscorePlayers = gameDetails.boxscore?.players?.[selectedTeam === 'away' ? 0 : 1]?.statistics?.[0]?.athletes || [];
    
    // Get the current team abbreviation
    const currentTeamAbbr = selectedTeam === 'away' ? selectedGame.awayTeam : selectedGame.homeTeam;
    
    // Find the injury data for this specific team
    const teamInjuryData = gameDetails.injuries?.find(
      injData => injData.team?.abbreviation === currentTeamAbbr
    );
    
    // Create a Set of player IDs in the boxscore
    const boxscorePlayerIds = new Set(boxscorePlayers.map(p => p.athlete.id));
    
    // Add injured players who aren't in the boxscore
    const injuredOnlyPlayers = teamInjuryData?.injuries
      ?.filter(inj => !boxscorePlayerIds.has(inj.athlete.id))
      .map(inj => ({
        athlete: {
          id: inj.athlete.id,
          shortName: inj.athlete.shortName,
          headshot: inj.athlete.headshot
        },
        stats: null,
        isInjuredOnly: true,
        injury: inj
      })) || [];
    
    // Combine boxscore players with injured-only players
    const allPlayers = [...boxscorePlayers, ...injuredOnlyPlayers];
    
    // Sort by minutes played (injured players at bottom)
    return allPlayers
      .sort((a, b) => {
        if (a.isInjuredOnly) return 1;
        if (b.isInjuredOnly) return -1;
        const aMinutes = parseFloat(a.stats?.[0]) || 0;
        const bMinutes = parseFloat(b.stats?.[0]) || 0;
        return bMinutes - aMinutes;
      })
      .map((player, idx) => {
    // Find injury for this player
// Show injury if: (1) game is not final OR (2) player didn't play (isInjuredOnly)
const playerInjury = (!selectedGame.isFinal || player.isInjuredOnly) ? teamInjuryData?.injuries?.find(
  inj => inj.athlete.id === player.athlete.id
) : null;
        
return (
  <tr key={idx} className="border-b border-zinc-800 last:border-0 relative h-12">
<td className="py-1 sticky left-0 bg-zinc-900 z-20 -ml-px border-l-0 w-14">
<div className="flex items-center gap-0">
{/* Smaller square headshot */}
{player.athlete.headshot && (
<img 
src={player.athlete.headshot.href} 
alt={player.athlete.shortName}
className="w-10 h-10 rounded-md object-cover flex-shrink-0"
/>
      )}
{/* Floating name badge - positioned above the stats */}
<div className="absolute left-14 -top-0.5 z-30">
<span className={`text-xs font-normal whitespace-nowrap ${player.isInjuredOnly ? 'text-gray-500' : 'text-gray-400'}`}>
{player.athlete.shortName} {player.athlete.position?.abbreviation && <span className="text-gray-400">• {player.athlete.position.abbreviation}</span>}
</span>
{playerInjury && (
<div className="text-xs text-red-500 whitespace-nowrap">
{playerInjury.status} - {playerInjury.details?.type || 'Injury'}
</div>
        )}
</div>
</div>
</td>
{player.isInjuredOnly ? (
<td className="text-center px-2" colSpan="15"></td>
) : (
<>
<td className="text-center px-2 font-semibold">{player.stats?.[0] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[1] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[5] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[6] || '-'}</td>
<td className={`text-center px-2 font-semibold ${
player.stats?.[13] && player.stats[13] !== '-' 
? (parseFloat(player.stats[13]) > 0 ? 'text-green-500' : parseFloat(player.stats[13]) < 0 ? 'text-red-500' : '')
: ''
}`}>{player.stats?.[13] || '-'}</td>
<td className="text-center px-2 font-semibold whitespace-nowrap">{player.stats?.[2] || '-'}</td>
<td className="text-center px-2 font-semibold whitespace-nowrap">
{(() => {
const fgStat = player.stats?.[2];
if (!fgStat || fgStat === '-') return '-';
const [made, attempted] = fgStat.split('-').map(n => parseFloat(n));
if (!attempted || attempted === 0) return '0';
const percentage = ((made / attempted) * 100);
return percentage % 1 === 0 ? percentage.toFixed(0) : percentage.toFixed(1);
  })()}
</td>
<td className="text-center px-2 font-semibold whitespace-nowrap">{player.stats?.[3] || '-'}</td>
<td className="text-center px-2 font-semibold whitespace-nowrap">
{(() => {
const threePtStat = player.stats?.[3];
if (!threePtStat || threePtStat === '-') return '-';
const [made, attempted] = threePtStat.split('-').map(n => parseFloat(n));
if (!attempted || attempted === 0) return '0';
const percentage = ((made / attempted) * 100);
return percentage % 1 === 0 ? percentage.toFixed(0) : percentage.toFixed(1);
  })()}
</td>
<td className="text-center px-2 font-semibold whitespace-nowrap">{player.stats?.[4] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[8] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[9] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[7] || '-'}</td>
<td className="text-center px-2 font-semibold">{player.stats?.[12] || '-'}</td>
</>
)}
</tr>
);
});
})()}
</tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
  
  {selectedTeamInfo && (
  <div 
    className="fixed inset-0 bg-black bg-opacity-95 z-[100] overflow-y-auto transition-transform duration-300 ease-out"
    style={{ transform: `translateX(${swipeOffset}px)` }}
  >
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6">
  <button 
    onClick={closeTeamModal}
    className="text-gray-400 hover:text-white text-2xl font-light mr-4"
  >
    ‹
  </button>
  <h2 className="text-2xl font-bold">Team Stats</h2>
</div>
  
          {loadingTeamStats ? (
            <div className="text-center py-12 text-gray-400">Loading team stats...</div>
          ) : teamStats ? (
            <div>
              {/* Team Header */}
              <div className="bg-zinc-900 rounded-2xl p-6 mb-6 flex items-center gap-6">
                <img 
                  src={selectedTeamInfo.logo} 
                  alt={selectedTeamInfo.abbr}
                  className="w-24 h-24"
                />
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-1">{teamFullNames[selectedTeamInfo.abbr]}</h3>
                  <div className="text-gray-400 text-lg">
  {teamStats.record.wins}-{teamStats.record.losses} • {getOrdinalSuffix(teamStats.conferenceRank)} {teamStats.conference}
</div>
                  <div className="text-sm text-gray-400 mt-2">
                    {teamStats.record.pct} PCT • {teamStats.record.streak}
                  </div>
                </div>
              </div>
  
         {/* Combined Offense & Defense Stats */}
<div className="bg-zinc-900 rounded-2xl p-6 mb-6">
  <h4 className="text-xl font-bold mb-4">Team Stats</h4>
  
  {/* Offense Row */}
  <div className="mb-6">
    <h5 className="text-sm font-semibold text-gray-400 mb-3 text-center">Offense</h5>
    <div className="grid grid-cols-6 gap-3">
      {(() => {
        const offenseCategory = teamStats.stats.find(cat => cat.name === 'offensive');
        if (!offenseCategory || !offenseCategory.stats) {
          return <div className="text-gray-400 col-span-6">No data available</div>;
        }
        
        const getStatValue = (name) => {
          const stat = offenseCategory.stats.find(s => s.name === name);
          return stat ? stat.displayValue : '-';
        };
        
        return (
          <>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgPoints')}</div>
              <div className="text-xs text-gray-400 mt-1">PPG</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('fieldGoalPct')}</div>
              <div className="text-xs text-gray-400 mt-1">FG%</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('threePointFieldGoalPct')}</div>
              <div className="text-xs text-gray-400 mt-1">3FG%</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('freeThrowPct')}</div>
              <div className="text-xs text-gray-400 mt-1">FT%</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgAssists')}</div>
              <div className="text-xs text-gray-400 mt-1">AST</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgTurnovers')}</div>
              <div className="text-xs text-gray-400 mt-1">TO</div>
            </div>
          </>
        );
      })()}
    </div>
  </div>
  
  {/* Defense Row */}
  <div>
    <h5 className="text-sm font-semibold text-gray-400 mb-3 text-center">Defense</h5>
    <div className="grid grid-cols-5 gap-3">
      {(() => {
        const offenseCategory = teamStats.stats.find(cat => cat.name === 'offensive');
        const defenseCategory = teamStats.stats.find(cat => cat.name === 'defensive');
        
        if (!offenseCategory && !defenseCategory) {
          return <div className="text-gray-400 col-span-5">No data available</div>;
        }
        
        const getStatValue = (name, preferredCategory = 'defensive') => {
          const primaryCat = preferredCategory === 'defensive' ? defenseCategory : offenseCategory;
          const secondaryCat = preferredCategory === 'defensive' ? offenseCategory : defenseCategory;
          
          let stat = primaryCat?.stats?.find(s => s.name === name);
          if (!stat && secondaryCat) {
            stat = secondaryCat.stats?.find(s => s.name === name);
          }
          return stat ? stat.displayValue : '-';
        };
        
        const calcTotalRebounds = () => {
          const dreb = parseFloat(getStatValue('avgDefensiveRebounds', 'defensive')) || 0;
          const oreb = parseFloat(getStatValue('avgOffensiveRebounds', 'offensive')) || 0;
          return (dreb + oreb).toFixed(1);
        };
        
        return (
          <>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{teamStats.record.oppg || '-'}</div>
              <div className="text-xs text-gray-400 mt-1">OPPG</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgDefensiveRebounds', 'defensive')}</div>
              <div className="text-xs text-gray-400 mt-1">DREB</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{calcTotalRebounds()}</div>
              <div className="text-xs text-gray-400 mt-1">REB</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgBlocks', 'defensive')}</div>
              <div className="text-xs text-gray-400 mt-1">BLK</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{getStatValue('avgSteals', 'defensive')}</div>
              <div className="text-xs text-gray-400 mt-1">STL</div>
            </div>
          </>
        );
      })()}
    </div>
  </div>
</div>
  
      {/* Recent Differentials */}
<div className="bg-zinc-900 rounded-2xl p-6">
  <h4 className="text-xl font-bold mb-4">Recent Differentials</h4>
  <div className="flex gap-2 justify-between">
    {teamStats.recentGames.map((game, idx) => {
      // Calculate bar height percentage
      const barHeightPercent = Math.min((Math.abs(game.differential) / 40) * 50, 50);
      
      return (
        <div key={idx} className="flex flex-col items-center flex-1">
  {/* Bar chart container - NOW CLICKABLE */}
  <div 
    className="relative h-24 w-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
    onClick={() => handleRecentGameClick(game)}
  >
            {/* Horizon line in middle */}
            <div className="absolute w-full h-0.5 bg-zinc-700" style={{ top: '50%' }}></div>
            
            {/* Vertical line from bottom to horizon */}
            <div 
              className="absolute bg-zinc-700 w-0.5"
              style={{ 
                bottom: '0',
                height: '50%',
                left: '50%',
                transform: 'translateX(-50%)'
              }}
            />
            
            {game.differential > 0 ? (
              <>
                {/* Win bar growing upward */}
                <div 
                  className="absolute bg-blue-500"
                  style={{ 
                    bottom: '50%',
                    height: `${barHeightPercent}%`,
                    width: '100%',
                    maxWidth: '32px',
                    borderTopLeftRadius: '4px',
                    borderTopRightRadius: '4px'
                  }}
                />
                {/* Number on TOP of upward bar */}
                <div 
                  className="absolute text-xs font-bold text-green-500 w-full text-center"
                  style={{ 
                    bottom: `${50 + barHeightPercent}%`,
                    transform: 'translateY(-4px)'
                  }}
                >
                  +{game.differential}
                </div>
              </>
            ) : (
              <>
                {/* Loss bar growing downward */}
                <div 
                  className="absolute bg-blue-900"
                  style={{ 
                    top: '50%',
                    height: `${barHeightPercent}%`,
                    width: '100%',
                    maxWidth: '32px',
                    borderBottomLeftRadius: '4px',
                    borderBottomRightRadius: '4px'
                  }}
                />
                {/* Number on TOP of downward bar */}
                <div 
                  className="absolute text-xs font-bold text-red-500 w-full text-center"
                  style={{ 
                    top: '50%',
                    transform: 'translateY(-18px)'
                  }}
                >
                  {game.differential}
                </div>
              </>
            )}
          </div>
          
          {/* Opponent info */}
          <div className="text-xs text-gray-400 mt-1">
            {game.isHome ? 'vs' : '@'} {game.opponent}
          </div>
        </div>
      );
    })}
  </div>
</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )}
  
      </div>
    );
  }