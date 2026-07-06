# minidamo — Architecture

## 개요

minidamo는 Vite + React + TypeScript로 만들어진 위치 기반 미니게임 PWA입니다.
사용자 간 연결은 Native WebRTC(`RTCPeerConnection` + `RTCDataChannel`)로 이루어지며,
Signaling(방 정보 교환)은 온라인/오프라인 두 방식 모두를 지원합니다.

## 통신 계층

```
┌─────────────────────────────────────────────────────────────┐
│                   Browser (Vite SPA)                        │
├─────────────────────────────────────────────────────────────┤
│  UI (React)                                                 │
│    ├─ features/home        홈 카드 슬라이더                  │
│    ├─ features/lobby       대기방 (온라인/오프라인 분기)     │
│    ├─ features/games       tictactoe · pingpong             │
│    └─ components/common    Splash · QrScanner · GameOver … │
│                                                             │
│  Hooks                                                      │
│    ├─ useLocation          GPS watchPosition + 권한 상태    │
│    ├─ useNetwork           navigator.onLine + 시그널링 유무 │
│    └─ useRoom              전체 flow orchestrator           │
│                                                             │
│  Services                                                   │
│    ├─ rtc.ts               Native WebRTC 래퍼                │
│    ├─ signaling.ts         Worker HTTP client               │
│    └─ nickPool.ts          닉네임 생성                       │
└─────────┬─────────────────────────────┬─────────────────────┘
          │                             │
      Online path                   Offline path
          │                             │
          ▼                             ▼
┌──────────────────┐            ┌──────────────────────┐
│ Cloudflare Worker│            │ QR ↔ QR             │
│ + R2 bucket      │            │ (offer/answer JSON)  │
│ (rooms/, answers/│            └──────────────────────┘
└──────────────────┘
          │
          ▼
   RTCDataChannel (P2P)  ← 게임 액션 통신 (양쪽 공통)
```

## Signaling 계약

### Offer (host → guest)
```jsonc
{
  "v": 1,
  "kind": "offer",
  "roomId": "abc123xyz45",
  "hostName": "말랑이1234",
  "gameId": "tictactoe",
  "sdp": { "type": "offer", "sdp": "..." },
  "ice": [ { "candidate": "...", "sdpMid": "...", "sdpMLineIndex": 0 } ],
  "createdAt": 1720000000000,
  "location": { "lat": 37.5, "lon": 127.0, "acc": 8 }
}
```

### Answer (guest → host)
```jsonc
{
  "v": 1,
  "kind": "answer",
  "roomId": "<same-uuid>",
  "guestName": "포동이5240",
  "sdp": { "type": "answer", "sdp": "..." },
  "ice": [ ... ],
  "createdAt": 1720000000000
}
```

## 클라이언트 상태 흐름

1. **호스트 방 생성**
   1. `useRoom.createRoom()`
   2. `createHostSession()` → RTCPeerConnection + DataChannel
   3. `waitForIceGathering()` (max 4s)
   4. offer 페이로드 완성 → 온라인이면 `POST /room`, 아니면 그대로 QR로 표시
   5. `startAnswerPoll(roomId)` (온라인) 또는 `ingestGuestSignal(raw)` 대기(오프라인)
   6. answer 도착 → `applyRemoteAnswer()` → DataChannel `onopen`

2. **게스트 방 참가**
   - 온라인: `fetchRoomOffer` → `createGuestSession` → `submitAnswer` → host poll이 완료
   - 오프라인: `ingestHostSignal(raw)` → `createGuestSession` → offlineAnswer QR로 표시

3. **P2P 통신 이후**
   - DataChannel `send/onmessage`로 `LOBBY_STATE`, `GAME_ACTION`, `HEARTBEAT` 등의
     `P2PMessage` JSON을 주고받음. `window.dispatchEvent('p2p_message')`로 UI에 브로드캐스트.

## 오프라인/네트워크 감지

`useNetwork()`
- `navigator.onLine` 실시간 추적
- `VITE_SIGNALING_URL` 설정 유무를 함께 노출 (`signalingConfigured`)

App은 배너 노출 + Lobby는 온라인/오프라인 분기로 UI 전환.

## Cloudflare Worker

`worker/` 디렉토리에 독립 프로젝트로 존재. `src/index.ts`가 유일한 진입점.
스토리지 추상화:
- `saveRoom / loadRoom / listActiveRooms / deleteRoom`
- `saveAnswer / loadAnswer`

현재 백엔드는 R2 버킷(`ROOMS_BUCKET` 바인딩) 하나. 추후 KV/D1로 스왑할 경우
`saveRoom` 등 함수의 몸체만 교체하면 되므로 API 라우팅과 무관하게 확장 가능.

## 환경 변수

클라이언트(`.env`):
```
VITE_SIGNALING_URL=https://minidamo-signaling.<subdomain>.workers.dev
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Worker(`wrangler.toml`의 `[vars]`):
```
ROOM_TTL_SECONDS = "60"
ALLOWED_ORIGIN   = "*"
```

Worker 시크릿(선택, `wrangler secret put`):
- 인증 등을 붙일 경우 여기 추가

## 파일 지도

| 경로 | 역할 |
|---|---|
| `src/services/rtc.ts` | WebRTC 생성/응답/ICE gather/DataChannel wiring |
| `src/services/signaling.ts` | Worker HTTP client + 타임아웃 fetch |
| `src/hooks/useRoom.ts` | 방 생성/참가/nearby 스캔/오프라인 QR 인제스션 |
| `src/hooks/useLocation.ts` | GPS watchPosition + Permissions API |
| `src/hooks/useNetwork.ts` | 온라인/오프라인 감지 |
| `src/features/lobby/Lobby.tsx` | 온라인/오프라인 UI 분기 |
| `src/components/common/QrScanner.tsx` | html5-qrcode lazy-import |
| `src/components/common/OfflineBanner.tsx` | 상단 배너 |
| `worker/src/index.ts` | signaling 라우터 |
| `worker/wrangler.toml` | R2 바인딩 + vars + cron |
