/* ============================================================================
   Net Rating engine (pure functions, no React, no network)

   processGame(summary)  -> compact per-game result (cached forever by the caller)
   buildRows(games, filterGarbage) -> one row per team (ORtg, DRtg, Net, Pythagorean, Four Factors, ranks)

   `summary` is ESPN's game summary JSON (the same payload the replay uses).
============================================================================ */

export const ENGINE_VERSION = 1;   // bump this to throw away every cached game and reprocess

/** Every tunable number lives here. */
export const TUNING = {
  // A team that gains the ball with this many seconds (or fewer) left in a period only has time
  // for an inbound and a heave. That possession is excluded. CTG doesn't publish its exact rule.
  endOfPeriodCutoffSecs: 3,
  // CTG garbage time: 4th quarter + margin big enough for the clock + at most N starters on the floor.
  garbage: {
    period: 4,
    maxStarters: 2,                      // combined, across both teams
    tiers: [                             // checked top to bottom; first tier whose minRemaining fits wins
      { minRemaining: 540, margin: 25 }, // 12:00 to 9:00 left
      { minRemaining: 360, margin: 20 }, // 9:00 to 6:00 left
      { minRemaining: 0, margin: 10 },   // under 6:00 left
    ],
  },
  pythagoreanExponent: 14,
  maxPossessionGap: 1,                   // if the teams' possession counts differ by more, the feed is broken
};

const other = s => (s === 'away' ? 'home' : 'away');
const blank = () => ({ poss: 0, pts: 0, fga: 0, fgm: 0, tpm: 0, fta: 0, ftm: 0, tov: 0, orb: 0, orbChances: 0 });
const KEYS = Object.keys(blank());

/* ────────────────────────────────────────────────────────────────────────────
   Parsing helpers
──────────────────────────────────────────────────────────────────────────── */

/** "11:42" -> 702, "0:29.9" -> 29.9, "29.9" -> 29.9 */
export function parseClock(v) {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    return (parseFloat(m) || 0) * 60 + (parseFloat(sec) || 0);
  }
  return parseFloat(s) || 0;
}

/** Names in play text vs the box score: ignore accents, punctuation, case, Jr./III. */
export const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\s(jr|sr|ii|iii|iv|v)$/, '');

const DEF3_RE = /\b(defensive|def)\s*(3|three)[\s-]*(second|sec)/i;
const TURNOVER_RE = /\b(bad pass|lost ball|turnover|traveling|travelling|discontinue dribble|double dribble|out of bounds|shot clock|backcourt|palming|illegal screen|carrying|offensive goaltending|lane violation)\b|\b(5|8|10)[\s-]*second/i;
const NEUTRAL_RE = /foul|timeout|time out|jump ball|violation|delay|review|challenge|ejection|start of|instant replay|official/i;

/** One ESPN play -> what it means for possessions. */
export function classify(pl) {
  const text = String(pl.text || '');
  const t = text.toLowerCase();
  const type = String(pl.type?.text || '').toLowerCase();
  if (/enters the game for/.test(t)) return { k: 'sub' };
  if (type === 'end period' || type === 'end game' || /^end of /.test(t)) return { k: 'end' };
  if (DEF3_RE.test(t) || DEF3_RE.test(type)) return { k: 'def3' };
  if (/\brebound\b/.test(t) || type.includes('rebound')) {
    return { k: 'reb', off: /offensive/.test(t) || type.includes('offensive'), team: /team rebound/.test(t) || /team/.test(type) };
  }
  if (/free throw/.test(t)) {
    const m = /(\d+)\s+of\s+(\d+)/.exec(t);
    return {
      k: 'ft',
      made: /\bmakes\b/.test(t) || pl.scoringPlay === true,
      tech: /technical/.test(t),
      n: m ? Number(m[1]) : 1,
      m: m ? Number(m[2]) : 1,
    };
  }
  if (type.includes('turnover') || TURNOVER_RE.test(t)) return { k: 'tov' };
  if (/\b(makes|misses|blocks)\b/.test(t)) {
    const made = /\bmakes\b/.test(t);
    const sv = Number(pl.scoreValue);
    const three = sv === 3 || /three[\s-]*point|3[\s-]*(pt|point|pointer)|\bthree\b/.test(t);
    return { k: 'fg', made, block: /\bblocks\b/.test(t) && !made, pts: made ? (sv === 2 || sv === 3 ? sv : three ? 3 : 2) : 0 };
  }
  if (NEUTRAL_RE.test(t) || NEUTRAL_RE.test(type)) return { k: 'neutral' };
  return { k: 'other' };
}

/** After a made shot: is the next real event a 1-of-1 free throw by the same team (an and-one)? */
function hasAndOne(plays, i, side, sideById) {
  for (let j = i + 1; j < plays.length && j <= i + 10; j++) {
    const c = classify(plays[j]);
    if (c.k === 'sub' || c.k === 'neutral' || c.k === 'def3') continue;
    return c.k === 'ft' && !c.tech && c.m === 1 && sideById[String(plays[j].team?.id)] === side;
  }
  return false;
}

/* ────────────────────────────────────────────────────────────────────────────
   Play-by-play possession engine
──────────────────────────────────────────────────────────────────────────── */

function run(summary) {
  // who is home / away
  const comps = summary.header?.competitions?.[0]?.competitors || [];
  const sideById = {};
  const abbr = {};
  const hdrScore = {};
  comps.forEach(c => {
    const s = c.homeAway;
    if (s !== 'home' && s !== 'away') return;
    sideById[String(c.team?.id)] = s;
    abbr[s] = c.team?.abbreviation;
    hdrScore[s] = Number(c.score);
  });
  if (!abbr.home || !abbr.away) return null;

  const plays = (summary.plays || []).filter(p => p && p.period && Number.isFinite(Number(p.period.number)));
  if (plays.length < 100) return null;   // no real play-by-play: use the box-score fallback

  // starting fives and the roster, from the box score
  const lineup = { away: new Set(), home: new Set() };
  const starters = new Set();
  (summary.boxscore?.players || []).forEach(tp => {
    const s = sideById[String(tp.team?.id)];
    if (!s) return;
    (tp.statistics?.[0]?.athletes || []).forEach(a => {
      const n = norm(a.athlete?.displayName);
      if (n && a.starter) { lineup[s].add(n); starters.add(n); }
    });
  });
  let broken = lineup.away.size !== 5 || lineup.home.size !== 5;   // lineup tracking can't be trusted -> no garbage filter

  let period = 0;
  let cur = null;             // the possession in progress
  let awaiting = null;        // a reboundable miss is waiting for its rebound
  let ignoreTeamReb = false;  // "team rebound" logged after a non-final missed free throw
  let lastEnd = null;         // when/where the previous possession ended (= when the next one began)
  let lastTov = null;
  let def3 = false;           // a defensive-3-seconds technical was just called
  const score = { away: 0, home: 0 };
  const tally = { away: 0, home: 0 };               // every point scored incl. excluded technicals (to check against the final)
  const rawPoss = { away: 0, home: 0 };
  const done = [];

  const startersOnFloor = () => {
    let n = 0;
    ['away', 'home'].forEach(s => lineup[s].forEach(x => { if (starters.has(x)) n += 1; }));
    return n;
  };
  const threshold = rem => TUNING.garbage.tiers.find(t => rem >= t.minRemaining).margin;

  const startPoss = (side, rem) => {
    const carried = lastEnd && lastEnd.period === period;
    const startRem = carried ? lastEnd.rem : rem;
    const snap = carried ? lastEnd.score : score;
    if (lineup.away.size !== 5 || lineup.home.size !== 5) broken = true;
    cur = {
      side,
      heave: startRem <= TUNING.endOfPeriodCutoffSecs,
      garbage: period === TUNING.garbage.period
        && startersOnFloor() <= TUNING.garbage.maxStarters
        && Math.abs(snap.away - snap.home) >= threshold(startRem),
      stats: blank(),
    };
  };
  const endPoss = (rem, reason) => {
    if (!cur) return;
    rawPoss[cur.side] += 1;
    done.push(cur);
    lastEnd = reason === 'period' ? null : { rem, period, score: { away: score.away, home: score.home } };
    cur = null;
    awaiting = null;
  };
  const ensure = (side, rem) => {
    if (cur && cur.side !== side) endPoss(rem, 'switch');
    if (!cur) startPoss(side, rem);
  };
  const applySub = (pl, sd) => {
    const m = /^(.*?)\s+enters the game for\s+(.*)$/i.exec(String(pl.text || ''));
    if (!m) return;
    const inN = norm(m[1]);
    const outN = norm(m[2]);
    const s = sd || (lineup.away.has(outN) ? 'away' : lineup.home.has(outN) ? 'home' : null);
    if (!s || !lineup[s].has(outN)) { broken = true; return; }
    lineup[s].delete(outN);
    lineup[s].add(inN);
  };

  for (let i = 0; i < plays.length; i++) {
    const pl = plays[i];
    const pn = Number(pl.period.number);
    if (pn !== period) {                       // safety: a new period always starts clean
      if (cur) endPoss(0, 'period');
      awaiting = null; ignoreTeamReb = false; lastEnd = null; lastTov = null; def3 = false;
      period = pn;
    }
    const rem = parseClock(pl.clock?.displayValue);
    if (Number.isFinite(Number(pl.awayScore)) && pl.awayScore !== null) score.away = Number(pl.awayScore);
    if (Number.isFinite(Number(pl.homeScore)) && pl.homeScore !== null) score.home = Number(pl.homeScore);
    const c = classify(pl);
    const sd = sideById[String(pl.team?.id)] || null;

    if (c.k === 'sub') { applySub(pl, sd); continue; }
    if (c.k === 'end') { if (cur) endPoss(0, 'period'); awaiting = null; lastEnd = null; continue; }
    if (c.k === 'def3') { def3 = true; continue; }
    if (c.k === 'neutral' || c.k === 'other') continue;

    if (c.k === 'reb') {
      if (ignoreTeamReb && c.team) { ignoreTeamReb = false; continue; }   // not a real rebound chance
      ignoreTeamReb = false;
      if (!awaiting) continue;
      if (c.off) { if (cur) cur.stats.orb += 1; awaiting = null; }          // possession continues
      else endPoss(rem, 'dreb');
      continue;
    }

    if (c.k === 'ft') {
      const s = sd || (cur && cur.side);
      if (!s) continue;
      if (c.made) tally[s] += 1;
      if (c.tech) {
        const counts = def3;                    // technicals don't count, except defensive 3 seconds
        def3 = false;
        if (!counts) continue;
        ensure(s, rem);
        cur.stats.fta += 1;
        if (c.made) { cur.stats.ftm += 1; cur.stats.pts += 1; }
        continue;
      }
      def3 = false;
      ensure(s, rem);
      awaiting = null;
      cur.stats.fta += 1;
      if (c.made) { cur.stats.ftm += 1; cur.stats.pts += 1; }
      if (c.made) {
        ignoreTeamReb = false;
        if (c.n >= c.m) endPoss(rem, 'ft');     // the last free throw of the trip ends it
      } else if (c.n >= c.m) {
        cur.stats.orbChances += 1;              // a missed LAST free throw is reboundable
        awaiting = { side: s };
        ignoreTeamReb = false;
      } else {
        ignoreTeamReb = true;                   // first miss of two: not reboundable, ignore a logged team rebound
      }
      continue;
    }

    if (c.k === 'tov') {
      const s = sd || (cur && cur.side);
      if (!s) continue;
      if (!cur && lastTov && lastTov.side === s && lastTov.rem === rem) continue;   // same turnover logged twice
      ensure(s, rem);
      cur.stats.tov += 1;
      lastTov = { side: s, rem };
      def3 = false;
      endPoss(rem, 'tov');
      continue;
    }

    if (c.k === 'fg') {
      const s = c.block && cur ? cur.side : sd;   // a block's team field can be the blocker's; the shooter has the ball
      if (!s) continue;
      ensure(s, rem);
      awaiting = null; ignoreTeamReb = false; def3 = false;
      cur.stats.fga += 1;
      if (c.made) {
        cur.stats.fgm += 1;
        cur.stats.pts += c.pts;
        if (c.pts === 3) cur.stats.tpm += 1;
        tally[s] += c.pts;
        if (!hasAndOne(plays, i, s, sideById)) endPoss(rem, 'make');   // and-one: ends after the free throw
      } else {
        cur.stats.orbChances += 1;
        awaiting = { side: s };
      }
    }
  }
  if (cur) endPoss(0, 'period');

  // ── validation: if the feed looks broken, give up on this game (caller falls back to the box score)
  if (Math.abs(rawPoss.away - rawPoss.home) > TUNING.maxPossessionGap) return null;
  const last = plays[plays.length - 1];
  const final = {
    away: Number.isFinite(hdrScore.away) ? hdrScore.away : Number(last.awayScore),
    home: Number.isFinite(hdrScore.home) ? hdrScore.home : Number(last.homeScore),
  };
  if (!Number.isFinite(final.away) || !Number.isFinite(final.home)) return null;
  if (tally.away !== final.away || tally.home !== final.home) return null;

  // ── bucket possessions: `all` drops end-of-period heaves; `clean` also drops garbage time
  const all = { away: blank(), home: blank() };
  const clean = { away: blank(), home: blank() };
  const add = (t, p) => { KEYS.forEach(k => { t[k] += p.stats[k]; }); t.poss += 1; };
  done.forEach(p => {
    if (p.heave) return;
    add(all[p.side], p);
    if (!(p.garbage && !broken)) add(clean[p.side], p);
  });
  return { awayAbbr: abbr.away, homeAbbr: abbr.home, final, fallback: false, lineupBroken: broken, all, clean };
}

/* ────────────────────────────────────────────────────────────────────────────
   Box-score fallback (used for a single game when its play-by-play looks broken)
──────────────────────────────────────────────────────────────────────────── */

const pair = v => {
  const m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(String(v ?? ''));
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

export function estimateFromBoxscore(summary) {
  const comps = summary.header?.competitions?.[0]?.competitors || [];
  const sideById = {};
  const abbr = {};
  const final = {};
  comps.forEach(c => {
    if (c.homeAway !== 'home' && c.homeAway !== 'away') return;
    sideById[String(c.team?.id)] = c.homeAway;
    abbr[c.homeAway] = c.team?.abbreviation;
    final[c.homeAway] = Number(c.score);
  });
  if (!abbr.home || !abbr.away || !Number.isFinite(final.home) || !Number.isFinite(final.away)) return null;

  const raw = {};
  (summary.boxscore?.teams || []).forEach(t => {
    const s = sideById[String(t.team?.id)];
    if (!s) return;
    const get = name => t.statistics?.find(x => x.name === name)?.displayValue;
    const [fgm, fga] = pair(get('fieldGoalsMade-fieldGoalsAttempted'));
    const [tpm] = pair(get('threePointFieldGoalsMade-threePointFieldGoalsAttempted'));
    const [ftm, fta] = pair(get('freeThrowsMade-freeThrowsAttempted'));
    raw[s] = { fgm, fga, tpm, ftm, fta, orb: parseFloat(get('offensiveRebounds')) || 0, tov: parseFloat(get('turnovers')) || 0 };
  });
  if (!raw.away || !raw.home || !raw.away.fga || !raw.home.fga) return null;

  const est = r => r.fga - r.orb + r.tov + 0.44 * r.fta;
  const poss = (est(raw.away) + est(raw.home)) / 2;   // both teams get about the same number: average the two estimates
  const make = s => ({
    poss, pts: final[s], fga: raw[s].fga, fgm: raw[s].fgm, tpm: raw[s].tpm, fta: raw[s].fta, ftm: raw[s].ftm,
    tov: raw[s].tov, orb: raw[s].orb, orbChances: raw[s].fga - raw[s].fgm + 0.44 * (raw[s].fta - raw[s].ftm),
  });
  const bucket = () => ({ away: make('away'), home: make('home') });
  return { awayAbbr: abbr.away, homeAbbr: abbr.home, final, fallback: true, lineupBroken: false, all: bucket(), clean: bucket() };
}

/** summary JSON -> cached game record. Never throws. */
export function processGame(summary, meta = {}) {
  let result = null;
  try { result = run(summary); } catch (e) { result = null; }
  if (!result) { try { result = estimateFromBoxscore(summary); } catch (e) { result = null; } }
  if (!result) return null;
  return { v: ENGINE_VERSION, id: String(meta.id ?? ''), date: meta.date || null, ...result };
}

/* ────────────────────────────────────────────────────────────────────────────
   Aggregation: game records -> team rows (with league ranks)
──────────────────────────────────────────────────────────────────────────── */

const ratio = (a, b) => (b > 0 ? a / b : null);
const factors = s => ({
  efg: ratio(s.fgm + 0.5 * s.tpm, s.fga),     // (2PM + 1.5*3PM) / FGA
  tov: ratio(s.tov, s.poss),                  // turnovers / possessions
  orb: ratio(s.orb, s.orbChances),            // offensive rebounds / reboundable misses
  ftr: ratio(s.ftm, s.fga),                   // FTM / FGA
});

/** Pythagorean expectation from points for/against. */
export const pythag = (pf, pa, exp = TUNING.pythagoreanExponent) => {
  const a = Math.pow(pf, exp);
  const b = Math.pow(pa, exp);
  return a + b > 0 ? a / (a + b) : null;
};

/** [rank key, how to read it from a row, true if a bigger number is better] */
export const RANK_SPECS = [
  ['net', r => r.net, true], ['ortg', r => r.ortg, true], ['drtg', r => r.drtg, false],
  ['win', r => r.winPct, true], ['xwin', r => r.xWin, true],
  ['off_efg', r => r.off?.efg, true], ['off_tov', r => r.off?.tov, false], ['off_orb', r => r.off?.orb, true], ['off_ftr', r => r.off?.ftr, true],
  ['def_efg', r => r.def?.efg, false], ['def_tov', r => r.def?.tov, true], ['def_orb', r => r.def?.orb, false], ['def_ftr', r => r.def?.ftr, false],
];

export function addRanks(rows) {
  rows.forEach(r => { r.rk = {}; });
  RANK_SPECS.forEach(([key, get, higher]) => {
    const ok = rows.filter(r => Number.isFinite(get(r)));
    [...ok].sort((a, b) => (higher ? get(b) - get(a) : get(a) - get(b))).forEach((r, i) => { r.rk[key] = i + 1; });
  });
  return rows;
}

export function buildRows(games, filterGarbage) {
  const acc = {};
  games.forEach(g => {
    const b = filterGarbage ? g.clean : g.all;
    if (!b || !g.final) return;
    ['away', 'home'].forEach(s => {
      const o = other(s);
      const abbr = s === 'away' ? g.awayAbbr : g.homeAbbr;
      if (!acc[abbr]) acc[abbr] = { abbr, gp: 0, w: 0, pf: 0, pa: 0, off: blank(), def: blank() };
      const t = acc[abbr];
      t.gp += 1;
      t.pf += g.final[s];
      t.pa += g.final[o];
      if (g.final[s] > g.final[o]) t.w += 1;
      KEYS.forEach(k => { t.off[k] += b[s][k]; t.def[k] += b[o][k]; });   // defense = what the opponent did
    });
  });
  const rows = Object.values(acc)
    .filter(t => t.gp > 0 && t.off.poss > 0 && t.def.poss > 0)
    .map(t => {
      const ortg = (100 * t.off.pts) / t.off.poss;
      const drtg = (100 * t.def.pts) / t.def.poss;
      const xWin = pythag(t.pf, t.pa);
      return {
        abbr: t.abbr, gp: t.gp, w: t.w, estimate: false,
        ortg, drtg, net: ortg - drtg,
        winPct: t.w / t.gp, xWin, gap: xWin === null ? null : t.w - xWin * t.gp,
        off: factors(t.off), def: factors(t.def),
      };
    });
  return addRanks(rows);
}