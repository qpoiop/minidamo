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
import { Breaker } from '../features/games/breaker/Breaker'

export type ThumbKind = 'tictactoe' | 'pingpong' | 'memory' | 'mosun' | 'breaker' | 'placeholder'

export interface GameGuideStep {
  title: string;
  desc: string;
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
  genre: '턴제 전략' | '실시간 액션' | '퍼즐' | '스포츠' | '보드게임' | '추리' | '패턴';
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
    steps: GameGuideStep[];
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
const BreakerAdapter: GameRenderer = (props) => (
  <Breaker {...props} />
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
      title: '코드네임 · 모순 가이드',
      steps: [
        { title: '슬로건', desc: '규칙을 캐고, 폭탄을 좁혀라. 폭탄을 밟거나 잘못 지목하면 패배.' },
        { title: '카드 구성 (9장)', desc: '💣 폭탄 1 · 📢 전체힌트 3 · 🔒 개인힌트 3 · ✓ 일반 2. 폭탄만 위험.' },
        { title: '힌트 공개 규칙', desc: '📢 전체힌트는 양쪽 다 봄. 🔒 개인힌트는 연 사람만 봄 (상대는 "먹었다"만).' },
        { title: '내 턴 · 3택 1', desc: '🔄 뒤집기 · ⏭ 턴 넘기기(게임당 1회) · 🎯 폭탄 찾기 (정답 = 승리 · 오답 = 패배).' },
        { title: '결정론', desc: '힌트만으로 폭탄이 1칸으로 확정되진 않음 (후보 늘 2칸 이상). 마지막은 판단 + 눈치.' },
        { title: '배제형 ✦', desc: '판당 최대 1장. 등장 시 전체 화면 반짝. 넓은 영역이 한 번에 배제됨.' },
      ],
    },
  },
  {
    id: 'breaker',
    title: '컬러 브레이커',
    code: 'BREAKER',
    genre: '패턴',
    turnType: '턴제',
    playerCount: 2,
    desc: '색 버튼을 누르며 숨은 마스터 룰을 먼저 알아맞히는 쪽 승리.',
    version: 'v1.0.0',
    updateDate: '2026-07-07',
    thumbKind: 'breaker',
    Component: BreakerAdapter,
    matchOptions: [{ value: 10, label: '10회 시도' }],
    ruleTag: (n) => `${n}회 시도`,
    guide: {
      title: '컬러 브레이커 가이드',
      steps: [
        { title: '보드', desc: '4색 버튼 · 정답 시퀀스 O/X가 전광판에 표시.' },
        { title: '내 턴', desc: '색을 눌러 관찰. 규칙을 알겠으면 "선언" 버튼.' },
        { title: '승리', desc: '먼저 마스터 룰을 정확히 선언하는 쪽 승리.' },
      ],
    },
  },
] as const

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
