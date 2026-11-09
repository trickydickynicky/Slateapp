/* One config for every ranked stat. Used by the pages, the rank helper and Leaderboards. */

export const MIN_GP_SHARE = 0.5;   // player ranks only count players with >= 50% of the max games played

// Player stats: `names` are ESPN byathlete stat names (strings or RegExps), tried in order.
export const PLAYER_STATS = [
  { key: 'pts',      label: 'PTS', long: 'Points',               scope: 'players', names: ['avgPoints'], decimals: 1, lowerIsBetter: false },
  { key: 'reb',      label: 'REB', long: 'Rebounds',             scope: 'players', names: ['avgRebounds'], decimals: 1, lowerIsBetter: false },
  { key: 'ast',      label: 'AST', long: 'Assists',              scope: 'players', names: ['avgAssists'], decimals: 1, lowerIsBetter: false },
  { key: 'stl',      label: 'STL', long: 'Steals',               scope: 'players', names: ['avgSteals'], decimals: 1, lowerIsBetter: false },
  { key: 'blk',      label: 'BLK', long: 'Blocks',               scope: 'players', names: ['avgBlocks'], decimals: 1, lowerIsBetter: false },
  { key: 'to',       label: 'TO',  long: 'Turnovers',            scope: 'players', names: ['avgTurnovers'], decimals: 1, lowerIsBetter: false },
  { key: 'min',      label: 'MIN', long: 'Minutes',              scope: 'players', names: ['avgMinutes', 'minutesPerGame', /^avgMin/i], decimals: 1, lowerIsBetter: false },
  { key: 'fgPct',    label: 'FG%', long: 'Field goal %',         scope: 'players', names: ['fieldGoalPct'], decimals: 1, lowerIsBetter: false },
  { key: 'threePct', label: '3P%', long: 'Three-point %',        scope: 'players', names: ['threePointFieldGoalPct', 'threePointPct', /^threePoint(Field)?(Goal)?Pct$/i], decimals: 1, lowerIsBetter: false },
  { key: 'tpa',      label: '3PA', long: 'Three-pointers attempted', scope: 'players', names: ['avgThreePointFieldGoalsAttempted'], decimals: 1, lowerIsBetter: false },
  { key: 'ftPct',    label: 'FT%', long: 'Free throw %',         scope: 'players', names: ['freeThrowPct'], decimals: 1, lowerIsBetter: false },
  { key: 'fta',      label: 'FTA', long: 'Free throws attempted', scope: 'players', names: ['avgFreeThrowsAttempted'], decimals: 1, lowerIsBetter: false },
  { key: 'ts',       label: 'TS%', long: 'True shooting %',      scope: 'players', compute: 'ts', decimals: 1, lowerIsBetter: false },
];

// Team stats: `key` matches leagueRankings[abbr][key]. Order comes from those ranks;
// lowerIsBetter documents which ones rank low-to-high there.
export const TEAM_STATS = [
  { key: 'ppg',      label: 'PPG',  long: 'Points per game',   scope: 'teams', lowerIsBetter: false },
  { key: 'fgPct',    label: 'FG%',  long: 'Field goal %',      scope: 'teams', lowerIsBetter: false },
  { key: 'threePct', label: '3P%',  long: 'Three-point %',     scope: 'teams', lowerIsBetter: false },
  { key: 'ftPct',    label: 'FT%',  long: 'Free throw %',      scope: 'teams', lowerIsBetter: false },
  { key: 'ast',      label: 'AST',  long: 'Assists',           scope: 'teams', lowerIsBetter: false },
  { key: 'oreb',     label: 'OREB', long: 'Offensive rebounds', scope: 'teams', lowerIsBetter: false },
  { key: 'to',       label: 'TO',   long: 'Turnovers',         scope: 'teams', lowerIsBetter: true },
  { key: 'oppg',     label: 'OPPG', long: 'Opponent points',   scope: 'teams', lowerIsBetter: true },
  { key: 'dreb',     label: 'DREB', long: 'Defensive rebounds', scope: 'teams', lowerIsBetter: false },
  { key: 'blk',      label: 'BLK',  long: 'Blocks',            scope: 'teams', lowerIsBetter: false },
  { key: 'stl',      label: 'STL',  long: 'Steals',            scope: 'teams', lowerIsBetter: false },
];

export const getStat = (scope, key) =>
  (scope === 'teams' ? TEAM_STATS : PLAYER_STATS).find(s => s.key === key) || null;

export const TEAM_STAT_BY_LABEL = Object.fromEntries(TEAM_STATS.map(s => [s.label, s]));