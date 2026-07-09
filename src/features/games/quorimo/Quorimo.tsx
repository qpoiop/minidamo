import type { CSSProperties, JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlayerInfo, P2PMessage } from '../../../hooks/useRoom'
import { GameOverModal } from '../../../components/common/GameOverModal'
import { GameConnectionOverlay } from '../../../components/common/GameConnectionOverlay'
import { TurnTransitionToast } from '../common/TurnTransitionToast'
import { GameHeader } from '../common/GameHeader'
import { GameTurnStrip } from '../common/GameTurnStrip'
import { GamePlayerHud } from '../common/GamePlayerHud'
import { RegistryGuide } from '../common/RegistryGuide'
import { useRoleParticipants } from '../common/useRoleParticipants'
import { useMatchRestart } from '../common/useMatchRestart'
import {
  applyMove, applyWall, initialState, isBlocked, legalMoves, validateWallPlacement,
} from './board'
import type { Cat, QuorimoState, Wall, WallOrient } from './board'
import './quorimo.css'

/**
 * 쿼리모 (Quoridor) · 2인 완전정보 추상 전략.
 *
 * · matchOption = 보드 크기 (7 or 9).
 * · 시작 시 호스트가 초기 상태 브로드캐스트 → 이후 각자 자기 턴에 액션 1건.
 * · P2P protocol (payload.actionType):
 *     'QM_INIT'      · hostScore = size · guestScore = wallsEach
 *     'QM_MOVE'      · gameData = { r, c }
 *     'QM_WALL'      · gameData = { r, c, o }
 * · 완전정보라 클라이언트가 각자 로컬에서 결정론적 상태 유지 · 재검증 O.
 */

interface QuorimoProps {
  players: PlayerInfo[];
  peerId: string;
  isHost: boolean;
  sendMessage: (msg: P2PMessage) => void;
  onLobby: () => void;
  onChooseOther: () => void;
  onExit: () => void;
  isOpponentOnline?: boolean;
  soloMode?: boolean;
  matchOption?: number;
}

type Mode = 'move' | 'wall'

export function Quorimo({
  players, peerId, isHost, sendMessage,
  onLobby, onChooseOther, onExit,
  isOpponentOnline = true, soloMode = false,
  matchOption = 9,
}: QuorimoProps) {
  void onChooseOther
  void soloMode
  const size = matchOption === 7 ? 7 : 9
  const wallsEach = size === 7 ? 7 : 10

  const [state, setState] = useState<QuorimoState>(() => initialState(size, wallsEach))
  const [mode, setMode] = useState<Mode>('move')
  const [wallOrient, setWallOrient] = useState<WallOrient>('H')
  const [wallHover, setWallHover] = useState<Wall | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const { myName, opponentName } = useRoleParticipants(players, isHost)
  const myOwner = isHost ? 'host' : 'guest'
  const isMyTurn = state.turn === myOwner && !state.winner
  const canAct = isMyTurn && isOpponentOnline

  const myWalls = myOwner === 'host' ? state.hostWalls : state.guestWalls
  const oppWalls = myOwner === 'host' ? state.guestWalls : state.hostWalls
  const myPos = myOwner === 'host' ? state.hostPos : state.guestPos
  const oppPos = myOwner === 'host' ? state.guestPos : state.hostPos

  const legal = useMemo(() => (isMyTurn ? legalMoves(state, myOwner) : []), [state, isMyTurn, myOwner])

  const applyMatchReset = useCallback(() => {
    const fresh = initialState(size, wallsEach)
    setState(fresh)
    setMode('move')
    setWallOrient('H')
    setWallHover(null)
    setToast(null)
  }, [size, wallsEach])
  const { handleRestartMatch } = useMatchRestart({ applyMatchReset, sendMessage, peerId, isHost })

  // Host 가 초기 상태를 재전송하는 채널 (신규 참가·재접속 대응).
  useEffect(() => {
    if (!isHost) return
    const t = setTimeout(() => {
      sendMessage({
        type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
        payload: { actionType: 'QM_INIT', hostScore: size, guestScore: wallsEach },
      })
    }, 60)
    return () => clearTimeout(t)
  }, [isHost, peerId, sendMessage, size, wallsEach])

  useEffect(() => {
    const onMsg = (e: Event) => {
      const msg = (e as CustomEvent<P2PMessage>).detail
      if (!msg || msg.type !== 'GAME_ACTION') return
      const { actionType, gameData, hostScore, guestScore } = msg.payload
      if (actionType === 'QM_INIT' && typeof hostScore === 'number' && typeof guestScore === 'number') {
        if (isHost) return
        setState(initialState(hostScore, guestScore))
        return
      }
      if (actionType === 'QM_MOVE' && gameData) {
        const t = gameData as Cat
        setState((prev) => applyMove(prev, t, prev.turn))
        return
      }
      if (actionType === 'QM_WALL' && gameData) {
        const w = gameData as Wall
        setState((prev) => applyWall(prev, w, prev.turn) ?? prev)
        return
      }
    }
    window.addEventListener('p2p_message', onMsg)
    return () => window.removeEventListener('p2p_message', onMsg)
  }, [isHost])

  const flashToast = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 1600)
  }

  const doMove = (target: Cat) => {
    if (!canAct) return
    if (!legal.some((m) => m.r === target.r && m.c === target.c)) return
    setState((prev) => applyMove(prev, target, myOwner))
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'QM_MOVE', gameData: target },
    })
  }

  const doWall = (w: Wall) => {
    if (!canAct) return
    const v = validateWallPlacement(state, w, myOwner)
    if (v.ok !== true) { flashToast(v.reason); return }
    setState((prev) => applyWall(prev, w, myOwner) ?? prev)
    sendMessage({
      type: 'GAME_ACTION', senderId: peerId, timestamp: Date.now(),
      payload: { actionType: 'QM_WALL', gameData: w },
    })
    setWallHover(null)
  }

  const turnText = state.winner
    ? state.winner === myOwner ? '내가 도착 · 승리' : `${opponentName} 이 도착 · 패배`
    : !isOpponentOnline ? '상대 연결 대기'
      : isMyTurn ? `내 턴 · ${mode === 'move' ? '이동' : '벽 세우기'}` : `${opponentName} 고민 중`

  const winnerText = state.winner === myOwner ? '반대편 끝줄 도착' : '상대가 반대편 끝줄에 도착'
  const outcome: 'win' | 'lose' | undefined = state.winner ? (state.winner === myOwner ? 'win' : 'lose') : undefined

  const rows: JSX.Element[] = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isMy = myPos.r === r && myPos.c === c
      const isOpp = oppPos.r === r && oppPos.c === c
      const canMoveHere = isMyTurn && mode === 'move' && legal.some((m) => m.r === r && m.c === c)
      const isGoalMe = r === (myOwner === 'host' ? state.hostGoalRow : state.guestGoalRow)
      const cell = (
        <button
          key={`c-${r}-${c}`}
          type="button"
          className={[
            'qm-cell',
            isGoalMe ? 'qm-cell--goal-me' : '',
            canMoveHere ? 'qm-cell--legal' : '',
            isMy ? 'qm-cell--me' : '',
            isOpp ? 'qm-cell--opp' : '',
          ].filter(Boolean).join(' ')}
          disabled={!canMoveHere}
          onClick={() => doMove({ r, c })}
          aria-label={`R${r + 1}C${c + 1}`}
        >
          {isMy && (
            <svg className="qm-piece qm-piece--me" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M6 10l2-3 2 3h4l2-3 2 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
              <path fill="#0f280f" d="M9 13.5h1.5V15H9zM13.5 13.5H15V15h-1.5zM10.5 17h3v.6h-3z" />
            </svg>
          )}
          {isOpp && (
            <svg className="qm-piece qm-piece--opp" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M6 10l2-3 2 3h4l2-3 2 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
              <path fill="#160805" d="M9 13.5h1.5V15H9zM13.5 13.5H15V15h-1.5zM10.5 17h3v.6h-3z" />
            </svg>
          )}
        </button>
      )
      rows.push(cell)
    }
  }

  // 벽 배치용 절대좌표 계산.
  //   · 셀 크기 = 100 / size %.
  //   · 가로 벽 (r,c): row r+1 경계선 · col c 부터 2셀 폭.
  //   · 세로 벽 (r,c): col c+1 경계선 · row r 부터 2셀 높이.
  //   · Slot (hover 지점) 은 (r,c) 홈 중심에 놓아 클릭 가능.
  const cellPct = 100 / size
  const wallStyle = (w: Wall): CSSProperties => {
    if (w.o === 'H') {
      return {
        left: `${w.c * cellPct}%`,
        top: `calc(${(w.r + 1) * cellPct}% - 3px)`,
        width: `${cellPct * 2}%`,
        height: '6px',
      }
    }
    return {
      left: `calc(${(w.c + 1) * cellPct}% - 3px)`,
      top: `${w.r * cellPct}%`,
      width: '6px',
      height: `${cellPct * 2}%`,
    }
  }
  const slotStyle = (r: number, c: number): CSSProperties => ({
    left: `calc(${(c + 1) * cellPct}% - 10px)`,
    top: `calc(${(r + 1) * cellPct}% - 10px)`,
    width: '20px',
    height: '20px',
  })

  const wallSlots: JSX.Element[] = []
  if (mode === 'wall' && isMyTurn) {
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const w: Wall = { r, c, o: wallOrient }
        const v = validateWallPlacement(state, w, myOwner)
        wallSlots.push(
          <button
            key={`w-${r}-${c}-${wallOrient}`}
            type="button"
            className={`qm-slot qm-slot--${wallOrient} ${v.ok ? 'qm-slot--ok' : 'qm-slot--bad'}`}
            style={slotStyle(r, c)}
            onMouseEnter={() => setWallHover(w)}
            onMouseLeave={() => setWallHover(null)}
            onClick={() => doWall(w)}
            aria-label={`벽 R${r + 1}C${c + 1} ${wallOrient === 'H' ? '가로' : '세로'}`}
            title={v.ok === true ? '이 자리에 놓기' : v.reason}
          />,
        )
      }
    }
  }

  const placedWalls = state.walls.map((w, i) => (
    <div
      key={`p-${i}`}
      className={`qm-wall qm-wall--${w.o}`}
      style={wallStyle(w)}
      aria-hidden="true"
    />
  ))

  const hoverPreview = wallHover ? (() => {
    const v = validateWallPlacement(state, wallHover, myOwner)
    return (
      <div
        className={`qm-wall qm-wall--${wallHover.o} qm-wall--preview ${v.ok ? 'qm-wall--preview-ok' : 'qm-wall--preview-bad'}`}
        style={wallStyle(wallHover)}
        aria-hidden="true"
      />
    )
  })() : null

  void isBlocked

  return (
    <div className="game-screen" data-my-turn={isMyTurn && !state.winner ? '1' : '0'}>
      <GameHeader
        code="QUORIMO"
        onHelp={() => setGuideOpen(true)}
        onExit={onExit}
        onRestart={handleRestartMatch}
        isHost={isHost}
      />
      <GameTurnStrip
        turnText={turnText}
        connectionLabel={`벽 나 ${myWalls} · 상대 ${oppWalls} · 보드 ${size}×${size}`}
        variant={state.winner ? 'idle' : canAct ? 'default' : 'idle'}
        isMyTurn={canAct}
      />

      <div className="qm-mode-tabs" role="tablist" aria-label="행동 모드">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'move'}
          className={`qm-mode-tab ${mode === 'move' ? 'is-active' : ''}`}
          onClick={() => setMode('move')}
          disabled={!canAct}
        >이동</button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'wall'}
          className={`qm-mode-tab ${mode === 'wall' ? 'is-active' : ''}`}
          onClick={() => { if (myWalls > 0) setMode('wall') }}
          disabled={!canAct || myWalls <= 0}
          title={myWalls <= 0 ? '벽을 다 썼어요 — 이제 이동만 가능' : undefined}
        >벽 세우기 · {myWalls}</button>
        {mode === 'wall' && (
          <div className="qm-orient" role="group" aria-label="벽 방향">
            <button type="button" className={`qm-orient-btn ${wallOrient === 'H' ? 'is-active' : ''}`} onClick={() => setWallOrient('H')}>가로</button>
            <button type="button" className={`qm-orient-btn ${wallOrient === 'V' ? 'is-active' : ''}`} onClick={() => setWallOrient('V')}>세로</button>
          </div>
        )}
      </div>

      <div
        className={`qm-board qm-board--size-${size}`}
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {rows}
        {(mode === 'wall' || state.walls.length > 0) && (
          <div className="qm-wall-layer" aria-hidden="true" style={{ pointerEvents: mode === 'wall' && isMyTurn ? 'auto' : 'none' }}>
            {placedWalls}
            {wallSlots}
            {hoverPreview}
          </div>
        )}
      </div>

      {toast && <div className="qm-toast" role="status">{toast}</div>}

      <GamePlayerHud
        rows={players.map((p) => ({
          player: p,
          active: state.turn === (p.isHost ? 'host' : 'guest') && !state.winner,
          online: p.id === peerId ? true : isOpponentOnline,
          extra: <span className="participant-symbol">벽 {p.isHost ? state.hostWalls : state.guestWalls}</span>,
        }))}
      />

      <GameConnectionOverlay isOpponentOnline={isOpponentOnline} onExit={onExit} />
      <TurnTransitionToast isMyTurn={isMyTurn} opponentName={opponentName} suppress={!!state.winner} />
      <RegistryGuide gameId="quorimo" open={guideOpen} onClose={() => setGuideOpen(false)} />

      {state.winner && (
        <GameOverModal
          title={outcome === 'win' ? 'YOU WIN' : 'YOU LOSE'}
          winnerText={winnerText}
          outcome={outcome}
          scoreSummary={[
            { label: '내 남은 벽', value: myWalls, highlight: outcome === 'win' },
            { label: '상대 남은 벽', value: oppWalls },
          ]}
          note={outcome === 'win' ? '반대편 끝줄에 먼저 도착했어요.' : `${opponentName} 이 먼저 도착했어요.`}
          onRestart={handleRestartMatch}
          onLobby={onLobby}
          onChooseOther={onChooseOther}
          onExit={onExit}
          restartDisabled={!isOpponentOnline}
          restartHint={!isOpponentOnline ? '상대방 재연결 대기 중' : undefined}
        />
      )}
      <span className="sr-only">내 이름 {myName}</span>
    </div>
  )
}
