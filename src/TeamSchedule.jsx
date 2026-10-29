import React, { useMemo, useState } from 'react';
import { useWebHaptics } from 'web-haptics/react';

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const logoFor = (abbr) => `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;

// avg opponent win% over a set of games (".458" style)
const sosOf = (games) => {
  const pcts = games
    .map((g) => {
      const m = String(g.opponentRecord || '').match(/^(\d+)-(\d+)/);
      if (!m) return null;
      const w = +m[1];
      const l = +m[2];
      return w + l ? w / (w + l) : null;
    })
    .filter((p) => p != null);
  if (!pcts.length) return null;
  return (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(3).replace(/^0/, '');
};

export default function TeamSchedule({ games = [], onTeamClick }) {
  const { trigger } = useWebHaptics();
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map();
    for (const g of games) {
      const d = new Date(g.date);
      const key = g.isPre ? 'pre' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          isPre: g.isPre,
          label: g.isPre ? 'Preseason' : d.toLocaleDateString('en-US', { month: 'long' }),
          games: [],
        });
      }
      map.get(key).games.push(g);
    }
    return [...map.values()];
  }, [games]);

  if (!groups.length) {
    return (
      <div className="bg-black rounded-2xl p-4 mt-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          Schedule
        </h4>
        <div className="text-gray-400 text-sm">No schedule available</div>
      </div>
    );
  }

  const next = games.find((g) => !g.completed);
  const currentKey = next
    ? groups.find((gr) => gr.games.some((g) => g.id === next.id))?.key
    : groups[groups.length - 1].key;
  const visible = open ? groups : groups.filter((gr) => gr.key === currentKey);

  return (
    <div className="bg-black rounded-2xl p-4 mt-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
        Schedule
      </h4>

      {visible.map((gr) => {
        const done = gr.games.filter((g) => g.completed);
        const wins = done.filter((g) => g.win).length;
        const sos = gr.isPre ? null : sosOf(gr.games);
        let w = 0;
        let l = 0;

        return (
          <div key={gr.key} className="mb-4 last:mb-0">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                {gr.label}
              </span>
              <span className="text-xs text-gray-400">
                {sos && <span className="mr-2">SOS {sos}</span>}
                <span className="font-bold text-sm">
                  {done.length ? `${wins}-${done.length - wins}` : `${gr.games.length} games`}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {gr.games.map((g) => {
                if (g.completed && !gr.isPre) g.win ? w++ : l++;
                const d = new Date(g.date);
                const dateLabel = gr.isPre
                  ? `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short' })} ${ordinal(d.getDate())}`
                  : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${ordinal(d.getDate())}`;
                const isNext = next && g.id === next.id;
                const corner = g.completed ? (gr.isPre ? null : `${w}-${l}`) : g.broadcast;

                return (
                  <div
                    key={g.id}
                    className={`rounded-xl p-2.5 bg-zinc-800/50 ${
                      isNext ? 'border-2 border-blue-500' : 'border border-zinc-700'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-sm font-bold whitespace-nowrap">{dateLabel}</span>
                      {corner && <span className="text-[10px] text-gray-400 truncate">{corner}</span>}
                    </div>

                    <div
                      className="flex items-center gap-1.5 mt-1.5 cursor-pointer active:opacity-70"
                      onClick={() => {
                        trigger('light');
                        onTeamClick?.(g.opponent, g.opponentLogo || logoFor(g.opponent));
                      }}
                    >
                      <span className="text-xs text-gray-400">{g.isHome ? 'vs' : '@'}</span>
                      <img src={g.opponentLogo || logoFor(g.opponent)} alt={g.opponent} className="w-5 h-5" />
                      <span className="text-sm font-semibold">{g.opponent}</span>
                    </div>

                    <div className="mt-1.5 text-sm font-bold whitespace-nowrap">
                      {g.completed ? (
                        <>
                          <span className={g.win ? 'text-green-500' : 'text-red-500'}>{g.win ? 'W' : 'L'}</span>{' '}
                          {g.myScore}-{g.oppScore}
                        </>
                      ) : (
                        <span className="text-gray-300">
                          {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {groups.length > 1 && (
        <button
          onClick={() => {
            trigger('selection');
            setOpen((o) => !o);
          }}
          className="w-full mt-3 pt-3 border-t border-zinc-800 flex items-center justify-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
        >
          {open ? 'Show less' : 'Show full schedule'}
          <span className="text-lg font-light leading-none" style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)' }}>
            ‹
          </span>
        </button>
      )}
    </div>
  );
}