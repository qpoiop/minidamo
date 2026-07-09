import type { ThumbKind } from '../../games/registry'

interface LibraryThumbProps {
  kind: ThumbKind;
  artText: string;      // 2-char fallback text (spec: kept for placeholder)
}

/**
 * Small (30px) 라이브러리 드로어 썸네일. v2 시안 리디자인부터는 게임
 * 마다 통일된 픽셀아트 아이콘 (`public/{kind}_icon.svg`) 을 그대로
 * 노출. 이전엔 인라인 SVG glyph 셀 단위로 그렸는데 시안 톤이 훨씬
 * 정갈해서 그쪽으로 이동. Placeholder / 미정의 kind 는 기존 fallback
 * span 을 유지.
 *
 * 파일 규칙 · `public/{kind}_icon.svg` — designer 가 asset 만 교체
 * 하면 코드 변경 없이 새 아이콘 반영됨. */
export function LibraryThumb({ kind, artText }: LibraryThumbProps) {
  if (kind === 'placeholder') {
    return <span className="library-thumb-fallback">{artText}</span>
  }
  return (
    <img
      className="library-thumb-img"
      src={`/${kind}_icon.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={30}
      height={30}
    />
  )
}
