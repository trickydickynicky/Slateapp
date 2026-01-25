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
  const filters = [
    { name: 'All', emoji: '🏀' },
    { name: 'Football', emoji: '🏈' },
    { name: 'Basketball', emoji: '🏀' },
    { name: 'Baseball', emoji: '⚾' },
    { name: 'Hockey', emoji: '🏒' },
    { name: 'Soccer', emoji: '⚽' }
  ];

// Add this line RIGHT BEFORE your first useEffect
const hasFetchedOdds = React.useRef(false);

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
          awayLogo: awayTeam.team.logo
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
      if (line.event?.league?.key === 'basketball_nba' && line.spread?.home?.point) {
        const gameDate = new Date(line.event.commence_time);
        const gameDateStr = gameDate.toDateString();
        
        console.log(`API Game: ${line.event.away_team} @ ${line.event.home_team} on ${gameDateStr}`);

        // Only include today's and tomorrow's games
        // Include yesterday's, today's, and tomorrow's games
if (gameDateStr === yesterdayStr || gameDateStr === todayStr || gameDateStr === tomorrowStr) {
          const homeAbbr = getTeamAbbreviation(line.event.home_team);
          const awayAbbr = getTeamAbbreviation(line.event.away_team);
          
          const gameKey = `${awayAbbr}-${homeAbbr}`;
          const homeSpread = parseFloat(line.spread.home.point);
          const spread = Math.abs(homeSpread);
          const favoriteTeam = homeSpread < 0 ? homeAbbr : awayAbbr;
          
          oddsMap[gameKey] = {
            favoriteTeam,
            spread,
            homeSpread,
            awaySpread: parseFloat(line.spread.away.point)
          };
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
      
      console.log('Full game details:', data);
      console.log('Boxscore teams:', data.boxscore?.teams);
      console.log('Looking for linescores:', data.scoringPlays);
      console.log('Header:', data.header);
      console.log('Competitions:', data.header?.competitions);

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
    setSelectedGame(game);
    setSelectedTeam('away'); // Reset to away team
    fetchGameDetails(game.id);
  };

  const closeModal = () => {
    setSelectedGame(null);
    setGameDetails(null);
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
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
            <p className="text-gray-400 text-sm mt-1">{formatDate()}</p>
          </div>
        </div>

        <div className="mt-6 relative">
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
  

  <div className="space-y-3">
    {loading ? (
      <div className="bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
        Loading games...
      </div>
    ) : liveGames.length === 0 ? (
      <div className="bg-zinc-900 rounded-2xl p-6 text-center text-gray-400">
        No live games right now
      </div>
    ) : (
      liveGames.map(game => (
        <div 
          key={game.id} 
          className="bg-zinc-900 rounded-2xl p-4 cursor-pointer hover:bg-zinc-800 transition-colors"
          onClick={() => handleGameClick(game)}
        >
{/* AWAY TEAM ROW */}
<div className="flex items-center gap-3 mb-1">
  {/* Away Team */}
  <div className="flex items-center gap-3 relative">
    {!game.isPreGame && parseInt(game.awayScore) > parseInt(game.homeScore) && (
      <span className="text-white text-xs absolute -left-3">▶</span>
    )}
    <img src={game.awayLogo} alt={game.awayTeam} className="w-10 h-10" />
    <div className="flex flex-col">
      <span className="font-semibold">{game.awayTeam}</span>
      {game.awayRecord && (
        <span className="text-xs text-gray-400">{game.awayRecord}</span>
      )}
    </div>
  </div>

  {/* TIME/LIVE/STATUS - Right next to away team */}
  <div className="flex flex-col items-start text-left">
    {game.isLive && (
      <>
        <div className="text-red-500 text-xs font-semibold">LIVE</div>
        <div className="text-xs text-gray-400 whitespace-nowrap">
          {game.clock === '0.0' || game.clock === '0:00' 
            ? (game.period === 2 ? 'Half' : `End Q${game.period}`)
            : `${game.period}Q • ${game.clock}`}
        </div>
      </>
    )}
    {game.isPreGame && (
      <div className="text-xs text-gray-400">{formatGameTime(game.gameTime)}</div>
    )}
    {game.isFinal && (
      <div className="text-xs font-semibold text-gray-300">FINAL</div>
    )}
  </div>

  {/* Away Score - pushed to right */}
  <span className={`text-2xl font-bold ml-auto ${
    !game.isPreGame && parseInt(game.awayScore) > parseInt(game.homeScore) 
      ? 'text-white' 
      : !game.isPreGame && parseInt(game.awayScore) < parseInt(game.homeScore)
      ? 'text-gray-500'
      : 'text-white'
  }`}>
    {game.awayScore}
  </span>
</div>

{/* HOME TEAM ROW */}
<div className="flex items-center gap-3">
  {/* Home Team */}
  <div className="flex items-center gap-3 relative">
    {!game.isPreGame && parseInt(game.homeScore) > parseInt(game.awayScore) && (
      <span className="text-white text-xs absolute -left-3">▶</span>
    )}
    <img src={game.homeLogo} alt={game.homeTeam} className="w-10 h-10" />
    <div className="flex flex-col">
      <span className="font-semibold">{game.homeTeam}</span>
      {game.homeRecord && (
        <span className="text-xs text-gray-400">{game.homeRecord}</span>
      )}
    </div>
  </div>

  {/* BETTING ODDS - Right next to home team */}
  {(() => {
    const gameKey = `${game.awayTeam}-${game.homeTeam}`;
    const odds = bettingOdds[gameKey];
    
    if (odds && odds.spread) {
      const awayProb = calculateWinProbability(odds.spread, odds.favoriteTeam, game.awayTeam);
      const homeProb = calculateWinProbability(odds.spread, odds.favoriteTeam, game.homeTeam);
      
      return (
        <div className="text-xs text-left leading-tight">
          <div className="text-orange-400">
            {odds.favoriteTeam} by {odds.spread}
          </div>
          <div className={awayProb > homeProb ? 'text-green-500' : 'text-red-500'}>
            {game.awayTeam} {awayProb}%
          </div>
          <div className={homeProb > awayProb ? 'text-green-500' : 'text-red-500'}>
            {game.homeTeam} {homeProb}%
          </div>
        </div>
      );
    }
    return null;
  })()}

  {/* Home Score - pushed to right */}
  <span className={`text-2xl font-bold ml-auto ${
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
      ))
    )}
  </div>
</div>

      {selectedPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-[100] overflow-y-auto">
          <div className="min-h-screen px-4 py-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Player Stats</h2>
                <button 
                  onClick={closePlayerModal}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
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

                  <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
                    <h4 className="text-xl font-bold mb-4">2024-25 Season Stats</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-500">23.5</div>
                        <div className="text-sm text-gray-400 mt-1">PPG</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-500">7.2</div>
                        <div className="text-sm text-gray-400 mt-1">RPG</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-500">5.8</div>
                        <div className="text-sm text-gray-400 mt-1">APG</div>
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

{selectedGame && (
  <div className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-y-auto">
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Game Details</h2>
                <button 
                  onClick={closeModal}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
              <div className="flex items-start justify-between min-h-[120px]">
    {/* AWAY TEAM - LEFT SIDE */}
    <div className="flex flex-col items-center flex-1">
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
      
      {/* BETTING ODDS FOR LIVE GAMES */}
      {(() => {
        const gameKey = `${selectedGame.awayTeam}-${selectedGame.homeTeam}`;
        const odds = bettingOdds[gameKey];
        
        if (odds && odds.spread) {
          const awayProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.awayTeam);
          const homeProb = calculateWinProbability(odds.spread, odds.favoriteTeam, selectedGame.homeTeam);
          
          return (
            <div className="mt-2">
              <div className="text-xs text-orange-400">
                {odds.favoriteTeam} by {odds.spread}
              </div>
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
    <div className="flex flex-col items-center flex-1">
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
  <div className="bg-zinc-900 rounded-2xl p-4 mb-6">
    <table className="w-full text-center">
      <thead>
        <tr className="text-gray-400 text-sm">
          <th className="text-left pb-3 w-20">Team</th>
          <th className="pb-3 w-1/5">1st</th>
          <th className="pb-3 w-1/5">2nd</th>
          <th className="pb-3 w-1/5">3rd</th>
          <th className="pb-3 w-1/5">4th</th>
        </tr>
      </thead>
      <tbody>
        {/* Away Team Row */}
        <tr className="border-t border-zinc-800">
          <td className="text-left py-3">
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
          <td className="text-left py-3">
            <span className="font-semibold">{selectedGame.homeTeam}</span>
          </td>
          {(() => {
            const homeTeam = gameDetails.header.competitions[0].competitors.find(c => c.homeAway === 'home');
            const quarters = homeTeam?.linescores || [];
            const currentPeriod = selectedGame.period;
            
            return (
              <>
                {[1, 2, 3, 4].map((quarterNum) => (
                  <td key={`home-q${quarterNum}`} className="text-lg font-semibold py-3">
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
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setSelectedTeam('away')}
                  className={`flex-1 py-3 rounded-xl font-bold text-lg transition-colors ${
                    selectedTeam === 'away' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
                  }`}
                >
                  {selectedGame.awayTeam}
                </button>
                <button
                  onClick={() => setSelectedTeam('home')}
                  className={`flex-1 py-3 rounded-xl font-bold text-lg transition-colors ${
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
    {selectedGame.isPreGame ? (
                  <div>
                    
                    
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <div className="space-y-2">
                        {(selectedTeam === 'away' ? gameDetails.awayRoster : gameDetails.homeRoster)?.map((player, idx) => (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400 text-sm w-6">{player.jersey}</span>
                              <span>{player.displayName}</span>
                            </div>
                            <span className="text-gray-400 text-sm">{player.position?.abbreviation}</span>
                          </div>
                        )) || <div className="text-gray-400 text-center py-4">Roster not available</div>}
                      </div>
                    </div>
                  </div>
                 ) : (
                  <div>
                    
                    
                    <div className="bg-zinc-900 rounded-2xl p-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                        <thead>
  <tr className="text-gray-400 border-b border-zinc-800">
    <th className="text-left py-2 sticky left-0 bg-zinc-900">Player</th>
    <th className="text-center py-2 px-2">MIN</th>
    <th className="text-center py-2 px-2">PTS</th>
    <th className="text-center py-2 px-2">REB</th>
    <th className="text-center py-2 px-2">AST</th>
    <th className="text-center py-2 px-2">STL</th>
    <th className="text-center py-2 px-2">BLK</th>
    <th className="text-center py-2 px-2">+/-</th>
    <th className="text-center py-2 px-2">FG</th>
    <th className="text-center py-2 px-2">3PT</th>
    <th className="text-center py-2 px-2">FT</th>
    <th className="text-center py-2 px-2">TO</th>
    <th className="text-center py-2 px-2">PF</th>
  </tr>
</thead>
                          <tbody>
  {gameDetails.boxscore?.players?.[selectedTeam === 'away' ? 0 : 1]?.statistics?.[0]?.athletes
    ?.sort((a, b) => {
      const aMinutes = parseFloat(a.stats?.[0]) || 0;
      const bMinutes = parseFloat(b.stats?.[0]) || 0;
      return bMinutes - aMinutes;
    })
    .map((player, idx) => (
      <tr key={idx} className="border-b border-zinc-800 last:border-0">
        <td className="py-2 sticky left-0 bg-zinc-900">
          <div className="flex items-center gap-2">
            {player.athlete.headshot && (
              <img 
                src={player.athlete.headshot.href} 
                alt={player.athlete.shortName}
                className="w-8 h-8 rounded-full object-cover"
              />
            )}
                                    <span>{player.athlete.shortName}</span>
                                  </div>
                                </td>
                                <td className="text-center px-2">{player.stats?.[0] || '-'}</td>
<td className="text-center px-2">{player.stats?.[1] || '-'}</td>
<td className="text-center px-2">{player.stats?.[5] || '-'}</td>
<td className="text-center px-2">{player.stats?.[6] || '-'}</td>
<td className="text-center px-2">{player.stats?.[8] || '-'}</td>
<td className="text-center px-2">{player.stats?.[9] || '-'}</td>
<td className={`text-center px-2 ${
  player.stats?.[13] && player.stats[13] !== '-' 
    ? (parseFloat(player.stats[13]) > 0 ? 'text-green-500' : parseFloat(player.stats[13]) < 0 ? 'text-red-500' : '')
    : ''
}`}>{player.stats?.[13] || '-'}</td>
<td className="text-center px-2 whitespace-nowrap">{player.stats?.[2] || '-'}</td>
<td className="text-center px-2 whitespace-nowrap">{player.stats?.[3] || '-'}</td>
<td className="text-center px-2 whitespace-nowrap">{player.stats?.[4] || '-'}</td>
<td className="text-center px-2">{player.stats?.[7] || '-'}</td>
<td className="text-center px-2">{player.stats?.[12] || '-'}</td>
                              </tr>
                            ))}
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
    </div>
  );
}