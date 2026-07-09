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
import { Wavelength } from '../features/games/wavelength/Wavelength'
import { HiddenWord } from '../features/games/hiddenword/HiddenWord'

export type ThumbKind = 'tictactoe' | 'pingpong' | 'memory' | 'mosun' | 'nyangho' | 'wudada' | 'escape' | 'wavelength' | 'hiddenword' | 'placeholder'

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
  /** Optional second option value. Games that expose a two-axis lobby
   * dropdown (e.g. Wavelength: tolerance × target score) read this
   * alongside `matchOption`. Games without a second axis leave it
   * undefined. */
  matchOption2?: number;
  /** Solo bench flag from TestMode. Signals to games that require a P2P
   *  handshake (Memory, Nyangho, Mosun) that they should self-seed
   *  instead of waiting for a peer that will never send. */
  soloMode?: boolean;
}

/** A per-game adapter that maps CommonGameProps into the game's actual props. */
type GameRenderer = ComponentType<CommonGameProps>

export interface GameDefinition {
  id: string;
  title: string;
  code: string;                  // arcade top-line label
  /** Consolidated category taxonomy — many earlier genres had a
   *  single member each (러너 · 스포츠 · 감각 · 패턴 · 보드게임 …)
   *  which fragmented the library filter without giving users a real
   *  way to browse by shared feel. Collapsed into 4 buckets so the
   *  drawer chip row has enough games under each label to be worth
   *  filtering on. */
  genre: '실시간 액션' | '전략' | '추리' | '협동';
  turnType: '턴제' | '실시간';
  playerCount: number;
  desc: string;
  version: string;
  updateDate: string;
  thumbKind: ThumbKind;
  Component: GameRenderer;
  /** Presets for the "판수/점수" style option shown in the lobby. */
  matchOptions: ReadonlyArray<{ value: number; label: string }>;
  /** Optional second dropdown (e.g. Wavelength: tolerance × target
   * score). Presence of `matchOptions2` makes the lobby show a
   * second select next to the primary one; `matchOption2Label` is the
   * label above the second dropdown. */
  matchOptions2?: ReadonlyArray<{ value: number; label: string }>;
  matchOption2Label?: string;
  matchOptionsLabel?: string;    // primary label override
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
  <MemoryMatch {...props} matchOption={props.matchOption} />
)
const MosunAdapter: GameRenderer = (props) => {
  const side = (props.matchOption === 4 || props.matchOption === 5)
    ? props.matchOption
    : 3
  return <Mosun {...props} boardSide={side} />
}
const NyanghoAdapter: GameRenderer = (props) => (
  <Nyangho {...props} matchOption={props.matchOption} />
)
const WudadaAdapter: GameRenderer = (props) => (
  <Wudada {...props} mode={props.matchOption as 1 | 2 | 3} />
)
const EscapeAdapter: GameRenderer = (props) => (
  <Escape {...props} matchOption={props.matchOption} />
)
const WavelengthAdapter: GameRenderer = (props) => (
  <Wavelength {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const HiddenWordAdapter: GameRenderer = (props) => (
  <HiddenWord {...props} matchOption={props.matchOption} />
)

export const GAMES: readonly GameDefinition[] = [
  {
    id: 'tictactoe',
    title: '틱택토',
    code: 'TICTACTOE',
    genre: '전략',
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
      oneLine: '3×3 격자에 O·X를 번갈아 두어 세 칸을 먼저 이으면 그 판 승리, 판수를 채우면 매치 승리입니다.',
      sections: [
        {
          title: '내 턴에 할 수 있는 것',
          kind: 'rows',
          items: [
            { label: '빈 칸에 내 기호 두기', desc: '이미 놓은 칸에는 못 두어요. 한 번 두면 되돌릴 수 없어요.', glyph: 'grid' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 명이 O와 X 기호를 번갈아 두는 고전 3-in-a-row 매치.' },
        { title: '진행 방식', desc: '패자가 다음 라운드 선공(무승부일 땐 순서 유지). 매치 옵션에서 지정한 판수만큼 반복.' },
        { title: '승리 조건', desc: '한 판: 가로·세로·대각선 중 하나로 세 칸을 이으면 라운드 승. 매치: 선승 수(3판 2선승 · 5판 3선승 등)를 먼저 달성한 쪽.' },
      ],
      warning: {
        text: '무승부는 매치 스코어에 영향 없이 다음 라운드로 넘어가요.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'pingpong',
    title: '미니 탁구',
    code: 'PINGPONG',
    genre: '실시간 액션',
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
      oneLine: '패들을 좌우로 조작해 상대 골대를 넘긴 쪽이 득점하며, 정해진 점수에 먼저 도달하면 매치 승리입니다.',
      sections: [
        {
          title: '실시간 조작',
          kind: 'rows',
          items: [
            { label: '패들 이동', desc: '경기장 하단을 좌우로 드래그. 손을 뗄 필요 없이 이어서 조준 가능.', glyph: 'skip' },
            { label: '서브 준비', desc: 'SERVE 카운트다운 동안 패들 위치를 미리 잡아 두면 첫 랠리에서 유리해요.', glyph: 'target' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 명이 동시에 조작하는 실시간 미니 탁구. 호스트가 물리 시뮬레이션 권위.' },
        { title: '진행 방식', desc: '공이 상대 골대를 넘기면 득점 → 다음 서브. 좌우 왕복 랠리를 이어가며 실수를 유도.' },
        { title: '랠리 속도 증가', desc: '패들에 맞을 때마다 공 속도가 약 5.5% 빨라져요. 랠리가 오래갈수록 반사 신경 승부 · 최고 속도는 7.5까지로 캡. 랠리 수는 헤더에 표시.' },
        { title: '승리 조건', desc: '대기방에서 선택한 목표 점수(선제 3점 · 5점 · 7점)에 먼저 도달한 쪽 매치 승.' },
      ],
      warning: {
        text: '실시간 게임입니다. 연결이 끊기면 서브 진행이 멈추고 재접속 창이 떠요.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'memory',
    title: '메모리 매치',
    code: 'PAIR MATCH',
    genre: '전략',
    turnType: '턴제',
    playerCount: 2,
    desc: '카드 8쌍을 짝지어 뒤집기. 맞추면 한 번 더!',
    version: 'v1.0.0',
    updateDate: '2026-07-07',
    thumbKind: 'memory',
    Component: MemoryAdapter,
    matchOptions: [
      { value: 8,  label: '8쌍 · 단판' },
      { value: 83, label: '8쌍 · 3라운드 (2선승)' },
      { value: 85, label: '8쌍 · 5라운드 (3선승)' },
    ],
    ruleTag: (n) => `${n}쌍`,
    guide: {
      title: '메모리 매치 가이드',
      oneLine: '엎어놓은 카드를 한 턴에 두 장씩 뒤집어 짝을 맞추며, 정해진 쌍 중 더 많이 획득한 쪽이 승리합니다.',
      sections: [
        {
          title: '내 턴에 할 수 있는 것',
          kind: 'rows',
          items: [
            { label: '카드 두 장 뒤집기', desc: '한 턴에 정확히 두 장. 같으면 내 것 · 다르면 다시 엎어짐.', glyph: 'grid' },
            { label: '짝 맞추기 성공 시 이어서', desc: '한 쌍을 얻으면 턴을 다시 받아 연속으로 시도할 수 있어요.', glyph: 'check', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 명이 번갈아 카드 짝을 맞추는 기억력 대결. 상대가 뒤집는 카드도 정보예요.' },
        { title: '진행 방식', desc: '각 턴에 두 장을 뒤집고 결과에 따라 획득 or 턴 넘김. 상대 시도를 관찰해 유리한 카드를 추적.' },
        { title: '승리 조건', desc: '전체 쌍이 모두 열리면 매치 종료. 획득한 쌍이 더 많은 쪽 승 · 같으면 무승부.' },
      ],
      warning: {
        text: '보드 배치는 시드 기반으로 양쪽 동일. 순수 기억력 승부.',
        tone: 'accent',
      },
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
    // Value = board side (3/4/5). Each preset scales BOMB/ALL/ME/SAFE
    // composition and the shrink-target curves so bomb hunting stays
    // gradual regardless of size.
    matchOptions: [
      { value: 3, label: '3×3 (기본)' },
      { value: 4, label: '4×4' },
      { value: 5, label: '5×5' },
    ],
    ruleTag: (n) => `${n}×${n}`,
    guide: {
      title: '모순 가이드',
      oneLine: '보드 크기를 골라 폭탄 한 장을 피하며 힌트를 모으고, 확신이 서면 폭탄을 정확히 지목해 승리하는 추리 대전입니다. 3×3 · 4×4 · 5×5 지원.',
      sections: [
        {
          title: '내 턴에 할 수 있는 것 (셋 중 하나)',
          kind: 'rows',
          items: [
            { label: '뒤집기', desc: '카드 1장을 열어 힌트를 획득해요. 전체힌트는 양쪽 다 보고, 개인힌트는 연 사람만 봅니다.', glyph: 'grid' },
            { label: '턴 넘기기', desc: '게임당 1회만 사용. 아직 확신이 없을 때 정보를 더 쌓고 싶다면 사용하세요.', glyph: 'skip' },
            { label: '폭탄 찾기', desc: '이 칸이 폭탄이라고 지목해요. 맞으면 즉시 승리, 틀리면 즉시 패배 · 되돌릴 수 없어요.', glyph: 'target', tone: 'bomb' },
          ],
        },
        {
          title: '나오는 규칙 4종',
          kind: 'badges',
          items: [
            { label: '관계형', countBadge: '×2' },
            { label: '조건형', countBadge: '×2' },
            { label: '소거형', countBadge: '×1' },
            { label: '★ 배제형', countBadge: '×1', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 명이 같은 N×N 보드에서 서로의 힌트 카드를 교차 관찰하며 폭탄 위치를 좁혀갑니다.' },
        { title: '보드 크기', desc: '3×3 (기본, 9칸) · 4×4 (16칸) · 5×5 (25칸). 크기가 커질수록 개인·전체 힌트 카드 수량이 늘어나고, 후보 축소 폭도 넓어져요.' },
        { title: '진행 방식', desc: '턴제 · 매 턴 세 가지 액션 중 하나를 수행. 힌트는 매번 후보 영역을 좁히지만 결코 한 칸으로 확정되지 않아요.' },
        { title: '승리 조건', desc: '폭탄 찾기로 폭탄을 정확히 지목한 쪽 승리. 상대가 폭탄을 뒤집거나 오답 지목해도 승리.' },
      ],
      warning: {
        text: '규칙만으로 폭탄 한 칸이 확정되지 않아요. 마지막은 추론과 배짱의 싸움.',
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
    desc: '숨겨진 4칸 기호 암호를 정확 · 포함 피드백으로 좁혀 먼저 지르는 쪽 승리.',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'nyangho',
    Component: NyanghoAdapter,
    // Match presets encode rounds + peek + disrupt counts. Keys mirror
    // Nyangho.NYANGHO_PRESETS so the game screen can pull the full
    // config back out.
    matchOptions: [
      { value: 1, label: '기본 · 훔 1 · 교 1' },
      { value: 3, label: '표준 · 훔 2 · 교 2' },
      { value: 5, label: '심화 · 훔 3 · 교 3' },
    ],
    ruleTag: (n) => n === 5 ? '심화' : n === 3 ? '표준' : '기본',
    guide: {
      title: '냥호 브레이커 가이드',
      oneLine: '두 사람이 같은 4칸 기호 암호를 각자 풀며, 정확과 포함 피드백을 활용해 정답을 먼저 지르는 쪽이 이깁니다.',
      sections: [
        {
          title: '피드백 표기',
          kind: 'badges',
          items: [
            { label: '● 정확 · 기호 O · 자리 O',   tone: 'accent' },
            { label: '○ 포함 · 기호 O · 자리 X',   tone: 'accent' },
          ],
        },
        {
          title: '내 액션 (넷 중 하나)',
          kind: 'rows',
          items: [
            { label: '추측 제출', desc: '4칸 조합 채우고 제출. 정확·포함 피드백을 받아 정답 후보 좁히기. 제출 후 상대 턴.', glyph: 'check' },
            { label: '정답 선언', desc: '지금 조합이 정답이라고 선언. 맞으면 즉시 승, 틀리면 즉시 패. 되돌릴 수 없음.', glyph: 'target', tone: 'bomb' },
            { label: '훔쳐보기 (프리셋별 1~3회)', desc: '정답 코드 4칸 중 1칸의 실제 기호를 미리 확인. 상대는 알림 + 훔쳐보기 +1을 얻음.', glyph: 'sprite-eye' },
            { label: '교란 (프리셋별 1~3회)', desc: '상대 다음 추측의 피드백을 가짜로 표시. 상대도 "교란당함" 경고를 받음.', glyph: 'skip' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '양쪽에게 같은 4칸 기호 암호가 주어지고, 서로 번갈아 추측하며 피드백으로 정답을 좁혀 갑니다.' },
        { title: '진행 방식', desc: '팔레트에서 기호 4개를 골라 제출 → 정확·포함 개수 반환 → 상대 턴. 여러 시도를 조합해 후보를 좁히고, 상대의 진행 상황도 시야에 들어옵니다.' },
        { title: '피드백 표기', desc: '정확 = 채워진 원(기호 · 자리 다 맞음). 포함 = 비어있는 원(기호는 있지만 자리는 틀림).' },
        { title: '승리 조건', desc: '정답 선언을 정확히 맞춘 쪽 즉시 승리. 오답이면 즉시 패배 → 상대가 승. 되돌릴 수 없어요.' },
      ],
      warning: {
        text: '훔쳐보기 · 교란은 강력하지만 상대에게도 힌트·카드가 넘어가요. 타이밍이 승부처.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'wudada',
    title: '우다다 대시',
    code: 'WUDADA',
    genre: '실시간 액션',
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
      oneLine: '5개 레인을 좌우로 오가며 장애물을 피하고 아이템을 먹어 더 멀리 달리는 실시간 러너 대결입니다.',
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
            { label: '간식(생선)', desc: '2.1초 무적 · 점수 없음', glyph: 'sprite-fish', tone: 'accent' },
            { label: '실뭉치', desc: '거리 +8m 보너스', glyph: 'sprite-yarn', tone: 'accent' },
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
      steps: [
        { title: '개요', desc: '두 명이 같은 시드로 생성된 트랙을 동시에 달리는 실시간 러너. 상대 방해 없이 순수 반응 승부.' },
        { title: '진행 방식', desc: '좌·우 버튼(또는 A/D · 화살표)으로 레인을 이동. 위에서 내려오는 장애물을 피하고 아이템을 밟아 강화.' },
        { title: '아이템 효과 (점수 X 대부분)', desc: '간식(생선) = 2.1초 무적, 점수는 안 오릅니다. 실뭉치 = 거리 +8m 보너스. 즉 점수(=달린 거리)에 직접 기여하는 건 실뭉치뿐.' },
        { title: '500m마다 난이도 상승', desc: '거리가 500m를 넘길 때마다 기본 속도 +0.55 · 장애물 최소 간격 −40ms (최소 260ms까지). 속도 상한은 7.5, 스폰 간격 하한은 260ms이므로 무한 가속은 없어요.' },
        { title: '승리 조건', desc: '모드에 따라 다름. 서바이벌 = 마지막까지 남은 쪽, 타임어택 = 60초 후 거리 우위, 스프린트 = 1200m 선착.' },
      ],
      warning: {
        text: '양쪽 맵은 시드가 같아 완전히 동일해요. 상대를 방해할 방법은 없고, 오직 반응과 판단이 승부.',
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
    matchOptions: [
      { value: 180, label: '3분 제한' },
      { value: 300, label: '5분 제한' },
      { value: 420, label: '7분 제한' },
    ],
    ruleTag: (n) => `${Math.floor(n / 60)}분`,
    guide: {
      title: '냥탈출 가이드',
      oneLine: '두 사람이 좁은 시야의 미로에서 합류·열쇠·출구 조건을 채운 뒤, 둘 다 각자 출구를 밟아야 팀이 성공하는 협동 게임입니다.',
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
        { title: '개요', desc: '두 명이 서로 다른 지점에서 시작해 좁은 시야를 극복하며 협동으로 미로를 탈출.' },
        { title: '진행 방식', desc: '원형 조이스틱으로 상하좌우 이동. 시야는 원형 반경 2칸(누적 아이템으로 확장). 지나온 길은 안개, 안 가본 곳은 완전 암흑.' },
        { title: '아이템 정책', desc: '시야·속도 아이템은 한 번 먹으면 라운드 끝까지 유지되고, 여러 번 먹을수록 x2·x3처럼 누적. 초기 4개 배치 + 15초마다 랜덤 드랍.' },
        { title: '승리 조건', desc: '합류 + 열쇠 획득 → 출구 등장. 두 사람이 각자 출구를 밟아야 팀 성공. 한 명만 먼저 나오면 그 사람은 관전 모드, 상대가 나올 때까지 대기.' },
        { title: '30초 남았을 때', desc: '남은 시간 30초 이하가 되면 화면 중앙에 카운트다운이 뜨고, 미니맵에 출구 위치가 자홍색 별로 공개되어 마지막 스퍼트를 도울 수 있어요.' },
      ],
      warning: {
        text: '아무도 미로 전체를 못 봐요. 미니맵은 위치만 표시 · 벽은 안 보임. 소통이 곧 실력.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'wavelength',
    title: '냥파장',
    code: 'NYANGWAVE',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '촉냥의 한 줄 단서만 듣고 숨은 지점에 다이얼을 최대한 가깝게 맞춰라.',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'wavelength',
    Component: WavelengthAdapter,
    // Wavelength is the first game with a two-axis lobby dropdown.
    // Primary: tolerance preset. Secondary: target score. Consumer
    // reads both matchOption + matchOption2.
    matchOptionsLabel: '오차 범위',
    matchOptions: [
      { value: 0, label: '초정밀 ±1' },
      { value: 1, label: '보통 ±4' },
      { value: 2, label: '빡빡 ±2' },
      { value: 3, label: '널널 ±6' },
    ],
    matchOption2Label: '승리 점수',
    matchOptions2: [
      { value: 8,  label: '8점' },
      { value: 10, label: '10점' },
      { value: 12, label: '12점' },
      { value: 15, label: '15점' },
      { value: 20, label: '20점' },
    ],
    ruleTag: (n) => n === 2 ? '빡빡 ±2' : n === 3 ? '널널 ±6' : n === 0 ? '초정밀 ±1' : '보통 ±4',
    guide: {
      title: '냥파장 가이드',
      oneLine: '두 사람이 번갈아 촉냥(출제자)이 되어 스펙트럼 위 숨은 지점을 한 줄 단서로 힌트, 나머지 한 사람이 다이얼을 돌려 가까이 맞추는 감각 대전입니다.',
      sections: [
        {
          title: '역할 (매 라운드 교대)',
          kind: 'rows',
          items: [
            { label: '촉냥 (출제자)', desc: '스펙트럼 위 숨은 지점을 확인하고, 그 지점을 표현하는 단서 한 줄을 씁니다. 숫자·양끝 단어 금지.', glyph: 'target', tone: 'accent' },
            { label: '추측자', desc: '단서만 보고 다이얼을 드래그해 그 지점을 맞춥니다.', glyph: 'skip' },
          ],
        },
        {
          title: '점수 (보통 기준)',
          kind: 'badges',
          items: [
            { label: '±5 이내 · 4점', tone: 'accent' },
            { label: '±10 이내 · 3점', tone: 'accent' },
            { label: '±15 이내 · 2점', tone: 'accent' },
            { label: '그 외 · 0점', tone: 'bomb' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 사람이 한 번씩 촉냥·추측자 역할을 번갈아 수행하며 점수를 누적합니다.' },
        { title: '진행 방식', desc: '① 촉냥은 정답 존을 보고 단서 한 줄 제출 → ② 추측자는 단서만 보고 다이얼 드래그 → ③ 채점 후 다음 라운드.' },
        { title: '승리 조건', desc: '목표 점수(방 옵션: 12/15/20)에 먼저 도달한 쪽 매치 승.' },
      ],
      warning: {
        text: '단서에 숫자·양끝 단어를 넣으면 안 됩니다. 시스템이 검열하지 않으니 서로 신뢰하며 진행.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'hiddenword',
    title: '냥말 블러핑',
    code: 'HIDDENWORD',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '내 정체를 흘리며 상대의 정체를 캔다. 정확히 지목하면 승, 오답 지목하면 즉시 패!',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'hiddenword',
    Component: HiddenWordAdapter,
    matchOptions: [
      { value: 4,  label: '4×4 · 단판' },
      { value: 5,  label: '5×5 · 단판' },
      { value: 43, label: '4×4 · 3라운드 (2선승)' },
      { value: 53, label: '5×5 · 3라운드 (2선승)' },
      { value: 45, label: '4×4 · 5라운드 (3선승)' },
      { value: 55, label: '5×5 · 5라운드 (3선승)' },
    ],
    ruleTag: (n) => {
      if (n === 43 || n === 53) return '3라운드'
      if (n === 45 || n === 55) return '5라운드'
      const side = n === 5 ? 5 : 4
      return `${side}×${side}`
    },
    guide: {
      title: '냥말 블러핑 가이드',
      oneLine: '공유 단어 보드 위 각자 랜덤 배정된 카드 하나가 정체. 단서를 흘려 상대 정체를 캐고 지목하면 승, 오답 지목은 즉시 패.',
      sections: [
        {
          title: '내 턴에 할 수 있는 것 (택1)',
          kind: 'rows',
          items: [
            { label: '단서 흘리기', desc: '내 카드에 어울리는 표현 한 마디. 참이어야 하고 매번 새 속성. 카드 단어·직역·좌표 노출 금지.', glyph: 'check' },
            { label: '상대 지목', desc: '상대의 정체 카드를 보드에서 골라 확정. 맞으면 즉시 승 · 틀리면 즉시 패, 되돌릴 수 없음.', glyph: 'target', tone: 'bomb' },
          ],
        },
        {
          title: '보드 구성',
          kind: 'rows',
          items: [
            { label: '유사군 (테마 카드)', desc: '보드의 절반 정도가 뜻이 겹치는 유사군. 두 사람의 정체는 모두 이 유사군에서 뽑혀요.', glyph: 'grid', tone: 'accent' },
            { label: '내 카드', desc: '보드 위 딱 한 장이 내 정체. 라임 테두리로 나에게만 하이라이트 표시.', glyph: 'sprite-cat', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '4×4 또는 5×5 단어 보드가 전원에게 앞면 공개. 각자에게 카드 한 장이 랜덤 배정 (본인만 아는 정체).' },
        { title: '진행 방식', desc: '턴제 · 매 턴 단서 흘리기 또는 지목 중 하나. 단서는 매번 새로운 속성으로.' },
        { title: '승리 조건', desc: '상대의 정체 카드를 정확히 지목 → 승리. 오답 지목 → 즉시 패배, 상대 자동 승리.' },
      ],
      warning: {
        text: '보드 절반이 유사군이라 단서 하나로는 안 좁혀져요. 여러 단서의 교집합으로만 정체가 드러나요.',
        tone: 'accent',
      },
    },
  },
] as const

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
