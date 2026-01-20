import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function SportsApp() {
  // Store API key safely (in production, use environment variables)
  const BETSTACK_API_KEY = '7f0e1495b778d1694a4a81ecabf836057f6d82d2f941e2306ff167c366ee3164';
  
  const [activeFilter, setActiveFilter] = useState('All');
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bettingOdds, setBettingOdds] = useState({});  // NEW: for betting odds
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
      const dateStr = selectedDate.toISOString().split('T')[0].replace(/-/g, '');
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
      console.log('Rate limited. Waiting before next request...');
      return;
    }
    
    const oddsMap = {};
    
    // Filter for NBA games only and process
    lines.forEach(line => {
      if (line.event?.league?.key === 'basketball_nba' && line.spread?.home?.point) {
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
    });
    
    console.log('Odds Map:', oddsMap);
    setBettingOdds(oddsMap);
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
            <h1 className="text-3xl font-semibold">Slate</h1>
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
                  <span className="text-xs text-gray-400">{month} {day}</span>
                  <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
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

<div className="px-4 mt-6 pb-8">
  <div className="flex items-center gap-2 mb-4">
    <h2 className="text-xl font-semibold">Live</h2>
    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
  </div>

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
{/* AWAY TEAM ROW - with time/LIVE indicator */}
<div className="flex items-center justify-between mb-3">
  <div className="flex items-center gap-4">
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
    
    {/* TIME/LIVE INDICATOR AND ODDS - between team and score */}
    <div className="flex flex-col gap-1 text-left">
      {game.isLive && (
        <>
          <div>
            <span className="text-red-500 text-xs font-semibold">LIVE</span>
            <span className="text-xs text-gray-400 ml-2">{game.period}Q • {game.clock}</span>
          </div>
        </>
      )}
      {game.isPreGame && (
        <div className="text-xs text-gray-400">{formatGameTime(game.gameTime)}</div>
      )}
      {game.isFinal && (
        <div className="text-xs font-semibold text-gray-300">FINAL</div>
      )}
      
      {/* BETTING ODDS */}
      {(() => {
        const gameKey = `${game.awayTeam}-${game.homeTeam}`;
        const odds = bettingOdds[gameKey];
        
        if (odds && odds.spread) {
          return (
            <div className="text-xs text-gray-400">
              {odds.favoriteTeam} by {odds.spread}
            </div>
          );
        }
        return null;
      })()}
    </div>
              
 

            </div>
            
            <span className={`text-2xl font-bold ${
              !game.isPreGame && parseInt(game.awayScore) > parseInt(game.homeScore) 
                ? 'text-white' 
                : !game.isPreGame && parseInt(game.awayScore) < parseInt(game.homeScore)
                ? 'text-gray-500'
                : 'text-white'
            }`}>
              {game.awayScore}
            </span>
          </div>

          {/* HOME TEAM ROW - clean, no time indicator */}
          <div className="flex items-center justify-between">
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
            
            <span className={`text-2xl font-bold ${
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 relative">
                    {!selectedGame.isPreGame && parseInt(selectedGame.awayScore) > parseInt(selectedGame.homeScore) && (
                      <span className="text-white text-sm absolute -left-4">▶</span>
                    )}
                    <img src={selectedGame.awayLogo} alt={selectedGame.awayTeam} className="w-16 h-16" />
                    <div className="flex flex-col">
                      <span className="text-xl font-bold">{selectedGame.awayTeam}</span>
                      {selectedGame.awayRecord && (
                        <span className="text-sm text-gray-400">{selectedGame.awayRecord}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-3xl font-bold ${
                    !selectedGame.isPreGame && parseInt(selectedGame.awayScore) > parseInt(selectedGame.homeScore) 
                      ? 'text-white' 
                      : !selectedGame.isPreGame && parseInt(selectedGame.awayScore) < parseInt(selectedGame.homeScore)
                      ? 'text-gray-500'
                      : 'text-white'
                  }`}>
                    {selectedGame.awayScore}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 relative">
                    {!selectedGame.isPreGame && parseInt(selectedGame.homeScore) > parseInt(selectedGame.awayScore) && (
                      <span className="text-white text-sm absolute -left-4">▶</span>
                    )}
                    <img src={selectedGame.homeLogo} alt={selectedGame.homeTeam} className="w-16 h-16" />
                    <div className="flex flex-col">
                      <span className="text-xl font-bold">{selectedGame.homeTeam}</span>
                      {selectedGame.homeRecord && (
                        <span className="text-sm text-gray-400">{selectedGame.homeRecord}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {selectedGame.isLive && (
                      <div className="text-right">
                        <span className="text-red-500 font-semibold">LIVE</span>
                        <div className="text-sm text-gray-400">{selectedGame.period}Q • {selectedGame.clock}</div>
                      </div>
                    )}
                    {selectedGame.isPreGame && (
                      <span className="text-gray-400">{formatGameTime(selectedGame.gameTime)}</span>
                    )}
                    <span className={`text-3xl font-bold ${
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

              {loadingDetails ? (
                <div className="text-center py-12 text-gray-400">Loading details...</div>
              ) : gameDetails ? (
                <div>
                  {selectedGame.isPreGame ? (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Rosters</h3>
                      
                      <div className="bg-zinc-900 rounded-2xl p-4 mb-4">
                        <h4 className="font-bold mb-3 text-lg">{selectedGame.awayTeam}</h4>
                        <div className="space-y-2">
                          {gameDetails.awayRoster?.map((player, idx) => (
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

                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <h4 className="font-bold mb-3 text-lg">{selectedGame.homeTeam}</h4>
                        <div className="space-y-2">
                          {gameDetails.homeRoster?.map((player, idx) => (
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
                      <h3 className="text-xl font-bold mb-4">Player Stats</h3>
                      
                      <div className="bg-zinc-900 rounded-2xl p-4 mb-4">
                        <h4 className="font-bold mb-3 text-lg">{selectedGame.awayTeam}</h4>
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
                                <th className="text-center py-2 px-2">3FG</th>
                                <th className="text-center py-2 px-2">FT</th>
                                <th className="text-center py-2 px-2">TO</th>
                                <th className="text-center py-2 px-2">PF</th>
                                <th className="text-center py-2 px-2">OREB</th>
                                <th className="text-center py-2 px-2">DREB</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gameDetails.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.map((player, idx) => (
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
                                  }`}>
                                    {player.stats?.[13] || '-'}
                                  </td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[2] || '-'}</td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[3] || '-'}</td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[4] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[7] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[12] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[10] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[11] || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Home Team Stats */}
                      <div className="bg-zinc-900 rounded-2xl p-4">
                        <h4 className="font-bold mb-3 text-lg">{selectedGame.homeTeam}</h4>
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
                                <th className="text-center py-2 px-2">3FG</th>
                                <th className="text-center py-2 px-2">FT</th>
                                <th className="text-center py-2 px-2">TO</th>
                                <th className="text-center py-2 px-2">PF</th>
                                <th className="text-center py-2 px-2">OREB</th>
                                <th className="text-center py-2 px-2">DREB</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gameDetails.boxscore?.players?.[1]?.statistics?.[0]?.athletes?.map((player, idx) => (
                                <tr key={idx} className="border-b border-zinc-800 last:border-0">
                                  <td className="py-2 sticky left-0 bg-zinc-900">{player.athlete.shortName}</td>
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
                                  }`}>
                                    {player.stats?.[13] || '-'}
                                  </td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[2] || '-'}</td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[3] || '-'}</td>
                                  <td className="text-center px-2 whitespace-nowrap">{player.stats?.[4] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[7] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[12] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[10] || '-'}</td>
                                  <td className="text-center px-2">{player.stats?.[11] || '-'}</td>
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