import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Check, X, Minus } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────────
   SalaryCap.jsx  ·  NBA salary cap screen body (App.jsx owns wrapper + back arrow)

   WHAT IS ESPN DATA (fetched live, no key):
     - Team rosters (player ids, names, positions)
     - Contract salaries per season + any option / extension / minimum flags
   WHAT IS HARDCODED (edit at the top of this file):
     - CAP_RULES (cap, tax, aprons), TAX_BRACKETS, APRON_RULES
     - HARD_CAP_OVERRIDES, DEAD_MONEY, OPTIONAL_FLAGS, REPEATER_TEAMS
     - ESPN team ids, team colors and full names
   WHAT IS COMPUTED: team salary, tax bill, payroll/tax ranks, team position.

   IMPORTANT: ESPN's contract JSON field names were NOT verified when this was
   written. normalizeContract() tries several likely names. Run
   `window.probeContract(athleteId, 2027)` in the dev console, read the raw
   JSON, and fix normalizeContract() if a field is named differently.
──────────────────────────────────────────────────────────────────────────── */

/* ── Constants ───────────────────────────────────────────────────────────── */

const teamColors = {
  ATL:'#E03A3E',BOS:'#007A33',BKN:'#000000',CHA:'#1D1160',CHI:'#CE1141',
  CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GS:'#1D428A',
  HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',
  MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NO:'#0C2340',NY:'#006BB6',
  OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',
  SAC:'#5A2D81',SA:'#C4CED4',TOR:'#CE1141',UTAH:'#002B5C',WSH:'#002B5C',
};

const teamFullNames = {
  ATL:'Atlanta Hawks',BOS:'Boston Celtics',BKN:'Brooklyn Nets',CHA:'Charlotte Hornets',
  CHI:'Chicago Bulls',CLE:'Cleveland Cavaliers',DAL:'Dallas Mavericks',DEN:'Denver Nuggets',
  DET:'Detroit Pistons',GS:'Golden State Warriors',HOU:'Houston Rockets',IND:'Indiana Pacers',
  LAC:'LA Clippers',LAL:'Los Angeles Lakers',MEM:'Memphis Grizzlies',MIA:'Miami Heat',
  MIL:'Milwaukee Bucks',MIN:'Minnesota Timberwolves',NO:'New Orleans Pelicans',NY:'New York Knicks',
  OKC:'Oklahoma City Thunder',ORL:'Orlando Magic',PHI:'Philadelphia 76ers',PHX:'Phoenix Suns',
  POR:'Portland Trail Blazers',SAC:'Sacramento Kings',SA:'San Antonio Spurs',TOR:'Toronto Raptors',
  UTAH:'Utah Jazz',WSH:'Washington Wizards',
};

// ESPN team ids (same map App.jsx uses)
const ESPN_TEAM_IDS = {
  ATL:'1',BOS:'2',BKN:'17',CHA:'30',CHI:'4',CLE:'5',DAL:'6',DEN:'7',DET:'8',GS:'9',
  HOU:'10',IND:'11',LAC:'12',LAL:'13',MEM:'29',MIA:'14',MIL:'15',MIN:'16',NO:'3',NY:'18',
  OKC:'25',ORL:'19',PHI:'20',PHX:'21',POR:'22',SAC:'23',SA:'24',TOR:'28',UTAH:'26',WSH:'27',
};
const ABBRS = Object.keys(ESPN_TEAM_IDS);

const ACCENT = '#2563eb';
const MUTED = '#6b7280';
const GREEN = '#22c55e';
const RED = '#ef4444';
const YELLOW = '#eab308';
const ORANGE = '#f97316';
const CARD = { background: '#0a0a0a', border: '1px solid #171717' };
const HAIR = '#1f1f1f';
const heading = { fontFamily: 'Rajdhani, sans-serif' };   // titles only
const nums = { fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' };
const logoUrl = abbr => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

/** Season keys are the ENDING year: 2027 = 2026-27. Flips to the next season in October. */
const seasonEndYear = (d = new Date()) => (d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear());
const CURRENT = seasonEndYear();
const SEASONS = [0, 1, 2, 3, 4].map(i => CURRENT + i);
const seasonLabel = y => `${y - 1}-${String(y).slice(2)}`;

// $M. A season past the ones listed is "projected" (italic + *).
const KNOWN_RULES = {
  2027: { min: 148.5, cap: 165.0, tax: 200.4, apron1: 209.0, apron2: 221.7, projected: false },
  2028: { cap: 176.0, tax: 213.0, apron1: 223.0, apron2: 236.0, projected: true },
  2029: { cap: 184.8, tax: 224.5, apron1: 234.2, apron2: 248.3, projected: true },
};
const PLACEHOLDER_GROWTH = 1.055;   // 5.5% a year, placeholder only
function buildCapRules() {
  const out = { ...KNOWN_RULES };
  let prev = KNOWN_RULES[2029];
  [2030, 2031].forEach(y => {
    const g = k => Math.round(prev[k] * PLACEHOLDER_GROWTH * 10) / 10;
    prev = { cap: g('cap'), tax: g('tax'), apron1: g('apron1'), apron2: g('apron2'), projected: true };
    out[y] = prev;
  });
  return out;
}
export const CAP_RULES = buildCapRules();

// Tax rate per $1 over the line, per $5M slice. After the list, +0.50 for each further $5M.
// NOTE: cavs_db's tax bill may differ (rounding, repeater rules, timing of the calculation).
export const TAX_BRACKETS = { slice: 5, rates: [1.5, 1.75, 2.5, 3.25], step: 0.5 };
const REPEATER_TEAMS = new Set([]);          // e.g. new Set(['LAC']); adds REPEATER_ADD per $1
const REPEATER_ADD = 1.0;

// null | 'apron1' | 'apron2'. ESPN can't tell us which teams are hard-capped.
const HARD_CAP_OVERRIDES = { CLE: 'apron1' };
// Dead money in $M, by team then season: { CLE: { 2027: 2.5 } }. Empty = not included.
const DEAD_MONEY = {};
// Fallback badges by athlete id then season: { '4066328': { 2028: ['PO'] } }
const OPTIONAL_FLAGS = {};
// Future-season salaries in $M by athlete id, since ESPN doesn't list them:
// { '3908809': { 2028: 54.1 } }
const CONTRACT_OVERRIDES = {
    '4576087': { 2027: 20.5 },   // Peyton Watson (estimate from 9.8% share, replace with exact)
    '3934723': { 2027: 2.5 },    // Thomas Bryant (estimate)
    '2995706': { 2027: 2.5 },    // Mario Hezonja (estimate)
    '3992':    { 2027: 30.7 },   // James Harden (cavs_db figure, estimate)
    'x-tomlin': { 2027: 2.5 },   // Nae'Qwan Tomlin (estimate)
  };
  // Players ESPN's roster is missing. The id must start with 'x-' so we never request it from ESPN.
  const EXTRA_PLAYERS = {
    CLE: [{ id: 'x-tomlin', name: "Nae'Qwan Tomlin", pos: '' }],
  };

const MAX_CONCURRENT = 8;
const CACHE_TTL = 6 * 60 * 60 * 1000;
const USE_PROXY = false;   // set true if the browser is blocked by CORS (see api/espn.js)

const POSITION_META = {
  under:  { label: 'UNDER CAP',       color: GREEN },
  cap:    { label: 'OVER CAP',        color: YELLOW },
  tax:    { label: 'OVER TAX',        color: ORANGE },
  apron1: { label: 'OVER 1ST APRON',  color: RED },
  apron2: { label: 'OVER 2ND APRON',  color: RED },
};
const POSITION_COLUMN = { under: 0, cap: 1, tax: 1, apron1: 2, apron2: 3 };

const y = note => ({ v: 'yes', note });
const n = note => ({ v: 'no', note });
const na = note => ({ v: 'na', note });
const APRON_RULES = [
  { rule: 'Sign free agents with cap space', cells: [y(), n(), n(), n()] },
  { rule: 'Room mid-level exception', cells: [y('after using space'), n(), n(), n()] },
  { rule: 'Non-taxpayer mid-level exception', cells: [na(), y('hard caps at 1st apron'), n(), n()] },
  { rule: 'Taxpayer mid-level exception', cells: [na(), na(), y('hard caps at 2nd apron'), n()] },
  { rule: 'Bi-annual exception', cells: [na(), y('hard caps at 1st apron'), n(), n()] },
  { rule: 'Take back more salary than they send in a trade',
    cells: [y('into cap space'), y('200% + $250K max · hard caps at 1st apron'), n('100% max'), n('100% max')] },
  { rule: "Combine several players' salaries in one trade",
    cells: [y(), y('hard caps at 2nd apron'), y('hard caps at 2nd apron'), n()] },
  { rule: 'Send cash in a trade',
    cells: [y('hard caps at 2nd apron'), y('hard caps at 2nd apron'), y('hard caps at 2nd apron'), n()] },
  { rule: 'Acquire a player in a sign-and-trade',
    cells: [y('hard caps at 1st apron'), y('hard caps at 1st apron'), n(), n()] },
  { rule: 'Use a trade exception after the regular season it came from (offseason ones: after the next regular season)',
    cells: [na('counts against cap space'), y('hard caps at 1st apron'), n(), n()] },
  { rule: 'Sign a player waived during the season whose salary was above the non-taxpayer MLE',
    cells: [y('hard caps at 1st apron'), y('hard caps at 1st apron'), n(), n()] },
  { rule: 'Trade the first-round pick seven years out',
    cells: [y(), y(), y(), y("freezes if over at season's end")] },
];
const APRON_COLS = ['Under the cap', 'Over the cap (incl. tax)', 'Over 1st apron', 'Over 2nd apron'];

/* ────────────────────────────────────────────────────────────────────────────
   Pure helpers (exported so they can be tested). All money is in $M.
──────────────────────────────────────────────────────────────────────────── */

export const ordinal = num => {
  const v = Math.abs(num) % 100;
  const sfx = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${num}${sfx}`;
};

/** Dark team colors disappear on black, so lighten them for bars. */
export function lift(hex) {
  try {
    const v = parseInt(String(hex).slice(1), 16);
    const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > 0.18) return hex;
    const m = c => Math.round(c + (255 - c) * 0.5);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  } catch (e) {
    return '#3B82F6';
  }
}

/** 209 -> "$209.0M", 0.045 -> "$45K", null -> "—". */
export function fmtM(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—';
  const sign = m < 0 ? '-' : '';
  const a = Math.abs(m);
  if (a > 0 && a < 1) return `${sign}$${Math.round(a * 1000)}K`;
  return `${sign}$${a.toFixed(1)}M`;
}

/** Luxury tax bill in $M for a payroll, using the bracket table. */
export function taxBill(payroll, taxLine, repeater = false) {
  let over = payroll - taxLine;
  if (!(over > 0)) return 0;
  const { slice, rates, step } = TAX_BRACKETS;
  let bill = 0;
  let i = 0;
  while (over > 0) {
    const rate = (i < rates.length ? rates[i] : rates[rates.length - 1] + step * (i - rates.length + 1))
      + (repeater ? REPEATER_ADD : 0);
    const chunk = Math.min(over, slice);
    bill += chunk * rate;
    over -= chunk;
    i += 1;
  }
  return bill;
}

/** 'under' | 'cap' | 'tax' | 'apron1' | 'apron2' for a payroll against one season's lines. */
export function getPosition(payroll, rules) {
  if (payroll === null || payroll === undefined || !rules) return null;
  if (payroll > rules.apron2) return 'apron2';
  if (payroll > rules.apron1) return 'apron1';
  if (payroll > rules.tax) return 'tax';
  if (payroll >= rules.cap) return 'cap';
  return 'under';
}

/** 1 = highest. Returns null if the team isn't in the list. */
export function rankDesc(values, abbr) {
  const mine = values[abbr];
  if (mine === null || mine === undefined) return null;
  return 1 + Object.values(values).filter(v => v > mine).length;
}

const firstNum = (...vals) => {
  for (const v of vals) {
    const x = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : v;
    if (typeof x === 'number' && Number.isFinite(x)) return x;
  }
  return null;
};

/**
 * ONE place that maps ESPN's raw contract JSON to what the UI needs.
 * Field names below are best guesses; verify with window.probeContract().
 * Returns null when there is no usable salary (the UI shows "—").
 */
export function normalizeContract(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dollars = firstNum(raw.salary, raw.amount, raw.baseSalary, raw.totalSalary);
  if (dollars === null) return null;
  const optText = String(raw.optionType ?? raw.option?.type ?? raw.option ?? '').toLowerCase();
  let option = null;
  if (raw.playerOption === true || /player/.test(optText)) option = 'PO';
  else if (raw.teamOption === true || /team/.test(optText)) option = 'TO';
  return {
    salary: dollars / 1e6,
    option,
    ext: false,   // ESPN has no extension field; use OPTIONAL_FLAGS
    vm: raw.minimumSalaryException === true,
    yearsRemaining: firstNum(raw.yearsRemaining),
    bird: null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Data layer: one fetch helper, a request queue, caches
──────────────────────────────────────────────────────────────────────────── */

const IS_DEV = (() => {
  try { if (typeof import.meta !== 'undefined' && import.meta.env) return !!import.meta.env.DEV; } catch (e) { /* ignore */ }
  return false;
})();

/** Every request goes through here, so the Vercel proxy is a one-line switch (USE_PROXY). */
async function espnFetch(url) {
  const target = USE_PROXY ? `/api/espn?url=${encodeURIComponent(url)}` : url;
  const res = await fetch(target);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

const withRetry = async fn => { try { return await fn(); } catch (e) { return fn(); } };

// Tiny queue: at most MAX_CONCURRENT requests at once
let active = 0;
const waiting = [];
function pump() {
  while (active < MAX_CONCURRENT && waiting.length) {
    const job = waiting.shift();
    active += 1;
    job.fn().then(job.res, job.rej).finally(() => { active -= 1; pump(); });
  }
}
const queued = fn => new Promise((res, rej) => { waiting.push({ fn, res, rej }); pump(); });

// Caches: memory Map + sessionStorage (6h expiry)
const store = new Map();      // `${athleteId}:${season}` -> normalized contract | null
const rosters = new Map();    // abbr -> [{ id, name, pos }]
const rosterJobs = new Map(); // abbr -> Promise
const progress = { done: 0, total: 0 };
const listeners = new Set();
let timer = null;
const notify = () => {
  if (timer) return;
  timer = setTimeout(() => { timer = null; listeners.forEach(f => f()); }, 120);
};

const ssKey = (id, season) => `contract2:${id}:${season}`;
function readSession(id, season) {
  try {
    const raw = sessionStorage.getItem(ssKey(id, season));
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < CACHE_TTL ? v : undefined;
  } catch (e) { return undefined; }
}
function writeSession(id, season, v) {
  try { sessionStorage.setItem(ssKey(id, season), JSON.stringify({ t: Date.now(), v })); } catch (e) { /* full or blocked */ }
}

const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const contractUrl = (id, season) => `${CORE}/athletes/${id}/contracts/${season}?lang=en&region=us`;
const indexUrl = id => `${CORE}/athletes/${id}/contracts?lang=en&region=us`;

async function fetchContract(id, season) {
  const direct = await espnFetch(contractUrl(id, season));
  if (direct) return normalizeContract(direct);
  // Direct URL missed: follow the $ref links in the index instead
  const index = await espnFetch(indexUrl(id));
  const ref = (index?.items || []).map(i => i?.$ref).find(r => typeof r === 'string' && new RegExp(`/contracts/${season}(\\?|$)`).test(r));
  if (!ref) return null;
  return normalizeContract(await espnFetch(ref.replace(/^http:/, 'https:')));
}

/** Loads one athlete-season, using caches. Resolves to the normalized contract or null. */
function getContract(id, season) {
    const key = `${id}:${season}`;
    if (String(id).startsWith('x-')) { store.set(key, null); return Promise.resolve(null); }
  if (store.has(key)) return Promise.resolve(store.get(key));
  const cached = readSession(id, season);
  if (cached !== undefined) { store.set(key, cached); return Promise.resolve(cached); }
  progress.total += 1;
  return queued(() => withRetry(() => fetchContract(id, season))).then(v => {
    store.set(key, v);
    writeSession(id, season, v);
    progress.done += 1;
    notify();
    return v;
  });
}

function fetchRoster(abbr) {
  if (rosters.has(abbr)) return Promise.resolve(rosters.get(abbr));
  if (!rosterJobs.has(abbr)) {
    const job = queued(() => withRetry(() =>
      espnFetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${ESPN_TEAM_IDS[abbr]}/roster`)
    )).then(data => {
      const list = (data?.athletes || []).map(a => ({
        id: String(a.id), name: a.displayName || a.shortName || 'Player', pos: a.position?.abbreviation || '',
      }));
      rosters.set(abbr, [...list, ...(EXTRA_PLAYERS[abbr] || [])]);
      notify();
      return list;
    }).finally(() => rosterJobs.delete(abbr));
    rosterJobs.set(abbr, job);
  }
  return rosterJobs.get(abbr);
}

async function loadTeam(abbr, seasons) {
  const list = await fetchRoster(abbr);
  await Promise.all(list.flatMap(p => seasons.map(s => getContract(p.id, s))));
}

/** Dev only: log ONE athlete's raw contract index + season JSON. Use from the console. */
export async function probeContract(athleteId, season = CURRENT) {
  /* eslint-disable no-console */
  const index = await espnFetch(indexUrl(athleteId));
  console.log('[salary] contract index', index);
  const one = await espnFetch(contractUrl(athleteId, season));
  console.log(`[salary] contract ${season}`, one);
  console.log('[salary] normalized', normalizeContract(one));
  /* eslint-enable no-console */
}
if (IS_DEV && typeof window !== 'undefined') window.probeContract = probeContract;
if (IS_DEV && typeof window !== 'undefined') {
    window.salaryDebug = abbr => console.table((rosters.get(abbr) || []).map(p => ({
      id: p.id, name: p.name, salaryM: store.get(`${p.id}:${CURRENT}`)?.salary ?? null,
    })));
  }
  if (IS_DEV && typeof window !== 'undefined') {
    window.salaryGaps = () => {
      const out = [];
      ABBRS.forEach(a => (rosters.get(a) || []).forEach(p => {
        if (!String(p.id).startsWith('x-') && contractFor(p.id, CURRENT) === null) out.push({ team: a, id: p.id, name: p.name });
      }));
      console.table(out);
    };
  }
/** Flags for one cell: ESPN's first, then the OPTIONAL_FLAGS fallback. */
function badgesFor(id, season, c) {
  const fb = OPTIONAL_FLAGS[id]?.[season] || [];
  const out = [];
  const opt = c?.option || (fb.includes('PO') ? 'PO' : fb.includes('TO') ? 'TO' : null);
  if (opt) out.push(opt);
  if (c?.ext || fb.includes('EXT')) out.push('EXT');
  if (c?.vm || fb.includes('VM')) out.push('VM');
  return out;
}

const deadFor = (abbr, season) => DEAD_MONEY[abbr]?.[season] || 0;
// Team payroll in $M, used only for league ranks. Fill all 30, or ranks will be wrong.
const TEAM_PAYROLL_OVERRIDES = { CLE: 209.0 };
/** ESPN lists only the current season. Future years come from CONTRACT_OVERRIDES.
 *  Returns an object, null (no contract), or undefined (still loading). */
function contractFor(id, season) {
    const o = CONTRACT_OVERRIDES[id]?.[season];
    if (o != null) return { salary: o, option: null, ext: false, vm: false };
    if (season === CURRENT) return store.get(`${id}:${season}`);
    return store.get(`${id}:${CURRENT}`) === undefined ? undefined : null;
  }
  
  /** Team salary ($M) for a season, or null if any part of it is unknown. */
  function teamTotal(abbr, season) {
    const list = rosters.get(abbr);
    if (!list) return null;
    let sum = deadFor(abbr, season);
    for (const p of list) {
      const c = contractFor(p.id, season);
      if (c === undefined) return null;
      if (season > CURRENT && !c) {
        const cur = store.get(`${p.id}:${CURRENT}`);
        const expired = !cur || (Number.isFinite(cur.yearsRemaining) && cur.yearsRemaining < season - CURRENT);
        if (!expired) return null;   // still under contract but salary unknown: total would be wrong
      }
      sum += c?.salary || 0;
    }
    return sum;
  }



/* ────────────────────────────────────────────────────────────────────────────
   Small presentational pieces (same patterns as TeamStatsPage)
──────────────────────────────────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={heading}>
      {children}
    </h5>
  );
}

function Stat({ label, value, sub, valueColor }) {
  return (
    <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ ...nums, fontSize: 20, color: valueColor || 'white', lineHeight: 1.15, marginTop: 2, whiteSpace: 'nowrap' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: MUTED, fontWeight: 500, marginTop: 3, minHeight: 28, textAlign: 'center', lineHeight: '14px' }}>
        {sub || ''}
      </span>
    </div>
  );
}

const textBtn = { background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 14, fontWeight: 600 };

function Badge({ children }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: MUTED, border: '1px solid #27272a', borderRadius: 6, padding: '0 4px', lineHeight: '13px' }}>
      {children}
    </span>
  );
}

function TeamPicker({ current, onPick, onClose }) {
  return (
    <div role="dialog" aria-label="Choose a team" className="fixed inset-0 bg-black bg-opacity-95 z-[120] overflow-y-auto">
      <div className="min-h-screen px-4 pb-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center" style={{ padding: '12px 0 18px' }}>
            <button onClick={onClose} aria-label="Close"
              style={{ background: 'none', border: 'none', color: MUTED, fontSize: 24, fontWeight: 300, marginRight: 14, cursor: 'pointer' }}>
              ✕
            </button>
            <h2 style={{ ...heading, fontSize: 24, fontWeight: 900, color: 'white', margin: 0 }}>Choose a team</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(teamFullNames).map(([abbr, name]) => (
              <button key={abbr} onClick={() => onPick(abbr)} aria-label={name}
                className="bg-zinc-900 hover:bg-zinc-800 rounded-2xl p-4 flex items-center gap-3 transition-colors">
                <img src={logoUrl(abbr)} alt={abbr} className="w-12 h-12" />
                <div className="text-left min-w-0">
                  <div className="font-semibold" style={{ color: abbr === current ? ACCENT : undefined }}>{abbr}</div>
                  <div className="text-xs text-gray-400 truncate">{name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Horizontal bar with the cap lines marked on it. Labels sit on 3 levels so they never overlap. */
function ThresholdBar({ salary, rules, color }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  const scaleMax = rules.apron2 * 1.05;
  const pct = v => Math.min(100, (v / scaleMax) * 100);
  const BAR_TOP = 58;
  const BAR_H = 14;
  const marks = [
    { k: 'Min', v: rules.min, level: 'a1', color: MUTED, dashed: true },
    { k: 'Cap', v: rules.cap, level: 'b', color: MUTED, dashed: true },
    { k: 'Tax', v: rules.tax, level: 'a1', color: MUTED, dashed: true },
    { k: 'Apron 1', v: rules.apron1, level: 'b', color: ACCENT },
    { k: 'Apron 2', v: rules.apron2, level: 'a2', color: '#ffffff' },
  ].filter(m => m.v != null);
  const labelTop = { a2: 0, a1: 28, b: BAR_TOP + BAR_H + 6 };
  return (
    <div style={{ position: 'relative', height: BAR_TOP + BAR_H + 38, margin: '0 18px' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: BAR_TOP, height: BAR_H, borderRadius: 8, background: '#18181b', overflow: 'hidden' }}>
        <div style={{ width: on ? `${pct(salary)}%` : 0, height: '100%', background: color, borderRadius: 8, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }} />
      </div>
      {marks.map(m => {
        const above = m.level !== 'b';
        const lineTop = above ? labelTop[m.level] + 26 : BAR_TOP - 3;
        const lineH = above ? BAR_TOP + BAR_H + 3 - lineTop : labelTop.b - lineTop;
        return (
          <React.Fragment key={m.k}>
            <div style={{ position: 'absolute', left: `${pct(m.v)}%`, top: lineTop, height: lineH, width: 0,
              borderLeft: `${m.dashed ? '1px dashed' : '2px solid'} ${m.color}`, transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', left: `${pct(m.v)}%`, top: labelTop[m.level], transform: 'translateX(-50%)',
              textAlign: 'center', whiteSpace: 'nowrap', fontSize: 10, color: MUTED, lineHeight: '13px' }}>
              <div>{m.k}</div>
              <div style={{ ...nums, fontWeight: 700 }}>{fmtM(m.v)}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Screen body. App.jsx keeps the fixed wrapper and the back header.
──────────────────────────────────────────────────────────────────────────── */

export default function SalaryCap({ teamInfo, onHaptic, onTeamClick }) { // eslint-disable-line no-unused-vars
  const haptic = typeof onHaptic === 'function' ? onHaptic : () => {};
  const [abbr, setAbbr] = useState(teamInfo?.abbr && ESPN_TEAM_IDS[teamInfo.abbr] ? teamInfo.abbr : 'CLE');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [, rerender] = useReducer(x => x + 1, 0);
  const firstAbbr = useRef(abbr);

  // Re-render whenever new contract data lands (throttled in notify())
  useEffect(() => { listeners.add(rerender); return () => listeners.delete(rerender); }, []);

  // Selected team: current season first, then the other four seasons
  useEffect(() => {
    let off = false;
    setFailed(false);
    (async () => {
      try { await loadTeam(abbr, [CURRENT]); } catch (e) { if (!off) setFailed(true); return; }
      loadTeam(abbr, SEASONS.slice(1)).catch(() => {});
    })();
    return () => { off = true; };
  }, [abbr, attempt]);

  // League payroll for ranks: starts after the first team has loaded
  useEffect(() => {
    (async () => {
      await loadTeam(firstAbbr.current, [CURRENT]).catch(() => {});
      await Promise.all(ABBRS.map(a => loadTeam(a, [CURRENT]).catch(() => {})));
    })();
  }, [attempt]);

  const roster = rosters.get(abbr) || null;
  const color = lift(teamColors[abbr] || '#3B82F6');
  const rulesNow = CAP_RULES[CURRENT];
  const totals = {};
  SEASONS.forEach(s => { totals[s] = teamTotal(abbr, s); });
  const payroll = totals[CURRENT];
  const ready = payroll !== null;

  // League ranks (only once all 30 teams are loaded)
  const league = {};
  ABBRS.forEach(a => { league[a] = TEAM_PAYROLL_OVERRIDES[a] ?? teamTotal(a, CURRENT); });
  const leagueReady = ABBRS.every(a => league[a] !== null);
  const bills = {};
  if (leagueReady) ABBRS.forEach(a => { bills[a] = taxBill(league[a], rulesNow.tax, REPEATER_TEAMS.has(a)); });
  const payrollRank = leagueReady ? rankDesc(league, abbr) : null;
  const taxTeams = leagueReady ? ABBRS.filter(a => bills[a] > 0).length : 0;
  const taxRank = leagueReady && bills[abbr] > 0 ? rankDesc(bills, abbr) : null;

  const bill = ready ? taxBill(payroll, rulesNow.tax, REPEATER_TEAMS.has(abbr)) : null;
  const overTax = ready ? Math.max(0, payroll - rulesNow.tax) : null;
  const apronGap = ready ? payroll - rulesNow.apron1 : null;
  const hard = HARD_CAP_OVERRIDES[abbr] || null;
  const position = ready ? getPosition(payroll, rulesNow) : null;
  const posCol = position ? POSITION_COLUMN[position] : -1;

  // Rows for the cap sheet, biggest current salary first
  const rows = (roster || []).map(p => ({ ...p, cells: SEASONS.map(s => contractFor(p.id, s)) }))
    .sort((a, b) => (b.cells[0]?.salary || 0) - (a.cells[0]?.salary || 0));
  const seasonLoaded = s => totals[s] !== null;
  const usedBadges = new Set();
  rows.forEach(r => r.cells.forEach((c, i) => badgesFor(r.id, SEASONS[i], c).forEach(b => usedBadges.add(b))));

  // Money segments
  const segs = rows.filter(r => r.cells[0]?.salary > 0).map(r => ({ name: r.name, v: r.cells[0].salary }));
  const dead = deadFor(abbr, CURRENT);
  if (dead > 0) segs.push({ name: 'Dead money', v: dead, hatched: true });
  segs.sort((a, b) => b.v - a.v);
  const segTotal = segs.reduce((t, s) => t + s.v, 0);
  const opacityAt = i => (segs.length <= 1 ? 1 : 1 - (i / (segs.length - 1)) * 0.65);

  const strip = [
    { l: 'SALARY', v: fmtM(payroll), sub: 'Team salary' },
    { l: 'VS 1ST APRON', v: ready ? fmtM(Math.abs(apronGap)) : '—', color: ready ? (apronGap <= 0 ? GREEN : RED) : null,
      sub: hard && ready && apronGap <= 0 ? 'Under hard cap' : ready ? (apronGap <= 0 ? 'Under 1st apron' : 'Over 1st apron') : '' },
    { l: 'OVER TAX', v: ready ? fmtM(overTax) : '—', sub: 'Over the tax line' },
    { l: 'TAX BILL', v: ready ? fmtM(bill) : '—', sub: 'Estimated bill' },
    { l: 'PAYROLL', v: payrollRank ? ordinal(payrollRank) : '—', sub: 'Highest payroll of 30' },
    { l: 'TAX RANK', v: taxRank ? ordinal(taxRank) : '—', sub: taxRank ? `Largest tax bill of ${taxTeams}` : leagueReady ? 'Not over the tax' : '' },
  ];
  const grid = cols => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 2, rowGap: 6 });

  const th = { fontSize: 10, color: MUTED, fontWeight: 600, padding: '10px 8px', textAlign: 'center', borderBottom: `1px solid ${HAIR}`, whiteSpace: 'nowrap' };
  const stickyCell = { position: 'sticky', left: 0, background: '#0a0a0a', zIndex: 1 };
  const tint = 'rgba(37,99,235,0.12)';

  if (failed) {
    return (
      <div className="rounded-2xl text-center" style={{ ...CARD, marginTop: 8, padding: '22px 16px', color: MUTED, fontSize: 13, fontWeight: 600 }}>
        Salary data is not available right now.
        <div>
          <button onClick={() => { haptic('light'); setAttempt(a => a + 1); }} aria-label="Retry"
            style={{ ...textBtn, fontSize: 15, fontWeight: 700, padding: '14px 20px' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out both' }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 14 }}>
        <img src={logoUrl(abbr)} alt={abbr} style={{ width: 72, height: 72 }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div style={{ ...heading, fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: 'white' }}>{teamFullNames[abbr]}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Salary cap · {seasonLabel(CURRENT)}</div>
          <button onClick={() => { haptic('light'); setPickerOpen(true); }} aria-label="Change team"
            style={{ ...textBtn, padding: '8px 0 0', minHeight: 44, textAlign: 'left' }}>
            Change team ›
          </button>
        </div>
      </div>

      {!leagueReady && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: -4 }}>
          Loading league payroll… {progress.done}/{progress.total}
        </div>
      )}

      {/* Stat grid */}
      {!ready ? (
        <div className="skeleton rounded-2xl" style={{ height: 150, marginTop: 24 }} />
      ) : (
        <div style={{ ...grid(3), rowGap: 16, marginTop: 24 }}>
          {strip.map(c => <Stat key={c.l} label={c.l} value={c.v} sub={c.sub} valueColor={c.color} />)}
        </div>
      )}

      {/* Thresholds */}
      <div style={{ marginTop: 30 }}>
        <div style={{ marginBottom: 12 }}><SectionTitle>Thresholds</SectionTitle></div>
        {!ready ? <div className="skeleton rounded-2xl" style={{ height: 130 }} /> : (
          <div className="rounded-2xl" style={{ ...CARD, padding: '16px 6px 6px' }}>
            <ThresholdBar key={abbr} salary={payroll} rules={rulesNow} color={color} />
          </div>
        )}
      </div>

      {/* Where the money goes */}
      <div style={{ marginTop: 30 }}>
        <div style={{ marginBottom: 12 }}><SectionTitle>Where the {seasonLabel(CURRENT)} money goes</SectionTitle></div>
        {!ready ? <div className="skeleton rounded-2xl" style={{ height: 160 }} /> : (
          <div className="rounded-2xl" style={{ ...CARD, padding: 16 }}>
            <div className="flex" style={{ height: 18, borderRadius: 9, overflow: 'hidden', background: '#18181b', gap: 1 }}>
              {segs.map((s, i) => (
                <div key={s.name} title={s.name} style={{
                  width: `${(s.v / segTotal) * 100}%`,
                  background: s.hatched
                    ? `repeating-linear-gradient(45deg, ${color} 0 3px, #0a0a0a 3px 6px)`
                    : color,
                  opacity: s.hatched ? 0.7 : opacityAt(i), transition: 'width 200ms',
                }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 14, rowGap: 8, marginTop: 16 }}>
              {segs.map((s, i) => (
                <div key={s.name} className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color, opacity: s.hatched ? 0.7 : opacityAt(i) }} />
                  <span className="truncate flex-1" style={{ fontSize: 13, color: 'white' }}>{s.name}</span>
                  <span style={{ ...nums, fontSize: 13, color: 'white' }}>{Math.round((s.v / segTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cap sheet */}
      <div style={{ marginTop: 30 }}>
        <div style={{ marginBottom: 12 }}><SectionTitle>Cap sheet</SectionTitle></div>
        {!roster ? <div className="skeleton rounded-2xl" style={{ height: 260 }} /> : (
          <div className="rounded-2xl" style={{ ...CARD, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table aria-label="Cap sheet" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 540 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...stickyCell, textAlign: 'left', minWidth: 120 }}>Player</th>
                    {SEASONS.map((s, i) => (
                      <th key={s} style={{ ...th, background: i === 0 ? tint : undefined, minWidth: 84 }}>
                        {seasonLabel(s)}{CAP_RULES[s].projected ? '*' : ''}
                        {i === 0 && <div style={{ fontSize: 8, color: ACCENT, fontWeight: 800, letterSpacing: '0.06em' }}>CURRENT</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {

                    return (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                        <td style={{ ...stickyCell, padding: '10px 8px', minWidth: 120 }}>
                          <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'white', maxWidth: 130 }}>{r.name}</div>
                          {r.pos && <div style={{ fontSize: 10, color: MUTED }}>{r.pos}</div>}
                        </td>
                        {r.cells.map((c, i) => {
                          const loaded = c !== undefined;
                          const badges = badgesFor(r.id, SEASONS[i], c);
                          return (
                            <td key={SEASONS[i]} style={{ textAlign: 'center', padding: '8px 4px', background: i === 0 ? tint : undefined }}>
                              {!loaded ? <span style={{ color: '#27272a' }}>…</span>
                                : c ? <span style={{ ...nums, fontSize: 13, color: 'white' }}>{fmtM(c.salary)}</span>
                                : <span style={{ fontSize: 12, color: MUTED }}>{r.cells[0] && Number.isFinite(r.cells[0].yearsRemaining) && r.cells[0].yearsRemaining < i ? 'UFA' : '—'}</span>}
                              {badges.length > 0 && (
                                <div className="flex justify-center" style={{ gap: 3, marginTop: 3 }}>
                                  {badges.map(b => <Badge key={b}>{b}</Badge>)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Team total */}
                  <tr style={{ borderTop: `1px solid ${HAIR}` }}>
                    <td style={{ ...stickyCell, padding: '12px 8px' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'white' }}>Team total</div>
                      <div style={{ fontSize: 10, color: MUTED }}>{rows.length} players + dead</div>
                    </td>
                    {SEASONS.map((s, i) => (
                      <td key={s} style={{ textAlign: 'center', background: i === 0 ? tint : undefined }}>
                        <span style={{ ...nums, fontSize: 13, color: 'white' }}>{fmtM(totals[s])}</span>
                      </td>
                    ))}
                  </tr>

                  {/* Team position pills */}
                  <tr>
                    <td style={{ ...stickyCell, padding: '8px', fontSize: 12, color: MUTED }}>Team position</td>
                    {SEASONS.map((s, i) => {
                      const p = seasonLoaded(s) ? getPosition(totals[s], CAP_RULES[s]) : null;
                      const meta = p ? POSITION_META[p] : null;
                      return (
                        <td key={s} style={{ textAlign: 'center', padding: '6px 3px', background: i === 0 ? tint : undefined }}>
                          {meta ? (
                            <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, color: meta.color, background: `${meta.color}24`, borderRadius: 6, padding: '3px 5px', lineHeight: '11px' }}>
                              {meta.label}
                            </span>
                          ) : <span style={{ color: MUTED }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* League thresholds */}
                  <tr>
                    <td colSpan={SEASONS.length + 1} style={{ ...stickyCell, padding: '14px 8px 6px', fontSize: 10, color: MUTED, fontWeight: 600, borderTop: `1px solid ${HAIR}` }}>
                      League thresholds · team committed salary vs.
                    </td>
                  </tr>
                  {[['Salary cap', 'cap'], ['Luxury tax', 'tax'], ['First apron', 'apron1'], ['Second apron', 'apron2']].map(([label, k]) => (
                    <tr key={k}>
                      <td style={{ ...stickyCell, padding: '8px', fontSize: 12, color: 'white' }}>{label}</td>
                      {SEASONS.map((s, i) => {
                        const line = CAP_RULES[s][k];
                        const t = totals[s];
                        const diff = t === null ? null : t - line;
                        return (
                          <td key={s} style={{ textAlign: 'center', padding: '6px 2px', background: i === 0 ? tint : undefined }}>
                            <div style={{ ...nums, fontSize: 12, color: 'white', fontStyle: CAP_RULES[s].projected ? 'italic' : 'normal' }}>
                              {fmtM(line)}{CAP_RULES[s].projected ? '*' : ''}
                            </div>
                            {diff !== null && (
                              <div style={{ ...nums, fontSize: 10, color: diff > 0 ? RED : GREEN }}>
                                {fmtM(Math.abs(diff))} {diff > 0 ? 'over' : 'under'}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {usedBadges.size > 0 && (
          <div className="flex flex-wrap" style={{ gap: '6px 14px', marginTop: 10, fontSize: 11, color: MUTED }}>
            {[['PO', 'Player option'], ['TO', 'Team option'], ['EXT', 'Extension eligible'], ['VM', 'Veteran minimum']]
              .filter(([b]) => usedBadges.has(b))
              .map(([b, t]) => <span key={b}><Badge>{b}</Badge> {t}</span>)}
          </div>
        )}
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>* Projected. Future seasons use estimated cap lines.</div>
      </div>

      {/* What each apron allows */}
      <div style={{ marginTop: 32 }}>
      <div style={{ marginBottom: 12 }}><SectionTitle>What each apron allows</SectionTitle></div>
        <div className="rounded-2xl" style={{ ...CARD, overflow: 'hidden' }}>
          <div className="overflow-x-auto">
            <table aria-label="What each apron allows" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...stickyCell, textAlign: 'left', minWidth: 170 }}>Rule</th>
                  {APRON_COLS.map((c, i) => (
                    <th key={c} style={{ ...th, background: i === posCol ? tint : undefined, minWidth: 96 }}>
                      {c}
                      {i === posCol && <div style={{ fontSize: 8, color: ACCENT, fontWeight: 800, letterSpacing: '0.06em' }}>TEAM</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {APRON_RULES.map(r => (
                  <tr key={r.rule} style={{ borderTop: `1px solid ${HAIR}` }}>
                    <td style={{ ...stickyCell, padding: '10px 8px', fontSize: 12, color: 'white', lineHeight: '16px' }}>{r.rule}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} style={{ textAlign: 'center', verticalAlign: 'top', padding: '10px 6px', background: i === posCol ? tint : undefined }}>
                        {c.v === 'yes' && <Check size={16} color={GREEN} aria-label="Yes" />}
                        {c.v === 'no' && <X size={16} color={RED} aria-label="No" />}
                        {c.v === 'na' && <Minus size={16} color={MUTED} aria-label="Not applicable" />}
                        {c.note && <div style={{ fontSize: 10, color: MUTED, lineHeight: '13px', marginTop: 3 }}>{c.note}</div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: '17px' }}>
          A team's position after the move is what counts. A move marked 'hard caps' means the team can't go over that line for the rest of the league year. Rules: NBA CBA, as summarized by the CBA Guide.
        </div>
      </div>

      {pickerOpen && (
        <TeamPicker current={abbr} onClose={() => setPickerOpen(false)}
          onPick={a => { haptic('light'); setAbbr(a); setPickerOpen(false); }} />
      )}
    </div>
  );
}