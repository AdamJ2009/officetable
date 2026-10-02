import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface EloHistoryPoint {
  /** null = season boundary break: the line stops so the flat reset is visible */
  elo: number | null;
  date: string;
}

export function EloChart({ eloHistory }: { eloHistory: EloHistoryPoint[] }) {
  // Strip leading/trailing breaks so a single gap doesn't hide the whole series
  const points = eloHistory.filter(p => p.elo !== null);
  if (points.length <= 1) return null;

  const data = eloHistory.map((point, i) => ({
    match: i + 1,
    elo: point.elo,
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));

  return (
    <div className="px-6 py-4 bg-card border-t border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📈</span>
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Skill History</span>
        {eloHistory.some(p => p.elo === null) && (
          <span className="text-xs text-gray-400">— season resets shown as breaks</span>
        )}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="match"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(value) => value.toFixed(0)}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                fontSize: '12px'
              }}
              formatter={(value) => value === null || value === undefined
                ? [null, 'Rating']
                : [(value as number).toFixed(3), 'Rating']}
              labelFormatter={(label) => `Match ${label}`}
            />
            {/* connectNulls defaults to false: season resets render as
                discontinuities between segments */}
            <Area
              type="monotone"
              dataKey="elo"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#eloGradient)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}