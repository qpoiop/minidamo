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
  /** True only during the RECONNECTING window that `.reconnect-popup-overlay`
   *  (App.tsx) already owns — tells GameConnectionOverlay to stay unmounted. */
  reconnecting?: boolean;
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
        { title: '라운드 옵션', desc: '방 만들기에서 단판 · 3라운드(2선승) · 5라운드(3선승) 중 선택. 단판이 아니면 매 라운드 새 보드로 다시 시작하고, 획득 쌍 수는 라운드마다 0으로 리셋돼요.' },
        { title: '승리 조건', desc: '한 라운드는 8쌍이 모두 열리면 종료 — 그 라운드에서 더 많이 획득한 쪽이 라운드 승리, 정확히 4쌍씩 나누면 그 라운드는 무승부(누구도 라운드 승 획득 못함). 단판이면 그대로 매치 종료. 3·5라운드면 정해진 라운드 승수(2선승/3선승)를 먼저 채운 쪽이 그 즉시 매치 승리하고, 아무도 못 채운 채 마지막 라운드까지 가면 그때까지 더 많이 이긴 쪽(동률이면 마지막 라운드 승자, 그마저 비기면 매치 전체 무승부)이 승리해요.' },
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
          kind: 'rows',
          items: [
            { label: '관계형', desc: '인접 · 같은 행/열 · 거리 · 방금 뒤집은 카드 기준 등 다양한 패턴으로 폭탄 위치를 좁혀요.' },
            { label: '조건형', desc: '특정 영역(모서리/가장자리/대각선/사분면) · 짝수·홀수 행열 등 조건으로 폭탄이 있는·없는 곳을 알려줘요.' },
            { label: '소거형', desc: '모서리·중앙 후보 중 한 칸이 폭탄이 아니라고 알려줘요.' },
            { label: '★ 배제형', desc: '매치당 최대 1회, 넓은 영역 전체가 폭탄이 아니라고 알려주는 강력한 힌트예요.', tone: 'accent' },
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
        { title: '미니맵', desc: '화면 좌상단 원형 미니맵엔 내 위치만 초록 점으로 항상 표시되고 벽·구조는 안 보여요. 친구와 합류했는데 아직 열쇠가 없으면 열쇠 위치가 노란 점 힌트로 떠요.' },
        { title: '승리 조건', desc: '합류 + 열쇠 획득 → 출구 등장. 두 사람이 각자 출구를 밟아야 팀 성공. 한 명만 먼저 나오면 그 사람은 관전 모드, 상대가 나올 때까지 대기.' },
        { title: '30초 남았을 때', desc: '남은 시간 30초 이하가 되면 화면 중앙에 카운트다운이 뜨고, 미니맵에 출구 위치가 자홍색 별로 공개되어 마지막 스퍼트를 도울 수 있어요.' },
      ],
      warning: {
        text: '미니맵에 미로 전체는 안 보여요. 벽 구조는 각자 시야로만 파악 가능 — 소통이 곧 실력.',
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
        { title: '승리 조건', desc: '방 옵션 \'승리 점수\'(3 · 5 · 7점) 중 고른 목표에 먼저 도달한 쪽 매치 승. 맞히면 3점씩 오르므로 3점 목표는 1문제, 5점은 2문제, 7점은 3문제째에 승부가 갈려요.' },
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
            { label: '정답 · 1장(라임) → +1점', tone: 'accent' },
            { label: '함정 · 3장(빨강) → 매치 즉시 실패', tone: 'bomb' },
            { label: '일반 · 나머지 → 점수 없음', tone: 'accent' },
          ],
        },
        {
          title: '기록 표기',
          kind: 'badges',
          items: [
            { label: 'R{라운드} 단서 → 작성자: "단서 내용"', tone: 'accent' },
            { label: 'R{라운드} 지목 → 지목자 → 단어 (정답/함정/일반)', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '3×3 · 4×4 · 5×5 단어 보드. 매 라운드 정답 1장 · 함정 3장 · 나머지 일반 카드로 재배치.' },
        { title: '진행 방식', desc: '① 출제자가 단서 작성 → ② 맞추는 사람이 카드 지목 → ③ 결과 공개 → ④ 역할 교대 후 다음 라운드.' },
        { title: '점수 규칙', desc: '정답 지목 → 공유 점수 +1 · 일반 → 점수 변동 없음 · 함정 → 매치 즉시 실패.' },
        { title: '기록 표기', desc: '우측 상단 "기록" 버튼으로 지난 라운드 로그 확인. 각 줄은 "R{라운드} 단서" 배지 아래 작성자와 단서 문구, "R{라운드} 지목" 배지 아래 지목자 → 지목한 단어와 결과(정답/함정/일반)를 보여주고, 결과에 따라 줄 색이 달라져요.' },
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
            { label: '이동', desc: '인접 4방향 중 한 칸. 두 셀 사이 벽이 있으면 못 감. 상대와 정면 접촉하면 뛰어넘기 · 그마저 벽이면 대각 이동으로 우회.', glyph: 'skip' },
            { label: '벽 세우기', desc: '2칸 길이 벽을 셀 경계 홈에 놓아 상대 길을 늘림. 방향(가로/세로) 선택. 내 벽 재고 −1. 겹침·교차 금지 + 완전 봉쇄 금지 (BFS 자동 검증 → 위반 배치는 거부).', glyph: 'grid', tone: 'accent' },
          ],
        },
        {
          title: '컨트롤 · 실기 조작',
          kind: 'rows',
          items: [
            { label: '이동 모드 · 상단 [이동] 탭', desc: '내 조각 주변 4방향 후보 셀이 라임 outline 으로 하이라이트. 그 셀을 탭하면 이동 확정.', glyph: 'target' },
            { label: '벽 모드 · [벽 세우기] 탭', desc: '방향(가로/세로) 선택 → 가능한 홈 위치가 라임 · 불가능은 빨강. 홈 클릭 시 즉시 배치 (2단계 미리보기 없음).', glyph: 'grid' },
            { label: '거부 안내', desc: '벽이 상대(또는 나)의 도달 경로를 완전히 막으면 배치 거부 + 붉은 토스트 "이 벽은 상대의 길을 완전히 막아요".', glyph: 'close', tone: 'bomb' },
          ],
        },
        {
          title: '핵심 감각 · 배지',
          kind: 'badges',
          items: [
            { label: '벽 자원 유한 · 아껴 쓰기', tone: 'accent' },
            { label: '완전 봉쇄 벽 시도 → 자동 거부', tone: 'bomb' },
            { label: '벽으로 만든 미로가 나를 가둘 수도', tone: 'muted' },
            { label: '"상대 최단 경로 vs 내 최단"을 항상 저울질', tone: 'accent' },
            { label: '초반 벽 남발 → 종반 무방비', tone: 'muted' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '두 고양이가 각자 반대편 끝줄에서 출발. 격자 이동+벽 세우기로 반대편 끝줄에 먼저 도착하는 쪽이 승리. 2인 완전정보 추상 전략.' },
        { title: '보드 · 벽 재고', desc: '9×9 (기본) 또는 7×7 (빠른 판). 벽 재고 · 9×9=10개, 7×7=7개 각자. 대기방 옵션으로 선택.' },
        { title: '진행 방식', desc: '턴제 교대. 매 턴 이동 또는 벽 배치 중 하나만. 벽 후보 좌표는 (N-1)² 홈. 방향은 가로/세로 2택.' },
        { title: '이동 세부 (건너뛰기)', desc: '상대 조각이 바로 앞 칸에 있으면 그 뒤 칸으로 점프. 뒤가 벽이거나 보드 끝이면 상대의 좌·우 대각 셀 중 하나로 우회.' },
        { title: '벽 검증 (BFS)', desc: '겹침·교차 금지 + 양쪽 조각이 각자 목표선까지 최소 하나의 경로가 남아야 함. 위반 배치는 서버가 아니라 클라이언트에서 즉시 거부 (시각 피드백 + 토스트).' },
        { title: '전술 팁', desc: '① 초반은 이동 위주로 최단 경로 뽑기. ② 상대가 5칸 남았을 때 벽 한 장으로 +3칸 우회 유발이면 이득. ③ 벽으로 U자 회로를 만들어 상대만 돌리기.' },
        { title: '승리 조건', desc: '자기 목표 행(반대편 끝줄) 아무 칸에나 도달 시 즉시 승. 무승부 없음 (선착순).' },
      ],
      warning: {
        text: '벽 자원은 유한 · 완전정보라 상대의 다음 몇 수를 미리 읽어야 진짜 승부. 초반 남발 시 종반에 아무것도 못 함. 상대의 최단 경로를 항상 계산하면서 벽 한 장의 "우회 칸 수 vs 내 이동 손해" 를 저울질하세요.',
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
      oneLine: '상대의 오름차순 숨은 타일을 하나씩 맞혀라. 맞히면 상대 것이 공개·계속 or 멈춤. 틀리면 방금 뽑은 내 타일이 공개. 전부 공개된 사람이 패.',
      sections: [
        {
          title: '내 턴 흐름 (① → ②)',
          kind: 'rows',
          items: [
            { label: '① 뽑기', desc: '더미에서 1장. 내 화면에만 값 노출 · 상대에겐 "방금 뽑음" 뒷면만 보임. 스톡 소진 시 뽑기 생략하고 바로 지목.', glyph: 'grid' },
            { label: '② 지목 + 선언', desc: '상대 타일 카드 하나 골드 outline 으로 지목 → 숫자패드 0~11 or 조커 선택 → [선언] 확정.', glyph: 'target' },
            { label: '정답 → 계속', desc: '지목한 상대 타일 공개 · 손에 든 타일 여전히 리스크. 계속 지목하거나 [멈춤]으로 안전 착지.', glyph: 'check', tone: 'accent' },
            { label: '오답 → 자기 공개', desc: '방금 뽑은 내 타일이 공개돼 내 hand 에 앞면 삽입. 턴 상대에게. 정보 손실.', glyph: 'close', tone: 'bomb' },
            { label: '멈춤 (정답 후 선택)', desc: '뽑은 타일을 비공개로 내 hand 에 삽입 · 턴 종료. 조커면 위치 선택 모달로 원하는 rank 지정.', glyph: 'skip' },
          ],
        },
        {
          title: '타일 세트 (26장)',
          kind: 'badges',
          items: [
            { label: '검정 0~11 (12장)', tone: 'muted' },
            { label: '흰색 0~11 (12장)', tone: 'muted' },
            { label: '조커 2장 (특별 · 위치 유동)', tone: 'accent' },
            { label: '정렬 · 동수는 검정 < 흰색', tone: 'accent' },
            { label: '조커 · 소유자가 원하는 rank 에 숨김', tone: 'accent' },
          ],
        },
        {
          title: '핵심 감각 · 배지',
          kind: 'badges',
          items: [
            { label: '왼쪽=3, 오른쪽=8 → 사이 값은 4~7', tone: 'accent' },
            { label: '연속 성공 vs 멈춤 리스크 판단', tone: 'muted' },
            { label: '뽑은 타일 위치 = 상대에게 흘리는 힌트', tone: 'bomb' },
            { label: '조커 위치는 소유자 자유', tone: 'accent' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인 · 시작 손 4장씩 · 오름차순 정렬. 상대에겐 뒷면+위치만 보임. 검정 0-11, 흰색 0-11, 조커 2 · 총 26장.' },
        { title: '진행 방식', desc: '내 턴: 더미에서 1장 뽑기 (스톡 소진 시 skip) → 상대 타일 지목 + 값 선언 → 정답/오답에 따라 계속/멈춤/공개 후 턴 종료.' },
        { title: '정렬 규칙', desc: '값 오름차순. 동수 색상 우선: 검정 < 흰색. 조커는 소유자가 삽입 시 원하는 위치 지정 가능. 새 타일은 규칙 자리에 자동 삽입되며 위치 자체가 상대에게 힌트가 됨.' },
        { title: '가능 값 좁히기', desc: '공개된 타일과 정렬 규칙으로 각 숨은 칸의 가능 값 집합을 좁힘. 예: 왼쪽이 3이고 오른쪽이 8이면 그 사이 칸은 4~7. 조커가 어디에 있는지 모르면 후보 +1.' },
        { title: '조커 위치 선택 UI', desc: '정답 이어서 [멈춤] 눌렀는데 손에 든 타일이 조커면 다이얼로그 팝업. "≤ N" 선택으로 정렬 위치 지정 (또는 맨 뒤). 상대에겐 이 위치만 노출.' },
        { title: '연속 추리 리스크', desc: '한 번 성공하면 계속 이어가고 싶지만, 여전히 손에 든 타일이 오답 리스크. 확신 없이 이어가면 → 오답 → 뽑은 타일 통째로 상대에게 공개.' },
        { title: '승리 조건', desc: '상대의 모든 타일이 공개되면 상대 패 · 내 승. 무승부 없음.' },
      ],
      warning: {
        text: '오답 리스크가 실력의 절반. 확신 없이 계속 지르면 내 정보를 상대에게 흘림. 상대의 새로 삽입된 타일 위치도 힌트로 활용하세요 (검정/흰색 색깔이 정렬 규칙에 어긋나지 않는지 관찰).',
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
      oneLine: '내 카드는 뒷면 · 상대 카드는 앞면. 앤티 1 후 순차 베팅. 콜 맞추면 쇼다운 · 높은 쪽 팟 획득. 정해진 판 수 후 칩 우세 승.',
      sections: [
        {
          title: '베팅 액션 (2×2 그리드)',
          kind: 'rows',
          items: [
            { label: '체크', desc: '현재 currentBet=0 일 때만. 추가 없이 넘김. 양쪽 체크면 즉시 쇼다운.', glyph: 'check' },
            { label: '콜 (N)', desc: '상대 레이즈 액수 맞춤. 쇼다운 진행.', glyph: 'check' },
            { label: '레이즈 +N', desc: '슬라이더로 증액 N 선택 후 [레이즈] 탭. currentBet 갱신 · 상대 응대 대기. 상한 3회 왕복 후 강제 쇼다운.', glyph: 'target', tone: 'accent' },
            { label: '폴드', desc: '기권. 팟 상대에게 · 앤티 손실. 다음 판.', glyph: 'close', tone: 'bomb' },
          ],
        },
        {
          title: '한 판 흐름 (선공 교대)',
          kind: 'rows',
          items: [
            { label: '앤티 1', desc: '양쪽 1칩 팟에. 배분 시작.', glyph: 'grid' },
            { label: '배분', desc: '각자 1장. 내 것 뒷면(빨강) · 상대에겐 값 노출.', glyph: 'target' },
            { label: '베팅 라운드', desc: '선공부터 순차. 콜 맞추면 쇼다운. 폴드 시 즉시 종료.', glyph: 'skip' },
            { label: '쇼다운', desc: '양 카드 공개 · 높은 값이 팟 획득. 동률은 팟 분할 (홀수 칩은 선공 +1).', glyph: 'check', tone: 'accent' },
          ],
        },
        {
          title: '핵심 감각 · 배지',
          kind: 'badges',
          items: [
            { label: '상대 카드 낮음 → 내 카드 높을 확률↑', tone: 'accent' },
            { label: '상대가 세게 나오면 내 카드가 낮다는 신호', tone: 'muted' },
            { label: '블러핑 균형 · 항상 정직 = 읽힘', tone: 'accent' },
            { label: '베이지안 추론 · 상대 카드 + 남은 덱', tone: 'accent' },
            { label: '내 칩 스택 상시 확인 · 파산 위험 관리', tone: 'bomb' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인 심리 베팅. 매 판 1장씩 · 자기 것은 못 보고 상대 것만 봄. 상대의 카드와 베팅 패턴을 조합해 내 카드가 이길 확률을 역추론.' },
        { title: '덱 · 옵션', desc: '기본 1~10 각 4장 (40장). 시작 칩 20/30/50 · 앤티 1. 매치 판 수 9/15/21 선택 후 종료 시 칩 많은 쪽 승 · 상대 칩 0 시 즉시 승.' },
        { title: '진행 방식', desc: '앤티 → 배분 → 선공부터 순차 베팅 → 콜 맞추면 쇼다운 → 팟 이동 → 다음 판 선공 교대. 폴드 시 팟 상대에게.' },
        { title: '베팅 상한', desc: '레이즈 왕복 최대 3회 (5회 이상 강제 쇼다운). 남은 칩 초과 시 자동 all-in 스냅.' },
        { title: '심리 추론', desc: '상대 카드가 낮게 보이면 (예 4) → 통계적으로 내 카드가 높을 확률↑. 그런데 상대도 내 카드를 봐서 판단. 상대가 안 죽고 세게 나오면 → "내 카드가 낮다는 신호". 이 층위를 읽어 콜/폴드 결정.' },
        { title: '블러핑 균형', desc: '항상 정직하게 베팅하면 읽힘. 낮은 상대에 크게 질러 폴드 유도하는 세미블러프를 가끔 섞어 상대 콜 성향을 무너뜨리기.' },
        { title: '동률 처리', desc: '팟 분할 (홀수는 선공 +1). 옵션으로 "무효·재배분" 도 검토 가능 (현 사이클은 분할 고정).' },
        { title: '승리 조건', desc: '정해진 판 수 후 칩 많은 쪽 승. 도중 상대 칩 0 시 즉시 승 (파산 즉시 종료).' },
      ],
      warning: {
        text: '내 카드를 상대가 본다 → 내가 높으면 상대가 폴드. 상대가 안 죽으면 내 카드가 낮다는 뜻일 수 있음. 이 이중 신호를 읽는 게 실력. 확률만 믿고 콜하다간 낚임.',
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
      oneLine: '40장 브리스콜라 파생 · 손패 3 · 트럼프 무늬. 트릭을 이겨 점수를 모으고 승점 목표(41/61/81) 선도달하는 쪽 승.',
      sections: [
        {
          title: '트릭 흐름 (매 판)',
          kind: 'rows',
          items: [
            { label: '① 리드', desc: '선이 손패 1장 선택 → [탭] 확정. 더미 남았을 때는 무늬 강제 없음 (아무 카드).', glyph: 'grid' },
            { label: '② 후', desc: '후가 1장 응대. 트릭 자리에 두 카드 공개.', glyph: 'target' },
            { label: '③ 승자 판정', desc: '① 둘 다 트럼프 = 강한 rank 승. ② 한쪽만 트럼프 = 트럼프 승. ③ 같은 무늬(트럼프 아님) = 강한 rank. ④ 다른 무늬(트럼프 없음) = 선(리드) 승.', glyph: 'check', tone: 'accent' },
            { label: '④ 획득 + 보충', desc: '승자가 두 장 획득 · 점수 합산. 승자 먼저 더미 1장, 패자 1장 보충. 더미 맨 마지막 카드 = 트럼프 지정 카드.', glyph: 'skip' },
          ],
        },
        {
          title: '점수 카드 (합 120점)',
          kind: 'badges',
          items: [
            { label: 'A = 11점', tone: 'accent' },
            { label: '3 = 10점', tone: 'accent' },
            { label: 'K = 4점', tone: 'muted' },
            { label: 'Q = 3점', tone: 'muted' },
            { label: 'J = 2점', tone: 'muted' },
            { label: '나머지(2·4·5·6·7) = 0점', tone: 'muted' },
          ],
        },
        {
          title: '강도 서열 (트릭 승패 계산)',
          kind: 'badges',
          items: [
            { label: 'A > 3 > K > Q > J > 7 > 6 > 5 > 4 > 2', tone: 'accent' },
            { label: '값 크기 순 아님 · 별도 서열', tone: 'bomb' },
          ],
        },
        {
          title: '핵심 감각 · 배지',
          kind: 'badges',
          items: [
            { label: '트럼프 아껴 결정적 순간에 쓰기', tone: 'accent' },
            { label: '0점 카드로 손실 최소화', tone: 'muted' },
            { label: '나온 A·3·트럼프 카운트 → 상대 손 좁힘', tone: 'accent' },
            { label: '종반 무늬 따르기 강제 = 정밀 계산 국면', tone: 'bomb' },
          ],
        },
      ],
      steps: [
        { title: '개요', desc: '2인 트릭테이킹 · 이탈리아 브리스콜라 파생. 40장 (4무늬 × A·2·3·4·5·6·7·J·Q·K). 각자 손패 3장 유지 · 트럼프 무늬 고정. 총 120점.' },
        { title: '트럼프 지정', desc: '게임 시작 시 더미 마지막 카드가 트럼프 무늬 · 표시 chip 으로 상시 노출. 그 카드는 마지막에 뽑힘.' },
        { title: '초반 진행 (더미 有)', desc: '트릭 반복. 리드가 아무 카드 선택 · 후도 아무 카드. 승자 두 장 획득 · 보충 · 승자가 다음 리드. 이 국면은 자유도 높아 카드 완급 조절 여지↑.' },
        { title: '종반 (더미 소진)', desc: '더미 마르면 손패 3장으로 6트릭 마무리. 이때부터 무늬 따르기 강제: 후는 리드 무늬 있으면 반드시 따름 · 없으면 트럼프 우선 · 그도 없으면 아무 카드. 낼 수 없는 카드는 흐리게 잠금.' },
        { title: '카드 추적', desc: '나온 A·3·트럼프를 세면 상대 손패에 뭐가 남았는지 좁힘. 예: A 4장 모두 나왔으면 남은 트릭은 A 부재 → 3(10점) 가 최고 점수 카드.' },
        { title: '완급 조절 팁', desc: '① 0점 잡패로 큰 트릭 유도. ② A/3 (큰 점수) 은 트럼프로 보호 or 확실한 리드에서만. ③ 트럼프 아끼되 상대의 A/3 을 훔칠 결정적 순간엔 아낌없이. ④ 종반 무늬 강제 국면 대비해 손패 밸런스 유지.' },
        { title: '승리 조건', desc: '승점 목표 (41/61/81) 선도달 시 즉시 승. 아니면 판 종료 후 점수 합산 우위 승. 60-60 동률은 구조상 드묾 · 발생 시 무승부.' },
      ],
      warning: {
        text: '값 서열이 값 크기 순이 아님 (A > 3 > K…). "3 이 K/Q/J 보다 크다" 는 것 헷갈리기 쉬움. 큰 점수 카드(A·3)를 언제 걷고 언제 안 뺏길지 판단이 실력. 트럼프는 결정적 순간에 아껴 상대의 A/3 을 훔치기.',
        tone: 'accent',
      },
    },
  },
] as const

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
