import React, { useEffect, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';

const gamelogUrl = (id, season) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog${
    season ? `?season=${season}` : ''
  }`;

// ESPN names a season by the year it ends; before September the "prior" season is the one ending this year
const priorSeason = () => {
  const d = new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
};

function parseGamelog(json) {
  const names = json?.names || json?.labels || [];
  const idx = (...needles) =>
    names.findIndex((n) => needles.some((x) => String(n).toLowerCase() === x.toLowerCase()));
  const iMin = idx('minutes', 'min');
  const iPts = idx('points', 'pts');
  const iReb = idx('totalRebounds', 'rebounds', 'reb');
  const iAst = idx('assists', 'ast');
  const iTpm = idx('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT', 'threePointFieldGoalsMade');
  const meta = json?.events || {};
  const rows = [];
  for (const st of json?.seasonTypes || []) {
    if (/preseason/i.test(st?.displayName || '')) continue;
    for (const cat of st?.categories || []) {
      for (const ev of cat?.events || []) {
        const s = ev.stats || [];
        const m = meta[ev.eventId] || {};
        const mins = iMin >= 0 ? Number(s[iMin]) : 1;
        if (iMin >= 0 && !mins) continue; // DNP
        const num = (i) => (i >= 0 ? Number(String(s[i]).split('-')[0]) || 0 : 0);
        rows.push({
          id: ev.eventId,
          date: m.gameDate || '',
          opp: m.opponent?.abbreviation || '',
          home: m.atVs ? m.atVs !== '@' : true,
          result: m.gameResult || '',
          score: m.score || '',
          min: iMin >= 0 ? Math.round(mins) : null,
          pts: num(iPts),
          reb: num(iReb),
          ast: num(iAst),
          tpm: num(iTpm),
        });
      }
    }
  }
  return rows;
}

const avg = (rows, k) =>
  rows.length ? (rows.reduce((a, g) => a + (g[k] || 0), 0) / rows.length).toFixed(1) : '–';

export default function PlayerRecentGames({ playerId, color = '#3B82F6' }) {
  const { trigger } = useWebHaptics();
  const [games, setGames] = useState(null); // null = loading
  const [n, setN] = useState(5);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        let rows = [];
        const cur = await fetch(gamelogUrl(playerId)).then((r) => r.json());
        rows = parseGamelog(cur);
        if (rows.length < 10) {
          try {
            const prev = await fetch(gamelogUrl(playerId, priorSeason())).then((r) => r.json());
            rows = rows.concat(parseGamelog(prev));
          } catch (e) {}
        }
        const seen = new Set();
        rows = rows
          .filter((g) => (seen.has(g.id) ? false : seen.add(g.id)))
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 10);
        if (!dead) setGames(rows);
      } catch (e) {
        if (!dead) setGames([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [playerId]);

  const shown = (games || []).slice(0, n);
  const cols = 'grid-cols-[1.3fr_2fr_1fr_1fr_1fr_1fr_1fr]';

  return (
    <div className="bg-black rounded-2xl p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <h5
          className="text-xs font-semibold text-gray-400 uppercase tracking-widest"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          Recent Performances
        </h5>
        <div className="flex bg-zinc-800 rounded-full p-0.5 gap-0.5">
          {[5, 10].map((v) => (
            <button
              key={v}
              disabled={games && games.length <= 5 && v === 10}
              onClick={() => {
                trigger('selection');
                setN(v);
              }}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all disabled:opacity-30 ${
                n === v ? 'bg-blue-600 text-white' : 'text-gray-400'
              }`}
            >
              L{v}
            </button>
          ))}
        </div>
      </div>

      {games === null ? (
        <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-sm">
          <div className="w-3 h-3 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          Loading games…
        </div>
      ) : games.length === 0 ? (
        <div className="text-xs text-gray-500 text-center py-4">No recent games found</div>
      ) : (
        <>
          {/* averages */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            {[
              ['PTS', 'pts'],
              ['REB', 'reb'],
              ['AST', 'ast'],
              ['3PM', 'tpm'],
              ['MIN', 'min'],
            ].map(([label, k]) => (
              <div
                key={k}
                className="rounded-xl p-2 flex flex-col items-center"
                style={{ background: `${color}22`, border: `1px solid ${color}33` }}
              >
                <span className="text-base font-bold">{avg(shown, k)}</span>
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>

          {/* game rows */}
          <div className={`grid ${cols} gap-1 text-[10px] text-gray-500 mb-1`}>
            <span>DATE</span>
            <span>OPP</span>
            <span className="text-center">MIN</span>
            <span className="text-center">PTS</span>
            <span className="text-center">REB</span>
            <span className="text-center">AST</span>
            <span className="text-center">3PM</span>
          </div>
          {shown.map((g) => (
            <div key={g.id} className={`grid ${cols} gap-1 py-1.5 border-t border-zinc-800 text-xs items-center`}>
              <span className="text-gray-400">
                {g.date ? `${g.date.slice(5, 7)}/${g.date.slice(8, 10)}` : '–'}
              </span>
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-gray-400">{g.home ? 'vs' : '@'}</span>
                <span className="font-semibold">{g.opp}</span>
                {g.result && (
                  <span className={`font-bold ${g.result === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                    {g.result}
                  </span>
                )}
              </span>
              <span className="text-center text-gray-400">{g.min ?? '–'}</span>
              <span className="text-center font-bold">{g.pts}</span>
              <span className="text-center">{g.reb}</span>
              <span className="text-center">{g.ast}</span>
              <span className="text-center">{g.tpm}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}