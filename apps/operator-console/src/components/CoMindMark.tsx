import { useId } from "react";

interface CoMindMarkProps {
  className?: string;
  compact?: boolean;
}

export function CoMindMark({ className, compact = false }: CoMindMarkProps) {
  const prefix = useId().replace(/:/g, "");
  const brainGradientId = `${prefix}-brain`;
  const chipGradientId = `${prefix}-chip`;
  const glowId = `${prefix}-glow`;

  return (
    <span className={className} aria-label="CoMind brain and computer-chip mark" role="img">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 96 96"
        width={compact ? 38 : 52}
        height={compact ? 38 : 52}
      >
        <defs>
          <linearGradient id={brainGradientId} x1="16" y1="8" x2="77" y2="69" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8cf7ff" />
            <stop offset="0.48" stopColor="#39c8ff" />
            <stop offset="1" stopColor="#7067ff" />
          </linearGradient>
          <linearGradient id={chipGradientId} x1="26" y1="65" x2="72" y2="91" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffd27c" />
            <stop offset="1" stopColor="#ff9e4a" />
          </linearGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g
          fill="none"
          stroke={`url(#${brainGradientId})`}
          strokeWidth="3.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
        >
          <path d="M48 17c-4.5-7.3-16.2-7-19.5 1.6-7.4-.9-13.1 5.4-11.5 12.6-5.8 3.8-6.7 12.1-1.8 17 0 8.2 6.4 14.8 14.5 14.8 4.4 5 12.5 4.2 18.3-1.5V17Z" />
          <path d="M48 17c4.5-7.3 16.2-7 19.5 1.6 7.4-.9 13.1 5.4 11.5 12.6 5.8 3.8 6.7 12.1 1.8 17 0 8.2-6.4 14.8-14.5 14.8-4.4 5-12.5 4.2-18.3-1.5V17Z" />
          <path d="M30 23c5.5.4 8.9 3.8 9.3 9.2M25.8 39c5.3-1.1 10.6 1.4 12.2 6.3M29 55c3.9-3.3 8.8-3.5 13.2-.6M66 23c-5.5.4-8.9 3.8-9.3 9.2M70.2 39c-5.3-1.1-10.6 1.4-12.2 6.3M67 55c-3.9-3.3-8.8-3.5-13.2-.6" />
          <path d="M48 28h-7M48 42h8M48 52h-6" />
          <circle cx="38.5" cy="28" r="2.3" fill="#7fefff" stroke="none" />
          <circle cx="58.5" cy="42" r="2.3" fill="#7fefff" stroke="none" />
          <circle cx="39.5" cy="52" r="2.3" fill="#7fefff" stroke="none" />
        </g>

        <g fill="none" stroke={`url(#${chipGradientId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 68h40v16H28z" />
          <path d="M34 72h28v8H34z" opacity="0.8" />
          <path d="M21 71h7M21 77h7M21 83h7M68 71h7M68 77h7M68 83h7M34 84v7M42 84v7M50 84v7M58 84v7" />
          <path d="M39 64v8M48 62v10M57 64v8" />
        </g>
      </svg>
    </span>
  );
}
