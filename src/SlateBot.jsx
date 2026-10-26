/* =====================================================================
   SlateBot.jsx — floating, no-LLM chat assistant for Slate
   Everything runs in the browser against ESPN's free, unofficial API.
   No backend, proxy, API keys or LLM. UI is Tailwind (same as App.jsx) +
   lucide-react icons.

   Mount once at the root so it shows on every tab:
     import SlateBot from './SlateBot';
     <SlateBot />                       // props: defaultOpen, bottomOffset=88,
                                        //        league="nba", side="left" | "right",
                                        //        teamColors (abbr → hex, defaults below)

   Needs in your global CSS (already there): keyframes fadeUp, .skeleton.
   Only sbDot (typing dots) is defined locally.

   The chat is never saved: messages and context live in React state only, and are cleared
   after the page has been hidden for CHAT_RESET_AFTER_HIDDEN_MS. Type /probe to inspect the
   raw ESPN betting/contract endpoints.

   Debugging: set DEBUG = true below, or run  localStorage.sb_debug = '1'
   in the console and reload. Every request then logs its URL, HTTP status
   and the exact error name/message. Type /reset in the chat to clear all
   health state, caches and the player index.

   Adding MLB later: add an entry to LEAGUES, then add MLB stat defs (STATS),
   gamelog column map (parseGamelog) and intents. Everything else (fetch
   layer, index, parser, UI) is league-agnostic.
   ===================================================================== */
   import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
   import { flushSync } from 'react-dom';
   import { MessageCircle, X, Trash2, Send } from 'lucide-react';
   
   /* =====================================================================
      1. CONFIG
      ===================================================================== */
   const DEBUG = (() => { try { return window.localStorage.getItem('sb_debug') === '1'; } catch (e) { return false; } })() || false; // true → logs every request + raw ESPN payload
   const DAY = 864e5;
   const MIN5 = 3e5;
   const LIVE = 2e4;
   const CHAT_RESET_AFTER_HIDDEN_MS = 30 * 60 * 1000; // clear chat + context if the page was hidden longer than this
   const TIMEOUT = 15000; // per attempt; a timeout is retried once and never counted as an endpoint failure
   const APP_CACHE_KEY = 'allPlayersCache'; // written by App.jsx (id, name, headshot, position, team abbreviation; 24h TTL)
   
   const dbg = (...a) => { if (DEBUG) console.log('[SlateBot]', ...a); };
   
   const LEAGUES = {
     nba: { label: 'NBA', sport: 'basketball', slug: 'nba', propProvider: 100, espnLeagueId: '46' },
   };
   
   /* Hardcoded NBA teams (same abbr → ESPN id map as App.jsx). Used when /teams fails.
      [abbr, espnId, location, nickname] */
   const FALLBACK_TEAMS = [
     ['ATL', 1, 'Atlanta', 'Hawks'], ['BOS', 2, 'Boston', 'Celtics'], ['BKN', 17, 'Brooklyn', 'Nets'], ['CHA', 30, 'Charlotte', 'Hornets'],
     ['CHI', 4, 'Chicago', 'Bulls'], ['CLE', 5, 'Cleveland', 'Cavaliers'], ['DAL', 6, 'Dallas', 'Mavericks'], ['DEN', 7, 'Denver', 'Nuggets'],
     ['DET', 8, 'Detroit', 'Pistons'], ['GS', 9, 'Golden State', 'Warriors'], ['HOU', 10, 'Houston', 'Rockets'], ['IND', 11, 'Indiana', 'Pacers'],
     ['LAC', 12, 'LA', 'Clippers'], ['LAL', 13, 'Los Angeles', 'Lakers'], ['MEM', 29, 'Memphis', 'Grizzlies'], ['MIA', 14, 'Miami', 'Heat'],
     ['MIL', 15, 'Milwaukee', 'Bucks'], ['MIN', 16, 'Minnesota', 'Timberwolves'], ['NO', 3, 'New Orleans', 'Pelicans'], ['NY', 18, 'New York', 'Knicks'],
     ['OKC', 25, 'Oklahoma City', 'Thunder'], ['ORL', 19, 'Orlando', 'Magic'], ['PHI', 20, 'Philadelphia', '76ers'], ['PHX', 21, 'Phoenix', 'Suns'],
     ['POR', 22, 'Portland', 'Trail Blazers'], ['SAC', 23, 'Sacramento', 'Kings'], ['SA', 24, 'San Antonio', 'Spurs'], ['TOR', 28, 'Toronto', 'Raptors'],
     ['UTAH', 26, 'Utah', 'Jazz'], ['WSH', 27, 'Washington', 'Wizards'],
   ].map(([abbr, id, loc, nick]) => ({ id: String(id), abbr, name: `${loc} ${nick}`, nick, short: nick, loc }));
   
   /* Other abbreviations an app cache might use → ESPN's abbreviation */
   const ABBR_ALIAS = { GSW: 'GS', NYK: 'NY', NOP: 'NO', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' };
   
   /* Team accent colors (ESPN abbreviations). Your message was cut off after "GS #1D", so GS onward
      uses the standard team primaries; replace with the map from App.jsx or pass the `teamColors` prop. */
   const TEAM_COLORS = {
     ATL: '#E03A3E', BOS: '#007A33', BKN: '#000000', CHA: '#1D1160', CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#0E2240',
     DET: '#C8102E', GS: '#1D428A', HOU: '#CE1141', IND: '#002D62', LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
     MIL: '#00471B', MIN: '#0C2340', NO: '#0C2340', NY: '#006BB6', OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160',
     POR: '#E03A3E', SAC: '#5A2D81', SA: '#C4CED4', TOR: '#CE1141', UTAH: '#002B5C', WSH: '#002B5C',
   };
   
   const endpoints = (lg) => ({
     site: `https://site.api.espn.com/apis/site/v2/sports/${lg.sport}/${lg.slug}`,
     v2: `https://site.api.espn.com/apis/v2/sports/${lg.sport}/${lg.slug}`,
     common: `https://site.web.api.espn.com/apis/common/v3/sports/${lg.sport}/${lg.slug}`,
     core: `https://sports.core.api.espn.com/v2/sports/${lg.sport}/leagues/${lg.slug}`,
     cdn: `https://cdn.espn.com/core/${lg.slug}`,
     now: 'https://now.core.api.espn.com/v1/sports/news',
     search: 'https://site.web.api.espn.com/apis/search/v2',
     headshot: (id) => `https://a.espncdn.com/i/headshots/${lg.slug}/players/full/${id}.png`,
   });
   
   const NICK = [
     ['bron', 'lebron james'], ['lbj', 'lebron james'], ['kd', 'kevin durant'], ['steph', 'stephen curry'],
     ['greek freak', 'giannis antetokounmpo'], ['luka', 'luka doncic'], ['ad', 'anthony davis'],
     ['wemby', 'victor wembanyama'], ['sga', 'shai gilgeous-alexander'], ['dame', 'damian lillard'],
     ['zion', 'zion williamson'], ['trae', 'trae young'], ['cp3', 'chris paul'], ['kat', 'karl-anthony towns'],
     ['dray', 'draymond green'], ['bam', 'bam adebayo'], ['ja', 'ja morant'], ['joker', 'nikola jokic'],
   ];
   
   const TEAM_EXTRA = {
     NY: ['nyk', 'new york'], GS: ['gsw', 'dubs', 'golden state'], SA: ['sas', 'san antonio'], NO: ['nop', 'pels', 'new orleans'],
     CLE: ['cavs'], PHI: ['sixers', 'philly'], MIN: ['wolves', 'twolves'], POR: ['blazers'], DAL: ['mavs'],
     MEM: ['grizz'], DEN: ['nugs'], LAC: ['clips', 'la clippers'], LAL: ['la lakers'], WSH: ['wiz'], UTAH: ['utah'], BKN: ['brooklyn'],
   };
   
   /* =====================================================================
      2. SMALL UTILITIES
      ===================================================================== */
   const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   const f1 = (v) => (v == null || Number.isNaN(v) ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
   const fixRef = (u) => String(u || '').replace('.pvt', '.com').replace(/^http:/, 'https:');
   const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
   const idFromRef = (ref, seg) => { const m = ref && String(ref).match(new RegExp(`/${seg}/(\\d+)`)); return m ? m[1] : null; };
   
   const norm = (s) =>
     String(s || '')
       .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
       .replace(/[’‘`´']s\b/g, '').replace(/[’‘`´']/g, '')
       .replace(/(\d)\.(\d)/g, '$1§$2').replace(/\./g, ' ').replace(/§/g, '.')
       .replace(/[^a-z0-9\s+%/.-]/g, ' ').replace(/\s+/g, ' ').trim();
   
   const lev = (a, b) => {
     const m = a.length, n = b.length;
     if (!m) return n; if (!n) return m;
     let prev = Array.from({ length: n + 1 }, (_, j) => j);
     for (let i = 1; i <= m; i++) {
       const cur = [i];
       for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
       prev = cur;
     }
     return prev[n];
   };
   const sim = (a, b) => { const m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; };
   
   async function pool(items, size, fn) {
     let i = 0;
     await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
       while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch (e) { /* handled in fn */ } }
     }));
   }
   
   const store = (area) => ({
     get(k, d = null) { try { const v = window[area].getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
     set(k, v) { try { window[area].setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
     del(k) { try { window[area].removeItem(k); } catch (e) { /* ignore */ } },
   });
   const ls = store('localStorage');
   const ss = store('sessionStorage');
   
   /* ---------- dates (Eastern time; slate day rolls over at 4 AM ET) ---------- */
   const etISO = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
   const slateISO = () => etISO(new Date(Date.now() - 4 * 3600 * 1000));
   const ymd = (iso) => iso.replace(/-/g, '');
   const shiftISO = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
   const isoOf = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? etISO(d) : ''; };
   const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
   const fmtTime = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); };
   const seasonNow = () => { const iso = slateISO(); const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 9 ? y + 1 : y; }; // ESPN names a season by the year it ends
   
   /* =====================================================================
      3. FETCH LAYER — 15s timeout, retry once, de-dupe, TTL cache,
         concurrency 4, per-endpoint health tracking.
   
         Abort policy: the ONLY AbortController is the per-attempt timeout
         timer inside fetchOnce. Nothing aborts on component unmount or on
         React StrictMode's double mount, so module-level caches and the
         in-flight map are safe to share across mounts.
      ===================================================================== */
   const mem = new Map();
   const inflight = new Map();
   const health = new Map();
   const waiting = [];
   let active = 0;
   
   const resetHealth = () => { health.clear(); };
   resetHealth(); // fresh health state on every page load
   
   const IDX_KEY = 'sb_index_v1';
   function resetCaches() {
     resetHealth();
     mem.clear();
     inflight.clear();
     ls.del(IDX_KEY);
     ls.del('sb_lastsnap');
     // never touch APP_CACHE_KEY: it belongs to App.jsx
   }
   
   const pump = () => {
     while (active < 4 && waiting.length) {
       const job = waiting.shift();
       active++;
       job().finally(() => { active--; pump(); });
     }
   };
   const queued = (fn) => new Promise((res, rej) => { waiting.push(() => fn().then(res, rej)); pump(); });
   const endpointKey = (u) => { try { const x = new URL(u); return x.host + x.pathname.replace(/\d+/g, '#'); } catch (e) { return u; } };
   const downEndpoints = () => [...health.entries()].filter(([, h]) => h.until > Date.now()).map(([k]) => k);
   
   const isAbort = (e) => !!e && (e.name === 'AbortError' || e.name === 'TimeoutError' || e.timedOut === true);
   /* Only these count against an endpoint: 5xx, and network-level errors (fetch rejects with TypeError). */
   const countsAsFailure = (e) => !!e && !isAbort(e) && ((e.status >= 500) || e.name === 'TypeError');
   
   const noteOk = (key) => health.set(key, { fails: 0, until: 0 });
   const noteFail = (key) => {
     const fails = (health.get(key)?.fails || 0) + 1;
     health.set(key, { fails, until: fails >= 3 ? Date.now() + 600000 : 0 });
   };
   
   async function fetchOnce(url, attempt = 1) {
     const ctl = new AbortController();
     let timedOut = false;
     const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
     dbg(`→ GET (attempt ${attempt})`, url);
     try {
       const r = await fetch(url, { signal: ctl.signal });
       dbg(`← ${r.status}`, url);
       if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
       try { return await r.json(); } catch (e) { e.parse = true; throw e; }
     } catch (e) {
       dbg(`✗ ${e?.name}: ${e?.message}${timedOut ? ' (our own timeout fired)' : ''}`, url);
       if (timedOut) { const te = new Error(`timeout after ${TIMEOUT}ms`); te.name = 'TimeoutError'; te.timedOut = true; throw te; }
       throw e;
     } finally { clearTimeout(timer); }
   }
   
   /* One network job: up to 2 attempts. 4xx (incl. 404) is returned to the caller immediately and never
      counts against the endpoint. Aborts/timeouts are retried once and never counted. */
   async function runFetch(url, key, ttl) {
     let lastErr;
     for (let attempt = 1; attempt <= 2; attempt++) {
       try {
         const v = await fetchOnce(url, attempt);
         noteOk(key);
         mem.set(url, { t: Date.now(), ttl, v });
         dbg('payload', url, v);
         return v;
       } catch (e) {
         lastErr = e;
         if (e.status && e.status < 500) throw e;
         if (attempt === 1) await sleep(400);
       }
     }
     if (countsAsFailure(lastErr)) noteFail(key);
     throw lastErr;
   }
   
   async function getJSON(rawUrl, { ttl = 60000 } = {}, retried = false) {
     const url = fixRef(rawUrl);
     const hit = mem.get(url);
     if (hit && Date.now() - hit.t < hit.ttl) return hit.v;
   
     if (inflight.has(url)) {
       try { return await inflight.get(url); } catch (e) {
         // a shared promise that died from an abort must never be handed out again
         if (isAbort(e) && !retried) { inflight.delete(url); return getJSON(rawUrl, { ttl }, true); }
         throw e;
       }
     }
   
     const key = endpointKey(url);
     if ((health.get(key)?.until || 0) > Date.now()) { const e = new Error('endpoint down'); e.down = true; throw e; }
   
     const p = queued(() => runFetch(url, key, ttl)).finally(() => { if (inflight.get(url) === p) inflight.delete(url); });
     inflight.set(url, p);
     try { return await p; } catch (e) {
       if (isAbort(e) && !retried) { inflight.delete(url); return getJSON(rawUrl, { ttl }, true); }
       throw e;
     }
   }
   
   /* =====================================================================
      4. ENTITY INDEX — teams + players, cached 24h
         Order: hardcoded-team fallback for /teams, App.jsx's allPlayersCache
         first for players, then sb_index_v1, then /teams/{id}/roster.
      ===================================================================== */
   async function loadTeams(EP) {
     try {
       const j = await getJSON(`${EP.site}/teams`, { ttl: DAY });
       const list = (j?.sports?.[0]?.leagues?.[0]?.teams || []).map(({ team: t }) => ({
         id: String(t.id), abbr: t.abbreviation, name: t.displayName, nick: t.name, short: t.shortDisplayName, loc: t.location,
       }));
       if (list.length) return list;
       dbg('/teams returned no teams, using hardcoded list');
     } catch (e) {
       dbg(`/teams failed (${e?.name}: ${e?.message}), using hardcoded list`);
     }
     return FALLBACK_TEAMS.map((t) => ({ ...t }));
   }
   
   function parseRoster(j, t) {
     let list = j?.athletes || [];
     if (list[0]?.items) list = list.flatMap((g) => g.items || []);
     const players = list.map((a) => ({
       id: String(a.id), name: a.displayName || a.fullName || '', team: t.id, abbr: t.abbr, pos: a.position?.abbreviation || '',
       jersey: a.jersey || '', ht: a.displayHeight || '', wt: a.displayWeight || '', age: a.age ?? null,
       college: a.college?.name || '', exp: a.experience?.years ?? null, draft: a.draft?.displayText || '',
     }));
     const c = j?.coach?.[0];
     return { players, coach: c ? { name: `${c.firstName || ''} ${c.lastName || ''}`.trim(), exp: c.experience } : null };
   }
   const rosterOf = async (env, t) => parseRoster(await getJSON(`${env.EP.site}/teams/${t.id}/roster`, { ttl: DAY }), t);
   
   /* App.jsx's cache: tolerant of a bare array or a {ts, players|data|items} wrapper */
   function readAppPlayers(teams) {
     try {
       const raw = ls.get(APP_CACHE_KEY);
       if (!raw) return null;
       const arr = Array.isArray(raw) ? raw : (raw.players || raw.data || raw.items || raw.list || raw.value || null);
       if (!Array.isArray(arr) || !arr.length) return null;
       if (!Array.isArray(raw)) {
         const rawTs = raw.ts ?? raw.timestamp ?? raw.time ?? raw.savedAt ?? raw.fetchedAt ?? raw.cachedAt ?? raw.updatedAt;
         let ts = typeof rawTs === 'number' ? rawTs : rawTs ? Date.parse(rawTs) : 0;
         if (ts && ts < 1e12) ts *= 1000;
         if (ts && Date.now() - ts > DAY) { dbg('allPlayersCache is older than 24h, ignoring'); return null; }
       }
       const byAbbr = Object.fromEntries(teams.map((t) => [String(t.abbr).toUpperCase(), t]));
       const players = [];
       for (const a of arr) {
         const id = a?.id ?? a?.athleteId;
         const name = a?.name ?? a?.displayName ?? a?.fullName;
         const tv = a?.team;
         let ab = String((tv && typeof tv === 'object' ? (tv.abbreviation || tv.abbr) : tv) ?? a?.teamAbbr ?? a?.teamAbbreviation ?? a?.abbr ?? '').toUpperCase();
         ab = ABBR_ALIAS[ab] || ab;
         const t = byAbbr[ab];
         if (id == null || !name || !t) continue;
         const pos = a.position && typeof a.position === 'object' ? a.position.abbreviation : (a.position ?? a.pos ?? '');
         players.push({ id: String(id), name: String(name), team: t.id, abbr: t.abbr, pos: pos || '', jersey: a.jersey || '', ht: a.displayHeight || '', wt: a.displayWeight || '', age: a.age ?? null, college: '', exp: null, draft: '' });
       }
       if (players.length < 100) return null; // looks partial; don't trust it
       dbg(`using ${players.length} players from ${APP_CACHE_KEY}`);
       return players;
     } catch (e) { return null; }
   }
   
   async function buildIndex(EP) {
     const teams = await loadTeams(EP);
   
     const fromApp = readAppPlayers(teams);
     if (fromApp) return { ts: Date.now(), teams, players: fromApp, coaches: {}, src: 'app' };
   
     const cached = ls.get(IDX_KEY);
     if (cached?.players?.length && Date.now() - cached.ts < DAY) return cached;
   
     const players = [];
     const coaches = {};
     await pool(teams, 5, async (t) => {
       try {
         const r = parseRoster(await getJSON(`${EP.site}/teams/${t.id}/roster`, { ttl: DAY }), t);
         players.push(...r.players);
         if (r.coach) coaches[t.id] = r.coach;
       } catch (e) { dbg(`roster ${t.abbr} failed (${e?.name}: ${e?.message})`); }
     });
     if (!players.length) { if (cached?.players?.length) return cached; throw new Error('no rosters'); }
     const out = { ts: Date.now(), teams, players, coaches };
     ls.set(IDX_KEY, out);
     return out;
   }
   
   function prepareIndex(raw) {
     const teams = raw.teams.map((t) => {
       const al = new Set([norm(t.name), norm(t.nick), norm(t.short)]);
       if (t.loc && !/^(los angeles|new york)$/i.test(t.loc)) al.add(norm(t.loc));
       if (t.abbr && t.abbr.length >= 3 && norm(t.abbr) !== 'min') al.add(norm(t.abbr));
       (TEAM_EXTRA[t.abbr] || []).forEach((x) => al.add(x));
       al.delete('');
       return { ...t, aliases: [...al].sort((a, b) => b.length - a.length) };
     });
     const players = raw.players.map((p) => {
       const nn = norm(p.name).replace(/\s(jr|sr|ii|iii|iv)$/, '');
       const parts = nn.split(' ');
       return { ...p, nn, first: parts[0], last: parts[parts.length - 1] };
     });
     const teamWords = new Set(teams.flatMap((t) => t.aliases.flatMap((a) => a.split(' '))));
     return { ...raw, teams, players, teamWords, byId: Object.fromEntries(players.map((p) => [p.id, p])), teamById: Object.fromEntries(teams.map((t) => [t.id, t])) };
   }
   
   /* ESPN search fallback when the roster index has no match */
   async function searchPlayer(EP, lg, text) {
     try {
       const j = await getJSON(`${EP.search}?query=${encodeURIComponent(text)}&limit=5`, { ttl: DAY });
       const hits = (j?.results || []).flatMap((r) => r.contents || []);
       for (const h of hits) {
         const m = String(h.uid || '').match(/~l:(\d+)~a:(\d+)/);
         if (m && m[1] === lg.espnLeagueId) return { id: m[2], name: h.displayName || text, team: null, abbr: '', pos: '' };
       }
     } catch (e) { /* fall through */ }
     return null;
   }
   
   /* =====================================================================
      5. PARSER — rule-based entity extraction (no LLM)
      ===================================================================== */
   const STOP = new Set(('the and for was were are has have had did does how many much what whats who whom when where which with from this that his her him their them they last night game games over under against home away road points point rebounds assists threes steals blocks average avg season career tonight today yesterday playoffs time times first second third fourth quarter line lines spread stats stat about also just than more less most best top lead leads league nba team teams player players ever give show tell please plays play pick picks score scored scoring get got make made make shot shots defend defends defense defensive guards forwards centers bigs wings numbers change production highest biggest lowest smallest closest tightest prop props bet bets edges').split(' '));
   
   const STATS = {
     pra: { key: 'pra', label: 'PRA', parts: ['pts', 'reb', 'ast'], re: /\bpra\b|pts\+reb\+ast|points rebounds (?:and )?assists/ },
     pr: { key: 'pr', label: 'Pts+Reb', parts: ['pts', 'reb'], re: /\bpr\b|pts\+reb|points (?:and )?rebounds/ },
     pa: { key: 'pa', label: 'Pts+Ast', parts: ['pts', 'ast'], re: /\bpa\b|pts\+ast|points (?:and )?assists/ },
     ra: { key: 'ra', label: 'Reb+Ast', parts: ['reb', 'ast'], re: /\bra\b|reb\+ast|rebounds (?:and )?assists/ },
     fgp: { key: 'fgp', label: 'FG%', pct: ['fgm', 'fga'], re: /(?:^|\s)fg ?%|field goal (?:percentage|pct|%)|\bfg pct\b/ },
     tpp: { key: 'tpp', label: '3P%', pct: ['tpm', 'tpa'], re: /3p ?%|3pt ?%|(?:three|3) point (?:percentage|pct|%)|3p pct/ },
     ftp: { key: 'ftp', label: 'FT%', pct: ['ftm', 'fta'], re: /ft ?%|free throw (?:percentage|pct|%)|ft pct/ },
     td: { key: 'td', label: 'triple-doubles', dbl: 3, re: /triple[- ]?doubles?|\btd\b/ },
     dd: { key: 'dd', label: 'double-doubles', dbl: 2, re: /double[- ]?doubles?|\bdd\b/ },
     tpm: { key: 'tpm', label: '3PM', parts: ['tpm'], re: /\b(?:threes?|3pm|3s|3-?pointers?|3 pointers?|three pointers?|treys?)\b/ },
     stl: { key: 'stl', label: 'steals', parts: ['stl'], re: /\b(?:steals?|stls?|spg)\b/ },
     blk: { key: 'blk', label: 'blocks', parts: ['blk'], re: /\b(?:blocks?|blks?|bpg)\b/ },
     to: { key: 'to', label: 'turnovers', parts: ['to'], re: /\b(?:turnovers?|tovs?)\b/ },
     reb: { key: 'reb', label: 'rebounds', parts: ['reb'], re: /\b(?:rebounds?|rebs?|boards?|rpg)\b/ },
     ast: { key: 'ast', label: 'assists', parts: ['ast'], re: /\b(?:assists?|asts?|dimes?|apg)\b/ },
     min: { key: 'min', label: 'minutes', parts: ['min'], re: /\b(?:minutes?|mins|mpg)\b/ },
     pts: { key: 'pts', label: 'points', parts: ['pts'], re: /\b(?:points?|pts|scor(?:e|ed|es|ing)|buckets|ppg)\b/ },
   };
   const STAT_ORDER = ['pra', 'pr', 'pa', 'ra', 'fgp', 'tpp', 'ftp', 'td', 'dd', 'tpm', 'stl', 'blk', 'to', 'reb', 'ast', 'min', 'pts'];
   const dblCount = (r) => [r.pts, r.reb, r.ast, r.stl, r.blk].filter((v) => v >= 10).length;
   const rowVal = (r, def) => (def.dbl ? (dblCount(r) >= def.dbl ? 1 : 0) : def.parts.reduce((a, k) => a + (r[k] || 0), 0));
   const aggVal = (rows, def) => {
     if (!rows.length) return null;
     if (def.pct) { const a = rows.reduce((s, r) => s + (r[def.pct[1]] || 0), 0); return a ? (rows.reduce((s, r) => s + (r[def.pct[0]] || 0), 0) / a) * 100 : null; }
     return rows.reduce((s, r) => s + rowVal(r, def), 0) / rows.length;
   };
   const test = (v, cmp, thr) => (cmp === '>' ? v > thr : cmp === '>=' ? v >= thr : cmp === '<' ? v < thr : cmp === '<=' ? v <= thr : false);
   const CMP_WORD = { '>': 'over', '>=': 'at least', '<': 'under', '<=': 'at most' };
   const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
   const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
   
   function parseCmp(n) {
     let m;
     if ((m = n.match(/\b(?:at least|no less than|minimum of)\s+(\d+(?:\.\d+)?)/))) return { cmp: '>=', thr: +m[1] };
     if ((m = n.match(/(\d+(?:\.\d+)?)\s*(?:\+|or more|or better|or higher|plus|and up)/))) return { cmp: '>=', thr: +m[1] };
     if ((m = n.match(/\b(?:over|more than|greater than|above|exceeded?|exceeding|topped|beyond)\s+(\d+(?:\.\d+)?)/))) return { cmp: '>', thr: +m[1] };
     if ((m = n.match(/(\d+(?:\.\d+)?)\s*(?:or fewer|or less|or lower|and under)/))) return { cmp: '<=', thr: +m[1] };
     if ((m = n.match(/\b(?:at most|no more than|max of)\s+(\d+(?:\.\d+)?)/))) return { cmp: '<=', thr: +m[1] };
     if ((m = n.match(/\b(?:under|less than|fewer than|below|lower than)\s+(\d+(?:\.\d+)?)/))) return { cmp: '<', thr: +m[1] };
     if (/\b(?:times|games|how often|how many)\b/.test(n) && (m = n.match(/\b(?:scored|had|got|hit|made|recorded|dropped|put up)\s+(\d+(?:\.\d+)?)\b/))) return { cmp: '>=', thr: +m[1] };
     return null;
   }
   
   function parseDate(n, today) {
     if (/\b(last night|last game|most recent|latest game)\b/.test(n)) return { kind: 'last' };
     if (/\byesterday\b/.test(n)) return { kind: 'date', iso: shiftISO(today, -1) };
     if (/\b(today|tonight|right now)\b/.test(n)) return { kind: 'today', iso: today };
     const m = n.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
     if (m) {
       const mo = MONTHS.indexOf(m[1]) + 1;
       let y = +today.slice(0, 4);
       let iso = `${y}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
       if (iso > today) { y -= 1; iso = `${y}-${iso.slice(5)}`; }
       return { kind: 'date', iso };
     }
     return null;
   }
   
   function findTeams(n, idx) {
     const padded = ` ${n} `;
     const found = [];
     for (const t of idx.teams) {
       for (const a of t.aliases) {
         const i = padded.indexOf(` ${a} `);
         if (i >= 0) { found.push({ team: t, i }); break; }
       }
     }
     return found.sort((a, b) => a.i - b.i).map((x) => ({ team: x.team }));
   }
   
   function findPlayers(n, idx, ctx) {
     const padded = ` ${n} `;
     const out = [];
     const add = (p) => { if (p && !out.some((o) => o.id === p.id)) out.push(p); };
     for (const p of idx.players) if (p.nn.length > 4 && padded.includes(` ${p.nn} `)) add(p);
     let rest = n;
     for (const p of out) rest = rest.replace(p.nn, ' ');
     const toks = rest.split(' ').filter(Boolean);
   
     if (!out.length) {
       let best = null;
       for (let i = 0; i < toks.length - 1; i++) {
         const a = toks[i], b = toks[i + 1];
         if (a.length < 3 || b.length < 3 || STOP.has(a) || STOP.has(b)) continue;
         const s = `${a} ${b}`;
         for (const p of idx.players) { const sc = sim(s, p.nn); if (!best || sc > best.sc) best = { sc, p, s }; }
       }
       if (best && best.sc >= 0.78) return best.sc >= 0.9 ? { list: [best.p], note: `Did you mean ${best.p.name}? Showing ${best.p.name}.` } : { ask: best.p, heard: best.s };
     }
   
     const cands = toks.filter((w) => w.length >= 3 && !STOP.has(w) && !idx.teamWords.has(w));
     for (const w of cands) {
       let c = idx.players.filter((p) => p.last === w);
       if (!c.length && w.length >= 6) c = idx.players.filter((p) => p.first === w);
       if (c.length === 1) add(c[0]);
       else if (c.length > 1) {
         const pick = ctx?.player && c.find((x) => x.id === ctx.player.id);
         if (pick) add(pick); else return { ambiguous: c.slice(0, 6), heard: w };
       }
     }
     if (out.length) return { list: out.slice(0, 3) };
   
     for (const w of cands) {
       if (w.length < 5) continue;
       let best = null;
       for (const p of idx.players) { const sc = Math.max(sim(w, p.last), sim(w, p.first)); if (!best || sc > best.sc) best = { sc, p }; }
       if (best && best.sc >= 0.85) return { ask: best.p, heard: w };
     }
     return { list: [] };
   }
   
   function parseQuestion(raw, env, ctx) {
     const idx = env.idx;
     let n = norm(raw);
     for (const [k, v] of NICK) n = n.replace(new RegExp(`\\b${esc(k)}\\b`, 'g'), v);
     n = n.replace(/\b(last|past|previous)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/g, (m, a, w) => `${a} ${WORDNUM[w]}`);
   
     const nMatch = n.match(/\b(?:last|past|previous)\s+(\d{1,2})\b(?!\s*(?:minutes?|mins?|seconds?))/);
     const N = nMatch ? Math.min(+nMatch[1], 40) : null;
     const nClean = nMatch ? n.replace(nMatch[0], ' ') : n;
   
     const found = findPlayers(n, idx, ctx);
     const teams = findTeams(n, idx);
     let player = found.list?.[0] || null;
     const players = found.list || [];
     let fromCtx = false;
     if (!player && !found.ask && !found.ambiguous && /\b(he|his|him|himself|they|their|them)\b/.test(n) && ctx?.player) { player = ctx.player; players.push(player); fromCtx = true; }
   
     let stat = null;
     for (const k of STAT_ORDER) if (STATS[k].re.test(n)) { stat = STATS[k]; break; }
   
     const cmpInfo = parseCmp(nClean) || {};
     const home = /\b(at home|home games?|home)\b/.test(n);
     const away = /\b(away|road|on the road)\b/.test(n);
     const scope = /\bcareer\b|all time/.test(n) ? 'career' : /\bthis (season|year)\b|so far this/.test(n) ? 'season' : null;
   
     const p = {
       raw, n, N, stat, player, players, teams, scope,
       cmp: cmpInfo.cmp || null, thr: cmpInfo.thr ?? null,
       date: parseDate(n, env.today), loc: home && away ? 'split' : home ? 'home' : away ? 'away' : null,
       note: found.note || null, ask: found.ask ? { player: found.ask, heard: found.heard } : null,
       ambiguous: found.ambiguous ? { list: found.ambiguous, heard: found.heard } : null,
     };
     if (fromCtx) { if (!p.date && ctx.date) p.date = ctx.date; if (!p.stat && ctx.stat) p.stat = STATS[ctx.stat] || null; }
     return p;
   }
   
   /* =====================================================================
      6. GAME-LOG + BOX-SCORE PARSING (map by label, never by index)
      ===================================================================== */
   function parseGamelog(json) {
     const names = (json?.names || json?.labels || []).map((s) => String(s).toLowerCase());
     const at = (...ks) => { for (const k of ks) { const i = names.indexOf(k.toLowerCase()); if (i >= 0) return i; } return -1; };
     const I = {
       min: at('minutes', 'min'), fg: at('fieldGoalsMade-fieldGoalsAttempted', 'fg'),
       tp: at('threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3pt', 'threePointFieldGoalsMade'),
       ft: at('freeThrowsMade-freeThrowsAttempted', 'ft'), reb: at('totalRebounds', 'rebounds', 'reb'), ast: at('assists', 'ast'),
       blk: at('blocks', 'blk'), stl: at('steals', 'stl'), to: at('turnovers', 'to'), pts: at('points', 'pts'), pf: at('fouls', 'pf'),
     };
     const meta = json?.events || {};
     const seen = new Map();
     for (const st of json?.seasonTypes || []) {
       const nm = String(st?.displayName || '');
       if (/preseason/i.test(nm)) continue;
       const playoff = /post|playoff/i.test(nm);
       for (const cat of st?.categories || []) {
         for (const ev of cat?.events || []) {
           const s = ev.stats || [];
           const m = meta[ev.eventId] || {};
           const min = I.min >= 0 ? Number(s[I.min]) : 1;
           if (I.min >= 0 && !min) continue; // DNP: no stat line is not a zero
           const made = (i) => (i >= 0 ? Number(String(s[i]).split('-')[0]) || 0 : 0);
           const att = (i) => (i >= 0 ? Number(String(s[i]).split('-')[1]) || 0 : 0);
           seen.set(String(ev.eventId), {
             id: String(ev.eventId), date: m.gameDate || '', opp: m.opponent?.abbreviation || '', oppId: m.opponent?.id ? String(m.opponent.id) : null,
             home: m.atVs ? m.atVs !== '@' : null, playoff, result: m.gameResult || '', min,
             pts: made(I.pts), reb: made(I.reb), ast: made(I.ast), stl: made(I.stl), blk: made(I.blk), to: made(I.to), pf: made(I.pf),
             fgm: made(I.fg), fga: att(I.fg), tpm: made(I.tp), tpa: att(I.tp), ftm: made(I.ft), fta: att(I.ft),
           });
         }
       }
     }
     return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
   }
   
   async function loadLog(env, playerId, seasons) {
     const cur = seasonNow();
     const years = Array.from({ length: seasons }, (_, i) => cur - i);
     const base = `${env.EP.common}/athletes/${playerId}/gamelog`;
     const out = [];
     for (let i = 0; i < years.length; i += 4) {
       const batch = years.slice(i, i + 4);
       const res = await Promise.all(batch.map((y) =>
         getJSON(y === cur ? base : `${base}?season=${y}`, { ttl: y === cur ? MIN5 : DAY }).then(parseGamelog).catch(() => [])));
       const count = res.reduce((a, r) => a + r.length, 0);
       out.push(...res.flat());
       if (count === 0 && i > 0) break;
     }
     const seen = new Map(out.map((r) => [r.id, r]));
     return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
   }
   
   function boxLine(sum, id) {
     for (const t of sum?.boxscore?.players || []) {
       for (const grp of t.statistics || []) {
         const labels = (grp.labels || []).map((s) => String(s).toUpperCase());
         for (const a of grp.athletes || []) {
           if (String(a.athlete?.id) !== String(id)) continue;
           if (a.didNotPlay || !(a.stats || []).length) return { dnp: true, reason: a.reason || '' };
           const g = (k) => { const i = labels.indexOf(k); return i >= 0 ? a.stats[i] : null; };
           const m = (k) => Number(String(g(k)).split('-')[0]) || 0;
           const at = (k) => Number(String(g(k)).split('-')[1]) || 0;
           return { dnp: false, starter: !!a.starter, teamId: String(t.team?.id), min: Number(g('MIN')) || 0, pts: m('PTS'), reb: m('REB'), ast: m('AST'), stl: m('STL'), blk: m('BLK'), to: m('TO'), pf: m('PF'), fgm: m('FG'), fga: at('FG'), tpm: m('3PT'), tpa: at('3PT'), ftm: m('FT'), fta: at('FT') };
         }
       }
     }
     return null;
   }
   
   function boxRows(sum) {
     return (sum?.boxscore?.players || []).map((t) => {
       const grp = t.statistics?.[0] || {};
       const labels = (grp.labels || []).map((s) => String(s).toUpperCase());
       const col = (a, k) => { const i = labels.indexOf(k); return i >= 0 ? a.stats?.[i] : null; };
       return {
         teamId: String(t.team?.id), abbr: t.team?.abbreviation || '',
         rows: (grp.athletes || []).filter((a) => !a.didNotPlay && (a.stats || []).length).map((a) => ({
           id: String(a.athlete?.id), name: a.athlete?.displayName || '', pos: a.athlete?.position?.abbreviation || '', starter: !!a.starter,
           min: Number(col(a, 'MIN')) || 0, pts: Number(col(a, 'PTS')) || 0, reb: Number(col(a, 'REB')) || 0, ast: Number(col(a, 'AST')) || 0,
         })),
       };
     });
   }
   
   /* ---------- events (scoreboard + schedule share one shape) ---------- */
   function normEvent(e) {
     const c = e?.competitions?.[0] || {};
     const st = (c.status || e?.status)?.type || {};
     const teams = (c.competitors || []).map((x) => {
       const t = x.team || {};
       const sc = x.score && typeof x.score === 'object' ? (x.score.displayValue ?? x.score.value) : x.score;
       return {
         id: String(t.id ?? x.id), abbr: t.abbreviation || '', name: t.displayName || '', home: x.homeAway === 'home',
         score: sc == null || sc === '' ? null : Number(sc), winner: x.winner, lines: (x.linescores || []).map((l) => l.displayValue ?? l.value), rec: x.records?.[0]?.summary || '',
       };
     });
     return {
       id: String(e.id), date: e.date || c.date, iso: isoOf(e.date || c.date), state: st.state || (st.completed ? 'post' : 'pre'),
       completed: !!st.completed, detail: st.shortDetail || st.detail || '', teams, away: teams.find((x) => !x.home), home: teams.find((x) => x.home),
       odds: c.odds?.[0] || null, tv: c.broadcasts || [], geo: c.geoBroadcasts || [],
     };
   }
   const board = async (env, iso) => (await getJSON(`${env.EP.site}/scoreboard?dates=${ymd(iso)}`, { ttl: iso >= env.today ? LIVE : DAY }))?.events?.map(normEvent) || [];
   const teamSched = async (env, teamId) => ((await getJSON(`${env.EP.site}/teams/${teamId}/schedule`, { ttl: MIN5 }))?.events || []).map(normEvent);
   const mineOf = (ev, teamId) => ev.teams.find((t) => t.id === String(teamId));
   const otherOf = (ev, teamId) => ev.teams.find((t) => t.id !== String(teamId));
   const gameLabel = (ev, teamId) => {
     const m = mineOf(ev, teamId), o = otherOf(ev, teamId);
     if (!m || !o) return ev.teams.map((t) => t.abbr).join(' vs ');
     const res = ev.state === 'post' && m.score != null && o.score != null ? ` (${m.score > o.score ? 'W' : 'L'} ${m.score}-${o.score})` : '';
     return `${m.abbr} ${m.home ? 'vs' : '@'} ${o.abbr}${res}`;
   };
   
   async function resolveGame(env, teamId, date) {
     const pick = (evs) => evs.find((e) => e.teams.some((t) => t.id === String(teamId)));
     if (date?.kind === 'today' || date?.kind === 'date') {
       const ev = pick(await board(env, date.iso));
       return ev ? { ev } : { msg: `I couldn't find a game for that team on ${fmtDay(date.iso)}.` };
     }
     if (date?.kind !== 'last') { const t = pick(await board(env, env.today)); if (t && t.state !== 'pre') return { ev: t }; }
     const done = (await teamSched(env, teamId)).filter((e) => e.completed);
     const last = done[done.length - 1];
     return last ? { ev: last } : { msg: 'No completed games found yet this season.' };
   }
   
   const summary = (env, id, ttl = LIVE) => getJSON(`${env.EP.site}/summary?event=${id}`, { ttl });
   
   /* =====================================================================
      7. PROP LINES — DraftKings propBets (same parsing as Betting.jsx) + snapshots
      ===================================================================== */
   const PROP_LABEL = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', pr: 'Pts+Reb', pa: 'Pts+Ast', pra: 'PRA', tpm: '3PM' };
   const SNAP_KEY = 'sb_props_v1';
   
   function propKey(rawName) {
     const name = String(rawName || '').toLowerCase();
     if (!name) return null;
     if (/milestone|first|to score|to record|double|triple|race|steal|block|turnover|quarter|half|\d\s*\+/.test(name)) return null;
     const hasTpm = /3-point|3 point|three/.test(name);
     const rest = name.replace(/3-point|3 point|three[- ]point|three/g, '');
     const set = [];
     if (/point|pts/.test(rest)) set.push('pts');
     if (/rebound|reb/.test(rest)) set.push('reb');
     if (/assist|ast/.test(rest)) set.push('ast');
     if (hasTpm) return set.length ? null : 'tpm';
     return { pts: 'pts', reb: 'reb', ast: 'ast', 'pts+reb': 'pr', 'pts+ast': 'pa', 'pts+reb+ast': 'pra' }[set.join('+')] || null;
   }
   const readSide = (it) => {
     for (const c of [it?.odds?.total?.alternateDisplayValue, it?.odds?.total?.displayValue, it?.odds?.total?.value, it?.side, it?.type?.name, it?.type?.displayName, it?.current?.target?.description]) {
       const s = String(c ?? '').trim().toLowerCase();
       if (/^o(ver)?\b|^o\d|\bover\b/.test(s)) return 'over';
       if (/^u(nder)?\b|^u\d|\bunder\b/.test(s)) return 'under';
     }
     return null;
   };
   const readLine = (it) => {
     const a = it?.current?.target?.value;
     if (a != null && !Number.isNaN(Number(a))) return Number(a);
     const t = String(it?.odds?.total?.value ?? '').match(/[\d.]+/);
     return t ? Number(t[0]) : null;
   };
   const readPrice = (it) => { const v = it?.odds?.american?.value ?? it?.odds?.american?.displayValue; const n = Number(String(v ?? '').replace('+', '')); return Number.isNaN(n) ? null : n; };
   
   function parseProps(items) {
     const groups = new Map();
     for (const it of items) {
       const key = propKey(it?.type?.name);
       if (!key) continue;
       const aid = idFromRef(it?.athlete?.$ref, 'athletes') || it?.athlete?.id;
       const line = readLine(it);
       if (!aid || line == null) continue;
       const gk = `${aid}|${key}`;
       if (!groups.has(gk)) groups.set(gk, { aid: String(aid), key, lines: new Map() });
       const g = groups.get(gk);
       if (!g.lines.has(line)) g.lines.set(line, { over: null, under: null });
       const side = readSide(it);
       if (side) g.lines.get(line)[side] = readPrice(it);
     }
     const out = [];
     for (const g of groups.values()) {
       const entries = [...g.lines.entries()];
       const scored = entries.filter(([, p]) => p.over != null && p.under != null)
         .map(([line, p]) => ({ line, p, s: Math.abs(p.over + 110) + Math.abs(p.under + 110) })).sort((a, b) => a.s - b.s);
       let line, prices;
       if (scored.length) { line = scored[0].line; prices = scored[0].p; }
       else { const sorted = entries.sort((a, b) => a[0] - b[0]); [line, prices] = sorted[Math.floor(sorted.length / 2)]; }
       out.push({ aid: g.aid, key: g.key, line, over: prices.over, under: prices.under });
     }
     return out;
   }
   
   async function fetchGameProps(env, gameId) {
     const url = (page) => `${env.EP.core}/events/${gameId}/competitions/${gameId}/odds/${env.lg.propProvider}/propBets?lang=en&region=us&limit=1000&page=${page}`;
     try {
       const first = await getJSON(url(1), { ttl: MIN5 });
       let items = first.items || [];
       for (let pg = 2; pg <= Math.min(first.pageCount || 1, 5); pg++) items = items.concat((await getJSON(url(pg), { ttl: MIN5 })).items || []);
       return parseProps(items);
     } catch (e) { return []; }
   }
   
   function saveSnap(env, iso, gid, list) {
     const s = ls.get(SNAP_KEY, {});
     const m = {};
     for (const r of list) (m[r.aid] = m[r.aid] || {})[r.key] = [r.line, r.over, r.under];
     (s[iso] = s[iso] || {})[gid] = { ts: Date.now(), m };
     const cutoff = shiftISO(env.today, -14);
     Object.keys(s).forEach((d) => { if (d < cutoff) delete s[d]; });
     while (JSON.stringify(s).length > 900000 && Object.keys(s).length > 1) delete s[Object.keys(s).sort()[0]];
     ls.set(SNAP_KEY, s);
   }
   function snapFor(iso, aid) {
     const day = ls.get(SNAP_KEY, {})[iso];
     if (!day) return null;
     for (const g of Object.values(day)) if (g.m?.[aid]) return { props: g.m[aid], ts: g.ts };
     return null;
   }
   let snapshotting = false;
   async function snapshotTonight(env) {
     if (snapshotting || Date.now() - (ls.get('sb_lastsnap', 0) || 0) < 90 * 60000) return;
     snapshotting = true;
     try {
       const pre = (await board(env, env.today)).filter((e) => e.state === 'pre');
       await pool(pre, 2, async (g) => { const list = await fetchGameProps(env, g.id); if (list.length) saveSnap(env, env.today, g.id, list); });
       ls.set('sb_lastsnap', Date.now());
     } catch (e) { /* best effort */ } finally { snapshotting = false; }
   }
   const price = (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
   
   /* =====================================================================
      8. INTENT HANDLERS
      ===================================================================== */
   const A = (text, blocks = [], x = {}) => ({ text, blocks, ...x });
   const needPlayer = (p) => A(p.players.length ? '' : 'Which player do you mean? Include a name, like "Jaylen Brown".');
   const teamOfPlayer = (p, env) => env.idx.teamById[p.player.team];
   const asOpps = (p) => p.teams.filter((t) => t.team.id !== p.player?.team);
   const scopeSeasons = (p, dflt = 3) => (p.scope === 'career' ? 15 : p.scope === 'season' ? 1 : dflt);
   const scopeText = (p, dflt = 3) => (p.scope === 'career' ? 'his career (up to 15 seasons of ESPN logs)' : p.scope === 'season' ? 'this season' : `the last ${dflt} seasons`);
   const tbl = (head, rows) => ({ t: 'table', head, rows });
   const cards = (items) => ({ t: 'cards', items });
   const dateCell = (r) => fmtDay(isoOf(r.date));
   
   /* ---- 1. a player's stat in a game ---- */
   async function hGameStat(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const got = await resolveGame(env, pl.team, p.date);
     if (got.msg) return A(got.msg, [], { ctx: { player: pl } });
     const ev = got.ev;
     const ctx = { player: pl, date: p.date, game: { id: ev.id, iso: ev.iso } };
     if (ev.state === 'pre') return A(`${pl.name}'s game (${gameLabel(ev, pl.team)}) hasn't started. Tipoff is ${fmtTime(ev.date)}.`, [], { ctx });
     const sum = await summary(env, ev.id);
     const b = boxLine(sum, pl.id);
     const where = `${gameLabel(ev, pl.team)} on ${fmtDay(ev.iso)}`;
     if (!b || b.dnp) return A(`${pl.name} did not play in ${where}${b?.reason ? ` (${b.reason})` : ''}. A DNP has no stat line, so it is not counted as zero.`, [], { ctx });
     const live = ev.state === 'in' ? ` The game is live (${ev.detail}), so these numbers can still change.` : '';
     const def = p.stat;
     let lead = `Here is ${pl.name}'s line from ${where}.`;
     if (def) {
       const v = def.pct ? aggVal([b], def) : def.dbl ? (dblCount(b) >= def.dbl ? 'Yes' : 'No') : rowVal(b, def);
       lead = def.dbl ? `${pl.name}: ${def.label.replace(/s$/, '')} in ${where}? **${v}**.` : `${pl.name} had **${def.pct ? `${f1(v)}%` : v} ${def.pct ? def.label : def.label.toLowerCase()}** in ${where}.`;
     }
     return A(lead + live, [
       { t: 'people', rows: [{ id: pl.id, name: pl.name, sub: `${pl.abbr} ${pl.pos}` }] },
       cards([{ k: 'PTS', v: b.pts }, { k: 'REB', v: b.reb }, { k: 'AST', v: b.ast }, { k: 'MIN', v: b.min }, { k: 'FG', v: `${b.fgm}-${b.fga}` }, { k: '3PT', v: `${b.tpm}-${b.tpa}` }]),
     ], { ctx });
   }
   
   /* ---- 2. prop line (tonight live; past nights from saved snapshots) ---- */
   async function hPropLine(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const got = await resolveGame(env, pl.team, p.date || { kind: 'today', iso: env.today });
     if (got.msg) return A(got.msg);
     const ev = got.ev, iso = ev.iso;
     const ctx = { player: pl, date: p.date, game: { id: ev.id, iso } };
     let snap = snapFor(iso, pl.id);
     if (!snap && iso === env.today) {
       const list = await fetchGameProps(env, ev.id);
       if (list.length) { saveSnap(env, iso, ev.id, list); snap = snapFor(iso, pl.id); }
     }
     if (!snap) {
       return A(iso === env.today
         ? `ESPN has no prop lines posted for ${pl.name} yet.`
         : `I can't give you ${pl.name}'s line for ${fmtDay(iso)}. ESPN doesn't return lines for past games, and SlateBot hadn't saved a snapshot that night. It now saves each night's lines whenever it is opened, so this will work going forward.`, [], { ctx });
     }
     let b = null;
     if (ev.state !== 'pre') { try { b = boxLine(await summary(env, ev.id), pl.id); } catch (e) { /* optional */ } }
     if (p.stat && !PROP_LABEL[p.stat.key]) return A(`ESPN doesn't post ${p.stat.label} lines for players that I can read. I can show his points, rebounds, assists, 3PM or combined lines instead.`, [], { ctx });
     const def = p.stat && PROP_LABEL[p.stat.key] ? p.stat : null;
     const foot = { betting: true, provider: 'DraftKings', stamp: fmtTime(snap.ts) };
     if (def) {
       const [line, over, under] = snap.props[def.key] || [];
       if (line == null) return A(`No ${PROP_LABEL[def.key]} line is saved for ${pl.name} in ${gameLabel(ev, pl.team)}.`, [], { ctx, ...foot });
       let res = '';
       if (b && !b.dnp) { const v = rowVal(b, def); res = ` He finished with **${v}**: ${v > line ? 'the over hit' : v < line ? 'the under hit' : 'a push'}.`; }
       return A(`${pl.name}'s ${PROP_LABEL[def.key]} line for ${gameLabel(ev, pl.team)} (${fmtDay(iso)}) was **${line}** (over ${price(over)} / under ${price(under)}).${res}`, [], { ctx: { ...ctx, stat: def.key }, ...foot });
     }
     const rows = Object.entries(snap.props).map(([k, [line, o, u]]) => {
       let r = '–';
       if (b && !b.dnp) { const v = rowVal(b, STATS[k]); r = `${v} (${v > line ? 'O' : v < line ? 'U' : 'push'})`; }
       return [PROP_LABEL[k], line, price(o), price(u), r];
     });
     return A(`Saved lines for ${pl.name} in ${gameLabel(ev, pl.team)} (${fmtDay(iso)}).`, [tbl(['Prop', 'Line', 'Over', 'Under', 'Result'], rows)], { ctx, ...foot });
   }
   
   /* ---- 3. threshold history (with optional opponent) ---- */
   async function hThreshold(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const def = p.stat || STATS.pts;
     const rows = await loadLog(env, pl.id, scopeSeasons(p));
     const opps = asOpps(p);
     let sel = opps.length ? rows.filter((r) => opps.some((o) => r.oppId === o.team.id)) : rows;
     if (p.loc === 'home' || p.loc === 'away') sel = sel.filter((r) => r.home === (p.loc === 'home'));
     const ctx = { player: pl, stat: def.key, cmp: p.cmp, thr: p.thr, teams: opps.map((o) => o.team.id), loc: p.loc, scope: p.scope };
     if (!sel.length) return A(`I found no games for ${pl.name}${opps.length ? ` against ${opps.map((o) => o.team.name).join(' / ')}` : ''} in ${scopeText(p)}.`, [], { ctx });
     const vs = opps.length ? ` against the ${opps.map((o) => o.team.nick).join('/')}` : '';
     const hit = (r) => (def.dbl ? rowVal(r, def) === 1 : test(rowVal(r, def), p.cmp, p.thr));
     const hits = sel.filter(hit);
     const list = sel.slice(0, 40).map((r) => ({ d: dateCell(r), o: `${r.home === false ? '@' : r.home ? 'vs' : ''} ${r.opp}`.trim(), v: def.dbl ? (rowVal(r, def) ? 'Yes' : 'No') : f1(rowVal(r, def)), hit: hit(r) }));
     const chartRows = sel.slice(0, 20).reverse();
     const crit = def.dbl ? def.label : `${CMP_WORD[p.cmp]} ${p.thr} ${def.label}`;
     const blocks = [cards([{ k: 'Hit', v: `${hits.length}/${sel.length}` }, { k: 'Hit %', v: `${Math.round((hits.length / sel.length) * 100)}%` }, ...(def.dbl ? [] : [{ k: 'Avg', v: f1(aggVal(sel, def)) }, { k: 'High', v: Math.max(...sel.map((r) => rowVal(r, def))) }])])];
     if (!def.dbl) blocks.push({ t: 'chart', vals: chartRows.map((r) => rowVal(r, def)), labels: chartRows.map(dateCell), line: p.thr, title: `${def.label} · last ${chartRows.length}${vs ? ' vs' + vs.replace(' against', '') : ''}` });
     blocks.push({ t: 'games', title: `Show all ${sel.length} games`, head: ['Date', 'Opp', def.label], rows: list });
     return A(`${pl.name} has had **${hits.length} of ${sel.length}** games${vs} with ${crit} (${Math.round((hits.length / sel.length) * 100)}%) over ${scopeText(p)}, regular season and playoffs.`, blocks, { ctx });
   }
   
   /* ---- 15. career highs / last time ---- */
   async function hCareerHigh(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const def = p.stat || STATS.pts;
     const lastTime = /last time/.test(p.n);
     const rows = await loadLog(env, pl.id, p.scope === 'season' ? 1 : lastTime ? 8 : 15);
     const ctx = { player: pl, stat: def.key };
     if (!rows.length) return A(`ESPN returned no game logs for ${pl.name}.`, [], { ctx });
     if (lastTime && p.thr != null) {
       const r = rows.find((x) => test(rowVal(x, def), p.cmp || '>=', p.thr));
       return A(r ? `The last time ${pl.name} had ${CMP_WORD[p.cmp || '>=']} ${p.thr} ${def.label} was **${fmtDay(isoOf(r.date))}** ${r.home === false ? '@' : 'vs'} ${r.opp} (${f1(rowVal(r, def))}).` : `I found no game with ${CMP_WORD[p.cmp || '>=']} ${p.thr} ${def.label} in the ${rows.length} games ESPN has on file for him.`, [], { ctx });
     }
     const top = [...rows].sort((a, b) => rowVal(b, def) - rowVal(a, def)).slice(0, 5);
     const best = top[0];
     return A(`${pl.name}'s ${p.scope === 'season' ? 'best game this season' : 'career high'} in ${def.label} is **${f1(rowVal(best, def))}**, on ${fmtDay(isoOf(best.date))} ${best.home === false ? '@' : 'vs'} ${best.opp}. This covers the ${rows.length} games ESPN has on file.`,
       [tbl(['Date', 'Opp', def.label, 'PTS', 'REB', 'AST'], top.map((r) => [dateCell(r), `${r.home === false ? '@' : 'vs'} ${r.opp}`, f1(rowVal(r, def)), r.pts, r.reb, r.ast]))], { ctx });
   }
   
   /* ---- 4. last N games / averages ---- */
   async function hLastN(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const N = p.N || 10;
     let rows = await loadLog(env, pl.id, N > 20 ? 3 : 2);
     const opps = asOpps(p);
     if (opps.length) rows = rows.filter((r) => opps.some((o) => r.oppId === o.team.id));
     if (p.loc === 'home' || p.loc === 'away') rows = rows.filter((r) => r.home === (p.loc === 'home'));
     rows = rows.slice(0, N);
     const ctx = { player: pl, stat: p.stat?.key, N: p.N, loc: p.loc, teams: opps.map((o) => o.team.id) };
     if (!rows.length) return A(`No recent games found for ${pl.name} with those filters.`, [], { ctx });
     const def = p.stat;
     const basic = ['pts', 'reb', 'ast', 'min', 'tpm'];
     const tiles = [{ k: 'Games', v: rows.length }];
     if (def && !basic.includes(def.key)) tiles.push({ k: def.dbl ? def.label : `Avg ${def.label}`, v: def.pct ? `${f1(aggVal(rows, def))}%` : def.dbl ? rows.filter((r) => rowVal(r, def)).length : f1(aggVal(rows, def)) });
     tiles.push({ k: 'PTS', v: f1(aggVal(rows, STATS.pts)) }, { k: 'REB', v: f1(aggVal(rows, STATS.reb)) }, { k: 'AST', v: f1(aggVal(rows, STATS.ast)) }, { k: 'MIN', v: f1(aggVal(rows, STATS.min)) }, { k: '3PM', v: f1(aggVal(rows, STATS.tpm)) });
     if (def && p.thr != null && !def.pct && !def.dbl) tiles.push({ k: `${CMP_WORD[p.cmp || '>']} ${p.thr}`, v: `${rows.filter((r) => test(rowVal(r, def), p.cmp || '>', p.thr)).length}/${rows.length}` });
     const cdef = def && !def.pct && !def.dbl ? def : STATS.pts;
     const rev = [...rows].reverse();
     const blocks = [
       cards(tiles),
       { t: 'chart', vals: rev.map((x) => rowVal(x, cdef)), labels: rev.map(dateCell), line: p.thr ?? aggVal(rows, cdef), title: `${cdef.label} · last ${rows.length}` },
       tbl(['Date', 'Opp', 'W/L', 'MIN', 'PTS', 'REB', 'AST', '3PM'], rows.map((r) => [dateCell(r), `${r.home === false ? '@' : 'vs'} ${r.opp}`, r.result || '–', r.min, r.pts, r.reb, r.ast, r.tpm])),
     ];
     return A(`${pl.name} over his last **${rows.length}** games${p.loc && p.loc !== 'split' ? ` (${p.loc})` : ''}${opps.length ? ` against ${opps.map((o) => o.team.nick).join('/')}` : ''}. Averages first, newest game first in the table.`, blocks, { ctx });
   }
   
   /* ---- 4b. home/away splits (player or team), honors the stat ---- */
   async function hSplits(p, env) {
     const def = p.stat;
     if (p.player) {
       const pl = p.player;
       let rows = await loadLog(env, pl.id, 1);
       if (rows.length < 8) rows = await loadLog(env, pl.id, 2);
       if (p.N) rows = rows.slice(0, p.N);
       const h = rows.filter((r) => r.home === true), a = rows.filter((r) => r.home === false);
       const ctx = { player: pl, loc: 'split', stat: def?.key, N: p.N };
       if (def) {
         const val = (rs) => (!rs.length ? '–' : def.pct ? `${f1(aggVal(rs, def))}%` : def.dbl ? String(rs.filter((r) => rowVal(r, def)).length) : f1(aggVal(rs, def)));
         const hi = (rs) => (!rs.length ? '–' : f1(Math.max(...rs.map((r) => rowVal(r, def)))));
         const line = (label, rs) => (def.pct || def.dbl ? [label, rs.length, val(rs)] : [label, rs.length, val(rs), hi(rs)]);
         const head = def.pct || def.dbl ? ['', 'GP', def.dbl ? `Games with ${def.label}` : def.label] : ['', 'GP', `Avg ${def.label}`, 'High'];
         return A(`${pl.name}'s home and road splits for ${def.label} (${rows.length} games).`, [tbl(head, [line('Home', h), line('Away', a)])], { ctx });
       }
       const line = (label, rs) => [label, rs.length, f1(aggVal(rs, STATS.pts)), f1(aggVal(rs, STATS.reb)), f1(aggVal(rs, STATS.ast)), f1(aggVal(rs, STATS.tpm)), aggVal(rs, STATS.fgp) == null ? '–' : `${f1(aggVal(rs, STATS.fgp))}%`];
       return A(`${pl.name}'s home and road splits (${rows.length} games).`, [tbl(['', 'GP', 'PTS', 'REB', 'AST', '3PM', 'FG%'], [line('Home', h), line('Away', a)])], { ctx });
     }
     const t = p.teams[0]?.team;
     if (!t) return A('Which player or team? For example "Lakers home vs away splits".');
     if (def && def.key !== 'pts') {
       return A(`Team splits only cover record and scoring, so I can't break out ${def.label} by home and road for the ${t.nick}. I can show a player's splits instead, like "Jayson Tatum home vs away ${def.label}".`, [], { ctx: { teams: [t.id], loc: 'split', stat: def.key } });
     }
     const evs = (await teamSched(env, t.id)).filter((e) => e.completed);
     const agg = (home) => {
       const g = evs.filter((e) => mineOf(e, t.id)?.home === home && mineOf(e, t.id)?.score != null && otherOf(e, t.id)?.score != null);
       const w = g.filter((e) => mineOf(e, t.id).score > otherOf(e, t.id).score).length;
       const pf = g.reduce((s, e) => s + mineOf(e, t.id).score, 0), pa = g.reduce((s, e) => s + otherOf(e, t.id).score, 0);
       return [home ? 'Home' : 'Away', `${w}-${g.length - w}`, g.length ? f1(pf / g.length) : '–', g.length ? f1(pa / g.length) : '–', g.length ? `${pf - pa >= 0 ? '+' : ''}${f1((pf - pa) / g.length)}` : '–'];
     };
     return A(`${t.name} home and road splits (regular-season schedule, completed games).`, [tbl(['', 'W-L', 'PPG', 'Opp PPG', 'Diff'], [agg(true), agg(false)])], { ctx: { teams: [t.id], loc: 'split' } });
   }
   
   /* ---- 5. season stats + shooting ---- */
   async function hSeasonStats(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const rows = await loadLog(env, pl.id, 1);
     const ctx = { player: pl, stat: p.stat?.key };
     if (!rows.length) return A(`${pl.name} has no games on file this season yet.`, [], { ctx });
     const pc = (d) => (aggVal(rows, d) == null ? '–' : `${f1(aggVal(rows, d))}%`);
     const def = p.stat;
     if (def) {
       const tiles = [{ k: def.dbl ? def.label : def.pct ? def.label : `Avg ${def.label}`, v: def.pct ? pc(def) : def.dbl ? rows.filter((r) => rowVal(r, def)).length : f1(aggVal(rows, def)) }];
       if (!def.pct && !def.dbl) tiles.push({ k: 'High', v: Math.max(...rows.map((r) => rowVal(r, def))) }, { k: 'Low', v: Math.min(...rows.map((r) => rowVal(r, def))) });
       tiles.push({ k: 'Games', v: rows.length });
       return A(`${pl.name}'s ${def.label} this season (${rows.length} games).`, [{ t: 'people', rows: [{ id: pl.id, name: pl.name, sub: `${pl.abbr} ${pl.pos}` }] }, cards(tiles)], { ctx });
     }
     const note = /usage/.test(p.n) ? ' Usage rate is not in ESPN\'s free feed.' : '';
     return A(`${pl.name} this season (${rows.length} games).${note}`, [
       { t: 'people', rows: [{ id: pl.id, name: pl.name, sub: `${pl.abbr} ${pl.pos}` }] },
       cards([{ k: 'PTS', v: f1(aggVal(rows, STATS.pts)) }, { k: 'REB', v: f1(aggVal(rows, STATS.reb)) }, { k: 'AST', v: f1(aggVal(rows, STATS.ast)) }, { k: 'MIN', v: f1(aggVal(rows, STATS.min)) }]),
       tbl(['STL', 'BLK', 'TO', 'FG%', '3P%', 'FT%'], [[f1(aggVal(rows, STATS.stl)), f1(aggVal(rows, STATS.blk)), f1(aggVal(rows, STATS.to)), pc(STATS.fgp), pc(STATS.tpp), pc(STATS.ftp)]]),
     ], { ctx });
   }
   
   /* ---- 14. player bio (index first; enriched from the team roster when the index is sparse) ---- */
   async function hBio(p, env) {
     let pl = p.player;
     if (!pl) return needPlayer(p);
     const t0 = env.idx.teamById[pl.team];
     if (t0 && !pl.ht && !pl.college && pl.age == null) {
       try {
         const full = (await rosterOf(env, t0)).players.find((x) => x.id === pl.id);
         if (full) pl = { ...pl, ...Object.fromEntries(Object.entries(full).filter(([, v]) => v !== '' && v != null)) };
       } catch (e) { /* show what we have */ }
     }
     const t = env.idx.teamById[pl.team];
     const bits = [['Team', t?.name || pl.abbr], ['Position', pl.pos], ['Number', pl.jersey && `#${pl.jersey}`], ['Height', pl.ht], ['Weight', pl.wt], ['Age', pl.age], ['College', pl.college], ['Experience', pl.exp != null && `${pl.exp} yrs`], ['Draft', pl.draft]].filter(([, v]) => v !== '' && v != null && v !== false);
     return A(`Here is what ESPN's roster lists for ${pl.name}.`, [{ t: 'people', rows: [{ id: pl.id, name: pl.name, sub: t?.name || '' }] }, tbl(['', ''], bits)], { ctx: { player: pl } });
   }
   
   /* ---- 6. league leaders (core v2 leaders) ---- */
   const LEADER_RE = {
     pts: /point/i, reb: /rebound/i, ast: /assist/i, stl: /steal/i, blk: /block/i, to: /turnover/i, min: /minute/i,
     tpm: /three|3-?point|3pt/i, fgp: /field ?goal.*(pct|percent)|fieldGoalPct/i, tpp: /three.*(pct|percent)|3.*(pct|percent)/i, ftp: /free ?throw.*(pct|percent)|freeThrowPct/i,
   };
   async function hLeaders(p, env) {
     const def = p.stat;
     const j = await getJSON(`${env.EP.core}/seasons/${seasonNow()}/types/2/leaders`, { ttl: MIN5 * 6 });
     const cats = j?.categories || [];
     const re = LEADER_RE[def.key];
     const label = (c) => `${c.name || ''} ${c.displayName || ''}`;
     const cands = cats.filter((c) => re && re.test(label(c)) && (def.pct ? true : !/pct|percent|attempt/i.test(label(c))));
     const cat = cands.find((c) => /perGame|per game/i.test(label(c))) || cands[0];
     if (!cat) return A(`ESPN's leaders feed has no category I can match to ${def.label}. It listed: ${cats.map((c) => c.displayName || c.name).slice(0, 12).join(', ') || 'nothing'}.`);
     const leaders = (cat.leaders || []).slice(0, 10);
     const rows = leaders.map((l) => ({ id: idFromRef(l.athlete?.$ref, 'athletes'), ref: l.athlete?.$ref, val: l.displayValue ?? f1(l.value), teamRef: l.team?.$ref }));
     await pool(rows.filter((r) => r.id && !env.idx.byId[r.id]), 4, async (r) => { const a = await getJSON(r.ref, { ttl: DAY }); r.name = a?.displayName || a?.fullName; });
     return A(`League leaders in ${cat.displayName || def.label} this season.`, [{ t: 'people', rows: rows.map((r) => { const pl = env.idx.byId[r.id]; return { id: r.id, name: pl?.name || r.name || `Player ${r.id}`, sub: pl ? `${pl.abbr} ${pl.pos}` : '', val: String(r.val) }; }) }], { ctx: { stat: def.key } });
   }
   
   /* ---- 7. injuries ---- */
   async function hInjuries(p, env) {
     const j = await getJSON(`${env.EP.site}/injuries`, { ttl: MIN5 });
     const all = (j?.injuries || []).flatMap((t) => (t.injuries || []).map((i) => ({
       teamId: String(t.id), team: t.displayName || '', id: String(i.athlete?.id ?? ''), name: i.athlete?.displayName || '',
       status: i.status || '', note: i.shortComment || i.details?.detail || i.type?.description || '',
     })));
     const rank = (s) => (/out/i.test(s) ? 0 : /doubt/i.test(s) ? 1 : /quest/i.test(s) ? 2 : 3);
     const row = (r) => [r.name, r.team.replace(/^.* /, ''), r.status, r.note.length > 70 ? `${r.note.slice(0, 67)}…` : r.note];
     if (p.player) {
       const hit = all.filter((r) => r.id === p.player.id || norm(r.name) === p.player.nn);
       return A(hit.length ? `${p.player.name} is on ESPN's injury report.` : `${p.player.name} is not on ESPN's current injury report.`, hit.length ? [tbl(['Player', 'Team', 'Status', 'Note'], hit.map(row))] : [], { ctx: { player: p.player } });
     }
     if (p.teams.length) {
       const t = p.teams[0].team;
       const hit = all.filter((r) => r.teamId === t.id || r.team === t.name).sort((a, b) => rank(a.status) - rank(b.status));
       return A(hit.length ? `${t.name} injury report: ${hit.length} player${hit.length === 1 ? '' : 's'} listed.` : `ESPN lists no injuries for the ${t.name} right now.`, hit.length ? [tbl(['Player', 'Team', 'Status', 'Note'], hit.map(row))] : [], { ctx: { teams: [t.id] } });
     }
     const sorted = all.sort((a, b) => rank(a.status) - rank(b.status));
     return A(`${all.length} players are on the league injury report. Showing the most serious first.`, [tbl(['Player', 'Team', 'Status', 'Note'], sorted.slice(0, 20).map(row))]);
   }
   
   /* ---- 8. scores, schedule, next/last game ---- */
   async function hScores(p, env) {
     const t = p.teams[0]?.team;
     if (t) {
       const sched = await teamSched(env, t.id);
       const done = sched.filter((e) => e.completed), next = sched.find((e) => !e.completed);
       const last = done[done.length - 1];
       const wantNext = /\b(next|upcoming|when)\b/.test(p.n), wantLast = /\b(last|result|final|did)\b/.test(p.n);
       const bits = [];
       if (last && (wantLast || !wantNext)) bits.push(`**Last:** ${gameLabel(last, t.id)} on ${fmtDay(last.iso)}.`);
       if (next && (wantNext || !wantLast)) bits.push(`**Next:** ${gameLabel(next, t.id)} on ${fmtDay(next.iso)}, ${fmtTime(next.date)}.`);
       return A(bits.join(' ') || `No schedule data for the ${t.name}.`, [], { ctx: { teams: [t.id] } });
     }
     const iso = p.date?.iso || env.today;
     const evs = await board(env, iso);
     if (!evs.length) return A(`No NBA games on ${fmtDay(iso)}.`);
     const rows = evs.map((e) => [`${e.away?.abbr} @ ${e.home?.abbr}`, e.state === 'pre' ? fmtTime(e.date) : `${e.away?.score}-${e.home?.score}`, e.state === 'pre' ? '' : e.detail]);
     return A(`${evs.length} game${evs.length === 1 ? '' : 's'} on ${fmtDay(iso)}.`, [tbl(['Game', 'Score / tip', 'Status'], rows)]);
   }
   
   /* ---- 8b. box score + quarter scores ---- */
   async function hBoxscore(p, env) {
     const team = p.teams[0]?.team || (p.player && teamOfPlayer(p, env));
     if (!team) return A('Which team or game? For example "Celtics quarter scores".');
     const got = await resolveGame(env, team.id, p.date);
     if (got.msg) return A(got.msg);
     const ev = got.ev;
     if (ev.state === 'pre') return A(`${gameLabel(ev, team.id)} hasn't started. Tipoff is ${fmtTime(ev.date)}.`);
     const sum = await summary(env, ev.id);
     const comps = sum?.header?.competitions?.[0]?.competitors || [];
     const q = comps.map((c) => { const ls2 = (c.linescores || []).map((l) => l.displayValue ?? l.value); return { abbr: c.team?.abbreviation, ls: ls2.length ? ls2 : (ev.teams.find((t) => t.id === String(c.team?.id))?.lines || []), score: c.score }; });
     const nq = Math.max(...q.map((x) => x.ls.length), 4);
     const blocks = [tbl(['', ...Array.from({ length: nq }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`)), 'T'], q.map((x) => [x.abbr, ...Array.from({ length: nq }, (_, i) => x.ls[i] ?? '–'), x.score ?? '']))];
     if (/box ?score/.test(p.n) || p.player) {
       for (const side of boxRows(sum)) blocks.push(tbl([side.abbr, 'MIN', 'PTS', 'REB', 'AST'], [...side.rows].sort((a, b) => b.min - a.min).slice(0, 8).map((r) => [r.name, r.min, r.pts, r.reb, r.ast])));
     }
     return A(`${gameLabel(ev, team.id)} on ${fmtDay(ev.iso)}${ev.state === 'in' ? ` (live, ${ev.detail})` : ''}.`, blocks, { ctx: { teams: [team.id], game: { id: ev.id, iso: ev.iso } } });
   }
   
   /* ---- 9. play-by-play + win probability ---- */
   async function hPlays(p, env) {
     const team = p.teams[0]?.team || (p.player && teamOfPlayer(p, env));
     if (!team) return A('Which game? For example "last 5 plays of the Celtics game".');
     const got = await resolveGame(env, team.id, p.date);
     if (got.msg) return A(got.msg);
     const ev = got.ev;
     if (ev.state === 'pre') return A(`${gameLabel(ev, team.id)} hasn't started yet.`);
     const sum = await summary(env, ev.id);
     let plays = sum?.plays || [];
     if (!plays.length) { try { const c = await getJSON(`${env.EP.cdn}/game?xhr=1&gameId=${ev.id}`, { ttl: LIVE }); plays = c?.gamepackageJSON?.plays || []; } catch (e) { /* fall through */ } }
     if (!plays.length) return A(`ESPN has no play-by-play for ${gameLabel(ev, team.id)} yet.`);
     if (p.player) { const ln = p.player.name.split(' ').slice(-1)[0]; plays = plays.filter((x) => (x.participants || []).some((q) => String(q.athlete?.id) === p.player.id) || String(x.text || '').includes(ln)); }
     if (/scoring/.test(p.n)) plays = plays.filter((x) => x.scoringPlay);
     const n = p.N || 5;
     const shown = plays.slice(-n).reverse();
     return A(`${/scoring/.test(p.n) ? 'Latest scoring plays' : `Last ${shown.length} plays`} in ${gameLabel(ev, team.id)}${ev.state === 'in' ? ` (live, ${ev.detail})` : ''}, newest first.`,
       [{ t: 'list', items: shown.map((x) => ({ title: x.text || '', sub: `${x.period?.displayValue || ''} ${x.clock?.displayValue || ''} · ${x.awayScore ?? ''}-${x.homeScore ?? ''}`.trim() })) }], { ctx: { teams: [team.id], game: { id: ev.id, iso: ev.iso } } });
   }
   
   async function hWinProb(p, env) {
     const team = p.teams[0]?.team;
     if (!team) return A('Which game? For example "win probability in the Nuggets game".');
     const got = await resolveGame(env, team.id, p.date);
     if (got.msg) return A(got.msg);
     const sum = await summary(env, got.ev.id);
     const wp = sum?.winprobability || [];
     if (!wp.length) return A('ESPN has no win-probability data for that game.');
     const last = wp[wp.length - 1];
     const hp = Math.round((last.homeWinPercentage ?? 0) * 100);
     const away = got.ev.away?.abbr, home = got.ev.home?.abbr;
     return A(`Win probability in ${away} @ ${home}${got.ev.state === 'in' ? ` (live, ${got.ev.detail})` : ''}: **${home} ${hp}%**, ${away} ${100 - hp}%.`, [{ t: 'chart', vals: wp.filter((_, i) => i % Math.max(1, Math.floor(wp.length / 20)) === 0).map((x) => Math.round((x.homeWinPercentage ?? 0) * 100)), labels: [], line: 50, title: `${home} win probability trend` }], { ctx: { teams: [team.id] } });
   }
   
   /* ---- 10. head to head ---- */
   async function hH2H(p, env) {
     if (p.players.length >= 2) {
       const [a, b] = p.players;
       const [ra, rb] = await Promise.all([loadLog(env, a.id, 3), loadLog(env, b.id, 3)]);
       const ids = new Set(rb.map((r) => r.id));
       const bm = new Map(rb.map((r) => [r.id, r]));
       const common = ra.filter((r) => ids.has(r.id));
       if (!common.length) return A(`I found no games in the last 3 seasons where both ${a.name} and ${b.name} played.`);
       const hdef = p.stat && !p.stat.pct && !p.stat.dbl ? p.stat : STATS.pts;
       const together = a.team === b.team ? ' They are teammates now, so some of these may be games on the same team.' : '';
       return A(`${a.name} vs ${b.name}: **${common.length}** shared games in the last 3 seasons.${together}`, [
         cards([{ k: `${a.name.split(' ').pop()} ${hdef.label}`, v: f1(aggVal(common, hdef)) }, { k: `${b.name.split(' ').pop()} ${hdef.label}`, v: f1(aggVal(common.map((r) => bm.get(r.id)), hdef)) }]),
         tbl(['Date', `${a.name.split(' ').pop()}`, `${b.name.split(' ').pop()}`], common.slice(0, 10).map((r) => { const o = bm.get(r.id); return [dateCell(r), `${r.pts}/${r.reb}/${r.ast}`, `${o.pts}/${o.reb}/${o.ast}`]; })),
       ], { ctx: { player: a } });
     }
     const [x, y] = [p.teams[0]?.team, p.teams[1]?.team];
     if (!x || !y) return A('Name two teams or two players, like "Knicks vs Celtics head to head".');
     const evs = (await teamSched(env, x.id)).filter((e) => e.completed && e.teams.some((t) => t.id === y.id));
     if (!evs.length) return A(`The ${x.nick} and ${y.nick} haven't played each other yet this season (regular-season schedule).`, [], { ctx: { teams: [x.id, y.id] } });
     const w = evs.filter((e) => mineOf(e, x.id).score > otherOf(e, x.id).score).length;
     return A(`${x.name} are **${w}-${evs.length - w}** against the ${y.nick} this season.`, [tbl(['Date', 'Game', 'Result'], evs.map((e) => [fmtDay(e.iso), gameLabel(e, x.id).replace(/ \(.*/, ''), `${mineOf(e, x.id).score > otherOf(e, x.id).score ? 'W' : 'L'} ${mineOf(e, x.id).score}-${otherOf(e, x.id).score}`]))], { ctx: { teams: [x.id, y.id] } });
   }
   
   /* ---- 11. standings / records ---- */
   async function hStandings(p, env) {
     const j = await getJSON(`${env.EP.v2}/standings`, { ttl: MIN5 });
     const conf = (j?.children || []).map((c) => ({
       name: c.name || c.abbreviation || '', rows: (c.standings?.entries || []).map((en) => {
         const st = (k) => (en.stats || []).find((s) => s.name === k);
         const w = st('wins')?.value, l = st('losses')?.value;
         return { id: String(en.team?.id), abbr: en.team?.abbreviation || '', name: en.team?.displayName || '', w, l, seed: Number(st('playoffSeed')?.value) || null, streak: st('streak')?.displayValue || '', gb: st('gamesBehind')?.displayValue || '', pct: Number(st('winPercent')?.value) || (w + l ? w / (w + l) : 0) };
       }).sort((a, b) => (a.seed && b.seed ? a.seed - b.seed : b.pct - a.pct)),
     }));
     const t = p.teams[0]?.team;
     if (t) {
       for (const c of conf) {
         const i = c.rows.findIndex((r) => r.id === t.id);
         if (i >= 0) { const r = c.rows[i]; return A(`The ${t.name} are **${r.w}-${r.l}**, ${i + 1}${['th', 'st', 'nd', 'rd'][(i + 1) % 100 > 10 && (i + 1) % 100 < 14 ? 0 : (i + 1) % 10 < 4 ? (i + 1) % 10 : 0]} in the ${c.name}${r.streak ? `, streak ${r.streak}` : ''}${r.gb && r.gb !== '-' ? `, ${r.gb} GB` : ''}.`, [], { ctx: { teams: [t.id] } }); }
       }
       return A(`I couldn't find the ${t.name} in the standings feed.`);
     }
     const wanted = /\beast/.test(p.n) ? conf.filter((c) => /east/i.test(c.name)) : /\bwest/.test(p.n) ? conf.filter((c) => /west/i.test(c.name)) : conf;
     return A('Current standings.', wanted.map((c) => tbl([c.name, 'W', 'L', 'GB', 'Strk'], c.rows.slice(0, 15).map((r, i) => [`${i + 1}. ${r.abbr}`, r.w, r.l, r.gb || '', r.streak]))));
   }
   
   /* ---- 12/13. rosters, coaches, starters ---- */
   async function hRoster(p, env) {
     const t = p.teams[0]?.team;
     if (!t) return A('Which team? For example "Heat roster".');
     let rows = env.idx.players.filter((x) => x.team === t.id);
     try { const r = await rosterOf(env, t); if (r.players.length) rows = r.players; } catch (e) { /* fall back to the index */ }
     return A(`${t.name} roster (${rows.length} players).`, [tbl(['Player', 'Pos', '#', 'Ht', 'Wt'], rows.map((r) => [r.name, r.pos, r.jersey, r.ht, r.wt]))], { ctx: { teams: [t.id] } });
   }
   async function hCoach(p, env) {
     const t = p.teams[0]?.team;
     if (!t) return A('Which team? For example "Who coaches the Cavs?"');
     let c = env.idx.coaches?.[t.id];
     if (!c) { try { c = (await rosterOf(env, t)).coach; } catch (e) { /* none */ } }
     return A(c ? `**${c.name}** is the ${t.name} head coach${c.exp != null ? ` (${c.exp} years of experience listed)` : ''}. ESPN doesn't list his career record here.` : `ESPN's roster feed doesn't list a coach for the ${t.name}.`, [], { ctx: { teams: [t.id] } });
   }
   async function hStarters(p, env) {
     const t = p.teams[0]?.team;
     if (!t) return A('Which team? For example "Who starts at center for the Heat?"');
     const done = (await teamSched(env, t.id)).filter((e) => e.completed);
     const last = done[done.length - 1];
     if (!last) return A(`The ${t.nick} haven't played a completed game yet.`);
     const side = boxRows(await summary(env, last.id, DAY)).find((s) => s.teamId === t.id);
     const starters = (side?.rows || []).filter((r) => r.starter);
     const POS = [[/\bcenter\b|\bc\b/, 'C'], [/point guard|\bpg\b/, 'PG'], [/shooting guard|\bsg\b/, 'SG'], [/small forward|\bsf\b/, 'SF'], [/power forward|\bpf\b/, 'PF'], [/\bguard\b/, 'G'], [/\bforward\b/, 'F']].find(([re]) => re.test(p.n));
     const pick = POS ? starters.filter((r) => r.pos === POS[1] || (POS[1] === 'G' && /G/.test(r.pos)) || (POS[1] === 'F' && /F/.test(r.pos))) : starters;
     const from = `from their last game, ${gameLabel(last, t.id).replace(/ \(.*/, '')} on ${fmtDay(last.iso)}`;
     return A(pick.length ? `${POS ? `Starting ${POS[1]} for the ${t.nick}` : `${t.nick} starters`} ${from}: ${pick.map((r) => `**${r.name}**${POS ? '' : ` (${r.pos})`}`).join(', ')}. This is the last lineup, not a confirmed one for tonight.` : `I found no ${POS ? POS[1] : ''} starter in that box score.`, [], { ctx: { teams: [t.id] } });
   }
   
   /* ---- 12b. transactions + 20. news ---- */
   async function hTransactions(p, env) {
     const j = await getJSON(`${env.EP.site}/transactions`, { ttl: MIN5 * 3 });
     let list = (j?.transactions || []).map((x) => ({ date: x.date, text: x.description || '', team: x.team?.displayName || '' }));
     const t = p.teams[0]?.team;
     if (t) list = list.filter((x) => x.team === t.name || x.text.includes(t.nick));
     if (/\btoday\b/.test(p.n)) list = list.filter((x) => isoOf(x.date) === env.today);
     list = list.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
     if (!list.length) return A(/\btoday\b/.test(p.n) ? 'ESPN lists no transactions today.' : 'ESPN lists no matching transactions.');
     return A(`Latest transactions${t ? ` for the ${t.nick}` : ''}.`, [{ t: 'list', items: list.map((x) => ({ title: x.text, sub: `${fmtDay(isoOf(x.date))} · ${x.team}` })) }]);
   }
   async function hNews(p, env) {
     const t = p.teams[0]?.team;
     let items = [];
     try {
       const j = await getJSON(`${env.EP.site}/news?limit=15${t ? `&team=${t.id}` : ''}`, { ttl: MIN5 });
       items = (j?.articles || []).map((a) => ({ title: a.headline || '', sub: a.description || '', href: a.links?.web?.href, date: a.published }));
     } catch (e) {
       const j = await getJSON(`${env.EP.now}?leagues=${env.lg.slug}&limit=10${t ? `&team=${t.abbr.toLowerCase()}` : ''}`, { ttl: MIN5 });
       items = (j?.feed || j?.articles || []).map((a) => ({ title: a.headline || '', sub: a.description || '', href: a.links?.web?.href, date: a.published }));
     }
     if (p.player) { const ln = p.player.name.split(' ').slice(-1)[0]; const f = items.filter((x) => `${x.title} ${x.sub}`.includes(ln)); if (f.length) items = f; }
     if (!items.length) return A('ESPN returned no news items.');
     return A(`Latest ${t ? `${t.nick} ` : p.player ? `${p.player.name} ` : ''}news.`, [{ t: 'list', items: items.slice(0, 8).map((x) => ({ title: x.title, sub: x.sub.length > 110 ? `${x.sub.slice(0, 107)}…` : x.sub, href: x.href })) }]);
   }
   
   /* ---- 16. odds (spread / total / moneyline from the scoreboard) ---- */
   async function hOdds(p, env) {
     const evs = await board(env, env.today);
     const t = p.teams[0]?.team;
     const list = t ? evs.filter((e) => e.teams.some((x) => x.id === t.id)) : evs;
     const foot = { betting: true };
     if (!list.length) return A(t ? `No game for the ${t.nick} tonight.` : 'No games tonight.', [], foot);
     const rows = list.map((e) => { const o = e.odds || {}; return [`${e.away?.abbr} @ ${e.home?.abbr}`, o.details || '–', o.overUnder ?? '–', `${price(o.awayTeamOdds?.moneyLine)} / ${price(o.homeTeamOdds?.moneyLine)}`, o.provider?.name || '']; });
     const prov = list.map((e) => e.odds?.provider?.name).find(Boolean);
     return A(`Tonight's lines${t ? ` for the ${t.nick}` : ''}. Moneyline is away / home.`, [tbl(['Game', 'Spread', 'Total', 'ML', 'Book'], rows)], { ctx: t ? { teams: [t.id] } : {}, ...foot, provider: prov || 'ESPN', stamp: fmtTime(Date.now()) });
   }
   
   /* ---- 18. broadcast + tipoff ---- */
   async function hBroadcast(p, env) {
     const t = p.teams[0]?.team;
     if (!t) return A('Which team? For example "What channel is the Lakers game on?"');
     let ev = (await board(env, env.today)).find((e) => e.teams.some((x) => x.id === t.id));
     if (!ev) ev = (await teamSched(env, t.id)).find((e) => !e.completed);
     if (!ev) return A(`I couldn't find an upcoming game for the ${t.nick}.`);
     const nets = [...new Set([...ev.tv.flatMap((b) => b.names || []), ...ev.geo.map((g) => g.media?.shortName).filter(Boolean)])];
     return A(`${gameLabel(ev, t.id)} on ${fmtDay(ev.iso)}: tipoff **${fmtTime(ev.date)}** (your local time). ${nets.length ? `Watch on **${nets.join(', ')}**.` : 'ESPN has not listed a network yet.'}`, [], { ctx: { teams: [t.id] } });
   }
   
   /* ---- tonight's games ranked by total / spread ---- */
   const posNum = (v) => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/g); return m ? Math.abs(Number(m[m.length - 1])) : 0; };
   async function hTopLines(p, env) {
     const all = await board(env, env.today);
     if (!all.length) return A('No NBA games tonight.');
     const rows = all.filter((e) => e.odds && (e.odds.overUnder != null || e.odds.details)).map((e) => ({ e, total: Number(e.odds.overUnder) || 0, spread: posNum(e.odds.details) }));
     if (!rows.length) return A('No lines are posted for tonight\'s games yet. I can show the schedule instead.', [], { chips: [{ label: 'Tonight\'s games', q: 'What games are on tonight?' }] });
     const bySpread = /\b(spreads?|favou?r\w*|blowouts?|lopsided)\b/.test(p.n);
     const low = /\b(lowest|smallest|closest|tightest|least)\b/.test(p.n);
     const key = bySpread ? 'spread' : 'total';
     rows.sort((a, b) => (low ? 1 : -1) * (a[key] - b[key]));
     const label = bySpread ? (low ? 'closest spreads' : 'biggest spreads') : (low ? 'lowest totals' : 'highest totals');
     const prov = rows.map((r) => r.e.odds?.provider?.name).find(Boolean);
     return A(`Tonight's games by ${label}.${bySpread ? '' : ' Ask about spreads to rank by the biggest point spread instead.'}`,
       [tbl(['Game', 'Total', 'Spread', 'Tip / status'], rows.map(({ e, total }) => [`${e.away?.abbr} @ ${e.home?.abbr}`, total || '–', e.odds.details || '–', e.state === 'pre' ? fmtTime(e.date) : e.detail]))],
       { betting: true, provider: prov || 'ESPN', stamp: fmtTime(Date.now()) });
   }
   
   /* ---- best-looking props tonight: last-10 hit rate against the posted line ---- */
   async function hTopProps(p, env) {
     const pre = (await board(env, env.today)).filter((e) => e.state === 'pre');
     if (!pre.length) return A('There are no upcoming games tonight, so there are no open prop lines to look at.', [], { chips: [{ label: 'Tonight\'s games', q: 'What games are on tonight?' }] });
     const keys = p.stat && PROP_LABEL[p.stat.key] ? [p.stat.key] : ['pts', 'reb', 'ast', 'pra', 'tpm'];
     const props = [];
     await pool(pre, 3, async (g) => { const list = await fetchGameProps(env, g.id); if (list.length) saveSnap(env, env.today, g.id, list); props.push(...list); });
     const usable = props.filter((r) => keys.includes(r.key) && r.line != null && env.idx.byId[r.aid]);
     if (!usable.length) return A('Prop lines for tonight aren\'t posted yet. Check back closer to tip-off.', [], { chips: [{ label: 'Tonight\'s lines', q: 'Tonight\'s odds' }] });
     const out = new Set();
     try {
       const j = await getJSON(`${env.EP.site}/injuries`, { ttl: MIN5 });
       for (const t of j?.injuries || []) for (const i of t.injuries || []) if (/out|doubt/i.test(i.status || '')) out.add(String(i.athlete?.id));
     } catch (e) { /* skip the filter */ }
     const byPlayer = new Map();
     for (const r of usable) { if (out.has(r.aid)) continue; (byPlayer.get(r.aid) || byPlayer.set(r.aid, []).get(r.aid)).push(r); }
     const cands = [...byPlayer.entries()].sort((a, b) => Math.max(...b[1].map((r) => r.line)) - Math.max(...a[1].map((r) => r.line))).slice(0, 16);
     const picks = [];
     await pool(cands, 4, async ([aid, list]) => {
       const rows = (await loadLog(env, aid, 2)).slice(0, 10);
       for (const r of list) {
         const vals = rows.map((x) => rowVal(x, STATS[r.key]));
         if (vals.length < 6) continue;
         const over = vals.filter((v) => v > r.line).length, under = vals.filter((v) => v < r.line).length;
         const side = over >= under ? 'Over' : 'Under';
         const hit = Math.max(over, under);
         const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
         const margin = side === 'Over' ? avg - r.line : r.line - avg;
         picks.push({ r, pl: env.idx.byId[aid], side, hit, n: vals.length, avg, score: hit / vals.length + margin / Math.max(r.line, 1), pr: side === 'Over' ? r.over : r.under });
       }
     });
     const top = picks.sort((a, b) => b.score - a.score).slice(0, 5);
     if (!top.length) return A('I couldn\'t find enough recent games on these players to rank their props yet.');
     return A('Best-looking props tonight, ranked by how often the player cleared or missed the line over his last 10 games. This shows recent patterns, not a prediction. Injuries and matchups are not factored in.',
       [tbl(['Player', 'Prop', 'Pick', 'Line', 'Hit', 'Avg', 'Price'], top.map((x) => [`${x.pl.name} (${x.pl.abbr})`, PROP_LABEL[x.r.key], x.side, x.r.line, `${x.hit}/${x.n}`, f1(x.avg), price(x.pr)]))],
       { betting: true, provider: 'DraftKings', stamp: fmtTime(Date.now()) });
   }
   
   /* ---- "if X is out, how do Y's numbers change" ---- */
   async function hWithout(p, env) {
     const pls = p.players;
     if (pls.length < 2) {
       for (const w of unresolvedNames(p, env.idx)) {
         const sug = suggestPlayers(w, env.idx, 0.75);
         if (sug.length) return A(`I couldn't find "${w}". Did you mean one of these?`, [], { chips: sug.map((x) => ({ label: `${x.name} (${x.abbr})`, q: String(p.raw).replace(new RegExp(esc(w), 'i'), x.name) })) });
       }
       return A('Name both players, like "How do Maxey\'s numbers change if Embiid is out?"');
     }
     const two = pls.slice(0, 2);
     const at = (pl) => p.n.indexOf(pl.last);
     const wi = p.n.search(/\bwithout\b/), oi = p.n.search(/\bout\b/);
     let outP = two[0];
     if (wi >= 0) outP = two.filter((x) => at(x) > wi).sort((a, b) => at(a) - at(b))[0] || two[1];
     else if (oi >= 0) outP = two.filter((x) => at(x) >= 0 && at(x) < oi).sort((a, b) => at(b) - at(a))[0] || two[0];
     const subj = two.find((x) => x.id !== outP.id);
     if (outP.team && subj.team && outP.team !== subj.team) return A(`${outP.name} and ${subj.name} aren't on the same team, so there's no with-or-without split to show.`);
     const [sRows, oRows] = await Promise.all([loadLog(env, subj.id, 2), loadLog(env, outP.id, 2)]);
     if (!oRows.length) return A(`ESPN has no recent games on file for ${outP.name}.`);
     const since = oRows[oRows.length - 1].date;
     const played = new Set(oRows.map((r) => r.id));
     const span = sRows.filter((r) => r.date >= since);
     const withP = span.filter((r) => played.has(r.id)), without = span.filter((r) => !played.has(r.id));
     const ctx = { player: subj };
     if (!without.length) return A(`${outP.name} played in every game ${subj.name} played over this stretch, so there's no "without" sample to compare.`, [], { ctx });
     if (!withP.length) return A(`${subj.name} has no games with ${outP.name} on file over this stretch.`, [], { ctx });
     const def = p.stat && !p.stat.pct && !p.stat.dbl ? p.stat : null;
     const line = (label, rs) => (def ? [label, rs.length, f1(aggVal(rs, def))] : [label, rs.length, f1(aggVal(rs, STATS.pts)), f1(aggVal(rs, STATS.reb)), f1(aggVal(rs, STATS.ast)), f1(aggVal(rs, STATS.tpm)), f1(aggVal(rs, STATS.min))]);
     const head = def ? ['', 'GP', `Avg ${def.label}`] : ['', 'GP', 'PTS', 'REB', 'AST', '3PM', 'MIN'];
     const cmpDef = def || STATS.pts;
     const small = without.length < 5 ? ` Small sample: only ${without.length} game${without.length === 1 ? '' : 's'} without him.` : '';
     return A(`${subj.name} averages **${f1(aggVal(without, cmpDef))} ${cmpDef.label.toLowerCase()}** in ${without.length} games without ${outP.name}, compared with **${f1(aggVal(withP, cmpDef))}** in ${withP.length} games with him.${small} "Without" means games ${outP.name} has no stat line in ESPN's logs (injury, rest, or not on the team yet).`,
       [tbl(head, [line(`With ${outP.last}`, withP), line(`Without ${outP.last}`, without)])], { ctx });
   }
   
   /* ---- team defense (overall; ESPN has no by-position split) ---- */
   async function hDefense(p, env) {
     const t = p.teams[0].team;
     const done = (await teamSched(env, t.id)).filter((e) => e.completed && mineOf(e, t.id)?.score != null && otherOf(e, t.id)?.score != null);
     const ctx = { teams: [t.id] };
     const chips = [{ label: `${t.nick} injuries`, q: `Who's injured on the ${t.nick}?` }, { label: `${t.nick} next game`, q: `${t.nick} next game` }];
     if (!done.length) return A(`The ${t.nick} haven't played a completed game yet, so there's no defensive data to show.`, [], { ctx, chips });
     const allowed = (g) => (g.length ? f1(g.reduce((sum, e) => sum + otherOf(e, t.id).score, 0) / g.length) : '–');
     const last = done.slice(-10);
     const home = done.filter((e) => mineOf(e, t.id).home), away = done.filter((e) => !mineOf(e, t.id).home);
     const pos = p.n.match(/\b(guards?|forwards?|centers?|bigs?|wings?)\b/);
     const lead = pos
       ? `ESPN doesn't break defense down by position, so I can't say how the ${t.nick} do against ${pos[1]} specifically. Here is their overall defense.`
       : `${t.name} defense, measured by points allowed.`;
     return A(lead, [cards([{ k: 'Opp PPG', v: allowed(done) }, { k: `Last ${last.length}`, v: allowed(last) }, { k: 'Home', v: allowed(home) }, { k: 'Away', v: allowed(away) }, { k: 'Games', v: done.length }])], { ctx, chips });
   }
   
   /* ---- honest limits ---- */
   const hUnsupported = (p) => {
     const n = p?.n || '';
     const chips = [{ label: 'East standings', q: 'East standings' }, { label: 'Tonight\'s games', q: 'What games are on tonight?' }, { label: 'What can I ask?', q: '/help' }];
     if (/\b(power index|bpi)\b/.test(n)) return A('I don\'t have ESPN\'s power ratings. I can show the current standings or a team\'s record instead.', [], { chips });
     if (/\b(picked first|first overall)\b/.test(n)) return A('I can\'t look up draft history. If you ask about a player\'s background, I can show how he was drafted when ESPN lists it.', [], { chips });
     return A('I don\'t have the season calendar, so I can\'t say when the playoffs or finals start. I can show tonight\'s games or a team\'s next game instead.', [], { chips });
   };
   
   /* ---- betting + contract data. Parsed defensively; if ESPN returns nothing usable the user gets a plain-English gap message. ---- */
   const american = (v) => { const n = Number(String(v ?? '').replace('+', '')); return Number.isNaN(n) ? null : n; };
   const impliedProb = (n) => (n < 0 ? -n / (-n + 100) : 100 / (n + 100));
   
   async function hFutures(p, env) {
     const y = seasonNow();
     const foot = { betting: true, stamp: fmtTime(Date.now()) };
     const gap = () => A('ESPN isn\'t posting title odds I can read right now. I can show the current standings or tonight\'s lines instead.', [], { chips: [{ label: 'East standings', q: 'East standings' }, { label: 'Tonight\'s lines', q: 'Tonight\'s odds' }] });
     let j = null;
     try { j = await getJSON(`${env.EP.core}/seasons/${y}/futures`, { ttl: MIN5 * 6 }); } catch (e) { return gap(); }
     const items = (await Promise.all((j?.items || []).slice(0, 12).map(async (it) => {
       try { return it?.$ref && !it.futures ? await getJSON(it.$ref, { ttl: MIN5 * 6 }) : it; } catch (e) { return null; }
     }))).filter(Boolean);
     const fut = items.find((f) => /champion|title|finals/i.test(`${f.name || ''} ${f.displayName || ''}`));
     const entry = (fut?.futures || []).find((x) => (x.books || []).length) || null;
     const rows = (entry?.books || []).map((b) => {
       const id = idFromRef(b.team?.$ref, 'teams') || (b.team?.id != null ? String(b.team.id) : null);
       const t = id ? env.idx.teamById[id] : null;
       const n = american(b.value ?? b.odds ?? b.american);
       return t && n != null ? { t, n } : null;
     }).filter(Boolean).sort((a, b) => impliedProb(b.n) - impliedProb(a.n)).slice(0, 10);
     if (!rows.length) return gap();
     return A(`Title odds, favorites first (${y} season).`, [tbl(['Team', 'Odds'], rows.map((r) => [r.t.name, price(r.n)]))], { ...foot, provider: entry?.provider?.name || 'ESPN' });
   }
   
   async function recordRows(items) {
     const out = [];
     for (const raw of (items || []).slice(0, 12)) {
       let it = raw;
       try { if (it?.$ref && it.wins == null && !it.stats && !it.summary && !it.displayValue) it = await getJSON(it.$ref, { ttl: MIN5 * 6 }); } catch (e) { continue; }
       const stat = (k) => (it?.stats || []).find((x) => x.name === k)?.value;
       const w = it?.wins ?? stat('wins'), l = it?.losses ?? stat('losses'), pu = it?.pushes ?? stat('pushes');
       const label = it?.type?.description || it?.type?.displayName || it?.type?.name || it?.displayName || it?.name || '';
       const rec = w != null && l != null ? `${w}-${l}${pu ? `-${pu}` : ''}` : (it?.summary || it?.displayValue || '');
       if (label && rec) out.push([label, String(rec), it?.provider?.name || '']);
     }
     return out;
   }
   
   async function hAts(p, env) {
     const t = p.teams[0]?.team || (p.player && teamOfPlayer(p, env));
     if (!t) return A('Which team? For example "Celtics ATS record".');
     const y = seasonNow();
     const pull = async (seg) => {
       for (const yr of [y, y - 1]) {
         try {
           const j = await getJSON(`${env.EP.core}/seasons/${yr}/types/2/teams/${t.id}/${seg}`, { ttl: MIN5 * 6 });
           const rows = await recordRows(j?.items || j?.records || []);
           if (rows.length) return { rows, yr };
         } catch (e) { /* try the prior season */ }
       }
       return null;
     };
     const [ats, ou] = await Promise.all([pull('ats'), pull('odds-records')]);
     const ctx = { teams: [t.id] };
     if (!ats && !ou) {
       return A(`ESPN doesn't have an against-the-spread record for the ${t.nick} that I can read. I can show their record in the standings or tonight's spread instead.`, [], { ctx, chips: [{ label: `${t.nick} record`, q: `What's the ${t.nick} record?` }, { label: 'Tonight\'s lines', q: 'Tonight\'s odds' }] });
     }
     const blocks = [];
     if (ats) blocks.push(tbl(['Against the spread', 'Record'], ats.rows.map((r) => [r[0], r[1]])));
     if (ou) blocks.push(tbl(['Totals and lines', 'Record'], ou.rows.map((r) => [r[0], r[1]])));
     const yr = (ats || ou).yr;
     const prov = [...(ats?.rows || []), ...(ou?.rows || [])].map((r) => r[2]).find(Boolean) || 'ESPN';
     return A(`${t.name} betting records${yr !== y ? ` (${yr} season, the latest ESPN has)` : ''}.`, blocks, { ctx, betting: true, provider: prov, stamp: fmtTime(Date.now()) });
   }
   
   async function hContract(p, env) {
     const pl = p.player;
     if (!pl) return needPlayer(p);
     const ctx = { player: pl };
     const gap = () => A(`ESPN doesn't publish contract details I can read, so I can't say what ${pl.name} is paid. I can show his season stats or recent games instead.`, [], { ctx, chips: [{ label: 'Season averages', q: `${pl.name} stats this season` }, { label: 'Last 10 games', q: `${pl.name} last 10 games` }] });
     try {
       const j = await getJSON(`${env.EP.core}/athletes/${pl.id}/contracts`, { ttl: DAY });
       const list = (await Promise.all((j?.items || []).slice(0, 6).map(async (it) => { try { return it?.$ref && it.salary == null ? await getJSON(it.$ref, { ttl: DAY }) : it; } catch (e) { return null; } }))).filter(Boolean);
       const rows = list.map((c) => {
         const sal = Number(c.salary ?? c.baseSalary ?? c.amount);
         const season = c.season?.year ?? idFromRef(c.season?.$ref, 'seasons') ?? c.year ?? '';
         return sal > 0 ? [String(season || '–'), `$${sal.toLocaleString('en-US')}`] : null;
       }).filter(Boolean);
       if (!rows.length) return gap();
       return A(`${pl.name}'s contract figures as ESPN lists them.`, [tbl(['Season', 'Salary'], rows)], { ctx });
     } catch (e) { return gap(); }
   }
   
   /* ---- hidden /probe command: shows what ESPN really returns for the betting/contract endpoints ---- */
   const trimJ = (v, d = 0) => {
     if (v == null || typeof v !== 'object') return typeof v === 'string' && v.length > 90 ? `${v.slice(0, 87)}…` : v;
     if (d >= 4) return Array.isArray(v) ? `[${v.length} items]` : '{…}';
     if (Array.isArray(v)) { const out = v.slice(0, 3).map((x) => trimJ(x, d + 1)); if (v.length > 3) out.push(`… ${v.length - 3} more`); return out; }
     const ent = Object.entries(v);
     const out = {};
     for (const [k, x] of ent.slice(0, 25)) out[k] = trimJ(x, d + 1);
     if (ent.length > 25) out['…'] = `${ent.length - 25} more keys`;
     return out;
   };
   async function probeOne(rawUrl) {
     const url = fixRef(rawUrl);
     const ctl = new AbortController();
     const timer = setTimeout(() => ctl.abort(), TIMEOUT);
     try {
       const r = await fetch(url, { signal: ctl.signal });
       let body = null, text = '';
       try { text = await r.text(); body = JSON.parse(text); } catch (e) { /* not JSON */ }
       return { url, status: r.status, keys: body && typeof body === 'object' ? Object.keys(body) : [], sample: body ? JSON.stringify(trimJ(body), null, 1).slice(0, 2400) : text.slice(0, 300), body };
     } catch (e) {
       return { url, status: 0, error: `${e?.name}: ${e?.message}`, keys: [], sample: '', body: null };
     } finally { clearTimeout(timer); }
   }
   async function runProbe(env) {
     const y = seasonNow();
     const bos = env.idx.teams.find((t) => t.abbr === 'BOS') || env.idx.teams[0];
     const joker = env.idx.players.find((x) => x.last === 'jokic') || env.idx.players[0];
     const list = [
       ['futures', `${env.EP.core}/seasons/${y}/futures`],
       ['ats (BOS)', `${env.EP.core}/seasons/${y}/types/2/teams/${bos?.id || 2}/ats`],
       ['odds-records (BOS)', `${env.EP.core}/seasons/${y}/types/2/teams/${bos?.id || 2}/odds-records`],
       ...(joker ? [[`contracts (${joker.name})`, `${env.EP.core}/athletes/${joker.id}/contracts`]] : []),
     ];
     const out = [];
     for (const [label, url] of list) {
       const r = await probeOne(url);
       const refs = [];
       const items = Array.isArray(r.body?.items) ? r.body.items : [];
       for (const it of items.slice(0, 2)) if (it?.$ref) refs.push(await probeOne(it.$ref));
       out.push({ label, url: r.url, status: r.status, error: r.error, keys: r.keys, sample: r.sample, refs: refs.map(({ body, ...x }) => x) });
     }
     return out;
   }
   
   const hHelp = () => {
     const cats = {};
     INTENTS.forEach((i) => { if (i.ex?.length) (cats[i.cat] = cats[i.cat] || []).push(...i.ex); });
     return A('Here is what I can answer. Tap an example or type your own. Type /reset if ESPN data seems stuck.', [{ t: 'list', items: Object.entries(cats).map(([c, ex]) => ({ title: c, sub: ex.slice(0, 2).join('  |  ') })) }], { chips: [{ label: 'Tonight\'s games', q: 'What games are on tonight?' }, { label: 'Who leads in threes?', q: 'Who leads the league in threes?' }] });
   };
   
   /* =====================================================================
      9. INTENT REGISTRY — one small entry per question type, tested in order
      ===================================================================== */
   const INTENTS = [
     { id: 'help', cat: 'Help', ex: ['/help'], test: (p) => /^\/?help$|^\/\?$|what can (i|you)|what do you do/.test(p.n), run: hHelp },
     { id: 'propLine', cat: 'Prop lines', ex: ['What was his set line?', 'Jaylen Brown points line tonight'], test: (p) => p.player && /\blines?\b|\bprops?\b|\bo\/u\b|over\/under/.test(p.n), run: hPropLine },
     { id: 'topProps', cat: 'Betting context', ex: ['What\'s the best prop tonight?'], test: (p) => !p.player && (/\b(best|top|strongest|safest|smartest|good)\b.*\b(props?|bets?|picks?|edges?)\b|\b(props?|bets?|picks?)\b.*\b(best|top|worth)\b/.test(p.n)), run: hTopProps },
     { id: 'topLines', cat: 'Betting context', ex: ['Which games tonight have the highest lines?'], test: (p) => !p.player && /\b(highest|biggest|largest|lowest|smallest|closest|tightest|most)\b.*\b(lines?|totals?|spreads?|over under|odds)\b/.test(p.n), run: hTopLines },
     { id: 'without', cat: 'With and without', ex: ['If Embiid is out, how do Maxey\'s numbers change?'], test: (p) => p.players.length >= 1 && /\b(if|when|without)\b/.test(p.n) && /\b(out|without|sits?|sitting|misses|missing|injured|absent)\b/.test(p.n) && /\b(numbers?|stats?|averages?|change|production|perform\w*|do|does|better|worse|points|rebounds|assists|scor\w*)\b/.test(p.n), run: hWithout },
     { id: 'defense', cat: 'Team', ex: ['How does Miami defend?'], test: (p) => p.teams.length > 0 && /\b(defen[sc]e|defend\w*|defensive)\b/.test(p.n), run: hDefense },
     { id: 'injuries', cat: 'Injuries', ex: ['Who\'s injured on the Warriors?', 'Is Embiid injured?'], test: (p) => /\binjur\w*|\bhurt\b|\bquestionable\b|\bout tonight\b/.test(p.n), run: hInjuries },
     { id: 'plays', cat: 'Play-by-play', ex: ['Last 5 plays of the Celtics game', 'Latest scoring plays Lakers'], test: (p) => !/\b(who|teams?)\b.*\bplays?\b/.test(p.n) && /\bplays?\b|play by play|pbp/.test(p.n), run: hPlays },
     { id: 'winProb', cat: 'Live game', ex: ['Win probability in the Nuggets game'], test: (p) => /win prob\w*|chances? (of|to) win/.test(p.n), run: hWinProb },
     { id: 'futures', cat: 'Betting context', ex: ['Who\'s favored to win the title?'], test: (p) => /\b(futures|favou?red to win|favou?rites? to win|title (odds|favou?rites?|contenders?)|championship (odds|favou?rites?)|(win|winning) the (title|championship|finals)|who wins the (title|championship|finals))\b/.test(p.n), run: hFutures },
     { id: 'ats', cat: 'Betting context', ex: ['Celtics ATS record'], test: (p) => /\bats\b|against the spread|cover(s|ed|ing)? the spread|\b(over under|o\/u) record/.test(p.n), run: hAts },
     { id: 'contract', cat: 'Player background', ex: ['Jokic\'s contract'], test: (p) => /\bcontracts?\b|\bsalary\b|\bcap hit\b/.test(p.n), run: hContract },
     { id: 'odds', cat: 'Betting context', ex: ['What\'s the spread on the Knicks game tonight?', 'Tonight\'s odds'], test: (p) => !p.player && /\b(spread|moneyline|money line|odds|point spread|total points|over under|favored by|line on)\b/.test(p.n), run: hOdds },
     { id: 'broadcast', cat: 'Broadcast', ex: ['What channel is the Lakers game on?', 'What time is the Heat game?'], test: (p) => /\b(channel|network|tv|broadcast|stream|tip ?off|what time|start time)\b/.test(p.n), run: hBroadcast },
     { id: 'threshold', cat: 'History', ex: ['How many times has LeBron scored over 28 against the Cavs?', 'Jokic triple-doubles this season'], test: (p) => p.player && ((p.cmp && /\b(times|how often|how many|games|against|vs|versus)\b/.test(p.n)) || (p.stat?.dbl && /\b(how many|times|count)\b/.test(p.n))), run: hThreshold },
     { id: 'careerHigh', cat: 'History', ex: ['What was Wemby\'s career high in points?', 'Last time Curry scored 40+'], test: (p) => p.player && /career high|season high|best game|career best|personal best|highest|last time/.test(p.n), run: hCareerHigh },
     { id: 'boxscore', cat: 'Box score', ex: ['Celtics quarter scores', 'Lakers box score'], test: (p) => (p.teams.length || p.player) && /box ?score|line ?score|by quarter|quarter scores?/.test(p.n), run: hBoxscore },
     { id: 'gameStat', cat: 'Player in a game', ex: ['How many points did Jaylen Brown have today?', 'How many points did LeBron have last night?'], test: (p) => p.player && !p.cmp && !p.N && !/average|avg|per game|season|career|splits?|stats?\b/.test(p.n) && (p.date || /\bhow many\b.*\b(have|had|get|got|score|scored|record|recorded|put up|drop|dropped)\b/.test(p.n)), run: hGameStat },
     { id: 'splits', cat: 'Splits', ex: ['Lakers home vs away splits', 'Brunson home vs away'], test: (p) => (p.player || p.teams.length) && /\bsplits?\b|home (vs|versus|and|or) (away|road)|home\/away/.test(p.n), run: hSplits },
     { id: 'lastN', cat: 'Recent form', ex: ['LeBron last 10 games', 'How\'s Brunson been playing?'], test: (p) => p.player && (p.N || /\b(recent|recently|lately|form|performance|been (playing|doing|performing))\b/.test(p.n)), run: hLastN },
     { id: 'seasonStats', cat: 'Season stats', ex: ['Brunson stats this season', 'Curry shooting percentages'], test: (p) => p.player && (/\b(stats?|averag\w*|avg|ppg|rpg|apg|shooting|percentage|pct|per game|this season|season|usage)\b/.test(p.n) || p.stat?.pct), run: hSeasonStats },
     { id: 'bio', cat: 'Player background', ex: ['How tall is Wemby?', 'What college did Brunson go to?'], test: (p) => p.player && /\b(how tall|height|weight|how old|age|college|drafted|born|jersey|number|bio|experience)\b/.test(p.n), run: hBio },
     { id: 'unsupported', cat: 'Not available yet', ex: [], test: (p) => /\b(power index|bpi|picked first|first overall|playoffs start|when (do|does|is|are) the (playoffs|season|finals))\b/.test(p.n), run: hUnsupported },
     { id: 'starters', cat: 'Lineups', ex: ['Who starts at center for the Heat?', 'Knicks starting lineup'], test: (p) => p.teams.length && /\b(starts?|starting|starters?)\b/.test(p.n), run: hStarters },
     { id: 'roster', cat: 'Team', ex: ['Heat roster'], test: (p) => p.teams.length && /\broster\b/.test(p.n), run: hRoster },
     { id: 'coach', cat: 'Team', ex: ['Who coaches the Cavs?'], test: (p) => /\bcoach(es)?\b/.test(p.n), run: hCoach },
     { id: 'h2h', cat: 'Head to head', ex: ['Knicks vs Celtics head to head', 'LeBron vs Steph'], test: (p) => (p.teams.length >= 2 || p.players.length >= 2) && /\b(vs|versus|head to head|h2h|against|beat)\b/.test(p.n), run: hH2H },
     { id: 'leaders', cat: 'League leaders', ex: ['Who leads the league in threes?', 'Top rebounders this season'], test: (p) => !p.player && p.stat && /\b(leads?|leaders?|leading|top|best|most|highest)\b/.test(p.n), run: hLeaders },
     { id: 'standings', cat: 'Standings', ex: ['East standings', 'What\'s the Celtics record?'], test: (p) => /\b(standings?|seeds?|conference|record|games back)\b/.test(p.n) || /\b(east|west)\b/.test(p.n), run: hStandings },
     { id: 'transactions', cat: 'Transactions', ex: ['Any trades today?', 'Latest Lakers signings'], test: (p) => /\btrades?|traded|signed|signings?|waived|transactions?|free agen\w+/.test(p.n), run: hTransactions },
     { id: 'news', cat: 'News', ex: ['Latest Warriors news'], test: (p) => /\bnews|headlines?|latest on|rumou?rs?\b/.test(p.n), run: hNews },
     { id: 'scores', cat: 'Scores & schedule', ex: ['What games are on tonight?', 'Celtics next game'], test: (p) => /\b(scores?|final|slate|schedule|who plays|who is playing|games? (tonight|today|yesterday)|tonight|next game|last game|result)\b/.test(p.n) || (p.teams.length && !p.player && /\b(game|games)\b/.test(p.n)), run: hScores },
   ];
   
   /* =====================================================================
      10. ANSWER PIPELINE (parse → classify → run → merge context)
      ===================================================================== */
   /* words that are never a player name (so anything else left over looks like an unresolved name) */
   const FUNC = new Set('a an at in on of to is it be been being by or if so vs versus i me my you your he his him himself she her they their them can could would should will do doing done and also then now instead out up down off per any all some like really still yet again too same other another one ones new old only even each both either not no yes ok okay thanks thank hey hi hello yo gonna going playing played performing performance form recent recently lately split splits averages compare better worse but'.split(' '));
   const unresolvedNames = (p, idx) => {
     const known = new Set(p.players.flatMap((x) => x.nn.split(' ')));
     return p.n.split(' ').filter((w) => w.length >= 3 && !/\d/.test(w) && !STOP.has(w) && !FUNC.has(w) && !idx.teamWords.has(w) && !known.has(w) && !STAT_ORDER.some((k) => STATS[k].re.test(w)));
   };
   const suggestPlayers = (word, idx, min = 0.6) => {
     const seen = new Set();
     return idx.players
       .map((x) => ({ x, sc: Math.max(sim(word, x.last), sim(word, x.first), sim(word, x.nn)) }))
       .filter((r) => r.sc >= min).sort((a, b) => b.sc - a.sc)
       .filter((r) => (seen.has(r.x.id) ? false : (seen.add(r.x.id), true))).slice(0, 3).map((r) => r.x);
   };
   const FOLLOW_RE = /^(and|also|what about|how about|what if|same|now|then|but)\b|\binstead\b/;
   /* one string describing every param a handler can use; used to spot follow-ups that changed nothing */
   const sigOf = (p, id) => JSON.stringify([id, p.player?.id || null, p.stat?.key || null, (p.teams || []).map((t) => t.team.id), p.loc || null, p.N || null, p.cmp || null, p.thr ?? null, p.scope || null, p.date?.iso || p.date?.kind || null]);
   
   async function answerQuestion(q, ctx, env) {
     const p = parseQuestion(q, env, ctx);
     const swap = (heard, full) => { const re = new RegExp(esc(heard), 'i'); return re.test(q) ? q.replace(re, full) : `${q} (${full})`; };
     if (p.ask) return A(`Did you mean **${p.ask.player.name}**?`, [], { chips: [{ label: `Yes, ${p.ask.player.name}`, q: swap(p.ask.heard, p.ask.player.name) }] });
     if (p.ambiguous) return A('Which player do you mean?', [], { chips: p.ambiguous.list.map((x) => ({ label: `${x.name} (${x.abbr})`, q: swap(p.ambiguous.heard, x.name) })) });
   
     if (!p.players.length) {
       const guess = p.n.split(' ').filter((w) => w.length >= 4 && !STOP.has(w) && !env.idx.teamWords.has(w)).slice(-2).join(' ');
       if (guess && /\bhow many\b|\bstats?\b/.test(p.n) && !p.teams.length) {
         const hit = await searchPlayer(env.EP, env.lg, guess);
         if (hit) { p.player = hit; p.players.push(hit); }
       }
     }
   
     let intent = INTENTS.find((i) => i.test(p));
     let carried = false;
     if (!intent) {
       /* a name-like word we could not resolve: never reuse the previous player */
       const unres = p.players.length ? [] : unresolvedNames(p, env.idx);
       if (unres.length) {
         const heard = unres[0];
         const sug = suggestPlayers(heard, env.idx);
         const capital = String(q).split(/\s+/).some((t) => /^[A-Z]/.test(t) && norm(t).startsWith(heard.slice(0, 3)));
         if (sug.length) return A(`I couldn't find "${heard}". Did you mean one of these?`, [], { chips: sug.map((x) => ({ label: `${x.name} (${x.abbr})`, q: swap(heard, x.name) })) });
         if (capital) return A(`I couldn't find "${heard}". Try the full name, like "Jaylen Brown".`, []);
       } else {
         const paramsChanged = !!(p.stat || p.teams.length || p.loc || p.N || p.cmp || p.date);
         if (ctx?.lastIntent && (paramsChanged || (p.player && FOLLOW_RE.test(p.n)))) {
           /* follow-up: re-run the SAME intent with the merged params */
           if (!p.player && ctx.player) { p.player = ctx.player; p.players = [ctx.player]; }
           if (!p.stat && ctx.stat) p.stat = STATS[ctx.stat] || null;
           if (!p.teams.length && ctx.teams?.length) p.teams = ctx.teams.map((id) => ({ team: env.idx.teamById[id] })).filter((x) => x.team);
           if (!p.loc && ctx.loc && ctx.loc !== 'split') p.loc = ctx.loc;
           if (!p.N && ctx.N) p.N = ctx.N;
           if (!p.scope && ctx.scope) p.scope = ctx.scope;
           if (!p.cmp && ctx.cmp) { p.cmp = ctx.cmp; p.thr = ctx.thr; }
           if (!p.date && ctx.date && ['gameStat', 'propLine'].includes(ctx.lastIntent)) p.date = ctx.date;
           intent = INTENTS.find((i) => i.id === ctx.lastIntent);
           carried = !!intent;
         } else if (p.player) {
           const nm = p.player.name;
           const res = A(`What would you like to know about ${nm}?`, [], { chips: [{ label: 'Last 10 games', q: `${nm} last 10 games` }, { label: 'Season averages', q: `${nm} stats this season` }, { label: 'Splits', q: `${nm} home vs away splits` }, { label: 'Tonight\'s line', q: `${nm} points line tonight` }] });
           res.nextCtx = { ...(ctx || {}), player: p.player };
           return res;
         }
       }
     }
     if (!intent) {
       return A('I didn\'t catch that. Try a question about a player, team, game or the league.', [], { chips: [{ label: 'How many points did LeBron have last night?', q: 'How many points did LeBron have last night?' }, { label: 'Who leads the league in threes?', q: 'Who leads the league in threes?' }, { label: 'What can I ask?', q: '/help' }] });
     }
     const sig = sigOf(p, intent.id);
     if (carried && ctx?.sig === sig) console.warn('[SlateBot] follow-up produced the same params as the previous turn; the answer will repeat.', { intent: intent.id, params: JSON.parse(sig) });
     const res = await intent.run(p, env);
     if (p.note) res.text = `${p.note} ${res.text}`;
     const c = res.ctx || {};
     res.nextCtx = {
       lastIntent: intent.id,
       sig,
       player: c.player ?? p.player ?? ctx?.player ?? null,
       stat: c.stat ?? p.stat?.key ?? ctx?.stat ?? null,
       teams: c.teams ?? (p.teams.length ? p.teams.map((t) => t.team.id) : ctx?.teams ?? []),
       date: c.date !== undefined ? c.date : p.date ?? null,
       loc: c.loc ?? p.loc ?? null, N: c.N ?? p.N ?? null, cmp: c.cmp ?? p.cmp ?? null, thr: c.thr ?? p.thr ?? null,
       scope: c.scope ?? p.scope ?? null,
       game: c.game ?? ctx?.game ?? null,
     };
     delete res.ctx;
     return res;
   }
   
   /* =====================================================================
      11. STYLE HELPERS (Tailwind does the styling; only one local keyframe)
      ===================================================================== */
   const KEYFRAMES = '@keyframes sbDot{0%,80%,100%{opacity:.25}40%{opacity:1}}';
   const RAJ = { fontFamily: 'Rajdhani, sans-serif' };
   const FADE_UP = { animation: 'fadeUp 0.3s ease-out both' };
   const HEADER_BG = { background: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 100%)' };
   const TILE = 'rounded-xl border border-zinc-700 bg-zinc-800/50 p-2';
   
   /* Team color for an answer's border + top glow. Near-black colors (BKN, DEN, MIN...) would vanish on a
      black panel, so they fall back to zinc-600. */
   const tintFor = (abbr, colors) => {
     const hex = colors?.[abbr];
     if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
     const sum = parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
     return sum < 120 ? '#52525b' : hex;
   };
   
   /* =====================================================================
      12. UI COMPONENTS
      ===================================================================== */
   function Rich({ text }) {
     return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith('**') && s.endsWith('**') ? <strong key={i} className="font-bold text-white">{s.slice(2, -2)}</strong> : <React.Fragment key={i}>{s}</React.Fragment>));
   }
   
   function Chart({ vals, labels, line, title }) {
     const n = vals.length;
     if (!n) return null;
     const max = Math.max(line ?? 0, ...vals, 1) * 1.12;
     const pct = (v) => Math.max((v / max) * 100, 1);
     return (
       <div className={TILE}>
         {title && <div className="text-[10px] text-gray-400 font-semibold mb-1">{title}</div>}
         <div className="relative h-24 mt-3">
           <div className="absolute inset-0 flex items-stretch gap-[2px]">
             {vals.map((v, i) => {
               const over = line != null && v > line;
               return (
                 <div key={i} className="relative flex-1 h-full">
                   {n <= 14 && <span className="absolute inset-x-0 text-center text-[8px] text-gray-400" style={{ bottom: `calc(${pct(v)}% + 1px)` }}>{f1(v)}</span>}
                   <div className={`absolute bottom-0 inset-x-0 rounded-t-sm ${over ? 'bg-blue-500' : 'bg-blue-900'}`} style={{ height: `${pct(v)}%` }} />
                 </div>
               );
             })}
           </div>
           {line != null && (
             <div className="absolute inset-x-0 z-10 border-t border-dashed border-zinc-600" style={{ bottom: `${pct(line)}%` }}>
               <span className="absolute right-0 -top-3 text-[8px] text-gray-400">{f1(line)}</span>
             </div>
           )}
         </div>
         {n <= 10 && labels.some(Boolean) && (
           <div className="flex gap-[2px] mt-1">{vals.map((_, i) => <span key={i} className="flex-1 text-center text-[8px] text-gray-500 truncate">{labels[i]}</span>)}</div>
         )}
       </div>
     );
   }
   
   function Tbl({ head, children }) {
     return (
       <div className="overflow-x-auto max-w-full rounded-xl border border-zinc-800">
         <table className="w-full text-xs whitespace-nowrap border-collapse">
           <thead><tr>{head.map((h, i) => <th key={i} className="bg-zinc-800 text-gray-400 font-semibold text-left px-2 py-1.5">{h}</th>)}</tr></thead>
           <tbody>{children}</tbody>
         </table>
       </div>
     );
   }
   
   function CopyBtn({ text, label = 'Copy' }) {
     const [ok, setOk] = useState(false);
     return (
       <button type="button" className="rounded-full bg-zinc-800 text-gray-300 text-xs font-semibold px-3 py-1 active:bg-blue-600 active:text-white"
         onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch (e) { /* clipboard blocked */ } }}>
         {ok ? 'Copied' : label}
       </button>
     );
   }
   
   function ProbeBlock({ rows }) {
     const asText = (r) => `${r.url}\nstatus: ${r.status}${r.error ? ` (${r.error})` : ''}\nkeys: ${(r.keys || []).join(', ')}\n${r.sample || ''}`;
     const one = (r, i) => (
       <details key={i} className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2">
         <summary className="cursor-pointer text-xs font-semibold text-blue-500">{r.label ? `${r.label} · ` : ''}{r.status || 'no response'}</summary>
         <div className="mt-2 flex flex-col gap-1.5">
           <div className="text-[10px] text-gray-400 break-all">{r.url}</div>
           {r.error && <div className="text-[10px] text-red-500">{r.error}</div>}
           <div className="text-[10px] text-gray-400">keys: {(r.keys || []).join(', ') || 'none'}</div>
           {r.sample ? <pre className="text-[10px] text-gray-300 overflow-x-auto max-h-56 whitespace-pre">{r.sample}</pre> : null}
           <div><CopyBtn text={asText(r)} /></div>
           {(r.refs || []).map((x, k) => one({ ...x, label: `$ref ${k + 1}` }, `r${k}`))}
         </div>
       </details>
     );
     const all = rows.map((r) => [asText(r), ...(r.refs || []).map(asText)].join('\n\n')).join('\n\n=====\n\n');
     return <div className="flex flex-col gap-1.5">{rows.map(one)}<div><CopyBtn text={all} label="Copy all" /></div></div>;
   }
   
   function Block({ b }) {
     if (b.t === 'cards') {
       return (
         <div className="grid grid-cols-[repeat(auto-fit,minmax(68px,1fr))] gap-1.5">
           {b.items.map((c, i) => (
             <div className={`${TILE} text-center`} key={i}>
               <div className="text-lg font-bold" style={RAJ}>{c.v}</div>
               <div className="text-[10px] text-gray-400">{c.k}</div>
             </div>
           ))}
         </div>
       );
     }
     if (b.t === 'table') {
       return (
         <Tbl head={b.head}>
           {b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-t border-zinc-800 px-2 py-1.5 text-white">{c}</td>)}</tr>)}
         </Tbl>
       );
     }
     if (b.t === 'probe') return <ProbeBlock rows={b.rows} />;
     if (b.t === 'chart') return <Chart {...b} />;
     if (b.t === 'games') {
       return (
         <details className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2">
           <summary className="cursor-pointer text-xs font-semibold text-blue-500">{b.title}</summary>
           <div className="mt-2">
             <Tbl head={b.head}>
               {b.rows.map((r, i) => (
                 <tr key={i}>
                   <td className="border-t border-zinc-800 px-2 py-1.5 text-white">{r.d}</td>
                   <td className="border-t border-zinc-800 px-2 py-1.5 text-white">{r.o}</td>
                   <td className={`border-t border-zinc-800 px-2 py-1.5 ${r.hit === true ? 'text-green-500 font-bold' : r.hit === false ? 'text-red-500 font-bold' : 'text-white'}`}>{r.v}</td>
                 </tr>
               ))}
             </Tbl>
           </div>
         </details>
       );
     }
     if (b.t === 'people') {
       return (
         <div className="flex flex-col gap-1.5">
           {b.rows.map((r, i) => (
             <div className={`${TILE} flex items-center gap-3`} key={i}>
               <img
                 className="w-10 h-10 rounded-full object-cover bg-zinc-800 shrink-0"
                 src={r.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${r.id}.png` : ''}
                 alt=""
                 onError={(e) => { e.target.style.visibility = 'hidden'; }}
               />
               <div className="flex-1 min-w-0">
                 <div className="font-bold truncate" style={RAJ}>{r.name}</div>
                 {r.sub && <div className="text-[10px] text-gray-400">{r.sub}</div>}
               </div>
               {r.val && <div className="text-lg font-bold" style={RAJ}>{r.val}</div>}
             </div>
           ))}
         </div>
       );
     }
     if (b.t === 'list') {
       return (
         <div className="flex flex-col gap-1.5">
           {b.items.map((it, i) => (
             <div className={TILE} key={i}>
               <div className="text-white">{it.href ? <a className="text-blue-500" href={it.href} target="_blank" rel="noopener noreferrer">{it.title}</a> : it.title}</div>
               {it.sub && <div className="text-[10px] text-gray-400 mt-0.5">{it.sub}</div>}
             </div>
           ))}
         </div>
       );
     }
     return null;
   }
   
   function Message({ m, onChip }) {
     const isUser = m.role === 'user';
     const blocks = m.blocks || [];
   
     if (isUser) {
       return (
         <div className="flex flex-col items-end" style={FADE_UP}>
           <div className="bg-blue-600 text-white rounded-2xl rounded-br-md ml-auto max-w-[85%] px-3 py-2 whitespace-pre-wrap break-words"><Rich text={m.text} /></div>
         </div>
       );
     }
   
     const cardStyle = m.tint ? { borderColor: `${m.tint}99`, boxShadow: `0 -10px 24px -14px ${m.tint}` } : undefined;
     return (
       <div className="flex flex-col items-start gap-1.5" style={FADE_UP}>
         {(m.text || blocks.length > 0 || m.ts) && (
           <div
             className={`bg-zinc-900 text-white rounded-2xl rounded-bl-md max-w-[92%] min-w-0 px-3 py-2 flex flex-col gap-2 border ${m.tint ? '' : 'border-transparent'} ${blocks.length ? 'w-full' : ''}`}
             style={cardStyle}
           >
             {m.text ? <div className="whitespace-pre-wrap break-words"><Rich text={m.text} /></div> : null}
             {blocks.map((b, i) => <Block b={b} key={i} />)}
             {m.ts && (
               <div className="text-[10px] text-gray-500">
                 ESPN{m.provider ? ` · ${m.provider}${m.stamp ? ` · line ${m.stamp}` : ''}` : ''} · as of {new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                 {m.betting ? ' · data only, not advice' : ''}
               </div>
             )}
           </div>
         )}
         {m.chips?.length ? (
           <div className="flex flex-wrap gap-2">
             {m.chips.map((c, i) => (
               <button key={i} className="rounded-full bg-zinc-800 text-gray-300 text-xs font-semibold px-3 py-1.5 text-left active:bg-blue-600 active:text-white" onClick={() => onChip(c.q)}>{c.label}</button>
             ))}
           </div>
         ) : null}
       </div>
     );
   }
   
   const SUGGESTIONS = [
     'How many points did LeBron have last night?',
     'Who leads the league in threes?',
     'Who\'s injured on the Warriors?',
     'What channel is the Lakers game on?',
     'Lakers home vs away splits',
     'What games are on tonight?',
     'What\'s the best prop tonight?',
     'Which games tonight have the highest lines?',
     'Tonight\'s odds',
     'East standings',
     'West standings',
     'Jokic triple-doubles this season',
     'Last time Curry scored 40+',
     'LeBron last 10 games',
     'Brunson home vs away',
     'Who leads the league in assists?',
     'Top rebounders this season',
     'Celtics next game',
     'Who coaches the Cavs?',
     'Heat roster',
     'Any trades today?',
     'Latest Warriors news',
     'Knicks vs Celtics head to head',
     'If Embiid is out, how do Maxey\'s numbers change?',
     'Who\'s favored to win the title?',
     'Celtics ATS record',
     'Last 5 plays of the Celtics game',
     'How tall is Wemby?',
     '/help',
   ];
   
   /* Auto-scrolling suggestion row. Drifts left on its own, pauses while the user touches, hovers,
      focuses or wheel-scrolls it, then resumes. Still manually scrollable; every chip is tappable. */
   function SuggestionMarquee({ items, onPick, speed = 28 }) {
     const ref = useRef(null);
     const paused = useRef(false);
     const timer = useRef(null);
   
     const hold = () => { clearTimeout(timer.current); paused.current = true; };
     const release = (ms) => { clearTimeout(timer.current); timer.current = setTimeout(() => { paused.current = false; }, ms); };
   
     useEffect(() => {
       const el = ref.current;
       if (!el) return undefined;
       if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
       let raf;
       let last = performance.now();
       let pos = el.scrollLeft;
       const tick = (now) => {
         const dt = Math.min(now - last, 64);
         last = now;
         if (paused.current) {
           pos = el.scrollLeft; // follow the user's own scrolling
         } else {
           if (Math.abs(el.scrollLeft - pos) > 1.5) pos = el.scrollLeft;
           pos += (speed * dt) / 1000;
           const half = el.scrollWidth / 2; // list is rendered twice, so wrap at the midpoint
           if (half > 0 && pos >= half) pos -= half;
           el.scrollLeft = pos;
         }
         raf = requestAnimationFrame(tick);
       };
       raf = requestAnimationFrame(tick);
       return () => { cancelAnimationFrame(raf); clearTimeout(timer.current); };
     }, [speed]);
   
     const wrapFix = () => { // manual scroll past either end of the doubled list: jump to the matching spot
       const el = ref.current;
       if (!el) return;
       const half = el.scrollWidth / 2;
       if (half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
     };
   
     return (
       <div
         ref={ref}
         className="flex overflow-x-auto -mx-3 px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
         onTouchStart={() => hold()}
         onTouchEnd={() => release(3000)}
         onTouchCancel={() => release(3000)}
         onMouseEnter={() => hold()}
         onMouseLeave={() => release(600)}
         onWheel={() => { hold(); release(2000); }}
         onFocus={() => hold()}
         onBlur={() => release(1000)}
         onScroll={wrapFix}
       >
         {[0, 1].map((copy) => items.map((s) => (
           <button
             key={`${copy}-${s}`}
             type="button"
             tabIndex={copy ? -1 : 0}
             aria-hidden={copy ? true : undefined}
             onClick={() => onPick(s)}
             className="shrink-0 whitespace-nowrap mr-2 rounded-full bg-zinc-800 text-gray-300 text-xs font-semibold px-3 py-1.5 active:bg-blue-600 active:text-white"
           >
             {s === '/help' ? 'What can I ask?' : s}
           </button>
         )))}
       </div>
     );
   }
   const OLD_STORAGE_KEYS = ['sb_chat_v1', 'sb_ctx_v1']; // older versions saved the chat here; deleted on mount
   
   /* =====================================================================
      13. MAIN COMPONENT
      ===================================================================== */
   export default function SlateBot({ defaultOpen = false, bottomOffset = 88, league = 'nba', side = 'left', teamColors = TEAM_COLORS }) {
     const lg = LEAGUES[league] || LEAGUES.nba;
     const EP = useMemo(() => endpoints(lg), [lg]);
     const [open, setOpen] = useState(defaultOpen);
     const [messages, setMessages] = useState([]);
     const [input, setInput] = useState('');
     const [busy, setBusy] = useState(false);
     const ctxRef = useRef({});
     const idxPromise = useRef(null); // shared by StrictMode's double mount so the index is built once
     const listRef = useRef(null);
     const inputRef = useRef(null);
   
     /* Visual viewport (shrinks when the on-screen keyboard opens) so the sheet fits above the keyboard */
     const [vv, setVv] = useState(null);
   
     useEffect(() => {
       if (!open || !window.visualViewport) return undefined;
       const vp = window.visualViewport;
       const update = () => setVv({ h: vp.height, top: vp.offsetTop, kb: window.innerHeight - vp.height > 120 });
       update();
       vp.addEventListener('resize', update);
       vp.addEventListener('scroll', update);
       return () => { vp.removeEventListener('resize', update); vp.removeEventListener('scroll', update); setVv(null); };
     }, [open]);
   
     const mobileSheet = !!vv && window.matchMedia('(max-width: 639px)').matches;
   
     /* The chat lives in React state only. Remove anything older versions saved. */
     useEffect(() => { OLD_STORAGE_KEYS.forEach((k) => { ss.del(k); ls.del(k); }); }, []);
   
     /* Resuming from the background doesn't reload the app, so wipe the chat if the page was hidden too long. */
     useEffect(() => {
       let hiddenAt = null;
       const onVis = () => {
         if (document.hidden) { hiddenAt = Date.now(); return; }
         if (hiddenAt && Date.now() - hiddenAt > CHAT_RESET_AFTER_HIDDEN_MS) { setMessages([]); setInput(''); ctxRef.current = {}; }
         hiddenAt = null;
       };
       document.addEventListener('visibilitychange', onVis);
       return () => document.removeEventListener('visibilitychange', onVis);
     }, []);
   
     useEffect(() => {
       const el = listRef.current;
       if (!el) return;
       const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
       el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
     }, [messages, busy, open, vv?.h]);
   
     useEffect(() => {
       if (!open) return undefined;
       const t = setTimeout(() => inputRef.current?.focus(), 320);
       const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
       window.addEventListener('keydown', onKey);
       return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
     }, [open]);
   
     /* Lock the page behind the chat while it is open */
     useEffect(() => {
       if (!open) return undefined;
       const y = window.scrollY;
       const b = document.body.style;
       const h = document.documentElement.style;
       const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow, paddingRight: b.paddingRight, hOverflow: h.overflow };
       const sbw = window.innerWidth - document.documentElement.clientWidth; // keeps desktop layout from jumping
       b.position = 'fixed';
       b.top = `-${y}px`;
       b.width = '100%';
       b.overflow = 'hidden';
       if (sbw > 0) b.paddingRight = `${sbw}px`;
       h.overflow = 'hidden';
       // also stops inner scroll containers in the app: only the message list may scroll
       const block = (e) => { if (!listRef.current?.contains(e.target)) e.preventDefault(); };
       document.addEventListener('touchmove', block, { passive: false });
       document.addEventListener('wheel', block, { passive: false });
       return () => {
         document.removeEventListener('touchmove', block);
         document.removeEventListener('wheel', block);
         b.position = prev.position; b.top = prev.top; b.width = prev.width; b.overflow = prev.overflow; b.paddingRight = prev.paddingRight;
         h.overflow = prev.hOverflow;
         window.scrollTo(0, y);
       };
     }, [open]);
   
   
     const loadIndex = useCallback(() => {
       if (!idxPromise.current) {
         idxPromise.current = (async () => {
           let raw;
           try { raw = await buildIndex(EP); } catch (e) {
             dbg(`buildIndex failed (${e?.name}: ${e?.message}); continuing with teams only`);
             raw = { ts: Date.now(), teams: await loadTeams(EP), players: [], coaches: {} }; // loadTeams never throws
           }
           const ix = prepareIndex(raw);
           if (!ix.players.length) setTimeout(() => { idxPromise.current = null; }, 60000); // try again in a minute
           return ix;
         })().catch((e) => { idxPromise.current = null; throw e; });
       }
       return idxPromise.current;
     }, [EP]);
   
     const getEnv = useCallback(async () => ({ lg, EP, idx: await loadIndex(), today: slateISO() }), [EP, lg, loadIndex]);
   
     useEffect(() => {
       if (!open) return;
       getEnv().then((env) => snapshotTonight(env)).catch(() => {});
     }, [open, getEnv]);
   
     const push = useCallback((m) => setMessages((prev) => [...prev, { id: uid(), ts: Date.now(), ...m }].slice(-50)), []);
   
     const send = useCallback(async (text) => {
       const q = String(text ?? input).trim();
       if (!q || busy) return;
       setInput('');
       push({ role: 'user', text: q });
   
       if (/^\/?reset$/i.test(q)) { // handled before getEnv so it works even when the index can't build
         resetCaches();
         idxPromise.current = null;
         ctxRef.current = {};
         push({ role: 'bot', text: 'Reset done: cleared endpoint health, cached responses and the player index. Ask again and I\'ll refetch from ESPN.' });
         return;
       }
   
       if (/^\/probe$/i.test(q)) { // hidden developer command
         setBusy(true);
         try {
           const env = await getEnv();
           push({ role: 'bot', text: `Probe results for the ${seasonNow()} season. Copy a sample or "Copy all" and send it back.`, blocks: [{ t: 'probe', rows: await runProbe(env) }] });
         } catch (e) { push({ role: 'bot', text: `Probe failed: ${e?.message || e}` }); } finally { setBusy(false); }
         return;
       }
   
       setBusy(true);
       try {
         const env = await getEnv();
         const res = await answerQuestion(q, ctxRef.current, env);
         if (res.nextCtx) ctxRef.current = res.nextCtx;
         const { nextCtx, intent, ...msg } = res;
         // appearance only: tint the answer with the team (or the player's team) it is about
         const abbr = nextCtx?.player?.abbr || env.idx.teamById[nextCtx?.teams?.[0]]?.abbr;
         push({ role: 'bot', ...msg, tint: nextCtx ? tintFor(abbr, teamColors) : null });
       } catch (e) {
         const down = downEndpoints();
         push({ role: 'bot', text: e?.down || down.length
           ? `ESPN data is temporarily unavailable for part of that (${down.map((d) => d.split('/').slice(0, 3).join('/')).join(', ') || 'one endpoint'}). I'll retry in about 10 minutes, or type /reset to retry now.`
           : 'ESPN didn\'t respond. Try again in a moment, or type /reset.' });
         dbg(`answer failed (${e?.name}: ${e?.message})`);
       } finally { setBusy(false); }
     }, [input, busy, getEnv, push, teamColors]);
   
     const clear = () => { setMessages([]); ctxRef.current = {}; };
   
     /* Open + focus inside the same tap so iOS shows the keyboard immediately */
     const toggle = () => {
       if (open) { setOpen(false); return; }
       flushSync(() => setOpen(true));
       inputRef.current?.focus({ preventScroll: true });
     };
   
     const isRight = side === 'right';
     const sideBubble = isRight ? 'right-4' : 'left-4';
     const sideSheet = isRight ? 'sm:right-4' : 'sm:left-4';
     const canSend = !busy && !!input.trim();
   
     return (
       <div style={{ '--sb-bottom': `${bottomOffset}px` }}>
         <style>{KEYFRAMES}</style>
   
         {/* dim backdrop (phones only); tap to close */}
         <div
           className={`fixed inset-0 z-[159] bg-black/60 transition-opacity duration-300 sm:hidden ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
           onClick={() => setOpen(false)}
           aria-hidden="true"
         />
   
         {/* floating bubble */}
         <button
           type="button"
           aria-label={open ? 'Close Slate assistant' : 'Open Slate assistant'}
           onClick={toggle}
           className={`fixed z-[160] ${sideBubble} w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-[0_0_12px_rgba(37,99,235,0.7)] active:scale-95 transition-transform duration-150 ${open ? 'max-sm:hidden' : ''}`}
           style={{ bottom: 'calc(var(--sb-bottom) + env(safe-area-inset-bottom, 0px))' }}
         >
           {open ? <X size={24} /> : <MessageCircle size={24} />}
         </button>
   
         {/* chat panel: bottom sheet on phones, ~380px card on desktop */}
         <div
           role="dialog"
           aria-label="Slate assistant"
           aria-hidden={!open}
           className={`fixed z-[161] inset-x-0 top-0 h-[100dvh] flex flex-col bg-black text-white overflow-hidden transition-[transform,opacity] duration-300 ease-out sm:inset-x-auto sm:top-auto ${sideSheet} sm:bottom-[calc(var(--sb-bottom)+64px)] sm:w-[380px] sm:h-[min(640px,78vh)] sm:rounded-2xl sm:border sm:border-zinc-800 ${open ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
           style={mobileSheet ? { top: vv.top, height: vv.h } : undefined}
         >
           {/* sticky header */}
           <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 backdrop-blur-md border-b border-white/5" style={{ ...HEADER_BG, paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
             <div className="flex-1 flex items-baseline gap-2 min-w-0">
               <span className="text-xl font-bold" style={RAJ}>Ask Slate</span>
               <span className="text-xs text-gray-500">Beta · ESPN data</span>
             </div>
             <button type="button" onClick={clear} aria-label="Clear chat" className="p-1.5 text-gray-400 hover:text-white"><Trash2 size={18} /></button>
             <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="p-1.5 text-gray-400 hover:text-white"><X size={20} /></button>
           </div>
   
           {/* messages */}
           <div ref={listRef} aria-live="polite" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-2 [-webkit-overflow-scrolling:touch]">
             {(
               <div className="flex flex-col gap-3 pb-2" style={FADE_UP}>
                 <div>
                   <h4 className="text-xl font-bold" style={RAJ}>Ask about {lg.label} players, games and lines</h4>
                   <p className="text-gray-400 mt-1">Answers come straight from ESPN. Nothing is estimated.</p>
                 </div>
                 <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest" style={RAJ}>Try asking</div>
                 <SuggestionMarquee items={SUGGESTIONS} onPick={send} />
               </div>
             )}
             {messages.map((m) => <Message key={m.id} m={m} onChip={send} />)}
             {busy && (
               <div className="flex gap-1 w-fit bg-zinc-900 rounded-2xl rounded-bl-md px-4 py-3" aria-label="Looking that up" style={FADE_UP}>
                 {[0, 0.2, 0.4].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-zinc-600" style={{ animation: 'sbDot 1.2s infinite', animationDelay: `${d}s` }} />)}
               </div>
             )}
           </div>
   
           {/* sticky input bar */}
           <form
             className="sticky bottom-0 z-10 flex items-center gap-2 px-3 pt-2 bg-black border-t border-white/5"
             style={{ paddingBottom: vv?.kb ? '0.75rem' : 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
             onSubmit={(e) => { e.preventDefault(); send(); }}
           >
             <input
               ref={inputRef}
               value={input}
               onChange={(e) => setInput(e.target.value)}
               placeholder="Ask a question…"
               aria-label="Ask a question"
               enterKeyHint="send"
               className="flex-1 min-w-0 bg-zinc-900 rounded-full px-4 py-3 text-base text-white placeholder-gray-400 outline-none"
             />
             <button
               type="submit"
               disabled={!canSend}
               aria-label="Send"
               className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${canSend ? 'bg-blue-600 text-white active:scale-95' : 'bg-zinc-800 text-gray-500'}`}
             >
               <Send size={18} />
             </button>
           </form>
         </div>
       </div>
     );
   }