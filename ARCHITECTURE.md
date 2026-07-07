# minidamo — Architecture & Game Policies

> Single source of truth for cross-game structural policies. Every game
> is expected to satisfy these contracts. If a game needs to deviate,
> document the deviation here and cite the spec that authorises it.

---

## 1. Screen state machine

```
SPLASH → HOME → LOBBY (CREATE | JOIN) → GAME_PLAY → LOBBY / HOME
```

- `useAppNavigation` owns transitions.
- Session persisted to **localStorage** (not sessionStorage — see
  cycle-43 write-up). TTL = 3 min. On boot, restore prompt appears if
  the persisted room is still fresh.
- Back gesture triggers `popstate` confirm per screen.

## 2. P2P transport

- Native `RTCPeerConnection` + one `RTCDataChannel` per peer.
- Signalling via Cloudflare Worker (`worker/src/index.ts`) with KV
  (default) or D1/R2 fallback.
- `useRoom` exposes:
  - `sendMessage(msg)` — queue-aware. Buffers up to 32 messages while
    the DC isn't in `open` state, flushes on `CONNECTED`.
  - `dispatchInbound(msg)` — fires a `window.p2p_message` CustomEvent
    that every game listens on directly. **Never** filter by
    `senderId === peerId`; peerId is the room id on both sides and
    always matches — the filter used to drop every remote GAME_ACTION.
- Message shape:
  ```
  { type, senderId, timestamp, payload }
  ```
  `senderId` = `peerId` (room id). Identity for **turn / ownership**
  purposes lives in `payload` (e.g. `payload.senderIsHost`) — never
  derive role from `senderId`.

## 3. Turn-based game contract

Every turn-based game (TicTacToe, Mosun, Memory) obeys the same rules.

### 3.1 Turn state

- Represented as a **role boolean** on both peers:
  ```
  turnIsHost: boolean
  isMyTurn   = turnIsHost === isHost
  advanceTurn = () => setTurnIsHost(v => !v)
  ```
- Never store the turn owner as a player.id. Both peers name the same
  player differently (`${roomId}` vs `${roomId}:me` vs `${roomId}:guest`)
  and `player.id === peerId` is symmetric — you cannot recover role
  from that. Boolean form is unambiguous on both sides.

### 3.2 Default turn ordering

- **Match start**: host always starts (turnIsHost = true).
- **Round-based games** (TicTacToe, future multi-round titles):
  - Default: **loser of previous round starts the next**.
  - Tie: previous starter flips.
  - Game may override by documenting the alternative here.
- **Same-round events**: pass to the opponent unless the effect is
  labelled "continuation" (see §3.3).

### 3.3 Turn-keeping actions

Some actions leave the current player on turn:
| Game       | Continuation action                              |
| ---------- | ------------------------------------------------ |
| Mosun      | — (every non-bomb flip ends the turn, per spec §B "일반 → 정보 없음, 턴 넘어감") |
| Memory     | Matching pair found                              |
| TicTacToe  | — (every move ends the turn)                     |

Deviation history:
- Mosun previously kept the turn on SAFE reveal — that violated spec
  §B. Removed cycle-46. Any future request to re-add continuation
  requires an explicit spec update.

## 4. Board sync protocol (host authoritative)

Every game with a random initial board:

1. **Host** generates a 31-bit seed on mount.
2. **Guest** sends `{actionType: '<GAME>_HELLO'}` on mount.
3. **Host** replies with `{actionType: '<GAME>_SEED', hostScore: seed}`.
4. Guest applies seed deterministically → board matches host.
5. **Rematch**: after `applyMatchReset`, host must broadcast the new
   seed. `applyMatchReset` returns the newly minted seed so the caller
   can send it immediately, then flip `seedBroadcastRef.current = true`
   so the standard host-side HELLO handler won't double-send.

Guest retries HELLO once at 1500ms if the board is still empty.

Handler idempotency:
- Guest ignores a `<GAME>_SEED` whose value equals the current seed and
  whose board is already populated.

## 5. Rule / hint reveal notification contract (Mosun)

Any card-flip that surfaces a rule (`ALL` or `ME`) must:

1. Compute the fact via `deriveRuleForReveal` on both peers with the
   same inputs (placements, seed, revealHistory, cardIndex, scope,
   ownerId=`ROLE_HOST | ROLE_GUEST`).
2. Append the fact to `rulesLog` on both peers with `owner = ownerRoleId`
   (NOT peerId) so opponent-vs-self checks stay symmetric.
3. Open the `pendingRuleModal` blocking overlay on **both** peers:
   - Owner sees the rule text.
   - Opponent sees `(내용은 상대만 알아요)` for ME reveals or the same
     text for ALL / exclusion reveals.
   - Exclusion reveals additionally trigger a 40-particle spark burst
     and the modal renders with the `--exclusion` variant.
4. Modal must be dismissed via CTA before further input registers.

## 6. Rematch protocol

1. Whoever clicked "다시하기" calls `applyMatchReset()`.
2. Broadcasts `{type: 'GAME_RESET', payload: {action: 'RESTART'}}`.
3. On receiving `RESTART`, opponent calls `applyMatchReset()`.
4. If we are host, we then broadcast a fresh `<GAME>_SEED` so the guest
   can regenerate the board (see §4).
5. Turn state reset per §3.2 (loser starts if we tracked a previous
   winner; else host starts).

## 7. Copy conventions

- **Card kinds** display Korean labels only. Raw enum keys (`ALL`,
  `ME`, `BOMB`, `SAFE`) never surface in UI.
  ```
  BOMB  → 폭탄
  ALL   → 전체힌트
  ME    → 개인힌트
  SAFE  → 일반
  ```
- Action buttons carry a leading icon (SVG only — no emoji in
  production game UIs).
- Game guides live in `src/games/registry.tsx`. GameGuideModal is
  wired from that registry entry so copy stays in one place.
- Turn strip / mode banner text is always second-person imperative.

## 8. Effects

- Shared canvas engine (`src/effects/*`) exposes:
  `ripple` `spark-burst` `confetti` `petal-fall` `metallic-line`.
- Every card-flip fires a small `spark-burst` at the cell centre.
- Round transitions use the shared `RoundBanner` component.
- Game-over transitions fire confetti + petals.
- Reconnect / gameover / modals all reference the CSS token ladder
  (`--z-effects-canvas` … `--z-pwa`) — never hard-coded z-index.

## 9. Overlay z-index ladder (single source: `src/styles/tokens.css`)

```
--z-effects-canvas: 500
--z-drawer: 800
--z-name-edit: 4000
--z-game-conn: 5000
--z-qr-scanner: 6000
--z-qr-zoom: 7000
--z-game-modal: 8000       (guide, mosun rules, chat drawer)
--z-game-over: 10000
--z-reconnect: 12000
--z-pwa: 20000             (always on top)
```

## 11. Canvas-based game infrastructure

Canvas games use the shared `CanvasStage` component
(`src/features/games/common/CanvasStage.tsx`):

- Fits a virtual stage (width/height in game coordinates) into its
  parent element with DPR-aware pixel sizing. Game code always draws
  in virtual coordinates — no manual DPR math needed.
- Owns the rAF loop. Calls `onFrame(ctx, dtMs, stageSize)` every paint
  with delta-milliseconds so physics stays refresh-rate agnostic.
- Delegates pointer input via `input.onDown / onMove / onUp` in virtual
  coordinates, pointer capture handled internally.
- Handles resize + tab-restore gap clamping (dt capped at 48 ms).

Games consuming this today (planned):

| Game    | Kind          | Status       |
| ------- | ------------- | ------------ |
| 우다다   | Canvas       | Awaiting spec (design MCP not reachable) |
| 냥탈출   | Canvas       | Awaiting spec (design MCP not reachable) |

## 10. Deviation register

Track each spec deviation with its rationale:

| Game / Feature | Deviation                                    | Rationale                                    |
| -------------- | -------------------------------------------- | -------------------------------------------- |
| Mosun          | SVG icons instead of design-URL assets       | claude_design MCP not accessible from build; SVGs match pixel-DMG skin |
| Chat surface   | Feature not in `screen_spec.html` §3         | Added post-spec per user request              |
| Home CTA copy  | "방 찾기" instead of prior "주변 참가하기"     | User feedback cycle-44                        |

Update this table whenever a fix breaks parity with the spec / design.
