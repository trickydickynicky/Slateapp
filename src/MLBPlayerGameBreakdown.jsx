import React from 'react';
import { useSwipeBack } from './useSwipeBack';

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

// Arc ring for shooting/stat percentage
function Ring({ pct, made, att, label, color, size = 70 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const val = parseFloat(pct) || 0;
  const dash = (val / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f1f1f" strokeWidth="3.5" />
          {att > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={color} strokeWidth="3.5"
              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: att > 0 ? 'white' : '#3f3f46', fontFamily: 'Rajdhani, sans-serif' }}>
  {att > 0 ? `${(val / 100).toFixed(3)}` : '—'}
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

export default function MLBPlayerGameBreakdown({ player, game, gameDetails, selectedTeam, onClose }) {
    const screenRef = useSwipeBack(onClose); // ← add this

    const teamAbbr = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
  const color = teamColors[teamAbbr] || '#3B82F6';

  // Determine if this player is a batter or pitcher by checking which boxscore list they appear in
  const teamIdx = selectedTeam === 'away' ? 0 : 1;
  const batters = gameDetails?.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes || [];
  const pitchers = gameDetails?.boxscore?.players?.[teamIdx]?.statistics?.[1]?.athletes || [];

  const batterRow = batters.find(a => a.athlete.id === player.id);
  const pitcherRow = pitchers.find(a => a.athlete.id === player.id);

  const isPitcher = !!pitcherRow && !batterRow;
  const statsRow = isPitcher ? pitcherRow : batterRow;
  const s = statsRow?.stats || [];

  // ── BATTING STATS ──
  // ESPN MLB batter stats order (from MLBApp boxscore):
  // [0]=H/AB, [1]=AB, [2]=R, [3]=H, [4]=RBI, [5]=HR, [6]=BB, [7]=K, [8]=P (pitches seen), [9]=AVG, [10]=OBP, [11]=SLG
  const bat = {
    hab:  s[0]  || '0-0',
    ab:   parseInt(s[1])  || 0,
    r:    parseInt(s[2])  || 0,
    h:    parseInt(s[3])  || 0,
    rbi:  parseInt(s[4])  || 0,
    hr:   parseInt(s[5])  || 0,
    bb:   parseInt(s[6])  || 0,
    k:    parseInt(s[7])  || 0,
    p:    parseInt(s[8])  || 0,
    avg:  s[9]  || '.000',
    obp:  s[10] || '.000',
    slg:  s[11] || '.000',
  };

  // ── PITCHING STATS ──
  // ESPN MLB pitcher stats order (from MLBApp pitching boxscore):
  // [0]=IP, [1]=H, [2]=R, [3]=ER, [4]=BB, [5]=SO, [6]=HR, [7]=PC-ST (e.g. "85-58"), [8]=ERA
  const pit = {
    ip:   s[0]  || '0',
    h:    parseInt(s[1])  || 0,
    r:    parseInt(s[2])  || 0,
    er:   parseInt(s[3])  || 0,
    bb:   parseInt(s[4])  || 0,
    so:   parseInt(s[5])  || 0,
    hr:   parseInt(s[6])  || 0,
    pcSt: s[7]  || '0-0',
    era:  s[8]  || '0.00',
  };

  // Parse pitch count / strikes
  const pcParts = pit.pcSt.split('-');
  const pitchCount = parseInt(pcParts[0]) || 0;
  const strikes = parseInt(pcParts[1]) || 0;
  const balls = pitchCount - strikes;

  // Batting derived stats
  const ops = bat.avg !== '.000' ? (parseFloat(bat.obp) + parseFloat(bat.slg)).toFixed(3) : '.000';
  const habParts = bat.hab.split('-');
  const habH = parseInt(habParts[0]) || 0;
  const habAB = parseInt(habParts[1]) || 0;
  const avgPct = habAB > 0 ? ((habH / habAB) * 100).toFixed(1) : '0';

  // Pitching derived stats
  const ipNum = parseFloat(pit.ip) || 0;
  const k9 = ipNum > 0 ? ((pit.so / ipNum) * 9).toFixed(1) : '0.0';
  const bb9 = ipNum > 0 ? ((pit.bb / ipNum) * 9).toFixed(1) : '0.0';
  const hr9 = ipNum > 0 ? ((pit.hr / ipNum) * 9).toFixed(1) : '0.0';
  const whip = ipNum > 0 ? (((pit.bb + pit.h) / ipNum)).toFixed(2) : '0.00';
  const strikeRate = pitchCount > 0 ? ((strikes / pitchCount) * 100).toFixed(1) : '0';
  const kbb = pit.bb > 0 ? (pit.so / pit.bb).toFixed(2) : pit.so > 0 ? '∞' : '—';

  const myScore  = selectedTeam === 'away' ? parseInt(game.awayScore) || 0 : parseInt(game.homeScore) || 0;
  const oppScore = selectedTeam === 'away' ? parseInt(game.homeScore) || 0 : parseInt(game.awayScore) || 0;
  const oppAbbr  = selectedTeam === 'away' ? game.homeTeam : game.awayTeam;
  const myLogo   = selectedTeam === 'away' ? game.awayLogo : game.homeLogo;
  const won      = myScore > oppScore;

  const headshot = player.athlete?.headshot?.href || player.headshot;
  const playerName = player.athlete?.displayName || player.athlete?.shortName || player.name;
  const position = player.athlete?.position?.abbreviation || player.position || '';

  // Pitching decision badge
  const decision = pitcherRow?.notes?.find(n => n.type === 'pitchingDecision')?.text;
  let decisionLabel = null;
  let decisionColor = '#3f3f46';
  if (decision) {
    if (decision.startsWith('W')) { decisionLabel = 'WIN'; decisionColor = '#22c55e'; }
    else if (decision.startsWith('L')) { decisionLabel = 'LOSS'; decisionColor = '#ef4444'; }
    else if (decision.startsWith('SV')) { decisionLabel = 'SAVE'; decisionColor = '#f59e0b'; }
    else if (decision.startsWith('H,') || decision === 'H') { decisionLabel = 'HOLD'; decisionColor = '#3b82f6'; }
    else if (decision.startsWith('BS')) { decisionLabel = 'BLOWN SAVE'; decisionColor = '#f97316'; }
  }

  return (
    <div
  ref={screenRef}
  className="fixed inset-0 bg-black z-[200] overflow-y-auto"
  style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}
>
      <div className="min-h-screen px-4 pt-12 pb-14 max-w-lg mx-auto">

       {/* Header */}
<div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, position: 'sticky', top: 0, zIndex: 50, padding: '12px 0', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
  <button onClick={onClose} style={{ color: '#6b7280', fontSize: 26, fontWeight: 300, marginRight: 12, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>‹</button>
  <h2 style={{ fontSize: 24, fontWeight: 900, fontFamily: 'Rajdhani, sans-serif', margin: 0, color: 'white' }}>Game Breakdown</h2>
</div>

        {/* ── HERO ── */}
        <div
          className="rounded-2xl p-4 mb-3 relative overflow-hidden"
          style={{
            background: `linear-gradient(125deg, ${color}1e 0%, #080808 55%)`,
            border: `1px solid ${color}28`,
          }}
        >
          <div className="absolute -top-10 -left-10 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: color, opacity: 0.08, filter: 'blur(40px)' }} />

          <div className="flex items-center gap-3 relative z-10">
            {/* Headshot */}
            {headshot ? (
              <img src={headshot} alt={playerName}
                className="rounded-xl object-cover flex-shrink-0"
                style={{ width: 62, height: 62, border: `2px solid ${color}40` }} />
            ) : (
              <div className="rounded-xl bg-zinc-900 flex items-center justify-center text-gray-500 font-bold flex-shrink-0"
                style={{ width: 62, height: 62, fontSize: 18 }}>
                {playerName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-black truncate"
                style={{ fontSize: 21, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                {playerName}
              </div>
              <div style={{ fontSize: 10, color: '#52525b', fontWeight: 600, marginTop: 2 }}>
                {position}{position ? ' · ' : ''}{teamAbbr}
              </div>

              {/* Matchup + result */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <img src={myLogo} alt={teamAbbr} style={{ width: 15, height: 15 }} />
                <span style={{ fontSize: 11, color: '#71717a', fontWeight: 600 }}>vs {oppAbbr}</span>
                {(game.isFinal || game.isLive) && (
                  <>
                    <span style={{ color: '#2d2d2d', fontSize: 11 }}>·</span>
                    {game.isFinal ? (
                      <>
                        <span style={{ fontSize: 11, fontWeight: 800, color: won ? '#22c55e' : '#ef4444' }}>
                          {won ? 'W' : 'L'}
                        </span>
                        <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 700 }}>
                          {myScore}–{oppScore}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 800, letterSpacing: '0.08em' }}>● LIVE</span>
                    )}
                  </>
                )}
                {decisionLabel && (
                  <>
                    <span style={{ color: '#2d2d2d', fontSize: 11 }}>·</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: decisionColor, letterSpacing: '0.06em' }}>
                      {decisionLabel}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Big stat on right: H/AB for batters, ERA for pitchers */}
            <div className="flex flex-col items-end flex-shrink-0">
              <span style={{
                fontSize: isPitcher ? 42 : 50, fontWeight: 900, lineHeight: 0.88,
                fontFamily: 'Rajdhani, sans-serif', color: 'white',
                textShadow: `0 0 28px ${color}44`,
              }}>
                {isPitcher ? pit.era : bat.hab}
              </span>
              <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '0.1em', marginTop: 5 }}>
                {isPitcher ? 'ERA' : 'H/AB'}
              </span>
            </div>
          </div>
        </div>

        {/* ── BATTER STATS ── */}
        {!isPitcher && (
          <>
            {/* Big 3: H / RBI / R */}
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {[
                { v: bat.h,   l: 'H',   hi: bat.h >= 3 },
                { v: bat.rbi, l: 'RBI', hi: bat.rbi >= 3 },
                { v: bat.r,   l: 'R',   hi: bat.r >= 2 },
              ].map(({ v, l, hi }) => (
                <Tile key={l} value={v} label={l} accent={hi ? '#22c55e' : null} large />
              ))}
            </div>

            {/* Secondary row 1: HR / BB / K / AB */}
            <div className="grid grid-cols-4 gap-1.5 mb-1.5">
              {[
                { v: bat.hr, l: 'HR', a: bat.hr >= 1 ? '#f59e0b' : null },
                { v: bat.bb, l: 'BB' },
                { v: bat.k,  l: 'K',  a: bat.k >= 3 ? '#ef4444' : null },
                { v: bat.ab, l: 'AB' },
              ].map(({ v, l, a }) => (
                <Tile key={l} value={v} label={l} accent={a} />
              ))}
            </div>

            {/* Secondary row 2: OBP / SLG / OPS */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { v: bat.obp, l: 'OBP' },
                { v: bat.slg, l: 'SLG' },
                { v: ops,     l: 'OPS' },
              ].map(({ v, l }) => (
                <Tile key={l} value={v} label={l} />
              ))}
            </div>

            {/* Batting Average Ring + Context */}
            <div className="rounded-2xl p-4 mb-3"
              style={{ background: '#0a0a0a', border: '1px solid #171717' }}>
              <div className="flex items-center justify-between mb-4"
                style={{ paddingBottom: 10, borderBottom: '1px solid #171717' }}>
                <span style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em' }}>AT BAT</span>
                <div className="flex gap-3">
                  <span style={{ fontSize: 10, color: '#3f3f46' }}>
                    AVG&nbsp;
                    <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
                      {bat.avg}
                    </span>
                  </span>
                  <span style={{ fontSize: 10, color: '#3f3f46' }}>
                    OBP&nbsp;
                    <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
                      {bat.obp}
                    </span>
                  </span>
                  {bat.p > 0 && (
                    <span style={{ fontSize: 10, color: '#3f3f46' }}>
                      P&nbsp;
                      <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>
                        {bat.p}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-around">
                <Ring pct={avgPct} made={habH} att={habAB} label="AVG" color={color} />
                <Ring pct={parseFloat(bat.obp) * 100} made={habH + bat.bb} att={habAB + bat.bb} label="OBP" color={color} />
                <Ring pct={parseFloat(bat.slg) * 100} made={bat.h} att={habAB} label="SLG" color={color} />
              </div>
            </div>

            {/* Advanced Batting */}
            {bat.ab > 0 && (
              <div className="rounded-2xl p-4" style={{ background: '#0a0a0a', border: '1px solid #171717' }}>
                <div className="flex items-center justify-between mb-4"
                  style={{ paddingBottom: 10, borderBottom: '1px solid #171717' }}>
                  <span style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em' }}>ADVANCED</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  {[
                    { v: ops, l: 'OPS' },
                    { v: bat.k > 0 ? (bat.bb / bat.k).toFixed(2) : bat.bb > 0 ? '∞' : '—', l: 'BB/K' },
                    { v: bat.ab > 0 ? ((bat.hr / bat.ab) * 100).toFixed(1) + '%' : '—', l: 'HR RATE' },
                  ].map(({ v, l }) => (
                    <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2.5"
                      style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: 'white', fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>{v}</span>
                      <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 3 }}>{l}</span>
                    </div>
                  ))}
                </div>
                {bat.p > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { v: bat.ab > 0 ? (bat.p / bat.ab).toFixed(1) : '—', l: 'P/PA' },
                      { v: bat.k > 0 ? ((bat.k / bat.ab) * 100).toFixed(1) + '%' : '0%', l: 'K%' },
                    ].map(({ v, l }) => (
                      <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2"
                        style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>{v}</span>
                        <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>{l}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── PITCHER STATS ── */}
        {isPitcher && (
          <>
            {/* Big 3: IP / SO / ER */}
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {[
                { v: pit.ip, l: 'IP',   hi: parseFloat(pit.ip) >= 6 },
                { v: pit.so, l: 'SO',   hi: pit.so >= 8 },
                { v: pit.er, l: 'ER',   hi: pit.er === 0 },
              ].map(({ v, l, hi }) => (
                <Tile key={l} value={v} label={l} accent={hi ? '#22c55e' : null} large />
              ))}
            </div>

            {/* Secondary row 1: H / R / BB / HR */}
            <div className="grid grid-cols-4 gap-1.5 mb-1.5">
              {[
                { v: pit.h,  l: 'H',  a: pit.h <= 3 && parseFloat(pit.ip) >= 5 ? '#22c55e' : null },
                { v: pit.r,  l: 'R',  a: pit.r === 0 && parseFloat(pit.ip) >= 5 ? '#22c55e' : null },
                { v: pit.bb, l: 'BB', a: pit.bb >= 4 ? '#ef4444' : null },
                { v: pit.hr, l: 'HR', a: pit.hr >= 2 ? '#ef4444' : null },
              ].map(({ v, l, a }) => (
                <Tile key={l} value={v} label={l} accent={a} />
              ))}
            </div>

            {/* ERA / WHIP / PC */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { v: pit.era,  l: 'ERA'  },
                { v: whip,     l: 'WHIP' },
                { v: pitchCount || '—', l: 'PITCHES' },
              ].map(({ v, l }) => (
                <Tile key={l} value={v} label={l} />
              ))}
            </div>

            {/* Pitch breakdown */}
            {pitchCount > 0 && (
              <div className="rounded-2xl p-4 mb-3"
                style={{ background: '#0a0a0a', border: '1px solid #171717' }}>
                <div className="flex items-center justify-between mb-4"
                  style={{ paddingBottom: 10, borderBottom: '1px solid #171717' }}>
                  <span style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em' }}>PITCH COUNT</span>
                  <div className="flex gap-3">
                    <span style={{ fontSize: 10, color: '#3f3f46' }}>
                      STR&nbsp;
                      <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>{strikes}</span>
                    </span>
                    <span style={{ fontSize: 10, color: '#3f3f46' }}>
                      BALL&nbsp;
                      <span style={{ color: '#e4e4e7', fontWeight: 800, fontFamily: 'Rajdhani, sans-serif' }}>{balls}</span>
                    </span>
                  </div>
                </div>

                {/* Strike % ring */}
                <div className="flex justify-around">
                  <Ring pct={strikeRate} made={strikes} att={pitchCount} label="STR%" color={color} />
                  <div className="flex flex-col items-center justify-center">
                    <span style={{ fontSize: 32, fontWeight: 900, color: 'white', fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>
                      {pit.pcSt}
                    </span>
                    <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '0.1em', marginTop: 5 }}>PC-ST</span>
                  </div>
                  <Ring
                    pct={pitchCount > 0 ? ((balls / pitchCount) * 100).toFixed(1) : '0'}
                    made={balls} att={pitchCount} label="BALL%" color="#ef4444"
                  />
                </div>
              </div>
            )}

            {/* Advanced Pitching */}
            {ipNum > 0 && (
              <div className="rounded-2xl p-4" style={{ background: '#0a0a0a', border: '1px solid #171717' }}>
                <div className="flex items-center justify-between mb-4"
                  style={{ paddingBottom: 10, borderBottom: '1px solid #171717' }}>
                  <span style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em' }}>ADVANCED</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  {[
                    { v: k9,   l: 'K/9'  },
                    { v: bb9,  l: 'BB/9' },
                    { v: hr9,  l: 'HR/9' },
                  ].map(({ v, l }) => (
                    <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2.5"
                      style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: 'white', fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>{v}</span>
                      <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 3 }}>{l}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  {[
                    { v: whip, l: 'WHIP' },
                    { v: kbb,  l: 'K/BB' },
                    { v: pitchCount > 0 ? (pitchCount / ipNum).toFixed(1) : '—', l: 'P/IP' },
                  ].map(({ v, l }) => (
                    <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2"
                      style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>{v}</span>
                      <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>{l}</span>
                    </div>
                  ))}
                </div>

                {/* Per 9 Innings row */}
                <div style={{ fontSize: 10, color: '#2d2d2d', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>PER 9 INN</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: k9,  l: 'K'  },
                    { v: bb9, l: 'BB' },
                    { v: hr9, l: 'HR' },
                  ].map(({ v, l }) => (
                    <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2"
                      style={{ background: '#0f0f0f', border: '1px solid #1c1c1c' }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>{v}</span>
                      <span style={{ fontSize: 9, color: '#3f3f46', fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* No data fallback */}
        {!batterRow && !pitcherRow && (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: '#0a0a0a', border: '1px solid #171717' }}>
            <span style={{ color: '#3f3f46', fontSize: 14 }}>No game stats available</span>
          </div>
        )}

      </div>
    </div>
  );
}