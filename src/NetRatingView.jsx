import React, { useMemo, useState, lazy, Suspense } from 'react';
import { useNetRating } from './netRatingdata';
import { buildRows } from './netRatingengine';
const NetRatingChart = lazy(() => import('./NetRatingChart'));

/* ============================================================================
   Net Rating + Four Factors views for the standings page.
   Same look as the standings table: black rows, sticky # / Team columns,
   blue accents, blue pill toggles.
============================================================================ */

const SWITCH_FRACTION = 0.6;   // show play-by-play numbers once this share of the season's games is processed
const SMALL_SAMPLE_GP = 10;
const logoUrl = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

/* ── formatting ─────────────────────────────────────────────────────────── */
const fmt1 = v => v.toFixed(1);
const fmtSigned = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
const fmtPct3 = v => (v >= 1 ? '1.000' : v.toFixed(3).replace(/^0/, ''));
const fmtFactor = v => (v * 100).toFixed(1);
const tone = v => (v > 0 ? 'text-green-500' : v < 0 ? 'text-red-500' : '');
const rankColor = r => (r <= 10 ? '#22c55e' : r > 20 ? '#f87171' : '#6b7280');   // same bands as the team stats page

/* ── columns ────────────────────────────────────────────────────────────── */
// get: the number to show and sort by · rk: which league rank to show beside it · tone: color by sign
const NET_COLS = [
  { id: 'net', label: 'Net Rtg', get: r => r.net, fmt: fmtSigned, rk: 'net', tone: true, dir: 'desc' },
  { id: 'ortg', label: 'ORtg', get: r => r.ortg, fmt: fmt1, rk: 'ortg', dir: 'desc' },
  { id: 'drtg', label: 'DRtg', get: r => r.drtg, fmt: fmt1, rk: 'drtg', dir: 'asc' },   // lower is better
  { id: 'win', label: 'Win%', get: r => r.winPct, fmt: fmtPct3, rk: 'win', dir: 'desc' },
  { id: 'xwin', label: 'xWin%', get: r => r.xWin, fmt: fmtPct3, rk: 'xwin', dir: 'desc' },
  { id: 'gap', label: 'W vs xW', get: r => r.gap, fmt: fmtSigned, tone: true, dir: 'desc' },
];
const factorCols = side => {
  const off = side === 'off';
  return [
    { id: 'efg', label: 'eFG%', get: r => r[side]?.efg, fmt: fmtFactor, rk: `${side}_efg`, dir: off ? 'desc' : 'asc' },
    { id: 'tov', label: 'TOV%', get: r => r[side]?.tov, fmt: fmtFactor, rk: `${side}_tov`, dir: off ? 'asc' : 'desc' },
    { id: 'orb', label: 'ORB%', get: r => r[side]?.orb, fmt: fmtFactor, rk: `${side}_orb`, dir: off ? 'desc' : 'asc' },
    { id: 'ftr', label: 'FT Rate', get: r => r[side]?.ftr, fmt: fmtFactor, rk: `${side}_ftr`, dir: off ? 'desc' : 'asc' },
  ];
};

function sortRows(rows, cols, sort) {
  const col = cols.find(c => c.id === sort.key);
  const get = sort.key === 'team' ? r => r.abbr : col?.get;
  if (!get) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const xn = x === null || x === undefined || Number.isNaN(x);
    const yn = y === null || y === undefined || Number.isNaN(y);
    if (xn && yn) return 0;
    if (xn) return 1;
    if (yn) return -1;
    return typeof x === 'string' ? dir * x.localeCompare(y) : dir * (x - y);
  });
}

/* ── small pieces ───────────────────────────────────────────────────────── */

function Pills({ options, value, onChange }) {
  return (
    <div className="flex bg-zinc-900 rounded-full p-0.5 gap-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
            value === id ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'text-gray-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
        active ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

/** The table. Presentational: rows and columns in, taps out. */
export function RatingTable({ rows, cols, sort, onSort, onTeamClick, showEstimate, rankByNet }) {
  return (
    <div className="bg-black rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
        <thead className="bg-black sticky top-0 [&_th]:py-2">
            <tr className="text-gray-400">
            <th className="text-right py-3 pl-2 pr-1 w-[34px] min-w-[34px] sticky left-0 bg-black z-10">#</th>
              <th
                className="text-left py-3 pl-1 pr-3 sticky left-[34px] bg-black z-10 cursor-pointer select-none"
                onClick={() => onSort('team', 'asc')}
              >
                Team{sort.key === 'team' && <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </th>
              {cols.map(c => (
                <th
                  key={c.id}
                  className="text-center py-3 px-3 whitespace-nowrap cursor-pointer select-none"
                  onClick={() => onSort(c.id, c.dir)}
                >
                  {c.label}
                  {c.id === 'net' && showEstimate && <span className="text-blue-500 text-[9px] ml-1">EST</span>}
                  {sort.key === c.id && <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.abbr}
                onClick={() => onTeamClick(r.abbr, logoUrl(r.abbr))}
                className="border-t border-zinc-800 hover:bg-black cursor-pointer transition-colors"
              >
                               <td className="py-3 pl-2 pr-1 w-[34px] min-w-[34px] text-right sticky left-0 bg-black font-semibold text-blue-500">{rankByNet ? (r.rk?.net ?? idx + 1) : idx + 1}</td>
                               <td className="py-3 pl-1 pr-3 sticky left-[34px] bg-black">
                  <div className="flex items-center gap-2">
                    <img src={logoUrl(r.abbr)} alt={r.abbr} className="w-6 h-6" />
                    <span className="font-semibold">{r.abbr}</span>
                  </div>
                </td>
                {cols.map(c => {
                  const v = c.get(r);
                  const has = v !== null && v !== undefined && !Number.isNaN(v);
                  const rank = c.rk ? r.rk?.[c.rk] : null;
                  return (
                    <td key={c.id} className="text-center py-3 px-3 whitespace-nowrap">
                      <span className={`font-semibold ${has && c.tone ? tone(v) : ''}`}>{has ? c.fmt(v) : '—'}</span>
                      {has && rank ? (
                        <span className="text-[10px] ml-1" style={{ color: rankColor(rank), fontWeight: rank <= 10 || rank > 20 ? 700 : 500 }}>{rank}</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── the page body ──────────────────────────────────────────────────────── */

export default function NetRatingView({ view, espnTeamIds, onTeamClick, onHaptic }) {
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const { games, quick, progress, error } = useNetRating(espnTeamIds);

  const [filterGarbage, setFilterGarbage] = useState(true);
  const [side, setSide] = useState('off');
  const [netSort, setNetSort] = useState({ key: 'net', dir: 'desc' });
  const [ffSort, setFfSort] = useState({ key: 'efg', dir: 'desc' });
  const [showChart, setShowChart] = useState(false);

  const gameList = useMemo(() => Object.values(games), [games]);
  const enough = gameList.length > 0
    && (!progress || progress.total === 0 || progress.done >= progress.total || gameList.length / progress.total >= SWITCH_FRACTION);
  const engineRows = useMemo(() => (enough ? buildRows(gameList, filterGarbage) : []), [enough, gameList, filterGarbage]);

  const isNet = view === 'net';
  const usingEstimate = isNet && !enough && !!quick;
  const baseRows = isNet ? (enough ? engineRows : quick || []) : engineRows;
  const cols = isNet ? NET_COLS : factorCols(side);
  const sort = isNet ? netSort : ffSort;
  const setSort = isNet ? setNetSort : setFfSort;
  const rows = useMemo(() => sortRows(baseRows, cols, sort), [baseRows, cols, sort]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onSort = (key, defaultDir) => {
    haptic('selection');
    setSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: defaultDir || 'desc' }));
  };
  const changeSide = id => {
    haptic('selection');
    setSide(id);
    setFfSort({ key: 'efg', dir: id === 'off' ? 'desc' : 'asc' });
  };

  const processing = progress && progress.done < progress.total;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div>
      {/* controls */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide">
        <Chip
          active={filterGarbage && enough}
          disabled={!enough}
          onClick={() => { haptic('selection'); setFilterGarbage(v => !v); }}
        >
          Filter garbage time
        </Chip>
        {!isNet && <Pills options={[['off', 'Offense'], ['def', 'Defense']]} value={side} onChange={changeSide} />}
        {isNet && (
          <button
            onClick={() => { haptic('light'); setShowChart(v => !v); }}
            className="flex-shrink-0 ml-auto px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow-[0_0_12px_rgba(37,99,235,0.7)]"
          >
            {showChart ? 'Table' : 'Chart'}
          </button>
        )}
      </div>

      {/* progress, in the same quiet style as the rest of the page */}
      {processing && (
        <div className="mb-3">
          <div className="text-xs text-gray-500">
            {enough ? 'Refining with' : 'Processing'} play-by-play · {progress.done} of {progress.total} games
          </div>
          <div className="h-1 rounded-full bg-zinc-900 mt-1.5 overflow-hidden">
            <div style={{ width: `${pct}%`, background: '#2563eb', height: '100%', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}
      {usingEstimate && (
        <div className="text-xs text-gray-500 mb-3">Estimate from season box-score stats. Play-by-play numbers replace it as games finish processing.</div>
      )}

      {/* body */}
      {rows.length === 0 ? (
        error && !processing ? (
          <div className="text-center py-12 text-gray-400">Couldn't load ratings right now.</div>
        ) : (
          <div>
            {Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton rounded-xl h-12 mb-2" />)}
            {!isNet && <div className="text-center text-xs text-gray-500 mt-3">Four Factors needs play-by-play data, so it appears once enough games are processed.</div>}
          </div>
        )
      ) : isNet && showChart ? (
        <Suspense fallback={<div className="skeleton rounded-2xl" style={{ height: 240 }} />}>
          <NetRatingChart rows={baseRows} filterGarbage={filterGarbage && enough} onHaptic={haptic} />
        </Suspense>
      ) : (
        <RatingTable
          rows={rows}
          cols={cols}
          sort={sort}
          onSort={onSort}
          onTeamClick={onTeamClick}
          showEstimate={usingEstimate}
          rankByNet={isNet}
        />
      )}

      {/* footnotes */}
      {rows.length > 0 && (
        <div className="mt-3 text-xs text-gray-500 space-y-1">
                 {enough && <div>{filterGarbage ? 'Excludes garbage time' : 'Includes garbage time'}</div>}
                 {rows.some(r => r.gp < SMALL_SAMPLE_GP) && <div>Some teams have played fewer than {SMALL_SAMPLE_GP} games, so early numbers swing a lot.</div>}
          {isNet && <div>xWin% is Pythagorean (exponent 14). Small gray numbers are league ranks.</div>}
          {!isNet && <div>{side === 'off' ? 'Offense' : 'Defense (what opponents did against them)'}. Small gray numbers are league ranks.</div>}
          {error && <div>Couldn't refresh everything. Showing saved data.</div>}
        </div>
      )}
    </div>
  );
}