/*
 * Rule reveal UI — two spec-driven variants.
 *
 * Owner reveal (I flipped ALL or my own ME):
 *   Full-screen centered overlay with a radial conic backdrop, a big
 *   flipped-card graphic, a type badge (관계형·조건형·소거형·배제형),
 *   the rule text with the referenced piece highlighted in fg-accent,
 *   plus a helper line and a confirm button.
 *
 * Opponent private reveal (opponent flipped their own ME):
 *   Top toast (NOT a modal). The board stays visible + dimmed behind.
 *   Rendered per spec §상대 개인규칙 획득 안내: accent-secondary card,
 *   opponent name + "개인규칙을 획득했어요" + "내용은 비공개예요…" body.
 */

import type { RuleType } from './rules'

interface MosunRuleRevealProps {
  scope: 'ALL' | 'ME';
  type: RuleType;
  text: string;
  opponent: boolean;             // true = the opponent revealed a private rule
  opponentName: string;
  onConfirm: () => void;
}

const TYPE_LABEL: Record<RuleType, string> = {
  relation:    '관계형',
  conditional: '조건형',
  elimination: '소거형',
  exclusion:   '배제형',
}

export function MosunRuleReveal({
  scope,
  type,
  text,
  opponent,
  opponentName,
  onConfirm,
}: MosunRuleRevealProps) {
  if (opponent && scope === 'ME') {
    return (
      <div className="mosun-rule-toast-scrim" onClick={onConfirm}>
        <div className="mosun-rule-toast" onClick={(e) => e.stopPropagation()}>
          <div className="mosun-rule-toast-head">
            <span className="mosun-rule-toast-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <div className="mosun-rule-toast-title">
              <div>{opponentName}가</div>
              <div>개인규칙을 획득했어요</div>
            </div>
          </div>
          <div className="mosun-rule-toast-body">
            내용은 <b>비공개</b>예요. 상대가 무엇을 아는지는 알 수 없어요 — "언제 지를까"의 눈치싸움.
          </div>
        </div>
      </div>
    )
  }

  // Owner reveal — full centered overlay.
  const eyebrow = type === 'exclusion'
    ? '배제형 · 특별 등장'
    : scope === 'ALL' ? '전체 규칙 · 공개' : '개인 규칙 · 나만'
  const cardLabel = scope === 'ALL' ? '전체규칙' : '개인규칙'
  const headline = scope === 'ALL' ? '양쪽 모두 규칙 획득!' : '나만 규칙 획득!'
  const helper = scope === 'ALL'
    ? '전체규칙은 열면 나·상대 모두 같은 내용을 획득해요.'
    : '개인규칙은 나만 알아요. 상대는 "규칙을 획득했다"는 사실만 봐요.'

  return (
    <div className={`mosun-rule-overlay ${type === 'exclusion' ? 'mosun-rule-overlay--exclusion' : ''}`} onClick={onConfirm}>
      <div className="mosun-rule-overlay-conic" aria-hidden="true" />
      <div className="mosun-rule-card" onClick={(e) => e.stopPropagation()}>
        <div className="mosun-rule-eyebrow">{eyebrow}</div>
        <div className={`mosun-rule-icon-card mosun-rule-icon-card--${scope.toLowerCase()}`}>
          {scope === 'ALL' ? (
            <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a13 13 0 0 1 0 18" />
              <path d="M12 3a13 13 0 0 0 0 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="46" height="46" fill="currentColor" aria-hidden="true">
              <rect x="6" y="10" width="12" height="9" rx="1" />
              <path d="M9 10V7a3 3 0 0 1 6 0v3h-2V7a1 1 0 0 0-2 0v3z" />
            </svg>
          )}
          <span className="mosun-rule-icon-label">{cardLabel}</span>
        </div>
        <div className="mosun-rule-headline">{headline}</div>
        <div className="mosun-rule-body">
          <span className="mosun-rule-type-tag">{TYPE_LABEL[type]}</span>
          <div className="mosun-rule-text">{renderRuleText(text)}</div>
        </div>
        <div className="mosun-rule-helper">{helper}</div>
        <button type="button" className="pixel-btn pixel-btn--primary mosun-rule-cta" onClick={onConfirm}>
          확인
        </button>
      </div>
    </div>
  )
}

/**
 * Highlights the referenced piece inside the rule sentence — numbers
 * (`n번`), region names (`상단 행` etc.), and card-kind labels get
 * wrapped in <b> so they stand out. Cheap regex approach mirrors the
 * spec's "4번" bold treatment.
 */
function renderRuleText(text: string): React.ReactNode {
  const pattern = /(\d+번|상단 행|중단 행|하단 행|왼쪽 열|중앙 열|오른쪽 열|모서리|가장자리|중앙 칸|일반|전체힌트|개인힌트|대각선(?: ?\([↘↙]\))?)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let match
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<b key={`m-${key++}`}>{match[0]}</b>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
