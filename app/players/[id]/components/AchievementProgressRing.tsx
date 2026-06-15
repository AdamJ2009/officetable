interface AchievementProgressRingProps {
  unlocked: number;
  total: number;
  size?: number;
}

export function AchievementProgressRing({ unlocked, total, size = 80 }: AchievementProgressRingProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = total > 0 ? unlocked / total : 0;
  const offset = circumference * (1 - percentage);

  // Use a unique gradient ID to avoid conflicts when multiple rings render
  const gradientId = `ringGrad-${unlocked}-${total}`;

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        {percentage > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        )}
      </svg>
      {/* Center text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white font-bold leading-none" style={{ fontSize: size * 0.22 }}>
          {unlocked}/{total}
        </span>
        <span className="text-slate-400 leading-none mt-0.5" style={{ fontSize: size * 0.13 }}>
          {Math.round(percentage * 100)}%
        </span>
      </div>
    </div>
  );
}