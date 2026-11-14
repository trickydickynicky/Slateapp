import React, { useEffect, useLayoutEffect, useRef } from 'react';

/* ============================================================================
   Collapsing sticky score header for the game detail screen (pre / live / final).

   Scroll progress p (0 = expanded, 1 = collapsed) is written straight onto the
   header element as the CSS variable --p by one rAF-throttled scroll listener,
   so nothing here re-renders while you scroll. Every size below is a calc() of
   --p, so the header shrinks continuously with the scroll.

   Defined at module level (never inline in App.jsx) so live score/clock updates
   re-render it in place without remounting or resetting the scroll position.
============================================================================ */

const COLLAPSE_PX = 100;                       // scroll distance over which the header shrinks
const heading = { fontFamily: 'Rajdhani, sans-serif' };
const DIM = '#6b7280';                         // gray-500, the loser's score

const lerp = (a, b) => `calc(${a}px + (${b - a}px) * var(--p, 0))`;   // a at p=0, b at p=1
const ROW_H = lerp(44, 30);                    // the logo / score row, shared by all three columns
const DOT = 'min(var(--p, 0) * 4, 1)';         // 0 -> 1 as the header collapses

/* A block that fades out early and collapses to zero height as --p rises, leaving no gap.
   Its natural height is measured (not guessed) so the collapse tracks the scroll exactly. */
function Collapse({ children, speed = 3 }) {
  const outer = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return undefined;
    const measure = () => o.style.setProperty('--h', `${i.offsetHeight + 2}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={outer}
      style={{
        overflow: 'hidden',
        maxHeight: `calc(var(--h, 400px) * (1 - min(var(--p, 0) * ${speed}, 1)))`,
        opacity: `calc(1 - var(--p, 0) * ${speed + 1})`,
      }}
    >
      <div ref={inner} style={{ display: 'flow-root' }}>{children}</div>
    </div>
  );
}

/* One team: logo + score on a single row (so it can shrink into the compact bar),
   with the city / record / home-away split underneath fading out. */
function Team({ side, abbr, logo, city, record, split, score, scoreColor, showScore, onClick }) {
  const isAway = side === 'away';
  const logoEl = (
    <img src={logo} alt={abbr} style={{ width: lerp(40, 24), height: lerp(40, 24), flexShrink: 0 }} />
  );
  const scoreEl = showScore ? (
    <span
      style={{
        fontSize: lerp(36, 24), lineHeight: 1, fontWeight: 700, color: scoreColor,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {score}
    </span>
  ) : null;
  return (
    <div onClick={onClick} className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity min-w-0">
      <div className="flex items-center" style={{ height: ROW_H, gap: lerp(10, 6) }}>
        {isAway ? <>{logoEl}{scoreEl}</> : <>{scoreEl}{logoEl}</>}
      </div>
      <Collapse>
        <div className="flex flex-col items-center" style={{ paddingTop: 4 }}>
          <span className="text-base font-bold whitespace-nowrap" style={heading}>{city}</span>
          {record ? <span className="text-xs text-gray-400">{record}</span> : null}
          {split ? <span className="text-xs text-gray-600">{split}</span> : null}
        </div>
      </Collapse>
    </div>
  );
}

/* Final-only "ATL -4 / ATL Covered" text, same logic the old scoreboard used */
function coveredInfo(game, odds) {
  if (!game.isFinal || !odds || odds.spread === undefined || odds.spread === null) return null;
  const awayScore = parseInt(game.awayScore, 10) || 0;
  const homeScore = parseInt(game.homeScore, 10) || 0;
  const margin = homeScore - awayScore;
  let covered;
  if (odds.spread === 0) {
    covered = margin > 0 ? game.homeTeam : game.awayTeam;
  } else {
    const favCovered = odds.favoriteTeam === game.homeTeam ? margin > odds.spread : -margin > odds.spread;
    covered = favCovered ? odds.favoriteTeam : (odds.favoriteTeam === game.homeTeam ? game.awayTeam : game.homeTeam);
  }
  return { label: odds.spread === 0 ? "Pick'em" : `${odds.favoriteTeam} -${odds.spread}`, covered };
}

export default function GameScoreHeader({
  game,
  teamCities = {},
  records,                 // gameTeamRecords
  openOdds,                // openingOdds[gameKey], for the Final "Covered" text
  oddsSlot,                // the <OddsTable /> element (pregame only), built in App.jsx
  scrollRef,               // gameDetailScrollRef
  swipe,                   // { x, active, handlers } from the existing scoreboard swipe code
  onTeamClick,
  abbreviateChannel,
  formatGameTime,
}) {
  const headerRef = useRef(null);
  const stripRef = useRef(null);
  const sync = useRef(() => {});
  const reduce = useRef(
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ).current;

  const isPre = !!game.isPreGame;
  const isLive = !!game.isLive;
  const kind = isLive ? 'live' : isPre ? 'pre' : 'final';

  /* 1) scroll -> --p (and whether the header is actually pinned, for the notch strip) */
  useEffect(() => {
    const scroller = scrollRef?.current;
    const el = headerRef.current;
    if (!scroller || !el) return undefined;
    scroller.style.overflowAnchor = 'none';        // no scroll-anchoring fights while the header changes height
    let raf = 0;
    let lastP = -1;
    let lastStuck = null;
    const apply = () => {
      raf = 0;
      let p = Math.min(Math.max(scroller.scrollTop / COLLAPSE_PX, 0), 1);
      p = reduce ? (p > 0.4 ? 1 : 0) : Math.round(p * 1000) / 1000;
      // read layout first, then write
      const strip = stripRef.current;
      const inset = strip ? strip.offsetHeight : 0;
      const stuck = el.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + inset + 1;
      if (p !== lastP) { lastP = p; el.style.setProperty('--p', String(p)); }
      if (strip && stuck !== lastStuck) { lastStuck = stuck; strip.style.opacity = stuck ? '1' : '0'; }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    sync.current = apply;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      sync.current = () => {};
    };
  }, [scrollRef, reduce]);

  /* 2) measure the collapsed height once (per game state) so the tab row can pin right under it */
  useEffect(() => {
    const scroller = scrollRef?.current;
    const el = headerRef.current;
    if (!scroller || !el) return;
    const prev = el.style.getPropertyValue('--p');
    el.style.setProperty('--p', '1');              // measure fully collapsed, restored before anything paints
    const h = el.offsetHeight;
    if (prev) el.style.setProperty('--p', prev); else el.style.removeProperty('--p');
    if (h > 0) scroller.style.setProperty('--hdr-h', `${h}px`);
  }, [scrollRef, kind]);

  /* 3) a different game (swipe, past matchup, back): start at the top and re-sync --p */
  const prevId = useRef(game.id);
  useEffect(() => {
    if (prevId.current === game.id) return;
    prevId.current = game.id;
    const scroller = scrollRef?.current;
    if (scroller) scroller.scrollTop = 0;
    sync.current();
  }, [game.id, scrollRef]);

  const away = parseInt(game.awayScore, 10);
  const home = parseInt(game.homeScore, 10);
  const awayColor = away < home ? DIM : '#fff';    // loser dimmed; ties stay white
  const homeColor = home < away ? DIM : '#fff';

  /* center column */
  const codes = [...new Set((game.allBroadcasts || []).map(ch => abbreviateChannel?.(ch)).filter(Boolean))];
  const shown = codes.filter(c => c !== 'NBALP');
  const channels = shown.length > 0 ? shown : codes;

  let centerMain = null;
  let centerExtras = null;
  if (kind === 'live') {
    const clockText = game.clock === '0.0' || game.clock === '0:00'
      ? (game.period === 2 ? 'Half' : `End Q${game.period}`)
      : `Q${game.period} • ${game.clock}`;
    centerMain = (
      <>
        <Collapse>
          <div className="flex items-center gap-1 justify-center" style={{ paddingBottom: 2 }}>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none" />
            <span className="text-red-500 font-bold text-xs tracking-widest uppercase">Live</span>
          </div>
        </Collapse>
        <div className="flex items-center justify-center text-gray-400 whitespace-nowrap" style={{ fontSize: 12, lineHeight: '16px' }}>
          <span
            className="rounded-full bg-red-500 animate-pulse motion-reduce:animate-none flex-shrink-0"
            style={{ height: 5, width: `calc(5px * ${DOT})`, marginRight: `calc(5px * ${DOT})`, opacity: `calc(${DOT})` }}
          />
          {clockText}
        </div>
      </>
    );
    if (channels.length) {
      centerExtras = (
        <div className="flex flex-col items-center mt-1">
          {channels.map(code => <div key={code} className="text-xs text-gray-500">{code}</div>)}
        </div>
      );
    }
  } else if (kind === 'pre') {
    centerMain = <div className="text-gray-300 text-sm font-semibold whitespace-nowrap">{formatGameTime ? formatGameTime(game.gameTime) : ''}</div>;
    if (channels.length) centerExtras = <div className="text-xs text-gray-500 mt-0.5 text-center">{channels.join(' • ')}</div>;
  } else {
    centerMain = <div className="text-gray-400 text-xs font-bold tracking-widest uppercase">Final</div>;
    const cov = coveredInfo(game, openOdds);
    if (cov) {
      centerExtras = (
        <div className="mt-2 text-center">
          <div className="text-xs text-orange-400 whitespace-nowrap">{cov.label}</div>
          <div className="text-xs text-orange-400 font-semibold whitespace-nowrap">{cov.covered} Covered</div>
        </div>
      );
    }
  }

  const handlers = swipe?.handlers || {};
  return (
    <div
      ref={headerRef}
      className="-mx-4"
      style={{
        position: 'sticky',
        top: 'env(safe-area-inset-top)',
        zIndex: 40,
        background: '#000',
        borderBottom: '1px solid rgba(39, 39, 42, var(--p, 0))',
        marginBottom: 8,
      }}
    >
      {/* opaque black behind the notch / status bar, only while the header is pinned */}
      <div
        ref={stripRef}
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, right: 0, bottom: '100%', height: 'env(safe-area-inset-top)',
          background: '#000', opacity: 0, pointerEvents: 'none',
        }}
      />
      <div style={{ overflow: 'hidden' }}>
        {/* the swipe-between-games gesture lives on this inner wrapper, never on the sticky element */}
        <div
          {...handlers}
          className="select-none cursor-grab active:cursor-grabbing"
          style={{
            transform: `translateX(${swipe?.x || 0}px)`,
            transition: swipe?.active || reduce ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            touchAction: 'pan-y',
            userSelect: 'none',
            padding: `${lerp(14, 6)} ${lerp(24, 12)} 6px`,
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: '1fr auto 1fr', alignItems: 'start' }}>
            <Team
              side="away" abbr={game.awayTeam} logo={game.awayLogo}
              city={teamCities[game.awayTeam] || game.awayTeam}
              record={game.awayRecord}
              split={records?.[game.awayTeam]?.away ? `${records[game.awayTeam].away} away` : ''}
              score={game.awayScore} scoreColor={awayColor} showScore={!isPre}
              onClick={() => onTeamClick && onTeamClick(game.awayTeam, game.awayLogo)}
            />

            <div className="flex flex-col items-center" style={{ minWidth: 90, padding: '0 8px' }}>
              <div className="flex flex-col items-center justify-center" style={{ height: ROW_H }}>
                {centerMain}
              </div>
              {centerExtras ? <Collapse>{centerExtras}</Collapse> : null}
            </div>

            <Team
              side="home" abbr={game.homeTeam} logo={game.homeLogo}
              city={teamCities[game.homeTeam] || game.homeTeam}
              record={game.homeRecord}
              split={records?.[game.homeTeam]?.home ? `${records[game.homeTeam].home} home` : ''}
              score={game.homeScore} scoreColor={homeColor} showScore={!isPre}
              onClick={() => onTeamClick && onTeamClick(game.homeTeam, game.homeLogo)}
            />
          </div>

          {oddsSlot ? <Collapse>{oddsSlot}</Collapse> : null}
        </div>
      </div>
    </div>
  );
}