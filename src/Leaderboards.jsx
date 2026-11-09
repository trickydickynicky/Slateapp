import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACCENT, MUTED, teamFullNames, logoUrl } from './slateShared';
import { PLAYER_STATS, TEAM_STATS, getStat } from './statConfig';
import { fetchLeagueRows, peekLeagueRows, rankPlayers } from './leagueRanks';
import { buildTeamCells } from './TeamStatsPage';
import { Headshot } from './PlayerStatsPage';

const ROW_H = 56;
const caret = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%232563eb' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`;
const card = { background: '#0a0a0a', border: '1px solid #171717', color: MUTED, fontSize: 13, fontWeight: 600 };

/* Team values: per-team stats loaded lazily and cached. Order never depends on these. */
const teamStatsCache = new Map();
function useTeamStats(abbrs, loadTeamStats, enabled) {
  const [, bump] = useState(0);
  const key = abbrs.join(',');
  useEffect(() => {
    if (!enabled || !loadTeamStats) return undefined;
    let dead = false;
    const todo = abbrs.filter(a => !teamStatsCache.has(a));
    let i = 0;
    const worker = async () => {
      while (i < todo.length && !dead) {
        const a = todo[i++];
        try { teamStatsCache.set(a, await loadTeamStats(a)); } catch (e) { teamStatsCache.set(a, null); }
        if (!dead) bump(n => n + 1);
      }
    };
    Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [key, enabled]);
}
const teamValue = (abbr, label) => {
  const st = teamStatsCache.get(abbr);
  if (!st) return null;
  const c = buildTeamCells(st, null);
  return [...c.offense, ...c.defense].find(x => x.l === label)?.v ?? null;
};

function usePlayerRows(season, enabled, tick) {
  const [state, setState] = useState(() => {
    const hit = peekLeagueRows(season);
    return hit ? { status: 'ready', rows: hit } : { status: 'loading', rows: null };
  });
  useEffect(() => {
    if (!enabled || season == null) return undefined;
    const hit = peekLeagueRows(season);
    if (hit) { setState({ status: 'ready', rows: hit }); return undefined; }
    setState({ status: 'loading', rows: null });
    const controller = new AbortController();
    fetchLeagueRows(season, controller.signal)
      .then(rows => setState({ status: 'ready', rows }))
      .catch(e => { if (e?.name !== 'AbortError') setState({ status: 'error', rows: null }); });
    return () => controller.abort();
  }, [season, enabled, tick]);
  return state;
}

function Pick({ value, onChange, label, disabled, children, width }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
      className="bg-transparent outline-none appearance-none cursor-pointer flex-shrink-0"
      style={{
        color: ACCENT, fontSize: 15, fontWeight: 700, minHeight: 28, paddingRight: 16, opacity: disabled ? 0.5 : 1, width,
        backgroundImage: caret, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center',
      }}
    >
      {children}
    </select>
  );
}

function ScopeToggle({ scope, onChange }) {
    return (
      <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5 flex-shrink-0">
        {[['players', 'Players'], ['teams', 'Teams']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${
              scope === id ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

const Row = React.forwardRef(function Row({ item, highlight, onClick }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className="w-full flex items-center hover:bg-zinc-900 transition-colors"
      style={{
        height: ROW_H, gap: 12, padding: '0 8px', borderTop: '1px solid #1f1f1f', textAlign: 'left', border: 'none',
        borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#1f1f1f', cursor: 'pointer',
        background: highlight ? 'rgba(37,99,235,0.14)' : 'transparent',
        contentVisibility: 'auto', containIntrinsicSize: `0 ${ROW_H}px`,
      }}
    >
      <span style={{ width: 26, textAlign: 'center', fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: item.rank <= 3 ? ACCENT : MUTED }}>
        {item.rank}
      </span>
      {item.logo
        ? <img src={item.logo} alt={item.sub || item.name} loading="lazy" className="flex-shrink-0" style={{ width: 38, height: 38 }} />
        : <Headshot src={item.headshot} name={item.name} size={40} />}
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{item.name}</div>
        {item.sub && <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 1 }}>{item.sub}</div>}
      </div>
      {item.value == null
        ? <div className="skeleton rounded-md" style={{ width: 42, height: 20 }} />
        : <span style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{item.value}</span>}
    </button>
  );
});

export default function Leaderboards({
  initial = {}, seasons = [], currentSeason, leagueRankings, loadTeamStats,
  onPlayerClick, onTeamClick, onHaptic,
}) {
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const startScope = initial.scope === 'teams' ? 'teams' : 'players';
  const [scope, setScope] = useState(startScope);
  const [statKey, setStatKey] = useState(initial.statKey || (startScope === 'teams' ? 'ppg' : 'pts'));
  const [season, setSeason] = useState(initial.season ?? currentSeason ?? seasons[0]?.year);
  const [team, setTeam] = useState('');
  const [pos, setPos] = useState('');
  const [tick, setTick] = useState(0);
  const [highlightId] = useState(initial.highlightId != null ? String(initial.highlightId) : null);

  const stat = getStat(scope, statKey) || (scope === 'teams' ? TEAM_STATS : PLAYER_STATS)[0];
  const isTeams = scope === 'teams';

  /* Players */
  const { status, rows } = usePlayerRows(season, !isTeams, tick);
  const ranked = useMemo(() => (!isTeams && rows ? rankPlayers(rows, stat) : []), [isTeams, rows, stat]);
  const teamOpts = useMemo(() => [...new Set((rows || []).map(r => r.team).filter(Boolean))].sort(), [rows]);
  const posOpts = useMemo(() => [...new Set((rows || []).map(r => r.pos).filter(Boolean))].sort(), [rows]);
  const playerItems = useMemo(
    () => ranked
      .filter(r => (!team || r.team === team) && (!pos || r.pos === pos))
      .map(r => ({
        id: r.id, rank: r.rank, name: r.name, sub: r.team, headshot: r.headshot,
        value: r.value.toFixed(stat.decimals), raw: r,
      })),
    [ranked, team, pos, stat]
  );

  /* Teams: order straight from leagueRankings so it equals the rank on the team page */
  const teamAbbrs = useMemo(() => Object.keys(leagueRankings || {}).filter(a => teamFullNames[a]), [leagueRankings]);
  useTeamStats(teamAbbrs, loadTeamStats, isTeams);
  const teamItems = isTeams
    ? teamAbbrs
        .map(a => ({ a, rank: leagueRankings[a]?.[stat.key] }))
        .filter(x => Number.isFinite(x.rank))
        .sort((x, y) => x.rank - y.rank || x.a.localeCompare(y.a))
        .map(x => ({ id: x.a, rank: x.rank, name: teamFullNames[x.a], logo: logoUrl(x.a), sub: null, value: teamValue(x.a, stat.label) }))
    : [];

    const items = isTeams ? teamItems : playerItems;

    /* Render in chunks of 100; more load as you near the bottom */
    const [limit, setLimit] = useState(100);
    useEffect(() => { setLimit(100); }, [scope, statKey, season, team, pos]);
    const hlIdx = highlightId ? items.findIndex(it => it.id === highlightId) : -1;
    const shown = Math.max(limit, hlIdx >= 0 ? hlIdx + 25 : 0);
    const sentinelRef = useRef(null);
    useEffect(() => {
      const el = sentinelRef.current;
      if (!el) return undefined;
      const io = new IntersectionObserver(
        entries => { if (entries[0].isIntersecting) setLimit(l => l + 100); },
        { rootMargin: '600px' }
      );
      io.observe(el);
      return () => io.disconnect();
    }, [items.length, shown]);

  /* Land on the tapped row once */
  const hlRef = useRef(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrolled.current && hlRef.current) {
      scrolled.current = true;
      hlRef.current.scrollIntoView({ block: 'center' });
    }
  });

  const changeScope = next => {
    haptic('selection');
    const other = next === 'teams' ? TEAM_STATS : PLAYER_STATS;
    setStatKey((other.find(s => s.label === stat.label) || other[0]).key);
    setTeam(''); setPos('');
    setScope(next);
  };

  const openRow = item => {
    haptic('light');
    if (isTeams) { onTeamClick && onTeamClick(item.id, item.logo); return; }
    onPlayerClick && onPlayerClick({
      id: item.id, name: item.name, teamAbbr: item.raw.team, teamLogo: logoUrl(item.raw.team),
      headshot: item.raw.headshot, position: item.raw.pos,
    });
  };

  return (
    <div style={{ marginTop: -34, paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
              {/* Controls */}
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top)', zIndex: 5, background: '#000'}}>
      <div className="flex items-center" style={{ paddingLeft: 36, minHeight: 32 }}>
          <ScopeToggle scope={scope} onChange={changeScope} />
        </div>
        <div className="flex items-center" style={{ columnGap: 18, rowGap: 0, flexWrap: 'wrap' }}>
          <Pick label="Season" value={season ?? ''} disabled={isTeams} onChange={e => { haptic('selection'); setSeason(parseInt(e.target.value, 10)); }}>
            {seasons.length === 0 && <option value={season ?? ''} className="bg-zinc-900">Current</option>}
            {seasons.map(s => <option key={s.year} value={s.year} className="bg-zinc-900">{s.displayName}</option>)}
          </Pick>
          <Pick label="Stat" width={`${stat.long.length * 8.5 + 20}px`} value={stat.key} onChange={e => { haptic('selection'); setStatKey(e.target.value); }}>
            {(isTeams ? TEAM_STATS : PLAYER_STATS).map(s => <option key={s.key} value={s.key} className="bg-zinc-900">{s.long}</option>)}
          </Pick>
          {!isTeams && (
            <>
              <Pick label="Team" value={team} onChange={e => { haptic('selection'); setTeam(e.target.value); }}>
                <option value="" className="bg-zinc-900">All teams</option>
                {teamOpts.map(a => <option key={a} value={a} className="bg-zinc-900">{a}</option>)}
              </Pick>
              {posOpts.length > 0 && (
                <Pick label="Position" value={pos} onChange={e => { haptic('selection'); setPos(e.target.value); }}>
                  <option value="" className="bg-zinc-900">All positions</option>
                  {posOpts.map(p => <option key={p} value={p} className="bg-zinc-900">{p}</option>)}
                </Pick>
              )}
            </>
          )}
        </div>
      </div>

      {/* List */}
      {!isTeams && status === 'loading' ? (
        <div style={{ marginTop: 10 }}>
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton rounded-2xl" style={{ height: 48, marginTop: 8 }} />)}
        </div>
      ) : !isTeams && status === 'error' ? (
        <div className="rounded-2xl text-center" style={{ ...card, marginTop: 16, padding: '22px 16px' }}>
          Leaderboards could not load.
          <div>
            <button
              onClick={() => { haptic('light'); setTick(t => t + 1); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 15, fontWeight: 700, minHeight: 44, marginTop: 6 }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl text-center" style={{ ...card, marginTop: 16, padding: '22px 16px' }}>
          {isTeams ? 'Team stats are not available right now.' : 'No players match these filters.'}
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
                 {items.slice(0, shown).map(it => {
            const hl = it.id === highlightId;
            return <Row key={it.id} ref={hl ? hlRef : null} item={it} highlight={hl} onClick={() => openRow(it)} />;
          })}
          {items.length > shown && <div ref={sentinelRef} style={{ height: 1 }} />}
        </div>
      )}
    </div>
  );
}