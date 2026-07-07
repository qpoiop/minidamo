interface ScanRadarProps {
  pings?: { distance: number; angle: number }[];
}

/**
 * Animated GPS radar disc. Renders three concentric rings + a rotating
 * conic sweep + optional pings for nearby rooms (position derived from
 * distance / bearing).
 */
export function ScanRadar({ pings = [] }: ScanRadarProps) {
  return (
    <div className="scan-radar" aria-hidden="true">
      <span className="scan-radar-ring scan-radar-ring--lg" />
      <span className="scan-radar-ring scan-radar-ring--md" />
      <span className="scan-radar-ring scan-radar-ring--sm" />
      <span className="scan-radar-sweep" />
      <span className="scan-radar-center" />
      {pings.slice(0, 4).map((p, i) => {
        const r = Math.min(50, 15 + p.distance * 1.6)
        const x = 50 + r * Math.cos(p.angle)
        const y = 50 + r * Math.sin(p.angle)
        return (
          <span
            key={i}
            className="scan-radar-ping"
            style={{ top: `${y}%`, left: `${x}%` }}
          />
        )
      })}
    </div>
  )
}
