/*
 * Single source of truth for every playable game.
 *
 * Screens (Home slider, library drawer, App router, Lobby options) all
 * read from this list — adding a game means adding one entry here, not
 * hunting for every switch statement.
 */

import type { ComponentType } from 'react'
import type { PlayerInfo, P2PMessage } from '../hooks/useRoom'
import { TicTacToe } from '../features/games/tictactoe/TicTacToe'
import { PingPong } from '../features/games/pingpong/PingPong'
import { MemoryMatch } from '../features/games/memory/MemoryMatch'
import { Mosun } from '../features/games/mosun/Mosun'
import { Nyangho } from '../features/games/nyangho/Nyangho'
import { Wudada } from '../features/games/wudada/Wudada'
import { Escape } from '../features/games/escape/Escape'

export type ThumbKind = 'tictactoe' | 'pingpong' | 'memory' | 'mosun' | 'nyangho' | 'wudada' | 'escape' | 'placeholder'

export interface GameGuideStep {
  title: string;
  desc: string;
}

/** Icon set exposed to structured guides. Extend as needed. */
export type GuideGlyph =
  | 'grid' | 'skip' | 'target' | 'check' | 'close'
  | 'sprite-cat' | 'sprite-buddy' | 'sprite-key' | 'sprite-door' | 'sprite-eye'
  | 'sprite-shield' | 'sprite-bolt' | 'sprite-monster'
  | 'sprite-crate' | 'sprite-puddle' | 'sprite-plant' | 'sprite-dog'
  | 'sprite-fish' | 'sprite-yarn'

export interface GuideItem {
  label: string;
  desc?: string;
  glyph?: GuideGlyph;
  tone?: 'accent' | 'bomb' | 'muted';
  countBadge?: string;   // "×2", "★×1" — shown at end of label chip
}
export interface GuideSection {
  title: string;
  kind: 'rows' | 'sprites' | 'badges';
  items: GuideItem[];
}
export interface GuideWarning {
  text: string;
  tone?: 'accent' | 'bomb';
}

/** Common shape every playable game accepts from App. */
export interface CommonGameProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  // Some games use `maxRounds`, others `maxPoints`, others ignore this.
  matchOption: number;
}

/** A per-game adapter that maps CommonGameProps into the game's actual props. */
type GameRenderer = ComponentType<CommonGameProps>

export interface GameDefinition {
  id: string;
  title: string;
  code: string;                  // arcade top-line label
  genre: '턴제 전략' | '실시간 액션' | '퍼즐' | '스포츠' | '보드게임' | '추리' | '패턴' | '러너' | '협동';
  turnType: '턴제' | '실시간';
  playerCount: number;
  desc: string;
  version: string;
  updateDate: string;
  thumbKind: ThumbKind;
  Component: GameRenderer;
  /** Presets for the "판수/점수" style option shown in the lobby. */
  matchOptions: ReadonlyArray<{ value: number; label: string }>;
  /** Format the currently selected option value into the header rule chip. */
  ruleTag: (n: number) => string;
  guide: {
    title: string;
    oneLine?: string;
    sections?: GuideSection[];
    steps?: GameGuideStep[];
    warning?: GuideWarning;
  };
}

/** Simple adapters so specialised game props stay strongly typed. */
const TicTacToeAdapter: GameRenderer = (props) => (
  <TicTacToe {...props} maxRounds={props.matchOption} />
)
const PingPongAdapter: GameRenderer = (props) => (
  <PingPong {...props} maxPoints={props.matchOption} />
)
const MemoryAdapter: GameRenderer = (props) => (
  <MemoryMatch {...props} />
)
const MosunAdapter: GameRenderer = (props) => (
  <Mosun {...props} />
)
const NyanghoAdapter: GameRenderer = (props) => (
  <Nyangho {...props} />
)
const WudadaAdapter: GameRenderer = (props) => (
  <Wudada {...props} mode={props.matchOption as 1 | 2 | 3} />
)
const EscapeAdapter: GameRenderer = (props) => (
  <Escape {...props} />
)

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'tictactoe',
    title: '틱택토',
    code: 'TICTACTOE',
    genre: '턴제 전략',
    turnType: '턴제',
    playerCount: 2,
    desc: '3×3 격자에 한 줄을 먼저 완성하면 승리! 클래식 픽셀 대전.',
    version: 'v1.1.0',
    updateDate: '2026-07-07',
    thumbKind: 'tictactoe',
    Component: TicTacToeAdapter,
    matchOptions: [
      { value: 1, label: '단판제' },
      { value: 3, label: '3판 2선승' },
      { value: 5, label: '5판 3선승' },
    ],
    ruleTag: (n) => `${n}판 ${Math.ceil(n / 2)}선승`,
    guide: {
      title: '틱택토 가이드',
      steps: [
        { title: '목표', desc: '3×3 칸 중 같은 기호 3칸을 완성하세요.' },
        { title: '규칙', desc: '설정한 판수만큼 진행. 무승부는 다음 라운드로.' },
        { title: '조작', desc: '내 턴에 빈 칸을 탭.' },
      ],
    },
  },
  {
    id: 'pingpong',
    title: '미니 탁구',
    code: 'PINGPONG',
    genre: '스포츠',
    turnType: '실시간',
    playerCount: 2,
    desc: '화면 좌우 드래그로 패들 조작. 초저지연 실시간 핑퐁.',
    version: 'v1.2.0',
    updateDate: '2026-07-07',
    thumbKind: 'pingpong',
    Component: PingPongAdapter,
    matchOptions: [
      { value: 3, label: '선제 3점' },
      { value: 5, label: '선제 5점' },
      { value: 7, label: '선제 7점' },
    ],
    ruleTag: (n) => `선제 ${n}점`,
    guide: {
      title: '미니 탁구 가이드',
      steps: [
        { title: '목표', desc: '상대 골대를 넘겨 선제 점수 달성.' },
        { title: '조작', desc: '경기장 하단을 드래그해 패들을 좌우로 이동.' },
        { title: '팁', desc: 'SERVE 카운트다운 동안 패들을 미리 배치.' },
      ],
    },
  },
  {
    id: 'memory',
    title: '메모리 매치',
    code: 'PAIR MATCH',
    genre: '퍼즐',
    turnType: '턴제',
    playerCount: 2,
    desc: '카드 8쌍을 짝지어 뒤집기. 맞추면 한 번 더!',
    version: 'v1.0.0',
    updateDate: '2026-07-07',
    thumbKind: 'memory',
    Component: MemoryAdapter,
    matchOptions: [{ value: 8, label: '8쌍' }],
    ruleTag: (n) => `${n}쌍`,
    guide: {
      title: '메모리 매치 가이드',
      steps: [
        { title: '목표', desc: '8쌍 중 많이 맞춘 쪽 승리.' },
        { title: '규칙', desc: '내 턴에 2장 뒤집기. 같으면 획득 + 한 번 더.' },
        { title: '팁', desc: '상대가 뒤집은 카드를 기억.' },
      ],
    },
  },
  {
    id: 'mosun',
    title: '코드네임 · 모순',
    code: 'MOSUN',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '규칙을 캐고, 폭탄을 좁혀라. 마지막은 눈치와 배짱.',
    version: 'v1.2.0',
    updateDate: '2026-07-07',
    thumbKind: 'mosun',
    Component: MosunAdapter,
    matchOptions: [{ value: 1, label: '단판제' }],
    ruleTag: () => '추리',
    guide: {
      title: '모순 가이드',
      oneLine: '뒤집힌 9장 중 폭탄 1장을 피하고, 정확히 짚어내면 승리.',
      sections: [
        {
          title: '내 턴 (셋 중 하나)',
          kind: 'rows',
          items: [
            { label: '뒤집기', desc: '카드 1장 열어 힌트 획득. 전체힌트는 양쪽·개인힌트는 나만.', glyph: 'grid' },
            { label: '턴 넘기기', desc: '게임당 1회. 아직 확신 없을 때 시간 벌기.', glyph: 'skip' },
            { label: '폭탄 찾기', desc: '이 칸이 폭탄이라고 지목. 맞으면 즉시 승리, 틀리면 즉시 패배.', glyph: 'target', tone: 'bomb' },
          ],
        },
        {
          title: '규칙 4종류',
          kind: 'badges',
          items: [
            { label: '관계형', countBadge: '×2' },
            { label: '조건형', countBadge: '×2' },
            { label: '소거형', countBadge: '×1' },
            { label: '★ 배제형', countBadge: '×1', tone: 'accent' },
          ],
        },
      ],
      warning: {
        text: '규칙만으론 폭탄 1칸 확정 불가. 끝은 추론 + 배짱.',
        tone: 'bomb',
      },
    },
  },
  {
    id: 'nyangho',
    title: '냥호 브레이커',
    code: 'NYANGHO',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '숨겨진 4칸 기호 암호를 정확 · 자리만 피드백으로 좁혀 먼저 지르는 쪽 승리.',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'nyangho',
    Component: NyanghoAdapter,
    matchOptions: [{ value: 1, label: '단판제' }],
    ruleTag: () => '추리',
    guide: {
      title: '냥호 브레이커 가이드',
      oneLine: '숨은 4칸 기호 암호를 좁혀 먼저 정확히 지르는 쪽 승리.',
      sections: [
        {
          title: '피드백 (매 추측마다)',
          kind: 'badges',
          items: [
            { label: '🟢 정확 · 기호 O · 자리 O', tone: 'accent' },
            { label: '🟡 자리만 · 기호 O · 자리 X', tone: 'bomb' },
          ],
        },
        {
          title: '내 액션 (넷 중 하나)',
          kind: 'rows',
          items: [
            { label: '추측 제출', desc: '4칸 조합 채우고 제출. 정확·자리만 피드백을 받아 정답 후보 좁히기.', glyph: 'check' },
            { label: '정답 선언', desc: '지금 조합이 정답이라고 선언. 맞으면 즉시 승, 틀리면 즉시 패. 되돌릴 수 없음.', glyph: 'target', tone: 'bomb' },
            { label: '훔쳐보기 (1회)', desc: '상대의 최근 시도 요약을 몰래 보기. 상대는 알림 + 훔쳐보기 +1을 얻음.', glyph: 'sprite-eye' },
            { label: '교란 (1회)', desc: '상대 다음 추측의 피드백을 가짜로 표시. 상대도 "교란당함" 경고를 받음.', glyph: 'skip' },
          ],
        },
      ],
      warning: {
        text: '훔쳐보기 · 교란은 언제 쓸지가 핵심. 남용하면 상대도 카드를 얻어요.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'wudada',
    title: '우다다 대시',
    code: 'WUDADA',
    genre: '러너',
    turnType: '실시간',
    playerCount: 2,
    desc: '3레인 러너. 장애물 피하고 물고기 먹으며 더 멀리 달려라.',
    version: 'v1.0.0',
    updateDate: '2026-07-07',
    thumbKind: 'wudada',
    Component: WudadaAdapter,
    // Spec §우다다: 모드 3종. Numeric-encoded because matchOption is
    // a number in the shared schema — 1=서바이벌, 2=타임어택, 3=스프린트.
    matchOptions: [
      { value: 1, label: '서바이벌 · 1충돌 종료' },
      { value: 2, label: '타임어택 · 60초' },
      { value: 3, label: '스프린트 · 1200m' },
    ],
    ruleTag: (n) => n === 2 ? '타임어택 60초' : n === 3 ? '스프린트 1200m' : '서바이벌',
    guide: {
      title: '우다다 대시 가이드',
      oneLine: '좌우 5레인 러너. 장애물 피하고 아이템 먹으며 더 멀리 달리기.',
      sections: [
        {
          title: '장애물 (부딪히면 아웃)',
          kind: 'sprites',
          items: [
            { label: '상자', desc: '단단함. 부딪히면 크래시', glyph: 'sprite-crate' },
            { label: '물웅덩이', desc: '미끄러워요 · 크래시', glyph: 'sprite-puddle' },
            { label: '화분', desc: '엉킴 · 크래시', glyph: 'sprite-plant' },
            { label: '낮잠 강아지', desc: '깨우지 마세요', glyph: 'sprite-dog', tone: 'bomb' },
          ],
        },
        {
          title: '아이템 (자기 강화 전용)',
          kind: 'sprites',
          items: [
            { label: '간식', desc: '2초 무적', glyph: 'sprite-fish', tone: 'accent' },
            { label: '실뭉치', desc: '거리 보너스', glyph: 'sprite-yarn', tone: 'accent' },
            { label: '가속', desc: '이동 속도 ↑', glyph: 'sprite-bolt', tone: 'accent' },
            { label: '내 냥이', desc: '나 자신', glyph: 'sprite-cat' },
          ],
        },
        {
          title: '모드 (대기방 선택)',
          kind: 'rows',
          items: [
            { label: '서바이벌', desc: '1충돌 종료. 마지막까지 남은 쪽 승.', glyph: 'sprite-cat' },
            { label: '타임어택', desc: '60초 안에 더 멀리. 충돌 시 1.5초 페널티.', glyph: 'skip' },
            { label: '스프린트', desc: '1200m 먼저 도달. 도달자 즉시 승.', glyph: 'target', tone: 'accent' },
          ],
        },
      ],
      warning: {
        text: '양쪽 맵은 시드 동일 · 완전히 똑같아요. 상대 방해 아이템은 없어요 — 순수 실력.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'escape',
    title: '냥탈출',
    code: 'ESCAPE',
    genre: '협동',
    turnType: '실시간',
    playerCount: 2,
    desc: '깜깜한 미로에서 친구 만나고, 열쇠 구해, 같이 탈출!',
    version: 'v1.0.0',
    updateDate: '2026-07-07',
    thumbKind: 'escape',
    Component: EscapeAdapter,
    matchOptions: [{ value: 300, label: '5분 제한' }],
    ruleTag: () => '협동 미로',
    guide: {
      title: '냥탈출 가이드',
      oneLine: '깜깜한 미로에서 ① 친구와 만나고 ② 열쇠를 구해 ③ 함께 탈출!',
      sections: [
        {
          title: '출구 조건 (순서 무관)',
          kind: 'rows',
          items: [
            { label: '① 친구와 접촉', desc: '서로 인접한 칸에 도달해야 첫 단계 완료.', glyph: 'sprite-buddy', tone: 'accent' },
            { label: '② 열쇠 획득', desc: '누구든 열쇠 칸을 밟으면 두 사람 모두 열쇠 획득 상태.', glyph: 'sprite-key', tone: 'accent' },
            { label: '③ 출구 도달', desc: '위 둘이 모두 채워지면 출구가 나타나요. 아무나 밟으면 탈출.', glyph: 'sprite-door', tone: 'accent' },
          ],
        },
        {
          title: '등장 요소',
          kind: 'sprites',
          items: [
            { label: '나', glyph: 'sprite-cat' },
            { label: '친구', glyph: 'sprite-buddy' },
            { label: '열쇠', glyph: 'sprite-key' },
            { label: '출구', glyph: 'sprite-door' },
            { label: '시야↑', desc: '누적 · 지속', glyph: 'sprite-eye', tone: 'accent' },
            { label: '속도↑', desc: '누적 · 지속', glyph: 'sprite-bolt', tone: 'accent' },
            { label: '몬스터', desc: '2초 스턴', glyph: 'sprite-monster', tone: 'bomb' },
          ],
        },
      ],
      steps: [
        { title: '시야 · 안개', desc: '기본 원형 반경 2칸. 지나온 길은 안개(반투명), 안 가본 곳은 완전 암흑. 시야 아이템 먹을 때마다 반경 확장(누적).' },
        { title: '아이템 정책', desc: '시야·속도는 한 번 먹으면 라운드 끝까지 유지. 여러 번 먹을수록 x2 · x3 …로 누적.' },
      ],
      warning: {
        text: '아무도 미로 전체를 못 봐요. 우측 상단 미니맵은 위치만 표시 · 벽은 안 보여요. 소통이 곧 실력.',
        tone: 'accent',
      },
    },
  },
] as const

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
