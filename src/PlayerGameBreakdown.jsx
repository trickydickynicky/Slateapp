import React from 'react';

const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

// Arc ring for shooting %
function Ring({ pct, made, att, label, color, size = 70 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const val = parseFloat(pct) || 0;
  const dash = (val / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f1f1f" strokeWidth="3.5" />
          {att > 0 && (
            <circle
              cx={size/2} cy={size/2} r={r}
              fill="none"
              stroke={color}
              strokeWidth="3.5"
              strokeDasharray={`${dash} ${circ}`}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 800, color: att > 0 ? 'white' : '#3f3f46',
            fontFamily: 'Rajdhani, sans-serif',
          }}>
            {att > 0 ? `${val}%` : '—'}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 10, color: '#52525b', fontWeight: 700, letterSpacing: '0.06em', marginTop: 3 }}>{label}</span>
      <span style={{ fontSize: 9, color: '#2d2d2d', marginTop: 1 }}>{made}/{att}</span>
    </div>
  );
}

// Compact stat tile
function Tile({ value, label, accent, large }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl"
      style={{
        background: accent ? `${accent}12` : '#0f0f0f',
        border: `1px solid ${accent ? accent + '30' : '#1c1c1c'}`,
        paddingTop: 10,
        paddingBottom: 10,
      }}
    >
      <span style={{
        fontSize: large ? 26 : 20,
        fontWeight: 900,
        color: accent || 'white',
        lineHeight: 1,
        fontFamily: 'Rajdhani, sans-serif',
        letterSpacing: '-0.01em',
      }}>
        {value}
      </span>
      <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 3 }}>
        {label}
      </span>
    </div>
  );
}

export default function PlayerGameBreakdown({ player, game, gameDetails, selectedTeam, onClose }) {
  const teamAbbr = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
  const color = teamColors[teamAbbr] || '#3B82F6';

  const teamIdx = selectedTeam === 'away' ? 0 : 1;
  const boxscoreRow = gameDetails?.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes?.find(
    a => a.athlete.id === player.id
  );
  const s = boxscoreRow?.stats || [];

  const gs = {
    min:    s[0]  || '-',
    pts:    s[1]  || '0',
    fg:     s[2]  || '0-0',
    three:  s[3]  || '0-0',
    ft:     s[4]  || '0-0',
    reb:    s[5]  || '0',
    ast:    s[6]  || '0',
    to:     s[7]  || '0',
    stl:    s[8]  || '0',
    blk:    s[9]  || '0',
oreb:   s[10] || '0',
dreb:   s[11] || '0',
pf:     s[12] || '0',
    pm:     s[13] || '0',
  };

  const split = str => {
    const p = (str || '0-0').split('-');
    return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0];
  };
  const [fgm, fga] = split(gs.fg);
  const [tpm, tpa] = split(gs.three);
  const [ftm, fta] = split(gs.ft);
  const pts = parseFloat(gs.pts) || 0;

  const fgPct  = fga > 0 ? ((fgm / fga) * 100).toFixed(1) : '0';
  const tpPct  = tpa > 0 ? ((tpm / tpa) * 100).toFixed(1) : '0';
  const ftPct  = fta > 0 ? ((ftm / fta) * 100).toFixed(1) : '0';
  const tsPct  = (fga + 0.44 * fta) > 0
    ? ((pts / (2 * (fga + 0.44 * fta))) * 100).toFixed(1) : '0';
  const efgPct = fga > 0
    ? (((fgm + 0.5 * tpm) / fga) * 100).toFixed(1) : '0';

  const pm      = parseFloat(gs.pm) || 0;
  const pmStr   = pm > 0 ? `+${pm}` : `${pm}`;
  const pmColor = pm > 0 ? '#22c55e' : pm < 0 ? '#ef4444' : '#52525b';

  const myScore  = selectedTeam === 'away' ? parseInt(game.awayScore) || 0 : parseInt(game.homeScore) || 0;
  const oppScore = selectedTeam === 'away' ? parseInt(game.homeScore) || 0 : parseInt(game.awayScore) || 0;
  const oppAbbr  = selectedTeam === 'away' ? game.homeTeam : game.awayTeam;
const oppLogo  = selectedTeam === 'away' ? game.homeLogo : game.awayLogo;
const myAbbr   = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
const myLogo   = selectedTeam === 'away' ? game.awayLogo : game.homeLogo;
  const won      = myScore > oppScore;

  const headshot = player.athlete?.headshot?.href || player.headshot;

  return (
    <div
      className="fixed inset-0 bg-black z-[200] overflow-y-auto"
      style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}
    >
      <div className="min-h-screen px-4 pt-12 pb-14 max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center mb-5">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-light mr-4">
            ‹
          </button>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            Game Breakdown
          </h2>
        </div>

        {/* ── HERO ── */}
        <div
          className="rounded-2xl p-4 mb-3 relative overflow-hidden"
          style={{
            background: `linear-gradient(125deg, ${color}1e 0%, #080808 55%)`,
            border: `1px solid ${color}28`,
          }}
        >
          <div
            className="absolute -top-10 -left-10 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: color, opacity: 0.08, filter: 'blur(40px)' }}
          />
          <div className="flex items-center gap-3 relative z-10">

            {/* Headshot */}
            {headshot ? (
              <img
                src={headshot}
                alt={player.name}
                className="rounded-xl object-cover flex-shrink-0"
                style={{ width: 62, height: 62, border: `2px solid ${color}40` }}
              />
            ) : (
              <div
                className="rounded-xl bg-zinc-900 flex items-center justify-center text-gray-500 font-bold flex-shrink-0"
                style={{ width: 62, height: 62, fontSize: 18 }}
              >
                {player.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div
                className="font-black truncate"
                style={{
                  fontSize: 21, fontFamily: 'Rajdhani, sans-serif',
                  letterSpacing: '-0.01em', lineHeight: 1.1,
                }}
              >
                {player.name}
              </div>

              {/* Matchup + result */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <img src={myLogo} alt={myAbbr} style={{ width: 15, height: 15 }} />
<span style={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>
  vs {oppAbbr}
</span>
                {(game.isFinal || game.isLive) && (
                  <>
                    <span style={{ color: '#2d2d2d', fontSize: 11 }}>·</span>
                    {game.isFinal ? (
                      <>
                        <span style={{
                          fontSize: 11, fontWeight: 800,
                          color: won ? '#22c55e' : '#ef4444',
                        }}>
                          {won ? 'W' : 'L'}
                        </span>
                        <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 700 }}>
                          {myScore}–{oppScore}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 800, letterSpacing: '0.08em' }}>
                        ● LIVE
                      </span>
                    )}
                  </>
                )}
              </div>

             
            </div>

   {/* Big MIN */}
<div className="flex flex-col items-end flex-shrink-0">
  <span
    style={{
      fontSize: 58, fontWeight: 900, lineHeight: 0.88,
      fontFamily: 'Rajdhani, sans-serif',
      color: 'white',
      textShadow: `0 0 28px ${color}44`,
    }}
  >
    {gs.min}
  </span>
  <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '0.1em', marginTop: 5 }}>
    MIN
  </span>
</div>
          </div>
        </div>

        {/* ── BIG 3: PTS / REB / AST ── */}
        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        {[
  { v: gs.pts, l: 'PTS', hi: parseInt(gs.pts) >= 20 },
  { v: gs.reb, l: 'REB', hi: parseInt(gs.reb) >= 10 },
  { v: gs.ast, l: 'AST', hi: parseInt(gs.ast) >= 10 },
].map(({ v, l, hi }) => (
  <Tile key={l} value={v} label={l} accent={hi ? '#22c55e' : null} large />
))}
        </div>

      {/* ── SECONDARY ROW 1 ── */}
<div className="grid grid-cols-4 gap-1.5 mb-1.5">
  {[
    { v: gs.stl,  l: 'STL' },
    { v: gs.blk,  l: 'BLK' },
    { v: gs.to,   l: 'TO'  },
    { v: pmStr,   l: '+/−', a: pmColor },
  ].map(({ v, l, a }) => (
    <Tile key={l} value={v} label={l} accent={a} />
  ))}
</div>

{/* ── SECONDARY ROW 2 ── */}
<div className="grid grid-cols-3 gap-1.5 mb-3">
  {[
    { v: gs.oreb, l: 'OREB' },
    { v: gs.dreb, l: 'DREB' },
    { v: gs.pf,   l: 'PF'   },
  ].map(({ v, l }) => (
    <Tile key={l} value={v} label={l} />
  ))}
</div>

        {/* ── SHOOTING ── */}
        <div
          className="rounded-2xl p-4"
          style={{ background: '#0a0a0a', border: '1px solid #171717' }}
        >
          {/* Header with TS% / eFG% */}
          <div
            className="flex items-center justify-between mb-4"
            style={{ paddingBottom: 10, borderBottom: '1px solid #171717' }}
          >
            <span style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em' }}>
              SHOOTING
            </span>
            <div className="flex gap-3">
  <span style={{ fontSize: 10, color: '#3f3f46' }}>
    TS%&nbsp;
    <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
      {tsPct}%
    </span>
  </span>
  <span style={{ fontSize: 10, color: '#3f3f46' }}>
    eFG%&nbsp;
    <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
      {efgPct}%
    </span>
  </span>
  <span style={{ fontSize: 10, color: '#3f3f46' }}>
    FTr&nbsp;
    <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
    {fga > 0 ? `${((fta / fga) * 100).toFixed(1)}%` : '—'}
    </span>
  </span>
</div>
          </div>

          {/* Rings only */}
          <div className="flex justify-around">
            <Ring pct={fgPct}  made={fgm} att={fga} label="FG"  color={color} />
            <Ring pct={tpPct}  made={tpm} att={tpa} label="3PT" color={color} />
            <Ring pct={ftPct}  made={ftm} att={fta} label="FT"  color={color} />
          </div>
        </div>

      </div>
    </div>
  );
}