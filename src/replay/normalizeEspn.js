/**
 * The ONLY file that knows ESPN's response shape.
 * Everything downstream consumes the clean event format returned by normalizeGame().
 *
 * Event: { id, t, period, clock, text, away, home, side, kind, type, pids }
 *   kind 'sub' -> inId, outId
 *   kind 'fg'  -> shooter, made, three, pts, assist, blocked, blockedBy, x, y   (x, y in feet, half court, or null)
 *   kind 'ft'  -> pid, made, pts
 *   kind 'reb' -> pid (null = team rebound), off
 *   kind 'tov' -> pid (null = team turnover), stolen, stolenBy
 *   kind 'other'
 * t = game seconds elapsed (regulation periods 720s, OT periods 300s).
 */

export const IS_DEV = (() => {
    try { return !!import.meta.env.DEV; } catch (e) { return false; }
  })();
  
  const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  
  const NO_COORD = -1000000;          // ESPN uses about -214748340 for "no location"
  const HOOP_FROM_BASELINE = 5.25;    // feet
  
  export const periodLength = p => (p > 4 ? 300 : 720);
  export const periodStart = p => (p <= 4 ? (p - 1) * 720 : 2880 + (p - 5) * 300);
  
  const clockSeconds = v => {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    const i = s.indexOf(':');
    return i >= 0 ? num(s.slice(0, i)) * 60 + num(s.slice(i + 1)) : num(s);   // "8:16" or "45.3"
  };
  const gameTime = (period, clock) => {
    const len = periodLength(period);
    return periodStart(period) + len - Math.min(len, Math.max(0, clockSeconds(clock)));
  };
  
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const titleCase = s => String(s).toLowerCase().replace(/(^|\s)\w/g, c => c.toUpperCase());
  
  /**
   * ESPN's shot coordinates are not documented. Calibrate against the "N-foot" distance in the play text:
   * find the y offset of the hoop that best explains those distances, then convert every shot to feet
   * from the baseline, mirroring far-end shots onto one half court.
   */
  function placeShots(events) {
    const samples = [];
    events.forEach(ev => {
      if (ev.kind !== 'fg' || ev.rx == null || ev.ry > 47) return;
      const m = /(\d+)-foot/.exec(ev.text);
      if (!m) return;
      const d = Number(m[1]);
      const dx = ev.rx - 25;
      if (d * d < dx * dx) return;
      samples.push(ev.ry - Math.sqrt(d * d - dx * dx));
    });
  
    let hoopY = HOOP_FROM_BASELINE;
    if (samples.length >= 8) {
      samples.sort((a, b) => a - b);
      hoopY = samples[samples.length >> 1];
    }
    const shift = HOOP_FROM_BASELINE - hoopY;
  
    let placed = 0;
    events.forEach(ev => {
      if (ev.kind !== 'fg') return;
      ev.x = null; ev.y = null;
      if (ev.rx == null) return;
      let x = ev.rx;
      let y = ev.ry + shift;
      if (y > 47) { x = 50 - x; y = 94 - y; }
      if (y < -3 || y > 47 || x < -3 || x > 53) return;
      ev.x = x; ev.y = y; placed++;
    });
  
    if (IS_DEV) {
      const errs = samples.map(s => Math.abs(s - hoopY)).sort((a, b) => a - b);
      // eslint-disable-next-line no-console
      console.info('[GameReplay] shot calibration:', {
        hoopYInEspnUnits: Number(hoopY.toFixed(2)),
        samples: samples.length,
        medianAbsErrorFeet: errs.length ? Number(errs[errs.length >> 1].toFixed(2)) : null,
        shotsWithLocation: placed,
      });
    }
  }
  
  export function normalizeGame(raw) {
    const j = raw?.gamepackageJSON || raw || {};
    const comp = j.header?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const boxTeams = j.boxscore?.players || [];
  
    const awayId = String(competitors.find(c => c.homeAway === 'away')?.team?.id ?? boxTeams[0]?.team?.id ?? '');
    const homeId = String(competitors.find(c => c.homeAway === 'home')?.team?.id ?? boxTeams[1]?.team?.id ?? '');
    const sideOfTeam = id => (id == null ? null : String(id) === awayId ? 'away' : String(id) === homeId ? 'home' : null);
  
    // Roster from the final boxscore: ids, names, starters, DNP reasons
    const roster = [];
    const sideOfPlayer = {};
    const idByName = new Map();
    const nameById = {};
    boxTeams.forEach(t => {
      const side = sideOfTeam(t.team?.id);
      const block = t.statistics?.[0];
      if (!side || !block) return;
      (block.athletes || []).forEach(a => {
        const id = a.athlete?.id != null ? String(a.athlete.id) : null;
        if (!id || sideOfPlayer[id]) return;
        const noStats = !a.stats || a.stats.length === 0;
        const dnp = a.didNotPlay || noStats ? titleCase(a.reason || 'DNP') : null;
        roster.push({
          id,
          side,
          name: a.athlete?.displayName || '',
          short: a.athlete?.shortName || a.athlete?.displayName || '',
          starter: !!a.starter,
          dnp,
          official: { labels: block.labels || [], stats: a.stats || [] },
        });
        sideOfPlayer[id] = side;
        nameById[id] = a.athlete?.displayName || '';
        const key = norm(a.athlete?.displayName);
        if (key) idByName.set(key, id);
      });
    });
  
    const seen = new Set();
    const plays = (j.plays || [])
      .filter(p => p && p.id != null && !seen.has(p.id) && (seen.add(p.id), true))
      .sort((a, b) => num(a.sequenceNumber) - num(b.sequenceNumber));
  
    const events = [];
    let lastT = 0, away = 0, home = 0;
    for (const p of plays) {
      const type = String(p.type?.text || '');
      const text = String(p.text || '');
      const period = p.period?.number || 1;
      const t = Math.max(lastT, gameTime(period, p.clock?.displayValue));
      lastT = t;
      away = Math.max(away, num(p.awayScore));
      home = Math.max(home, num(p.homeScore));
      const pids = (p.participants || []).map(x => x?.athlete?.id).filter(v => v != null).map(String);
      const attempted = num(p.pointsAttempted);
  
      const ev = {
        id: String(p.id), t, period, clock: String(p.clock?.displayValue || ''),
        text, type, away, home, pids, kind: 'other', side: sideOfTeam(p.team?.id),
      };
  
      if (type === 'Substitution') {
        ev.kind = 'sub';
        ev.inId = pids[0];          // participants: [entering, leaving]
        ev.outId = pids[1];
        ev.side = sideOfPlayer[ev.inId] || ev.side;
      } else if (/^free throw/i.test(type)) {
        ev.kind = 'ft';
        ev.pid = pids[0];
        ev.made = !!p.scoringPlay;
        ev.pts = ev.made ? 1 : 0;
        ev.side = sideOfPlayer[ev.pid] || ev.side;
      } else if (p.shootingPlay && (attempted === 2 || attempted === 3)) {
        ev.kind = 'fg';
        ev.made = !!p.scoringPlay;
        ev.three = attempted === 3;
        ev.pts = ev.made ? (num(p.scoreValue) || attempted) : 0;
        let shooter = pids[0];
        let blockedBy = null;
        const bm = /^(.+?) blocks (.+?)\s*['’]s\b/i.exec(text);
        if (bm) {
          ev.blocked = true;
          const bId = idByName.get(norm(bm[1]));
          const sId = idByName.get(norm(bm[2]));
          if (bId && sId) { blockedBy = bId; shooter = sId; }
          else if (pids.length >= 2) {
            const nt = norm(text);
            blockedBy = pids.find(id => nameById[id] && nt.startsWith(norm(nameById[id]))) || pids[1];
            shooter = pids.find(id => id !== blockedBy) || pids[0];
          }
        }
        ev.shooter = shooter;
        ev.blockedBy = blockedBy;
        if (ev.made) {
          const am = /\(([^()]+?) assists\)/i.exec(text);
          if (am) ev.assist = idByName.get(norm(am[1])) || pids[1] || null;
        }
        ev.side = sideOfPlayer[shooter] || ev.side;
        const c = p.coordinate;
        const ok = c && Number.isFinite(c.x) && Number.isFinite(c.y) && c.x > NO_COORD && c.y > NO_COORD;
        ev.rx = ok ? c.x : null;
        ev.ry = ok ? c.y : null;
      } else if (/^(offensive|defensive) rebound/i.test(type)) {
        ev.kind = 'reb';
        ev.off = /^offensive/i.test(type);
        ev.pid = pids[0] && sideOfPlayer[pids[0]] ? pids[0] : null;
        if (ev.pid) ev.side = sideOfPlayer[ev.pid];
      } else if (/turnover/i.test(type)) {
        ev.kind = 'tov';
        ev.pid = pids[0] && sideOfPlayer[pids[0]] ? pids[0] : null;
        if (ev.pid) ev.side = sideOfPlayer[ev.pid];
        const sm = /\(([^()]+?) steals\)/i.exec(text);
        if (sm) {
          ev.stolen = true;
          ev.stolenBy = idByName.get(norm(sm[1])) || (pids[1] && sideOfPlayer[pids[1]] ? pids[1] : null);
        }
      }
      events.push(ev);
    }
  
    placeShots(events);
  
    const status = comp?.status?.type;
    const last = events[events.length - 1];
    const finished = status?.completed === true || status?.state === 'post' || /^end game/i.test(last?.type || '');
  
    return { meta: { awayId, homeId }, players: roster, events, finished };
  }