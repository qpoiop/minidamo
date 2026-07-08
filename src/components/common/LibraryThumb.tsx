import type { ThumbKind } from '../../games/registry'

interface LibraryThumbProps {
  kind: ThumbKind;
  artText: string;      // 2-char fallback text (spec: kept for placeholder)
}

/**
 * Small (52-64px) SVG glyph for the library drawer's list items.
 * Bigger hero thumbs on the home cards live in Thumbnail.tsx; this is
 * the tighter compressed variant that fits in the drawer row.
 */
export function LibraryThumb({ kind, artText }: LibraryThumbProps) {
  const size = 30
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true,
  }
  switch (kind) {
    case 'tictactoe':
      return <svg {...common}><path d="M4 4v16M14 4v16M4 9h16M4 15h16" /><circle cx="7.5" cy="6.5" r="1.5" /><path d="M17 6.5l3 3M20 6.5l-3 3" /></svg>
    case 'pingpong':
      return <svg {...common}><path d="M4 12l4-4h8l4 4-4 4H8z" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M2 6l3 3M22 18l-3-3" /></svg>
    case 'memory':
      return <svg {...common}><rect x="3" y="4" width="8" height="10" /><rect x="13" y="4" width="8" height="10" /><rect x="3" y="16" width="8" height="4" /><rect x="13" y="16" width="8" height="4" /></svg>
    case 'mosun':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" /><path d="M8 8h2v2H8zM14 8h2v2h-2zM11 11h2v2h-2zM8 14h2v2H8z" fill="currentColor" /><circle cx="15" cy="15" r="1.5" fill="#c2331f" stroke="none" /></svg>
    case 'breaker':
      return <svg {...common}><rect x="3" y="3" width="8" height="8" fill="#5bb3c2" stroke="none" /><rect x="13" y="3" width="8" height="8" fill="#e0913f" stroke="none" /><rect x="3" y="13" width="8" height="8" fill="#c7e06a" stroke="none" /><rect x="13" y="13" width="8" height="8" fill="#c2331f" stroke="none" /></svg>
    case 'wudada':
      // 3 lanes + runner + obstacle
      return <svg {...common}><path d="M8 3v18M16 3v18" /><path d="M5 21l1-4h2l-1 4z" fill="currentColor" /><rect x="13" y="10" width="4" height="4" fill="currentColor" /></svg>
    case 'escape':
      // maze walls + exit door + character dot
      return <svg {...common}><path d="M4 4v6h4v4H4v6M4 10h8M12 4v10M12 20h8M16 14v6M20 4v10" /><circle cx="6" cy="18" r="1" fill="currentColor" /><rect x="18" y="2" width="4" height="4" fill="currentColor" stroke="none" /></svg>
    case 'placeholder':
    default:
      return <span className="library-thumb-fallback">{artText}</span>
  }
}
