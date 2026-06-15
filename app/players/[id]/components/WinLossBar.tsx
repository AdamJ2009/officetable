export function WinLossBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws;
  if (total === 0) return null;
  const winPct = (wins / total) * 100;
  const lossPct = (losses / total) * 100;
  const drawPct = (draws / total) * 100;

  return (
    <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-200">
      {winPct > 0 && (
        <div className="bg-gradient-to-r from-green-400 to-emerald-500" style={{ width: `${winPct}%` }} />
      )}
      {drawPct > 0 && (
        <div className="bg-gray-400" style={{ width: `${drawPct}%` }} />
      )}
      {lossPct > 0 && (
        <div className="bg-gradient-to-r from-red-400 to-rose-500" style={{ width: `${lossPct}%` }} />
      )}
    </div>
  );
}