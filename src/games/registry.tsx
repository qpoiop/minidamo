/*
 * Single source of truth for every playable game.
 *
 * Screens (Home slider, library drawer, App router, Lobby options) all
 * read from this list — adding a game means adding one entry here, not
 * hunting for every switch statement.
 */

import type { ComponentType } from 'react'
import type { PlayerInfo, P2PMessage } from '../hooks/useRoom'
import { MemoryMatch } from '../features/games/memory/MemoryMatch'
import { BombHunt } from '../features/games/bombhunt/BombHunt'
import { Mastermind } from '../features/games/mastermind/Mastermind'
import { Escape } from '../features/games/escape/Escape'
import { Wavelength } from '../features/games/wavelength/Wavelength'
import { HiddenWord } from '../features/games/hiddenword/HiddenWord'
import { Quorimo } from '../features/games/quorimo/Quorimo'
import { Vinci } from '../features/games/vinci/Vinci'
import { Ditrick } from '../features/games/ditrick/Ditrick'
import { Trumeon } from '../features/games/trumeon/Trumeon'

export type ThumbKind = 'memory' | 'bombhunt' | 'mastermind' | 'escape' | 'wavelength' | 'hiddenword' | 'catwall' | 'davinci' | 'indianpoker' | 'trick' | 'placeholder'

export interface GameGuideStep {
  title: string;
  desc: string;
}

/** Icon set exposed to structured guides. Extend as needed. */
export type GuideGlyph =
  | 'grid' | 'skip' | 'target' | 'check' | 'close'
  | 'sprite-cat' | 'sprite-buddy' | 'sprite-key' | 'sprite-door' | 'sprite-eye'
  | 'sprite-shield' | 'sprite-bolt' | 'sprite-monster'

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
   *  handshake (Memory, Mastermind, BombHunt) that they should self-seed
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
const MemoryAdapter: GameRenderer = (props) => (
  <MemoryMatch {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const BombHuntAdapter: GameRenderer = (props) => {
  const side = (props.matchOption === 4 || props.matchOption === 5)
    ? props.matchOption
    : 3
  return <BombHunt {...props} boardSide={side} />
}
const MastermindAdapter: GameRenderer = (props) => (
  <Mastermind {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const EscapeAdapter: GameRenderer = (props) => (
  <Escape {...props} matchOption={props.matchOption} />
)
const WavelengthAdapter: GameRenderer = (props) => (
  <Wavelength {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const HiddenWordAdapter: GameRenderer = (props) => (
  <HiddenWord {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const QuorimoAdapter: GameRenderer = (props) => (
  <Quorimo {...props} matchOption={props.matchOption} />
)
const VinciAdapter: GameRenderer = (props) => (
  <Vinci {...props} matchOption={props.matchOption} />
)
const DitrickAdapter: GameRenderer = (props) => (
  <Ditrick {...props} matchOption={props.matchOption} matchOption2={props.matchOption2} />
)
const TrumeonAdapter: GameRenderer = (props) => (
  <Trumeon {...props} matchOption={props.matchOption} />
)

export const GAMES: readonly GameDefinition[] = [
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
    matchOptionsLabel: '카드 쌍 수',
    matchOptions: [
      { value: 8, label: '8쌍' },
    ],
    matchOption2Label: '라운드',
    matchOptions2: [
      { value: 1, label: '단판' },
      { value: 3, label: '3라운드 (2선승)' },
      { value: 5, label: '5라운드 (3선승)' },
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
    id: 'bombhunt',
    title: '룰셋 판도라',
    code: 'BOMBHUNT',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '규칙을 캐고, 폭탄을 좁혀라. 마지막은 눈치와 배짱.',
    version: 'v1.2.0',
    updateDate: '2026-07-07',
    thumbKind: 'bombhunt',
    Component: BombHuntAdapter,
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
      title: '룰셋 판도라 가이드',
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
    id: 'mastermind',
    title: '코드 심볼',
    code: 'MASTERMIND',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '숨겨진 4칸 기호 암호를 정확 · 포함 피드백으로 좁혀 먼저 지르는 쪽 승리.',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'mastermind',
    Component: MastermindAdapter,
    // Match presets encode rounds + peek + disrupt counts. Keys mirror
    // Mastermind.MASTERMIND_PRESETS so the game screen can pull the full
    // config back out.
    matchOptionsLabel: '훔쳐보기',
    matchOptions: [
      { value: 1, label: '1회' },
      { value: 3, label: '2회' },
      { value: 5, label: '3회' },
    ],
    matchOption2Label: '교란',
    matchOptions2: [
      { value: 1, label: '1회' },
      { value: 3, label: '2회' },
      { value: 5, label: '3회' },
    ],
    ruleTag: (n) => n === 5 ? '3회' : n === 3 ? '2회' : '1회',
    guide: {
      title: '코드 심볼 가이드',
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
    id: 'escape',
    title: '협동 미로',
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
      title: '협동 미로 가이드',
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
    title: '모레파시',
    code: 'WAVELENGTH',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '출제자의 한 줄 단서만 듣고 숨은 지점에 다이얼을 최대한 가깝게 맞춰라.',
    version: 'v1.0.0',
    updateDate: '2026-07-08',
    thumbKind: 'wavelength',
    Component: WavelengthAdapter,
    // Wavelength is the first game with a two-axis lobby dropdown.
    // Primary: tolerance preset. Secondary: target score. Consumer
    // reads both matchOption + matchOption2.
    matchOptionsLabel: '오차 허용',
    matchOptions: [
      { value: 0, label: '±1' },
      { value: 2, label: '±2' },
      { value: 1, label: '±4' },
      { value: 3, label: '±6' },
    ],
    matchOption2Label: '승리 점수',
    matchOptions2: [
      { value: 3, label: '3점' },
      { value: 5, label: '5점' },
      { value: 7, label: '7점' },
    ],
    ruleTag: (n) => n === 2 ? '±2' : n === 3 ? '±6' : n === 0 ? '±1' : '±4',
    guide: {
      title: '모레파시 가이드',
      oneLine: '두 사람이 번갈아 출제자가 되어 스펙트럼 위 숨은 지점을 한 줄 단서로 힌트, 나머지 한 사람이 다이얼을 돌려 그 지점을 맞추는 감각 대전입니다.',
      sections: [
        {
          title: '역할 (매 라운드 교대)',
          kind: 'rows',
          items: [
            { label: '출제자', desc: '게이지 위 정답 지점을 확인하고, 그 지점을 유추할 수 있는 단서를 주제에 맞는 표현으로 한 줄 씁니다.', glyph: 'target', tone: 'accent' },
            { label: '추측자', desc: '단서만 보고 다이얼을 드래그해 그 지점을 맞춥니다.', glyph: 'skip' },
          ],
        },
        {
          title: '채점',
          kind: 'badges',
          items: [
            { label: '오차 범위 안 → 3점', tone: 'accent' },
            { label: '오차 범위 밖 → 0점', tone: 'bomb' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 사람이 한 번씩 출제자·추측자 역할을 번갈아 수행하며 점수를 누적합니다.' },
        { title: '진행 방식', desc: '① 출제자는 게이지에 표시된 목표 위치를 확인하고 한 줄 단서 제출 → ② 추측자는 단서만 보고 다이얼을 드래그해 확정 → ③ 채점 후 역할 교대, 다음 라운드.' },
        { title: '단서 규칙', desc: '주제에 맞는 표현으로 한 줄 작성. 애매하면 추측자가 재요청 가능 (라운드 당 1회).' },
        { title: '채점 규칙', desc: '오차가 오차 범위 (방 옵션) 안 → 3점 · 밖 → 0점. 이진 채점.' },
        { title: '승리 조건', desc: '방 옵션의 목표 점수(8/10/12/15/20)에 먼저 도달한 쪽 매치 승.' },
      ],
      warning: {
        text: '단서는 주제에 맞는 표현으로. 검열은 없으니 서로 신뢰하며 진행.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'hiddenword',
    title: '모드네임',
    code: 'HIDDENWORD',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '출제자가 단서로 정답 카드를 유도. 함정 카드를 짚으면 즉시 실패. 협동 매치.',
    version: 'v2.0.0',
    updateDate: '2026-07-09',
    thumbKind: 'hiddenword',
    Component: HiddenWordAdapter,
    matchOptionsLabel: '보드 크기',
    matchOptions: [
      { value: 3, label: '3×3' },
      { value: 4, label: '4×4' },
      { value: 5, label: '5×5' },
    ],
    matchOption2Label: '목표 점수',
    matchOptions2: [
      { value: 1, label: '1 정답' },
      { value: 3, label: '3 정답' },
      { value: 5, label: '5 정답' },
    ],
    ruleTag: (n) => `${n}×${n}`,
    guide: {
      title: '모드네임 가이드',
      oneLine: '출제자가 단서로 정답 카드를 유도하고 맞추는 사람이 카드를 지목. 함정 카드를 짚으면 매치 즉시 실패. 협동 매치.',
      sections: [
        {
          title: '역할 (매 라운드 교대)',
          kind: 'rows',
          items: [
            { label: '출제자', desc: '정답 · 함정 · 일반 카드가 나만 보임. 정답을 유도하는 한 줄 단서 작성.', glyph: 'target', tone: 'accent' },
            { label: '맞추는 사람', desc: '단서만 보고 카드 하나를 지목. 정답이면 점수 획득, 함정이면 매치 즉시 실패.', glyph: 'check' },
          ],
        },
        {
          title: '카드 종류',
          kind: 'badges',
          items: [
            { label: '정답 · 1장 → +1점', tone: 'accent' },
            { label: '함정 · 3장 → 매치 즉시 실패', tone: 'bomb' },
            { label: '일반 · 나머지 → 점수 없음', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '3×3 또는 4×4 단어 보드. 매 라운드 정답 1장 · 함정 3장 · 나머지 일반 카드로 재배치.' },
        { title: '진행 방식', desc: '① 출제자가 단서 작성 → ② 맞추는 사람이 카드 지목 → ③ 결과 공개 → ④ 역할 교대 후 다음 라운드.' },
        { title: '점수 규칙', desc: '정답 지목 → 공유 점수 +1 · 일반 → 점수 변동 없음 · 함정 → 매치 즉시 실패.' },
        { title: '승리 조건', desc: '함정을 피하고 목표 점수 (1 / 3 / 5 정답) 에 도달하면 두 사람 모두 승. 함정을 짚으면 두 사람 모두 패.' },
      ],
      warning: {
        text: '카드 종류는 출제자만 봐요. 단서에 지나친 힌트를 넣으면 함정 지목 위험도 커져요.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'quorimo',
    title: '쿼리모',
    code: 'QUORIMO',
    genre: '전략',
    turnType: '턴제',
    playerCount: 2,
    desc: '격자 위 반대편 끝줄까지 먼저 가라. 벽으로 상대를 돌아가게 만들 수 있다. 완전정보 수읽기.',
    version: 'v1.0.0',
    updateDate: '2026-07-09',
    thumbKind: 'catwall',
    Component: QuorimoAdapter,
    matchOptionsLabel: '보드 크기',
    matchOptions: [
      { value: 7, label: '7×7 (빠른 판)' },
      { value: 9, label: '9×9 (기본)' },
    ],
    ruleTag: (n) => `${n}×${n}`,
    guide: {
      title: '쿼리모 가이드',
      oneLine: '내 고양이를 반대편 끝줄에 먼저 도착시켜라. 벽으로 상대의 길을 미로처럼 늘릴 수 있다. 숨김·운 없는 순수 수읽기.',
      sections: [
        {
          title: '내 턴 · 둘 중 하나',
          kind: 'rows',
          items: [
            { label: '이동', desc: '인접 4방향 중 한 칸 · 벽으로 막혀 있으면 못 감. 상대와 마주치면 뛰어넘기·대각 이동 가능.', glyph: 'skip' },
            { label: '벽 세우기', desc: '2칸 벽을 홈에 놓아 상대 길을 늘림. 남은 벽 −1. 완전 봉쇄는 금지 (양쪽 도달 경로 필수).', glyph: 'grid', tone: 'accent' },
          ],
        },
        {
          title: '핵심 감각',
          kind: 'badges',
          items: [
            { label: '남은 벽 유한 · 아껴 쓰기', tone: 'accent' },
            { label: '완전 봉쇄 벽 시도 → 자동 거부', tone: 'bomb' },
            { label: '벽으로 만든 미로가 나를 가둘 수도', tone: 'muted' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 고양이가 각자 반대 편에서 출발 · 격자 이동+벽 세우기로 반대편 끝줄에 먼저 도착하는 쪽 승.' },
        { title: '진행 방식', desc: '턴제 · 매 턴 이동 또는 벽 배치 중 하나. 벽은 (N-1)² 홈 후보 · 가로/세로 방향 선택.' },
        { title: '벽 검증', desc: '겹침·교차 금지. 양쪽 목표선 도달 경로 존재 (BFS) 검증. 위반 시 배치 거부 + 사유 토스트.' },
        { title: '승리 조건', desc: '자기 목표 행(반대편 끝줄) 아무 칸에나 도달 시 즉시 승.' },
      ],
      warning: {
        text: '벽 자원은 유한 · 초반 남발 시 종반 무방비. 완전정보라 상대의 다음 몇 수를 미리 읽어야 진짜 승부.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'vinci',
    title: '모빈치코드',
    code: 'VINCI',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '오름차순 숨은 타일. 상대 것을 하나씩 맞혀 열어라. 틀리면 내 것이 열린다.',
    version: 'v1.0.0',
    updateDate: '2026-07-09',
    thumbKind: 'davinci',
    Component: VinciAdapter,
    matchOptions: [
      { value: 4, label: '시작 손 4장' },
    ],
    ruleTag: () => '4장',
    guide: {
      title: '모빈치코드 가이드',
      oneLine: '상대의 오름차순 숨은 타일을 하나씩 맞혀라. 맞히면 상대 것이 공개·계속 or 멈춤 선택. 틀리면 방금 뽑은 내 타일이 공개. 전부 공개된 사람이 패.',
      sections: [
        {
          title: '내 턴 흐름',
          kind: 'rows',
          items: [
            { label: '① 뽑기', desc: '더미에서 1장 (나만 봄).', glyph: 'grid' },
            { label: '② 지목 + 선언', desc: '상대 타일 하나 지목 → 값 0~11 or 조커 선택.', glyph: 'target' },
            { label: '정답', desc: '상대 타일 공개 · 계속 or 멈춤.', glyph: 'check', tone: 'accent' },
            { label: '오답', desc: '방금 뽑은 내 타일 공개 · 턴 종료.', glyph: 'close', tone: 'bomb' },
          ],
        },
        {
          title: '타일 세트',
          kind: 'badges',
          items: [
            { label: '검정 0~11 + 흰색 0~11 + 조커 2', tone: 'muted' },
            { label: '정렬 · 동수는 검정 < 흰색', tone: 'accent' },
            { label: '조커 · 원하는 위치에 숨김', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인 시작 손 4장 · 오름차순 · 상대에겐 뒷면+위치만 보임.' },
        { title: '핵심 감각', desc: '공개 타일과 정렬 규칙으로 각 숨은 칸의 가능 값 집합을 좁힘. 연속 성공 vs 멈춤 리스크 판단.' },
        { title: '승리 조건', desc: '상대의 모든 타일이 공개되면 상대 패 · 내 승.' },
      ],
      warning: {
        text: '오답 리스크가 실력의 절반. 확신 없이 계속 지르면 내 정보를 상대에게 흘림.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'ditrick',
    title: '모디언트릭',
    code: 'DITRICK',
    genre: '추리',
    turnType: '턴제',
    playerCount: 2,
    desc: '내 카드는 못 보고 상대 카드만 보인다. 상대 것과 베팅을 읽어 콜/폴드/레이즈로 승부하는 심리·확률 대전.',
    version: 'v1.0.0',
    updateDate: '2026-07-09',
    thumbKind: 'indianpoker',
    Component: DitrickAdapter,
    matchOptionsLabel: '판 수',
    matchOptions: [
      { value: 9, label: '9판' },
      { value: 15, label: '15판' },
      { value: 21, label: '21판' },
    ],
    matchOption2Label: '시작 칩',
    matchOptions2: [
      { value: 20, label: '20칩' },
      { value: 30, label: '30칩' },
      { value: 50, label: '50칩' },
    ],
    ruleTag: (n) => `${n}판`,
    guide: {
      title: '모디언트릭 가이드',
      oneLine: '내 카드는 뒷면 · 상대 카드는 앞면. 앤티 1 후 순차 베팅. 두 카드가 공개되면 높은 쪽이 팟 획득. 정해진 판 수 후 칩 우세 승.',
      sections: [
        {
          title: '베팅 액션',
          kind: 'rows',
          items: [
            { label: '체크/콜', desc: '추가 없이 넘기거나 상대 베팅 맞춤. 양쪽 콜이면 즉시 쇼다운.', glyph: 'check' },
            { label: '레이즈', desc: '증액 +N (슬라이더). 상대는 다시 응대.', glyph: 'target', tone: 'accent' },
            { label: '폴드', desc: '기권. 앤티 손실 후 다음 판.', glyph: 'close', tone: 'bomb' },
          ],
        },
        {
          title: '핵심 감각',
          kind: 'badges',
          items: [
            { label: '상대 카드 낮음 → 내 카드 높을 확률↑', tone: 'accent' },
            { label: '상대가 세게 나오면 내 카드가 낮다는 신호', tone: 'muted' },
            { label: '블러핑 균형 · 항상 정직 = 읽힘', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인. 매 판 1장씩 · 자기 것은 못 보고 상대 것만 봄.' },
        { title: '진행 방식', desc: '앤티 → 배분 → 선공부터 순차 베팅 → 콜 맞추면 쇼다운 → 팟 이동 → 다음 판 선공 교대.' },
        { title: '승리 조건', desc: '정해진 판 수 후 칩 많은 쪽 승. 상대 칩 0 시 즉시 승.' },
      ],
      warning: {
        text: '내 카드를 상대가 본다 → 내가 높으면 상대가 폴드. 상대가 안 죽으면 내 카드가 낮다는 뜻일 수 있음. 신호 읽기가 핵심.',
        tone: 'accent',
      },
    },
  },
  {
    id: 'trumeon',
    title: '모루먼쇼',
    code: 'TRUMEON',
    genre: '전략',
    turnType: '턴제',
    playerCount: 2,
    desc: '카드로 트릭을 겨뤄 점수를 모아라. 으뜸패와 점수 흐름을 읽어 61점 먼저 도달하면 승리.',
    version: 'v1.0.0',
    updateDate: '2026-07-09',
    thumbKind: 'trick',
    Component: TrumeonAdapter,
    matchOptionsLabel: '승점 기준',
    matchOptions: [
      { value: 41, label: '41점' },
      { value: 61, label: '61점 (표준)' },
      { value: 81, label: '81점' },
    ],
    ruleTag: (n) => `${n}점`,
    guide: {
      title: '모루먼쇼 가이드',
      oneLine: '40장 브리스콜라 파생 · 손패 3 · 트럼프 무늬. 트릭을 이겨 점수를 모으고 승점 목표 선도달.',
      sections: [
        {
          title: '트릭 진행',
          kind: 'rows',
          items: [
            { label: '리드 → 후', desc: '선이 1장 → 후가 1장. 더미 있는 동안 무늬 강제 없음.', glyph: 'grid' },
            { label: '승자 판정', desc: '둘 다 트럼프 = 강한 rank · 한쪽만 트럼프 = 트럼프 승 · 같은 무늬 = 강한 rank · 다른 무늬 = 선 승.', glyph: 'check', tone: 'accent' },
            { label: '보충', desc: '승자 먼저 1장, 패자 1장. 더미 마지막 카드 = 트럼프 지정 카드.', glyph: 'skip' },
          ],
        },
        {
          title: '점수 카드',
          kind: 'badges',
          items: [
            { label: 'A = 11점', tone: 'accent' },
            { label: '3 = 10점', tone: 'accent' },
            { label: 'K = 4 · Q = 3 · J = 2', tone: 'muted' },
            { label: '나머지 = 0점', tone: 'muted' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인 · 각자 손패 3장 · 트럼프 무늬 고정 · 총 120점.' },
        { title: '진행 방식', desc: '트릭 반복 → 더미 마르면 손패 3장으로 마무리 (무늬 따르기 강제).' },
        { title: '승리 조건', desc: '승점 목표(41/61/81) 선도달 시 승. 아니면 종반 합산 우위 승.' },
      ],
      warning: {
        text: '큰 점수 카드(A·3)를 언제 걷고 언제 안 뺏길지 판단이 실력. 트럼프를 결정적 순간에 아끼기.',
        tone: 'accent',
      },
    },
  },
] as const

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
