import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';

const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const scheduleUrl = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${id}/schedule`;
const summaryUrl = (id) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;
const logoUrl = (abbr) => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

const CACHE_KEY = 'cheatSheet_cache';
const EVENTS_KEY = 'cheatSheet_events';
const STATS = [
  { key: 'pts', label: 'Pts' },
  { key: 'reb', label: 'Reb' },
  { key: 'ast', label: 'Ast' },
  { key: 'tpm', label: '3PM' },
];

/* ---------- helpers ---------- */
const getJSON = async (url) => {
  const r = await fetch(url.replace(/^http:/, 'https:'));
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

const localDate = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, user's timezone

const readLS = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
};
const writeLS = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
};

const num = (v) => {
  const n = parseFloat(String(v ?? '').split('-')[0]);
  return Number.isNaN(n) ? null : n;
};

/* ---------- data ---------- */
function parseStandings(json) {
  const entries = (json?.children || []).flatMap((c) => c.standings?.entries || []);
  const seen = new Set();
  const teams = [];
  for (const en of entries) {
    const id = String(en.team?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const get = (name) => {
      const s = (en.stats || []).find((x) => x.name === name);
      const v = parseFloat(s?.value ?? s?.displayValue);
      return Number.isNaN(v) ? null : v;
    };
    const w = get('wins');
    const l = get('losses');
    teams.push({
      id,
      abbr: en.team?.abbreviation || '',
      name: en.team?.displayName || en.team?.name || '',
      gp: w != null && l != null ? w + l : null,
      ptsFor: get('avgPointsFor'),
      ptsAgainst: get('avgPointsAgainst'),
    });
  }
  return teams;
}

async function teamEventIds(teamId) {
  const sched = await getJSON(scheduleUrl(teamId));
  return (sched.events || [])
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .map((e) => String(e.id));
}

function parseSummary(json) {
  const out = [];
  for (const t of json?.boxscore?.teams || []) {
    const st = t.statistics || [];
    const pick = (...names) => {
      const s = st.find((x) => names.some((n) => String(x.name).toLowerCase() === n.toLowerCase()));
      return s ? num(s.displayValue ?? s.value) : null;
    };
    out.push({
      id: String(t.team?.id),
      reb: pick('totalRebounds', 'rebounds'),
      ast: pick('assists'),
      tpm: pick('threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointFieldGoalsMade'),
    });
  }
  // fallback: team totals row from the players boxscore
  for (const p of json?.boxscore?.players || []) {
    const s = p.statistics?.[0];
    const labels = s?.labels || [];
    const totals = s?.totals || [];
    const get = (l) => {
      const i = labels.indexOf(l);
      return i >= 0 ? num(totals[i]) : null;
    };
    const row = out.find((r) => r.id === String(p.team?.id));
    if (row) {
      if (row.reb == null) row.reb = get('REB');
      if (row.ast == null) row.ast = get('AST');
      if (row.tpm == null) row.tpm = get('3PT');
    }
  }
  if (!parseSummary.logged) {
    parseSummary.logged = true;
    console.log('[CheatSheet] first box score stat names', json?.boxscore?.teams?.[0]?.statistics?.map((s) => s.name));
    console.log('[CheatSheet] first box score parsed', out);
  }
  return out.length === 2 && out.every((r) => r.reb != null && r.ast != null && r.tpm != null) ? out : null;
}

async function buildData(onProgress) {
  const teams = parseStandings(await getJSON(STANDINGS));
  if (!teams.length) throw new Error('No standings data');

  const ids = new Set();
  await pool(teams, 5, async (t) => {
    try {
      (await teamEventIds(t.id)).forEach((i) => ids.add(i));
    } catch (e) {}
  });

  const events = readLS(EVENTS_KEY) || {};
  const todo = [...ids].filter((i) => !events[i]);
  let done = 0;
  await pool(todo, 5, async (id) => {
    try {
      const r = parseSummary(await getJSON(summaryUrl(id)));
      if (r) events[id] = r;
    } catch (e) {}
    done++;
    onProgress?.(done, todo.length);
  });
  writeLS(EVENTS_KEY, events);

  const agg = {};
  for (const id of ids) {
    const ev = events[id];
    if (!ev) continue;
    const [a, b] = ev;
    for (const [me, opp] of [[a, b], [b, a]]) {
      const x = (agg[me.id] = agg[me.id] || { n: 0, f: { reb: 0, ast: 0, tpm: 0 }, a: { reb: 0, ast: 0, tpm: 0 } });
      x.n += 1;
      for (const k of ['reb', 'ast', 'tpm']) {
        x.f[k] += me[k];
        x.a[k] += opp[k];
      }
    }
  }

  const out = teams.map((t) => {
    const x = agg[t.id];
    const avg = (v) => (x && x.n ? v / x.n : null);
    return {
      ...t,
      rebFor: avg(x?.f.reb), astFor: avg(x?.f.ast), tpmFor: avg(x?.f.tpm),
      rebAgainst: avg(x?.a.reb), astAgainst: avg(x?.a.ast), tpmAgainst: avg(x?.a.tpm),
    };
  });
  return { date: localDate(), ts: Date.now(), teams: out };
}

/* ---------- colors ---------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const GREEN = hex('#56BA89');
const GRAY = hex('#D8D8D8');
const RED = hex('#E67B73');
const L_RED = hex('#F2BFBF');
const L_GREEN = hex('#B2D8B2');

const rankBg = (rk, total) => {
  if (rk == null || total < 2) return undefined;
  const mid = Math.ceil(total / 2);
  let rgb;
  if (Math.abs(rk - mid) <= 1) rgb = GRAY;
  else if (rk < mid) rgb = mix(GREEN, GRAY, (rk - 1) / (mid - 1));
  else rgb = mix(GRAY, RED, (rk - mid) / (total - mid));
  return `rgba(${rgb.join(',')},0.3)`;
};

const diffBg = (d, maxNeg, maxPos) => {
  if (d == null || d === 0) return undefined;
  if (d < 0) return `rgba(${L_RED.join(',')},${(0.35 * Math.min(1, Math.abs(d) / (maxNeg || 1))).toFixed(2)})`;
  return `rgba(${L_GREEN.join(',')},${(0.35 * Math.min(1, d / (maxPos || 1))).toFixed(2)})`;
};

const f1 = (v) => (v == null ? '-' : v.toFixed(1));
const fDiff = (v) => (v == null ? '-' : `${v > 0.05 ? '+' : ''}${v.toFixed(1)}`);

/* ---------- component ---------- */
export default function CheatSheet({ onClose }) {
  const { trigger } = useWebHaptics();
  const [tab, setTab] = useState('off');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [failed, setFailed] = useState(false);
  const overlayRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  /* load: today's cache -> instant; otherwise fetch */
  useEffect(() => {
    let dead = false;
    const cached = readLS(CACHE_KEY);
    if (cached?.teams && cached.date === localDate()) {
      setData(cached);
      setLoading(false);
      return;
    }
    if (cached?.teams) {
      setData(cached); // show older data while refreshing
      setLoading(false);
    }
    (async () => {
      try {
        const fresh = await buildData((d, t) => !dead && setProgress({ d, t }));
        if (dead) return;
        writeLS(CACHE_KEY, fresh);
        setData(fresh);
        setFailed(false);
      } catch (e) {
        if (!dead) setFailed(true);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  /* swipe from left edge to close */
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    let startX = null;
    let dx = 0;
    const ts = (e) => {
      const x = e.touches[0].clientX;
      startX = x <= 30 ? x : null;
      dx = 0;
      if (startX != null) el.style.transition = 'none';
    };
    const tm = (e) => {
      if (startX == null) return;
      dx = Math.max(0, e.touches[0].clientX - startX);
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.2, 1 - (dx / window.innerWidth) * 0.8));
    };
    const te = () => {
      if (startX == null) return;
      startX = null;
      el.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
      if (dx > window.innerWidth * 0.35) {
        el.style.transform = `translateX(${window.innerWidth}px)`;
        el.style.opacity = '0';
        setTimeout(() => closeRef.current?.(), 200);
      } else {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
      }
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: true });
    el.addEventListener('touchend', te, { passive: true });
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
    };
  }, []);

  /* ranks, vs avg, league avg computed from raw cache on every render of the tab */
  const view = useMemo(() => {
    if (!data) return null;
    const isDef = tab === 'def';
    const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name));
    const cols = STATS.map((s) => {
      const key = s.key + (isDef ? 'Against' : 'For');
      const vals = teams.map((t) => t[key]).filter((v) => v != null);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const sorted = [...vals].sort((a, b) => (isDef ? a - b : b - a));
      const diffs = vals.map((v) => (avg == null ? null : isDef ? avg - v : v - avg)).filter((d) => d != null);
      return {
        key,
        label: `${s.label} ${isDef ? 'Against' : 'For'}`,
        short: s.label,
        avg,
        total: vals.length,
        rank: (v) => sorted.indexOf(v) + 1,
        maxNeg: Math.abs(Math.min(0, ...diffs)),
        maxPos: Math.max(0, ...diffs),
      };
    });
    const rows = teams.map((t) => ({
      t,
      cells: cols.map((c) => {
        const v = t[c.key];
        const diff = v == null || c.avg == null ? null : isDef ? c.avg - v : v - c.avg;
        return { v, diff, rk: v == null ? null : c.rank(v) };
      }),
    }));
    return { cols, rows };
  }, [data, tab]);

  const updated = data?.ts
    ? new Date(data.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  const th = 'px-2 text-[10px] uppercase text-gray-400 font-semibold text-center leading-tight min-w-[52px] h-10 bg-zinc-800';
  const td = 'px-2 text-center text-[15px] font-semibold h-9';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black z-[150] overflow-y-auto"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      <div className="min-h-screen px-4 pt-12 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* header */}
          <div
            className="flex items-center mb-4 sticky top-0 z-50 py-3 px-1 backdrop-blur-md border-b border-white/5"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)' }}
          >
            <button
              onClick={() => {
                trigger('light');
                onClose();
              }}
              className="text-gray-400 hover:text-white text-2xl font-light mr-4"
            >
              ‹
            </button>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              Cheat Sheet
            </h2>
          </div>

          {/* tabs */}
          <div className="flex gap-2 mb-3">
          {[
              ['off', 'Offense'],
              ['def', 'Defense'],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  trigger('selection');
                  setTab(k);
                }}
                className={`flex-1 py-3 rounded-xl font-bold ${
                  tab === k ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {updated && <p className="text-[10px] text-gray-500 mb-3">Updated {updated}</p>}
          {failed && data && (
            <p className="text-[10px] text-red-400 mb-2">Couldn't refresh. Showing older data.</p>
          )}

          {/* body */}
          {loading && !data ? (
            <div className="text-center py-12 text-gray-400">
              Loading cheat sheet…
              {progress && progress.t > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  Reading box scores {progress.d}/{progress.t}
                </div>
              )}
            </div>
          ) : !view ? (
            <div className="bg-zinc-900 rounded-2xl p-6 text-center text-red-500">Couldn't load cheat sheet data</div>
          ) : (
            <div className="bg-zinc-900 rounded-2xl overflow-auto max-h-[calc(100vh-250px)]">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} sticky left-0 top-0 z-30 text-left min-w-[76px]`}>Team</th>
                    <th className={`${th} sticky top-0 z-20`}>GP</th>
                    {view.cols.map((c) => (
                      <th key={c.key} className={`${th} sticky top-0 z-20`}>
                        {c.label}
                      </th>
                    ))}
                    {view.cols.map((c) => (
                      <th key={`v${c.key}`} className={`${th} sticky top-0 z-20`}>
                        {c.short} vs Avg
                      </th>
                    ))}
                    {view.cols.map((c) => (
                      <th key={`r${c.key}`} className={`${th} sticky top-0 z-20`}>
                        {c.short} Rank
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map(({ t, cells }) => (
                    <tr key={t.id} className="border-b border-zinc-800 last:border-0">
                      <td className="sticky left-0 z-10 bg-zinc-900 px-2 h-9 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <img src={logoUrl(t.abbr)} alt={t.abbr} className="w-5 h-5" />
                          <span className="text-sm font-semibold">{t.abbr}</span>
                        </div>
                      </td>
                      <td className={`${td} text-gray-300`}>{t.gp ?? '-'}</td>
                      {cells.map((c, i) => (
                        <td key={`s${i}`} className={td}>
                          {f1(c.v)}
                        </td>
                      ))}
                      {cells.map((c, i) => (
                        <td
                          key={`d${i}`}
                          className={td}
                          style={{ background: diffBg(c.diff, view.cols[i].maxNeg, view.cols[i].maxPos) }}
                        >
                          {fDiff(c.diff)}
                        </td>
                      ))}
                      {cells.map((c, i) => (
                        <td key={`r${i}`} className={td} style={{ background: rankBg(c.rk, view.cols[i].total) }}>
                          {c.rk ?? '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-700">
                    <td className="sticky left-0 z-10 bg-zinc-900 px-2 h-9 whitespace-nowrap text-sm font-bold">
                      League avg
                    </td>
                    <td className={td} />
                    {view.cols.map((c) => (
                      <td key={c.key} className={`${td} text-gray-300`}>
                        {f1(c.avg)}
                      </td>
                    ))}
                    <td className={td} colSpan={view.cols.length * 2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}