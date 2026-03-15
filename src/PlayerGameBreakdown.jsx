import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import { useSwipeBack } from './useSwipeBack';

const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

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
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
              strokeWidth="3.5" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: att > 0 ? 'white' : '#6b7280', fontFamily: 'Rajdhani, sans-serif' }}>
            {att > 0 ? `${val}%` : '—'}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em', marginTop: 3 }}>{label}</span>
      <span style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>{made}/{att}</span>
    </div>
  );
}

function Tile({ value, label, accent, large }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl"
      style={{ background: accent ? `${accent}12` : '#0f0f0f', border: `1px solid ${accent ? accent + '30' : '#1c1c1c'}`, paddingTop: 10, paddingBottom: 10 }}>
      <span style={{ fontSize: large ? 26 : 20, fontWeight: 900, color: accent || 'white', lineHeight: 1, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '-0.01em' }}>
        {value}
      </span>
      <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginTop: 3 }}>{label}</span>
    </div>
  );
}

// Share card stat box
function SBox({ v, l, large }) {
  return (
    <div style={{ background: '#ffffff0d', borderRadius: 10, padding: large ? '12px 0' : '9px 0', textAlign: 'center' }}>
      <div style={{ fontSize: large ? 30 : 18, fontWeight: 900, color: 'white', lineHeight: 1, fontFamily: 'Rajdhani, sans-serif' }}>{v}</div>
      <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginTop: 3 }}>{l}</div>
    </div>
  );
}

export default function PlayerGameBreakdown({ player, game, gameDetails, selectedTeam, onClose }) {
  const screenRef = useSwipeBack(onClose);
  const shareCardRef = useRef(null);

  const teamAbbr = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
  const color = teamColors[teamAbbr] || '#3B82F6';
  const teamIdx = selectedTeam === 'away' ? 0 : 1;

  const boxscoreRow = gameDetails?.boxscore?.players?.[teamIdx]?.statistics?.[0]?.athletes?.find(
    a => a.athlete.id === player.id
  );
  const s = boxscoreRow?.stats || [];

  const gs = {
    min:   s[0]  || '-',
    pts:   s[1]  || '0',
    fg:    s[2]  || '0-0',
    three: s[3]  || '0-0',
    ft:    s[4]  || '0-0',
    reb:   s[5]  || '0',
    ast:   s[6]  || '0',
    to:    s[7]  || '0',
    stl:   s[8]  || '0',
    blk:   s[9]  || '0',
    oreb:  s[10] || '0',
    dreb:  s[11] || '0',
    pf:    s[12] || '0',
    pm:    s[13] || '0',
  };

  const split = str => { const p = (str||'0-0').split('-'); return [parseFloat(p[0])||0, parseFloat(p[1])||0]; };
  const [fgm, fga]  = split(gs.fg);
  const [tpm, tpa]  = split(gs.three);
  const [ftm, fta]  = split(gs.ft);
  const pts  = parseFloat(gs.pts)  || 0;
  const min  = parseFloat(gs.min)  || 0;
  const ast  = parseFloat(gs.ast)  || 0;
  const to   = parseFloat(gs.to)   || 0;
  const stl  = parseFloat(gs.stl)  || 0;
  const blk  = parseFloat(gs.blk)  || 0;
  const oreb = parseFloat(gs.oreb) || 0;
  const dreb = parseFloat(gs.dreb) || 0;
  const pf   = parseFloat(gs.pf)   || 0;

  const fgPct  = fga > 0 ? ((fgm/fga)*100).toFixed(1) : '0';
  const tpPct  = tpa > 0 ? ((tpm/tpa)*100).toFixed(1) : '0';
  const ftPct  = fta > 0 ? ((ftm/fta)*100).toFixed(1) : '0';
  const tsPct  = (fga+0.44*fta) > 0 ? ((pts/(2*(fga+0.44*fta)))*100).toFixed(1) : '0';
  const efgPct = fga > 0 ? (((fgm+0.5*tpm)/fga)*100).toFixed(1) : '0';
  const ftr    = fga > 0 ? ((fta/fga)*100).toFixed(1) : '0';

  const pm      = parseFloat(gs.pm) || 0;
  const pmStr   = pm > 0 ? `+${pm}` : `${pm}`;
  const pmColor = pm > 0 ? '#22c55e' : pm < 0 ? '#ef4444' : '#6b7280';

  const myScore  = selectedTeam === 'away' ? parseInt(game.awayScore)||0 : parseInt(game.homeScore)||0;
  const oppScore = selectedTeam === 'away' ? parseInt(game.homeScore)||0 : parseInt(game.awayScore)||0;
  const oppAbbr  = selectedTeam === 'away' ? game.homeTeam : game.awayTeam;
  const myAbbr   = selectedTeam === 'away' ? game.awayTeam : game.homeTeam;
  const myLogo   = selectedTeam === 'away' ? game.awayLogo : game.homeLogo;
  const won      = myScore > oppScore;
  const headshot = player.athlete?.headshot?.href || player.headshot;

  // Advanced
  const atr    = to > 0 ? (ast/to).toFixed(1) : ast > 0 ? '∞' : '—';
  const stocks = stl + blk;
  const pps    = fga > 0 ? (pts/fga).toFixed(2) : '—';
  const ppr    = min > 0 ? ((ast-to)/min).toFixed(2) : '—';
  const sbRate = min > 0 ? ((stl+blk)/min).toFixed(2) : '—';
  const foulR  = min > 0 ? (pf/min).toFixed(2) : '—';
  const orbPct = (oreb+dreb) > 0 ? ((oreb/(oreb+dreb))*100).toFixed(1)+'%' : '—';
  const usage  = min > 0 ? ((fga+0.44*fta+to)/min).toFixed(2) : '—';
  const per36  = min > 0 ? {
    pts: ((pts/min)*36).toFixed(1), reb: (((oreb+dreb)/min)*36).toFixed(1),
    ast: ((ast/min)*36).toFixed(1), stl: ((stl/min)*36).toFixed(1), blk: ((blk/min)*36).toFixed(1),
  } : null;
  const per48  = min > 0 ? {
    pts: ((pts/min)*48).toFixed(1), reb: (((oreb+dreb)/min)*48).toFixed(1),
    ast: ((ast/min)*48).toFixed(1), stl: ((stl/min)*48).toFixed(1), blk: ((blk/min)*48).toFixed(1),
  } : null;

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    shareCardRef.current.style.display = 'block';
    await new Promise(r => setTimeout(r, 150));
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#000000',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: shareCardRef.current.offsetWidth,
        height: shareCardRef.current.offsetHeight,
        windowWidth: shareCardRef.current.offsetWidth,
      });
      shareCardRef.current.style.display = 'none';
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'breakdown.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'breakdown.png'; a.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');
    } catch (err) {
      shareCardRef.current.style.display = 'none';
      console.error('Share failed:', err);
    }
  };

  const sectionLabel = (text) => (
    <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8 }}>{text}</div>
  );

  return (
    <div ref={screenRef} className="fixed inset-0 bg-black z-[200] overflow-y-auto"
      style={{ animation: 'slideInRight 0.3s cubic-bezier(0.22,1,0.36,1)' }}>
      <div className="min-h-screen px-4 pb-14 max-w-lg mx-auto">

        {/* ── HEADER ── */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:18, position:'sticky', top:0, zIndex:50, padding:'12px 0', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', background:'linear-gradient(to bottom,rgba(0,0,0,1) 0%,rgba(0,0,0,0.7) 100%)', borderBottom:'1px solid rgba(255,255,255,0.05)', marginLeft:-16, marginRight:-16, paddingLeft:16, paddingRight:16 }}>
          <button onClick={onClose} style={{ color:'#6b7280', fontSize:26, fontWeight:300, marginRight:12, background:'none', border:'none', cursor:'pointer', lineHeight:1 }}>‹</button>
          <h2 style={{ fontSize:24, fontWeight:900, fontFamily:'Rajdhani, sans-serif', margin:0, color:'white', flex:1 }}>Game Breakdown</h2>
          <button onClick={handleShare} style={{ background:'none', border:'1px solid #3f3f46', borderRadius:10, color:'#a1a1aa', fontSize:12, fontWeight:700, padding:'6px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, letterSpacing:'0.03em' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </button>
        </div>

        {/* ── HERO ── */}
        <div className="rounded-2xl p-4 mb-3 relative overflow-hidden"
          style={{ background:`linear-gradient(125deg,${color}1e 0%,#080808 55%)`, border:`1px solid ${color}28` }}>
          <div className="absolute -top-10 -left-10 w-44 h-44 rounded-full pointer-events-none"
            style={{ background:color, opacity:0.08, filter:'blur(40px)' }} />
          <div className="flex items-center gap-3 relative z-10">
            {headshot ? (
              <img src={headshot} alt={player.name} className="rounded-xl object-cover flex-shrink-0"
                style={{ width:62, height:62, border:`2px solid ${color}40` }} />
            ) : (
              <div className="rounded-xl bg-zinc-900 flex items-center justify-center text-gray-500 font-bold flex-shrink-0"
                style={{ width:62, height:62, fontSize:18 }}>
                {player.name?.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-black truncate" style={{ fontSize:21, fontFamily:'Rajdhani, sans-serif', letterSpacing:'-0.01em', lineHeight:1.1 }}>{player.name}</div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <img src={myLogo} alt={myAbbr} style={{ width:15, height:15 }} />
                <span style={{ fontSize:11, color:'#6b7280', fontWeight:600 }}>vs {oppAbbr}</span>
                {(game.isFinal || game.isLive) && (
                  <>
                    <span style={{ color:'#6b7280', fontSize:11 }}>·</span>
                    {game.isFinal ? (
                      <>
                        <span style={{ fontSize:11, fontWeight:800, color:won?'#22c55e':'#ef4444' }}>{won?'W':'L'}</span>
                        <span style={{ fontSize:12, color:'#a1a1aa', fontWeight:700 }}>{myScore}–{oppScore}</span>
                      </>
                    ) : (
                      <span style={{ fontSize:9, color:'#ef4444', fontWeight:800, letterSpacing:'0.08em' }}>● LIVE</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end flex-shrink-0">
              <span style={{ fontSize:58, fontWeight:900, lineHeight:0.88, fontFamily:'Rajdhani, sans-serif', color:'white', textShadow:`0 0 28px ${color}44` }}>{gs.min}</span>
              <span style={{ fontSize:10, color, fontWeight:700, letterSpacing:'0.1em', marginTop:5 }}>MIN</span>
            </div>
          </div>
        </div>

        {/* ── BIG 3 ── */}
        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
          {[{v:gs.pts,l:'PTS',hi:parseInt(gs.pts)>=20},{v:gs.reb,l:'REB',hi:parseInt(gs.reb)>=10},{v:gs.ast,l:'AST',hi:parseInt(gs.ast)>=10}].map(({v,l,hi})=>(
            <Tile key={l} value={v} label={l} accent={hi?'#22c55e':null} large />
          ))}
        </div>

        {/* ── SECONDARY ROW 1 ── */}
        <div className="grid grid-cols-4 gap-1.5 mb-1.5">
          {[{v:gs.stl,l:'STL'},{v:gs.blk,l:'BLK'},{v:gs.to,l:'TO'},{v:pmStr,l:'+/−',a:pmColor}].map(({v,l,a})=>(
            <Tile key={l} value={v} label={l} accent={a} />
          ))}
        </div>

        {/* ── SECONDARY ROW 2 ── */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[{v:gs.oreb,l:'OREB'},{v:gs.dreb,l:'DREB'},{v:gs.pf,l:'PF'}].map(({v,l})=>(
            <Tile key={l} value={v} label={l} />
          ))}
        </div>

        {/* ── SHOOTING ── */}
        <div className="rounded-2xl p-4" style={{ background:'#0a0a0a', border:'1px solid #171717' }}>
          <div className="flex items-center justify-between mb-4" style={{ paddingBottom:10, borderBottom:'1px solid #171717' }}>
            <span style={{ fontSize:10, color:'#6b7280', fontWeight:700, letterSpacing:'0.1em' }}>SHOOTING</span>
            <div className="flex gap-3">
              <span style={{ fontSize:10, color:'#6b7280' }}>TS%&nbsp;<span style={{ color:'#e4e4e7', fontWeight:800, fontFamily:'Rajdhani, sans-serif' }}>{tsPct}%</span></span>
              <span style={{ fontSize:10, color:'#6b7280' }}>eFG%&nbsp;<span style={{ color:'#e4e4e7', fontWeight:800, fontFamily:'Rajdhani, sans-serif' }}>{efgPct}%</span></span>
              <span style={{ fontSize:10, color:'#6b7280' }}>FTr&nbsp;<span style={{ color:'#e4e4e7', fontWeight:800, fontFamily:'Rajdhani, sans-serif' }}>{fga>0?`${ftr}%`:'—'}</span></span>
            </div>
          </div>
          <div className="flex justify-around">
            <Ring pct={fgPct} made={fgm} att={fga} label="FG"  color={color} />
            <Ring pct={tpPct} made={tpm} att={tpa} label="3PT" color={color} />
            <Ring pct={ftPct} made={ftm} att={fta} label="FT"  color={color} />
          </div>
        </div>

        {/* ── ADVANCED ── */}
        {min > 0 && (
          <div className="rounded-2xl p-4 mt-3" style={{ background:'#0a0a0a', border:'1px solid #171717' }}>
            <div className="flex items-center mb-4" style={{ paddingBottom:10, borderBottom:'1px solid #171717' }}>
              <span style={{ fontSize:10, color:'#6b7280', fontWeight:700, letterSpacing:'0.1em' }}>ADVANCED</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {[{v:atr,l:'AST/TO'},{v:stocks,l:'STOCKS'},{v:pps,l:'PTS/FGA'}].map(({v,l})=>(
                <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2.5" style={{ background:'#0f0f0f', border:'1px solid #1c1c1c' }}>
                  <span style={{ fontSize:20, fontWeight:900, color:'white', fontFamily:'Rajdhani, sans-serif', lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:9, color:'#6b7280', fontWeight:700, letterSpacing:'0.08em', marginTop:3 }}>{l}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-1.5">
              {[{v:ppr,l:'PPR/MIN'},{v:sbRate,l:'S+B/MIN'},{v:foulR,l:'PF/MIN'},{v:usage,l:'USG/MIN'},{v:orbPct,l:'OREB%'}].map(({v,l})=>(
                <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2.5" style={{ background:'#0f0f0f', border:'1px solid #1c1c1c' }}>
                  <span style={{ fontSize:12, fontWeight:900, color:'white', fontFamily:'Rajdhani, sans-serif', lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:9, color:'#6b7280', fontWeight:700, letterSpacing:'0.08em', marginTop:3 }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#6b7280', fontWeight:700, letterSpacing:'0.1em', marginBottom:8 }}>PER 36 MIN</div>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {per36 && [{v:per36.pts,l:'PTS'},{v:per36.reb,l:'REB'},{v:per36.ast,l:'AST'},{v:per36.stl,l:'STL'},{v:per36.blk,l:'BLK'}].map(({v,l})=>(
                <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2" style={{ background:'#0f0f0f', border:'1px solid #1c1c1c' }}>
                  <span style={{ fontSize:14, fontWeight:900, color:'white', fontFamily:'Rajdhani, sans-serif', lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:9, color:'#6b7280', fontWeight:700, letterSpacing:'0.08em', marginTop:2 }}>{l}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:10, color:'#6b7280', fontWeight:700, letterSpacing:'0.1em', marginBottom:8 }}>PER 48 MIN</div>
            <div className="grid grid-cols-5 gap-1.5">
              {per48 && [{v:per48.pts,l:'PTS'},{v:per48.reb,l:'REB'},{v:per48.ast,l:'AST'},{v:per48.stl,l:'STL'},{v:per48.blk,l:'BLK'}].map(({v,l})=>(
                <div key={l} className="flex flex-col items-center justify-center rounded-xl py-2.5" style={{ background:'#0f0f0f', border:'1px solid #1c1c1c' }}>
                  <span style={{ fontSize:18, fontWeight:900, color:'white', fontFamily:'Rajdhani, sans-serif', lineHeight:1 }}>{v}</span>
                  <span style={{ fontSize:9, color:'#6b7280', fontWeight:700, letterSpacing:'0.08em', marginTop:3 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════
          HIDDEN SHARE CARD
          520px wide — rendered off-screen
      ══════════════════════════════════ */}
<div
        ref={shareCardRef}
        style={{
          display: 'none',
          position: 'fixed',
          left: -9999,
          top: 0,
          width: 520,
          background: '#000000',
          padding: '28px 24px 24px',
          fontFamily: 'Rajdhani, sans-serif',
          boxSizing: 'border-box',
        }}
      >
      <div>
        {/* Hero */}
        <div style={{ background:`linear-gradient(135deg,${color}2a 0%,#0d0d0d 55%)`, border:`1px solid ${color}40`, borderRadius:18, padding:20, marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
            {headshot && (
              <img src={headshot} alt={player.name} crossOrigin="anonymous"
                style={{ width:72, height:72, borderRadius:14, objectFit:'cover', border:`2px solid ${color}55`, flexShrink:0 }} />
            )}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:30, fontWeight:900, color:'white', lineHeight:1.05, letterSpacing:'-0.01em' }}>{player.name}</div>
              <div style={{ fontSize:14, color:'#a1a1aa', marginTop:5, fontWeight:600 }}>
                {myAbbr} vs {oppAbbr}
                {game.isFinal && (
                  <span style={{ marginLeft:10, color:won?'#22c55e':'#ef4444', fontWeight:800 }}>
                    {won?'W':'L'} {myScore}–{oppScore}
                  </span>
                )}
              </div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{gs.min} MIN</div>
            </div>
          </div>
          {/* Big 3 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
            {[{v:gs.pts,l:'PTS'},{v:gs.reb,l:'REB'},{v:gs.ast,l:'AST'}].map(({v,l})=>(
              <SBox key={l} v={v} l={l} large />
            ))}
          </div>
          {/* Secondary */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
            {[{v:gs.stl,l:'STL'},{v:gs.blk,l:'BLK'},{v:gs.to,l:'TO'},{v:pmStr,l:'+/−'}].map(({v,l})=>(
              <SBox key={l} v={v} l={l} />
            ))}
          </div>
        </div>

        {/* Rebounds & Fouls */}
        <div style={{ background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:14, padding:16, marginBottom:12 }}>
          {sectionLabel('REBOUNDS & FOULS')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[{v:gs.oreb,l:'OREB'},{v:gs.dreb,l:'DREB'},{v:gs.pf,l:'PF'}].map(({v,l})=>(
              <SBox key={l} v={v} l={l} />
            ))}
          </div>
        </div>

        {/* Shooting */}
        <div style={{ background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:14, padding:16, marginBottom:12 }}>
          {sectionLabel('SHOOTING')}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
            {[{l:'FG',pct:fgPct,ma:`${fgm}/${fga}`},{l:'3PT',pct:tpPct,ma:`${tpm}/${tpa}`},{l:'FT',pct:ftPct,ma:`${ftm}/${fta}`}].map(({l,pct,ma})=>(
              <div key={l} style={{ background:'#ffffff0d', borderRadius:10, padding:'10px 0', textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:900, color:'white', lineHeight:1 }}>{pct}%</div>
                <div style={{ fontSize:11, color:'#a1a1aa', marginTop:2 }}>{ma}</div>
                <div style={{ fontSize:9, color:'#6b7280', fontWeight:700, letterSpacing:'0.08em', marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[{v:`${tsPct}%`,l:'TS%'},{v:`${efgPct}%`,l:'eFG%'},{v:`${ftr}%`,l:'FTr'}].map(({v,l})=>(
              <SBox key={l} v={v} l={l} />
            ))}
          </div>
        </div>

        {/* Advanced */}
        {min > 0 && (
          <div style={{ background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:14, padding:16, marginBottom:12 }}>
            {sectionLabel('ADVANCED')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
              {[{v:atr,l:'AST/TO'},{v:stocks,l:'STOCKS'},{v:pps,l:'PTS/FGA'}].map(({v,l})=>(
                <SBox key={l} v={v} l={l} />
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8 }}>
              {[{v:ppr,l:'PPR/MIN'},{v:sbRate,l:'S+B/MIN'},{v:foulR,l:'PF/MIN'},{v:usage,l:'USG/MIN'},{v:orbPct,l:'OREB%'}].map(({v,l})=>(
                <div key={l} style={{ background:'#ffffff0d', borderRadius:10, padding:'8px 0', textAlign:'center' }}>
                  <div style={{ fontSize:13, fontWeight:900, color:'white', lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:8, color:'#6b7280', fontWeight:700, letterSpacing:'0.06em', marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per 36 & Per 48 */}
        {per36 && (
          <div style={{ background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:14, padding:16, marginBottom:12 }}>
            {sectionLabel('PER 36 MIN')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              {[{v:per36.pts,l:'PTS'},{v:per36.reb,l:'REB'},{v:per36.ast,l:'AST'},{v:per36.stl,l:'STL'},{v:per36.blk,l:'BLK'}].map(({v,l})=>(
                <div key={l} style={{ background:'#ffffff0d', borderRadius:10, padding:'8px 0', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:'white', lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:8, color:'#6b7280', fontWeight:700, letterSpacing:'0.06em', marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
            {sectionLabel('PER 48 MIN')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8 }}>
              {per48 && [{v:per48.pts,l:'PTS'},{v:per48.reb,l:'REB'},{v:per48.ast,l:'AST'},{v:per48.stl,l:'STL'},{v:per48.blk,l:'BLK'}].map(({v,l})=>(
                <div key={l} style={{ background:'#ffffff0d', borderRadius:10, padding:'8px 0', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:'white', lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:8, color:'#6b7280', fontWeight:700, letterSpacing:'0.06em', marginTop:3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Branding */}
        <div style={{ textAlign:'center', paddingTop:6 }}>
          <span style={{ fontSize:14, color:'#3f3f46', fontWeight:800, letterSpacing:'0.15em' }}>SLATE</span>
        </div>
      </div>
      </div>
    </div>
  );
}