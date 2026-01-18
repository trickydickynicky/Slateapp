import React, { useState, useEffect } from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';

export default function SportsApp() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const filters = [
    { name: 'All', emoji: '🏀' },
    { name: 'Football', emoji: '🏈' },
    { name: 'Basketball', emoji: '🏀' },
    { name: 'Baseball', emoji: '⚾' },
    { name: 'Hockey', emoji: '🏒' },
    { name: 'Soccer', emoji: '⚽' }
  ];

  useEffect(() => {
    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [selectedDate]);

  const fetchLiveScores = async () => {
    try {
      // Format date as YYYYMMDD for ESPN API
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
          status: event.status.type.description,
          period: event.status.period,
          clock: event.status.displayClock,
          isLive: event.status.type.state === 'in',
          isPreGame: event.status.type.state === 'pre',
          gameTime: event.date,
          homeLogo: homeTeam.team.logo,
          awayLogo: awayTeam.team.logo
        };
      });
      
      setLiveGames(games);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scores:', error);
      setLoading(false);
    }
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
      // Fetch detailed game summary with stats
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`);
      const data = await response.json();
      console.log('Game summary data:', data);
      
      // Fetch rosters for both teams
      const homeTeamId = data.boxscore?.teams?.[1]?.team?.id;
      const awayTeamId = data.boxscore?.teams?.[0]?.team?.id;
      
      console.log('Home Team ID:', homeTeamId);
      console.log('Away Team ID:', awayTeamId);
      
      let homeRoster = null;
      let awayRoster = null;
      
      if (homeTeamId) {
        const homeResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/roster`);
        const homeData = await homeResponse.json();
        console.log('Home team roster data:', homeData);
        homeRoster = homeData.athletes;
      }
      
      if (awayTeamId) {
        const awayResponse = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/roster`);
        const awayData = await awayResponse.json();
        console.log('Away team roster data:', awayData);
        awayRoster = awayData.athletes;
      }
      
      console.log('Home Roster:', homeRoster);
      console.log('Away Roster:', awayRoster);
      
      // Log the stats labels to see the correct order
      if (data.boxscore?.players?.[0]?.statistics?.[0]?.labels) {
        console.log('Stats labels:', data.boxscore.players[0].statistics[0].labels);
      }
      if (data.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.[0]) {
        console.log('First player stats example:', data.boxscore.players[0].statistics[0].athletes[0]);
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
      {/* Header */}
      <div className="px-4 pt-12 pb-4">
        <div className="flex justify-between items-start mb-1">
          <div>
            <h1 className="text-3xl font-semibold">Slate</h1>
            <p className="text-gray-400 text-sm mt-1">{formatDate()}</p>
          </div>
          <div className="relative">
            <Bell className="w-6 h-6 text-gray-400" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">1</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-6 relative">
          <div className="bg-zinc-900 rounded-xl px-4 py-3 flex items-center">
            <Search className="w-5 h-5 text-gray-400 mr-3" />
            <input 
              type="text" 
              placeholder="Search" 
              className="bg-transparent text-white placeholder-gray-400 outline-none flex-1"
            />
          </div>
        </div>

       {/* Sport Filters */}
<div className="flex gap-3 mt-6 overflow-x-auto pb-2 scrollbar-hide">
  {filters
    .filter(filter => filter.name === 'Basketball')   // ← Add this line
    .map(filter => (
      <button
        key={filter.name}
        onClick={() => setActiveFilter(filter.name)}
        className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl min-w-[70px] transition-colors ${
          activeFilter === filter.name ? 'bg-zinc-800' : 'bg-zinc-900'
        }`}
      >
        <span className="text-2xl">{filter.emoji}</span>
        <span className="text-xs text-gray-300">{filter.name}</span>
      </button>
    ))}
</div>

        {/* Date Selector */}
        <div className="mt-6 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-2">
            {generateDateRange().map((date, idx) => {
              const { month, day, dayOfWeek } = formatDateHeader(date);
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, new Date());
              
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

      {/* Live Section */}
      <div className="px-4 mt-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Live</h2>
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          </div>
          <button className="flex items-center gap-1 text-gray-400 text-sm">
            Sort by <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Live Games */}
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
                {/* Away Team */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 relative">
                    {!game.isPreGame && parseInt(game.awayScore) > parseInt(game.homeScore) && (
                      <span className="text-white text-xs absolute -left-3">▶</span>
                    )}
                    <img src={game.awayLogo} alt={game.awayTeam} className="w-10 h-10" />
                    <span className="font-semibold">{game.awayTeam}</span>
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

                {/* Home Team */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 relative">
                    {!game.isPreGame && parseInt(game.homeScore) > parseInt(game.awayScore) && (
                      <span className="text-white text-xs absolute -left-3">▶</span>
                    )}
                    <img src={game.homeLogo} alt={game.homeTeam} className="w-10 h-10" />
                    <span className="font-semibold">{game.homeTeam}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {game.isLive && (
                      <div className="text-right">
                        <span className="text-red-500 text-xs font-semibold">LIVE</span>
                        <div className="text-xs text-gray-400">{game.period}Q • {game.clock}</div>
                      </div>
                    )}
                    {game.isPreGame && (
                      <div className="text-right">
                        <span className="text-xs text-gray-400">{formatGameTime(game.gameTime)}</span>
                      </div>
                    )}
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
              </div>
            ))
          )}
        </div>
      </div>

      {/* Popular Matches */}
      <div className="px-4 mt-8 pb-24">
        <h2 className="text-xl font-semibold mb-4">Popular Matches</h2>
        <div className="space-y-3">
          <div className="bg-zinc-900 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-full"></div>
              <span className="font-semibold">Miami Heat</span>
            </div>
            <span className="text-gray-400">7:30 PM</span>
            <div className="flex items-center gap-3">
              <span className="font-semibold">Bucks</span>
              <div className="w-10 h-10 bg-green-700 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
     {/* Bottom Navigation */}
<div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800">
  <div className="flex justify-around items-center py-3 px-4 max-w-2xl mx-auto">
    {/* Home - already active/blue */}
    <button className="flex flex-col items-center gap-1 text-blue-500">
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
      <span className="text-xs">Home</span>
    </button>

    {/* Search - new button, gray for now (you can make it active later) */}
    <button className="flex flex-col items-center gap-1 text-gray-400">
      <Search className="w-6 h-6" />  {/* Using the imported Search icon */}
      <span className="text-xs">Search</span>
    </button>
  </div>
</div>

      {/* Game Details Modal */}
      {selectedGame && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-y-auto">
          <div className="min-h-screen px-4 py-8">
            <div className="max-w-2xl mx-auto">
              {/* Header */}
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

              {/* Game Score Card */}
              <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 relative">
                    {!selectedGame.isPreGame && parseInt(selectedGame.awayScore) > parseInt(selectedGame.homeScore) && (
                      <span className="text-white text-sm absolute -left-4">▶</span>
                    )}
                    <img src={selectedGame.awayLogo} alt={selectedGame.awayTeam} className="w-16 h-16" />
                    <span className="text-xl font-bold">{selectedGame.awayTeam}</span>
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
                    <span className="text-xl font-bold">{selectedGame.homeTeam}</span>
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
                  {/* Show rosters for pre-game, stats for live game */}
                  {selectedGame.isPreGame ? (
                    <div>
                      <h3 className="text-xl font-bold mb-4">Rosters</h3>
                      
                      {/* Away Team Roster */}
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

                      {/* Home Team Roster */}
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
                      
                      {/* Away Team Stats */}
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