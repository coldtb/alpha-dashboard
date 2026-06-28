import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface BacktestChartProps {
  data: { time: number; equity: number }[];
}

export const BacktestChart: React.FC<BacktestChartProps> = ({ data }) => {
  // Format timestamp to date string for XAxis
  const chartData = data.map((d) => {
    const date = new Date(d.time);
    return {
      name: `${date.getMonth() + 1}/${date.getDate()}`,
      equity: parseFloat(d.equity.toFixed(2)),
      rawTime: d.time,
    };
  });

  const formatYAxis = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val}`;
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-blue)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-blue)" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} 
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            tickFormatter={formatYAxis} 
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            domain={['auto', 'auto']}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(20, 20, 25, 0.9)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '11px',
              fontFamily: 'inherit',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
            labelStyle={{ fontWeight: 600, color: 'var(--color-blue)', marginBottom: '3px' }}
            formatter={(value: any) => [`$${value.toLocaleString()}`, 'Account Equity']}
          />
          <Area 
            type="monotone" 
            dataKey="equity" 
            stroke="var(--color-blue)" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorEquity)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
