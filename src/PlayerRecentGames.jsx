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

// label -> possible ESPN gamelog names (first match wins)
const COLS = [
    ['MIN', ['minutes', 'min']],
    ['PTS', ['points', 'pts']],
    ['REB', ['totalRebounds', 'rebounds', 'reb']],
    ['AST', ['assists', 'ast']],
    ['STL', ['steals', 'stl']],
    ['BLK', ['blocks', 'blk']],
    ['TO', ['turnovers', 'to']],
    ['FG', ['fieldGoalsMade-fieldGoalsAttempted', 'fg']],
    ['FG%', ['fieldGoalPct', 'fg%']],
    ['3PT', ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3pt']],
    ['3P%', ['threePointFieldGoalPct', 'threePointPct', '3p%']],
    ['FT', ['freeThrowsMade-freeThrowsAttempted', 'ft']],
    ['FT%', ['freeThrowPct', 'ft%']],
    ['PF', ['fouls', 'personalFouls', 'pf']],
    ['+/-', ['plusMinus', '+/-']],
  ];
  const colW = (l) => (/^(FG|3PT|FT)$/.test(l) ? 50 : 42);
  
  function parseGamelog(json) {
  const names = json?.names || json?.labels || [];
  const idx = (...needles) =>
    names.findIndex((n) => needles.some((x) => String(n).toLowerCase() === x.toLowerCase()));
  const iMin = idx('minutes', 'min');
  const iPts = idx('points', 'pts');
  const iReb = idx('totalRebounds', 'rebounds', 'reb');
  const iAst = idx('assists', 'ast');
  const iTpm = idx('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT', 'threePointFieldGoalsMade');
  const colIdx = COLS.map(([label, keys]) => [label, idx(...keys)]);
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
          box: Object.fromEntries(
            colIdx.map(([label, i]) => [label, i >= 0 && s[i] != null && s[i] !== '' ? String(s[i]) : null])
          ),
        });
      }
    }
  }
  return rows;
}

const avg = (rows, k) =>
  rows.length ? (rows.reduce((a, g) => a + (g[k] || 0), 0) / rows.length).toFixed(1) : '–';

const summaryUrl = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const pmCache = new Map(); // eventId -> Promise<{ athleteId: '+/-' string }>
function fetchPlusMinus(eventId) {
  if (!pmCache.has(eventId)) {
    pmCache.set(
      eventId,
      fetch(summaryUrl(eventId))
        .then((r) => r.json())
        .then((j) => {
          const out = {};
          for (const team of j?.boxscore?.players || []) {
            const st = team?.statistics?.[0];
            const i = (st?.labels || []).indexOf('+/-');
            if (i < 0) continue;
            for (const a of st?.athletes || []) {
              const v = a?.stats?.[i];
              if (a?.athlete?.id != null && v != null && v !== '') out[String(a.athlete.id)] = String(v);
            }
          }
          return out;
        })
        .catch(() => {
          pmCache.delete(eventId);
          return {};
        })
    );
  }
  return pmCache.get(eventId);
}

export default function PlayerRecentGames({ playerId, color = '#3B82F6' }) {
  const { trigger } = useWebHaptics();
  const [games, setGames] = useState(null); // null = loading
  const [n, setN] = useState(5);
  const [pm, setPm] = useState({}); // eventId -> '+12'

  useEffect(() => {
    if (!games) return undefined;
    let dead = false;
    games
      .slice(0, n)
      .filter((g) => g.box?.['+/-'] == null)
      .forEach((g) => {
        fetchPlusMinus(g.id).then((m) => {
          const v = m[String(playerId)];
          if (!dead && v != null) setPm((p) => ({ ...p, [g.id]: v }));
        });
      });
    return () => {
      dead = true;
    };
  }, [games, n, playerId]);

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
  const boxCols = COLS.map(([l]) => l).filter((l) => l === '+/-' || shown.some((g) => g.box?.[l] != null));

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

                  {/* game rows: full box score, scrolls sideways, date + opponent stay pinned */}
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="w-max min-w-full">
              <div className="flex text-[10px] text-gray-500 mb-1">
                <div className="sticky left-0 z-10 bg-black flex-shrink-0 flex" style={{ width: 128 }}>
                  <span style={{ width: 44 }}>DATE</span>
                  <span>OPP</span>
                </div>
                {boxCols.map((l) => (
                  <span key={l} className="flex-shrink-0 text-center" style={{ width: colW(l) }}>
                    {l}
                  </span>
                ))}
              </div>
              {shown.map((g) => (
                <div key={g.id} className="flex items-center border-t border-zinc-800 text-xs py-1.5">
                  <div className="sticky left-0 z-10 bg-black flex-shrink-0 flex items-center" style={{ width: 128 }}>
                    <span className="text-gray-400" style={{ width: 44 }}>
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
                  </div>
                                   {boxCols.map((l) => {
                    if (l === '+/-') {
                      const raw = g.box?.['+/-'] ?? pm[g.id];
                      const v = raw == null ? null : parseFloat(raw);
                      const txt = v == null || Number.isNaN(v) ? '–' : v > 0 ? `+${v}` : String(v);
                      const cls = v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-400';
                      return (
                        <span key={l} className={`flex-shrink-0 text-center font-semibold ${cls}`} style={{ width: colW(l) }}>
                          {txt}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={l}
                        className={`flex-shrink-0 text-center ${l === 'PTS' ? 'font-bold' : l === 'MIN' ? 'text-gray-400' : ''}`}
                        style={{ width: colW(l) }}
                      >
                        {g.box?.[l] ?? '–'}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}