import type { ThumbKind } from '../../games/registry'

interface LibraryThumbProps {
  kind: ThumbKind;
  artText: string;      // 2-char fallback text (spec: kept for placeholder)
}

/**
 * Small (30px) SVG glyph for the library drawer's list items. Filled
 * silhouettes so every game reads as a distinct icon at drawer size —
 * previous set was thin outlines drawn with mismatched viewBoxes and
 * the shapes were clipping / off-centre. All drawings now sit inside
 * a 24×24 box with balanced margins.
 */
export function LibraryThumb({ kind, artText }: LibraryThumbProps) {
  const size = 30
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'currentColor',
    'aria-hidden': true,
  }
  switch (kind) {
    case 'tictactoe':
      // 3×3 grid with an O in top-left and X across.
      return (
        <svg {...common}>
          <path d="M8 3v18h.6V3zM15.4 3v18h.6V3zM3 8h18v.6H3zM3 15.4h18v.6H3z" />
          <path d="M5 4.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm0 .8a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z" />
          <path d="M17.5 4l1.2 1.2 1.2-1.2.6.6-1.2 1.2 1.2 1.2-.6.6-1.2-1.2-1.2 1.2-.6-.6 1.2-1.2-1.2-1.2z" />
        </svg>
      )
    case 'pingpong':
      // Paddle + ball.
      return (
        <svg {...common}>
          <path d="M5 4c4-1 8 0 10 3s1 7-2 9-7 2-9-1z" />
          <path d="M13.5 14l3 5-2 1-2.5-4.5z" />
          <circle cx="19" cy="6" r="1.8" />
        </svg>
      )
    case 'memory':
      // Four face-down cards + one face-up pair.
      return (
        <svg {...common}>
          <rect x="3" y="4" width="7" height="9" opacity="0.5" />
          <rect x="12" y="4" width="7" height="9" />
          <rect x="3" y="14" width="7" height="6" />
          <rect x="12" y="14" width="7" height="6" opacity="0.5" />
        </svg>
      )
    case 'mosun':
      // 3×3 mini board with bomb cell red.
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" opacity="0.35" />
          <rect x="4" y="4" width="4" height="4" />
          <rect x="10" y="4" width="4" height="4" />
          <rect x="16" y="4" width="4" height="4" />
          <rect x="4" y="10" width="4" height="4" />
          <rect x="10" y="10" width="4" height="4" opacity="0.6" />
          <rect x="16" y="10" width="4" height="4" />
          <rect x="4" y="16" width="4" height="4" />
          <rect x="10" y="16" width="4" height="4" />
          <rect x="16" y="16" width="4" height="4" fill="#c2331f" />
        </svg>
      )
    case 'nyangho':
      // Four guess slots + two feedback dots — mastermind read.
      return (
        <svg {...common}>
          <rect x="2" y="6" width="4" height="9" />
          <rect x="7" y="6" width="4" height="9" opacity="0.55" />
          <rect x="12" y="6" width="4" height="9" opacity="0.85" />
          <rect x="17" y="6" width="4" height="9" opacity="0.4" />
          <circle cx="7" cy="19" r="2" fill="#c7e06a" />
          <circle cx="13" cy="19" r="2" fill="#ffd24a" />
          <circle cx="19" cy="19" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'wudada':
      // 3-lane track suggestion + runner + obstacle.
      return (
        <svg {...common}>
          <rect x="3" y="2" width="18" height="20" opacity="0.25" />
          <rect x="8" y="2" width="1" height="20" />
          <rect x="15" y="2" width="1" height="20" />
          <path d="M4 20l1.5-6h2L6 20z" />
          <rect x="15" y="8" width="5" height="5" />
        </svg>
      )
    case 'escape':
      // Maze frame + dot inside.
      return (
        <svg {...common}>
          <path d="M3 3h6v3H6v3H3zM11 3h4v3h-4zM17 3h4v6h-3V6h-1zM3 11h3v3H3zM8 11h3v3H8zM13 11h4v3h-4zM19 11h2v10h-6v-3h4zM3 16h3v5H3zM11 16h3v5h-3z" />
          <circle cx="18" cy="5" r="1" fill="#c2331f" />
        </svg>
      )
    case 'wavelength':
      // Spectrum bar with a lime target zone and a red dial pointer.
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="6" />
          <rect x="9" y="9" width="6" height="6" fill="#c7e06a" />
          <rect x="14" y="6" width="2" height="12" fill="#c2331f" />
          <rect x="3" y="8" width="18" height="1" opacity="0.6" />
          <rect x="3" y="15" width="18" height="1" opacity="0.6" />
        </svg>
      )
    case 'hiddenword':
      // 4x4 grid with one highlighted cell (my identity).
      return (
        <svg {...common}>
          <rect x="3" y="3" width="4" height="4" />
          <rect x="8" y="3" width="4" height="4" opacity="0.4" />
          <rect x="13" y="3" width="4" height="4" opacity="0.7" />
          <rect x="3" y="8" width="4" height="4" opacity="0.4" />
          <rect x="8" y="8" width="4" height="4" />
          <rect x="13" y="8" width="4" height="4" opacity="0.5" />
          <rect x="3" y="13" width="4" height="4" opacity="0.7" />
          <rect x="8" y="13" width="4" height="4" opacity="0.4" />
          <rect x="13" y="13" width="4" height="4" fill="#c7e06a" stroke="#0a260a" strokeWidth="1" />
        </svg>
      )
    case 'placeholder':
    default:
      return <span className="library-thumb-fallback">{artText}</span>
  }
}
