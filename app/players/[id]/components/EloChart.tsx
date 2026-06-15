import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

interface EloHistoryPoint {
  elo: number;
  date: string;
}

export function EloChart({ eloHistory }: { eloHistory: EloHistoryPoint[] }) {
  if (eloHistory.length <= 1) return null;

  return (
    <div className="px-6 py-4 bg-white border-t border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📈</span>
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Skill History</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={eloHistory.map((point, index) => ({
              match: index + 1,
              elo: point.elo,
              date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }))}
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
              formatter={(value) => [(value as number).toFixed(3), 'Rating']}
              labelFormatter={(label) => `Match ${label}`}
            />
            <Area
              type="monotone"
              dataKey="elo"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#eloGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}