export const ACCENT = '#2563eb';
export const MUTED = '#6b7280';
export const GREEN = '#22c55e';
export const RED = '#ef4444';
export const heading = { fontFamily: 'Rajdhani, sans-serif' };

export const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

export const teamFullNames = {
  ATL:'Atlanta Hawks',BOS:'Boston Celtics',BKN:'Brooklyn Nets',CHA:'Charlotte Hornets',
  CHI:'Chicago Bulls',CLE:'Cleveland Cavaliers',DAL:'Dallas Mavericks',DEN:'Denver Nuggets',
  DET:'Detroit Pistons',GS:'Golden State Warriors',HOU:'Houston Rockets',IND:'Indiana Pacers',
  LAC:'LA Clippers',LAL:'Los Angeles Lakers',MEM:'Memphis Grizzlies',MIA:'Miami Heat',
  MIL:'Milwaukee Bucks',MIN:'Minnesota Timberwolves',NO:'New Orleans Pelicans',NY:'New York Knicks',
  OKC:'Oklahoma City Thunder',ORL:'Orlando Magic',PHI:'Philadelphia 76ers',PHX:'Phoenix Suns',
  POR:'Portland Trail Blazers',SAC:'Sacramento Kings',SA:'San Antonio Spurs',TOR:'Toronto Raptors',
  UTAH:'Utah Jazz',WSH:'Washington Wizards',
};

export const logoUrl = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

export const ordinal = n => {
  const v = Math.abs(n) % 100;
  const sfx = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${sfx}`;
};

/** Dark team colors disappear on black, so lighten them for bars. */
export function lift(hex) {
  try {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > 0.18) return hex;
    const m = c => Math.round(c + (255 - c) * 0.5);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  } catch (e) {
    return '#3B82F6';
  }
}