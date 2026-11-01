import { useMemo } from 'react';
import { normalizeGame } from './replay/normalizeEspn';
import { buildModel, idxAt } from './replay/buildModel';

/**
 * Who is on the court right now, as a Set of player ids (strings).
 *
 * It uses the same logic as the replay: normalize the game's play-by-play,
 * build the model (which replays every substitution), then read the on-court
 * flags at the latest play.
 *
 * Returns null when it can't tell (game isn't live, or no plays yet), so the
 * box score can fall back to its normal single list.
 */
export default function useOnCourt(gameDetails, enabled) {
  return useMemo(() => {
    if (!enabled || !gameDetails?.plays?.length) return null;
    try {
      const model = buildModel(normalizeGame(gameDetails));
      if (!model.P || !model.E) return null;
      const snapI = idxAt(model.keys, model.endKey) + 1;   // snapshot after the newest play
      const ids = new Set();
      ['away', 'home'].forEach(side => {
        const g = model.bySide[side];
        [...g.starters, ...g.bench].forEach(p => {
          if (model.on[snapI * model.P + p.i] === 1) ids.add(String(p.id));
        });
      });
      return ids.size ? ids : null;
    } catch (e) {
      return null;
    }
  }, [gameDetails, enabled]);
}