import React, { useEffect, useState } from 'react';

interface BurnTimerProps {
  burnTime: number; // total duration in seconds
  readAt: number;   // timestamp when message was read
  onBurn: () => void; // callback when timer hits 0
}

export const BurnTimer: React.FC<BurnTimerProps> = ({ burnTime, readAt, onBurn }) => {
  const [timeLeft, setTimeLeft] = useState<number>(burnTime);

  useEffect(() => {
    let timer: any = null;

    // Tick immediately
    const updateTimer = () => {
      const elapsed = (Date.now() - readAt) / 1000;
      const remaining = Math.max(0, burnTime - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (timer) clearInterval(timer);
        onBurn();
      }
    };

    updateTimer();
    timer = setInterval(updateTimer, 50); // update frequently for smooth circle depletion

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [burnTime, readAt, onBurn]);

  // SVG parameters
  const radius = 16;
  const strokeWidth = 3;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate percentage of time remaining
  const percentage = timeLeft / burnTime;
  const strokeDashoffset = circumference - percentage * circumference;

  // Determine indicator color based on time remaining
  let color = '#05ffc5'; // Cool Green
  let isUrgent = false;

  if (timeLeft < 3) {
    color = '#ff0055'; // Pink/Red Urgent
    isUrgent = true;
  } else if (timeLeft < burnTime / 2) {
    color = '#ffb703'; // Warning Yellow/Amber
  }

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '38px',
        height: '38px',
        position: 'relative',
        borderRadius: '50%',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: isUrgent ? '0 0 10px rgba(255, 0, 85, 0.3)' : 'none',
        animation: isUrgent ? 'pulse-urgent 0.5s infinite alternate' : 'none',
        flexShrink: 0
      }}
    >
      <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Depleting foreground circle */}
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.05s linear, stroke 0.3s ease'
          }}
        />
      </svg>
      
      {/* Ticking number overlay */}
      <span
        style={{
          position: 'absolute',
          fontSize: '0.75rem',
          fontWeight: 800,
          color: color,
          fontFamily: 'monospace',
          textShadow: `0 0 6px ${color}50`
        }}
      >
        {Math.ceil(timeLeft)}
      </span>

      {/* Inline styles for pulse animations */}
      <style>{`
        @keyframes pulse-urgent {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); box-shadow: 0 0 14px rgba(255, 0, 85, 0.5); }
        }
      `}</style>
    </div>
  );
};
