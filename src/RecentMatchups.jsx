import React, { useEffect, useState } from 'react';

/* Recent head-to-head games for the pregame Game tab.
   Left = the upcoming game's away team, right = its home team, in every row.
   The marker between them is "@" when the left team was also the visitor that day, "vs" when it hosted. */

const TTL = 30 * 60 * 1000;
const cache = new Map();      // key -> { at, data }
const inflight = new Map();   // key -> Promise (so rapid re-renders share one fetch)

const scheduleUrl = (teamId, season, type) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${season}&seasontype=${type}`;
const logo = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;
const scoreOf = c => Number(c?.score?.value ?? c?.score?.displayValue ?? c?.score) || 0;

// ESPN's season year is the year the season ends (2026-27 -> 2027); a new season starts in October.
const seasonYear = (d = new Date()) => (d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear());

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

/** One team's schedule response -> completed games against the other team. */
function parseGames(json, awayId, homeId, isPlayoff) {
  const out = [];
  (json?.events || []).forEach(ev => {
    const comp = ev?.competitions?.[0];
    if (!comp?.status?.type?.completed) return;
    const cs = comp.competitors || [];
    const left = cs.find(c => String(c.team?.id) === String(awayId));
    const right = cs.find(c => String(c.team?.id) === String(homeId));
    const venueAway = cs.find(c => c.homeAway === 'away');
    const venueHome = cs.find(c => c.homeAway === 'home');
    if (!left || !right || !venueAway || !venueHome) return;
    const awayAbbr = venueAway.team.abbreviation;
    const homeAbbr = venueHome.team.abbreviation;
    out.push({
      id: String(ev.id),
      date: ev.date,
      isPlayoff,
      leftScore: scoreOf(left),
      rightScore: scoreOf(right),
      leftHome: left.homeAway === 'home',
      // shaped like the game objects App.jsx already opens for completed games
      game: {
        id: String(ev.id),
        awayTeam: awayAbbr,
        homeTeam: homeAbbr,
        awayLogo: logo(awayAbbr),
        homeLogo: logo(homeAbbr),
        awayScore: String(scoreOf(venueAway)),
        homeScore: String(scoreOf(venueHome)),
        period: comp.status?.period || 4,
        gameTime: ev.date,
      },
    });
  });
  return out;
}

/** Every scheduled regular-season meeting (played or not), so we can say "First of N". */
function countMeetings(json, awayId, homeId) {
    return (json?.events || []).filter(ev => {
      const cs = ev?.competitions?.[0]?.competitors || [];
      return cs.some(c => String(c.team?.id) === String(awayId)) && cs.some(c => String(c.team?.id) === String(homeId));
    }).length;
  }

const merge = (...lists) => {
  const seen = new Set();
  return lists.flat()
    .filter(g => !seen.has(g.id) && seen.add(g.id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));   // newest first
};

function loadMatchups(awayId, homeId, year) {
  const key = `${awayId}-${homeId}-${year}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    // Regular season (2) and playoffs (3), this season and last. One team's schedule holds every meeting.
    const jobs = [[year, 2], [year, 3], [year - 1, 2], [year - 1, 3]].map(([y, t]) =>
        getJson(scheduleUrl(awayId, y, t)).then(
            json => ({ ok: true, json }),
            e => { console.warn('[RecentMatchups]', y, t, e?.message || e); return { ok: false }; }
          )
    );
    const [thisReg, thisPo, lastReg, lastPo] = await Promise.all(jobs);
    // A missing regular season is a real failure. A missing playoff schedule just means no playoff games.
    if (!thisReg.ok || !lastReg.ok) throw new Error('Schedule unavailable');
    const games = (r, playoff) => (r.ok ? parseGames(r.json, awayId, homeId, playoff) : []);
    const data = {
        thisSeason: merge(games(thisReg, false), games(thisPo, true)),
        lastSeason: merge(games(lastReg, false), games(lastPo, true)),
        thisTotal: countMeetings(thisReg.json, awayId, homeId),
      };
    cache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

const fmtDate = iso =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).replace(/, (\d\d)$/, " '$1");

function Side({ abbr, score, won, reverse }) {
  return (
    <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${reverse ? 'flex-row-reverse' : ''}`}>
      <img src={logo(abbr)} alt={abbr} className={`w-6 h-6 flex-shrink-0 ${won ? '' : 'opacity-50'}`} />
      <span className={`text-sm ${won ? 'font-bold text-white' : 'font-semibold text-gray-500'}`}>{abbr}</span>
      <span className={`text-base tabular-nums ${reverse ? 'mr-auto' : 'ml-auto'} ${won ? 'font-bold text-white' : 'font-normal text-gray-500'}`}>
        {score}
      </span>
    </div>
  );
}

function Row({ g, leftAbbr, rightAbbr, onClick }) {
  const leftWon = g.leftScore > g.rightScore;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[44px] flex items-center gap-2 py-2 border-b border-zinc-800 last:border-0 active:bg-zinc-900 transition-colors text-left"
    >
      <div className="w-14 flex-shrink-0 leading-tight">
        <div className="text-[11px] text-gray-400">{fmtDate(g.date)}</div>
        {g.isPlayoff && <div className="text-[9px] text-gray-500 uppercase tracking-wide">Playoffs</div>}
      </div>
      <Side abbr={leftAbbr} score={g.leftScore} won={leftWon} />
      <span className="w-6 text-center text-[10px] font-semibold text-gray-500 flex-shrink-0">{g.leftHome ? 'vs' : '@'}</span>
      <Side abbr={rightAbbr} score={g.rightScore} won={!leftWon} reverse />
    </button>
  );
}

function Section({ title, games, empty, leftAbbr, rightAbbr, onGameClick, first }) {
  return (
    <div className={first ? '' : 'mt-4'}>
      <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">{title}</div>
      {games.length === 0 ? (
        <div className="text-gray-500 text-xs py-2">{empty}</div>
      ) : (
        <div>
          {games.map(g => (
            <Row key={g.id} g={g} leftAbbr={leftAbbr} rightAbbr={rightAbbr} onClick={() => onGameClick(g.game)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecentMatchups({ awayAbbr, homeAbbr, awayId, homeId, onGameClick }) {
  const year = seasonYear();
  const [state, setState] = useState(() => {
    const hit = cache.get(`${awayId}-${homeId}-${year}`);
    return hit && Date.now() - hit.at < TTL ? { status: 'ready', data: hit.data } : { status: 'loading', data: null };
  });

  useEffect(() => {
    if (!awayId || !homeId) {
        console.warn('[RecentMatchups] missing ESPN team id for', awayAbbr, homeAbbr, awayId, homeId);
        setState({ status: 'error', data: null });
        return undefined;
      }
    let dead = false;
    loadMatchups(awayId, homeId, year)
      .then(data => { if (!dead) setState({ status: 'ready', data }); })
        .catch(e => { console.error('[RecentMatchups] failed', e); if (!dead) setState({ status: 'error', data: null }); });
    return () => { dead = true; };
  }, [awayId, homeId, year]);

  if (state.status === 'error') {
    return <div className="bg-black rounded-2xl p-3 text-xs text-gray-500">Recent Matchups unavailable (check console)</div>;
  }

  return (
    <div className="bg-black rounded-2xl p-3">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
        Recent Matchups
      </h4>
      {state.status === 'loading' ? (
        <div className="space-y-2">
          <div className="skeleton h-3 w-1/4" />
          <div className="skeleton h-11 rounded-xl" />
          <div className="skeleton h-11 rounded-xl" />
        </div>
      ) : (
        <>
          <Section
            first title="This Season" games={state.data.thisSeason}
            empty={
              state.data.thisTotal > 1 ? `First of ${state.data.thisTotal} matchups this season`
              : state.data.thisTotal === 1 ? 'Only scheduled matchup this season'
              : 'No games played yet this season'
            }
            leftAbbr={awayAbbr} rightAbbr={homeAbbr} onGameClick={onGameClick}
          />
          <Section
            title="Last Season" games={state.data.lastSeason} empty="No games played last season"
            leftAbbr={awayAbbr} rightAbbr={homeAbbr} onGameClick={onGameClick}
          />
        </>
      )}
    </div>
  );
}