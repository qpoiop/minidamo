# TURN 서버 · 접근 제어 · 쿼터 (Cloudflare Realtime)

> minidamo가 원거리 셀룰러 유저 사이 연결을 성사시키기 위해 사용하는
> Cloudflare Realtime TURN 설정 문서. 서비스 접근 제한 · 남용 방지 ·
> 문제 진단 절차까지 한 문서에.

---

## 1. 아키텍처

```
[Client browser]
     │  1. GET /turn-credentials
     │     Header: X-Minidamo-Key: <access key>
     ▼
[Worker: minidamo-api]
     │  2. Allowlist 검증 · Quota 검증
     │  3. POST rtc.live.cloudflare.com/…/credentials/generate
     ▼
[Cloudflare Realtime TURN]
     ▲  4. { iceServers: { urls, username, credential } }
     │
     ▼  5. Response 그대로 client 에 반환
[Client] RTCPeerConnection.iceServers 에 병합 → 세션 시작
```

- Client 는 **CF API 토큰을 절대 보지 않음**. Worker 가 프록시.
- 매 세션 시작 시 `useRoom.buildIceConfigWithTurn()` 이 호출.
- 클라이언트 메모리 캐시 (`TURN_CACHE_MS ≈ 1h55m`) 로 재발급 방지.
- 발급 실패 (403/429/5xx) 시 static iceServers (공용 STUN + openrelay)
  로 fallback. 근접 P2P 시나리오는 여전히 가능.

---

## 2. Worker 환경 변수

### 필수 (Secret 저장)

| 이름 | 용도 | 등록 명령 |
|---|---|---|
| `CF_TURN_KEY_ID`     | Realtime TURN Key ID (공개 식별자)    | `wrangler secret put CF_TURN_KEY_ID` |
| `CF_TURN_API_TOKEN`  | Realtime TURN API Token (**비밀**)    | `wrangler secret put CF_TURN_API_TOKEN` |
| `MINIDAMO_ALLOWED_KEYS` | 접근 허용 키 (콤마 구분). 예: `abc,def,ghi` | `wrangler secret put MINIDAMO_ALLOWED_KEYS` |

### 선택 (`wrangler.toml [vars]` 또는 secret)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `TURN_DAILY_QUOTA_IP`     | 0 (현재 · disabled) / 100 (기본값) | IP당 하루 발급 상한. **0 이하면 비활성화** |
| `TURN_DAILY_QUOTA_KEY`    | 50  | 접근 키당 하루 발급 상한 (allowlist 모드) |
| `TURN_DAILY_QUOTA_GLOBAL` | 300 (현재) / 500 (기본값) | 계정 전체 하루 발급 상한 |
| `ROOM_TTL_SECONDS`        | 1800 (배포값) / 300 (코드 기본값) | 방 오퍼 KV 만료 (배포는 30분, `wrangler.toml [vars]` 미설정 시 코드 fallback은 5분) |

### 조정 방법

```bash
cd worker

# secret 변경/추가
echo "your-value" | npx wrangler secret put NAME

# 일반 var 변경 (wrangler.toml [vars] 편집 후)
npx wrangler deploy
```

---

## 3. 접근 제어 (Allowlist)

### 동작

- `MINIDAMO_ALLOWED_KEYS` 가 설정되어 있으면 **모든** `/turn-credentials`
  요청은 헤더 `X-Minidamo-Key: <key>` 를 반드시 포함해야 함.
- 허용 목록에 없으면 **403** 즉시 반환. Realtime API 도 호출 안 함.
- 값이 비어있으면 (또는 secret 미설정) allowlist 게이트는 통과, IP
  quota + global cap 만 남음 (global cap 은 allowlist 여부와 무관하게
  항상 가장 먼저 검사됨 — §4 참조). 개발용.

### 키 배포 시나리오

**URL 파라미터 방식** (기본, 지금 구현됨)
- 사용자에게 URL `https://minidamo.pages.dev/?k=abcXYZ` 공유
- 접속 시 `getMinidamoAccessKey()` 가 `?k=` 를 `localStorage` 로 저장
- 이후 URL 에서 자동 제거 (screenshot 유출 방지)
- 다음부터 localStorage 로 자동 인증

**수동 입력 방식** (향후 필요 시)
- 홈 진입 시 키 없으면 modal 로 "접근 코드" 프롬프트
- 저장 후 재사용

### 배포된 5개 키 (2026-07-08)

- `5YO4Aaf7`
- `lcxHFzNh`
- `VyofnIE_`
- `GF7sXjt-`
- `OiBUi3NT`

각각 다른 사용자에게 배포. 유출된 키는 secret 재등록으로 즉시 무효화 가능.

**공유 URL 예시**
```
https://minidamo.pages.dev/?k=5YO4Aaf7
```

### 회수 · 로테이션

특정 키만 회수하려면:
```bash
cd worker
echo "새키1,새키2,나머지키" | npx wrangler secret put MINIDAMO_ALLOWED_KEYS
```

전면 무효화:
```bash
echo "___BLOCK_ALL___" | npx wrangler secret put MINIDAMO_ALLOWED_KEYS
```

---

## 4. Rate Limit / Quota

3단계 방어 (모두 KV `ROOMS_KV` 에 하루 단위 카운터로 저장):

| 층 | 키 형태 | 초과 시 |
|---|---|---|
| 전역 | `turnq:YYYY-MM-DD:__global__` | 429 · **가장 먼저 검사** |
| IP당 | `turnq:YYYY-MM-DD:ip:{cf-connecting-ip}` | 429 |
| 키당 | `turnq:YYYY-MM-DD:key:{matchedKey}` | 429 |

카운터는 **Realtime 호출 성공 시에만** 증가. 5xx 실패는 slot 소비
안 함. 카운터 TTL = 2일.

### 소진 시 사용자 경험

- Client `fetchTurnCredentials()` 가 null 반환
- static iceServers 로 fallback
- 근접/Wi-Fi 성공 · 셀룰러 원거리 실패
- Diagnostic overlay 에서 `relay 0` 관찰 가능

### 조정 가이드

- 지인 배포 (현재 배포됨): `IP=0(off), KEY=50, GLOBAL=300`
  - 이유: 특정 사용자만 · 키가 있으면 IP 관계없이 허용
  - 클라이언트 캐시 TTL 1h55m → 활발 플레이도 하루 5-10회 발급
  - 5키 × 50회 = 이론 250, GLOBAL 300 은 안전 여유
- Personal β 테스트: `IP=30, KEY=20, GLOBAL=100`
- 소규모 오픈: `IP=100, KEY=50, GLOBAL=500`
- 넉넉히: `GLOBAL=2000` — CF Realtime 무료 tier 확인 후 결정

---

## 5. 클라이언트 통합

- `src/services/signaling.ts`
  - `fetchTurnCredentials()` : cache-first fetch
  - `getMinidamoAccessKey()` : URL `?k=` → localStorage 로직
- `src/hooks/useRoom.ts`
  - `buildIceConfigWithTurn()` : static + dynamic 병합
  - 세 진입점에서 호출: `establishHostSession`(`createRoom`·`restoreHostRoom`[호스트 콜드 리스토어] 공용 헬퍼) / `joinRoom` / `ingestHostSignal`(오프라인 offer 코드로 게스트 참가)
- 실패 시 자동 fallback · UX 단절 없음

**localStorage 키**
- `minidamo_key` : 접근 키 (수동 초기화: DevTools > Application > Storage)

---

## 6. Cloudflare 대시보드 설정 (권장)

**Realtime TURN**
1. Dashboard → Realtime → **Set spending notification**
   - 지출 임계값에서 이메일 알림 (하드락 아님, 조기 감지용)
2. Realtime → TURN Keys → 활동 모니터링 (다음 사이클 UI 배포 후 확인)

**Workers**
1. Dashboard → Workers → `minidamo-api` → Metrics
2. `/turn-credentials` 요청 수 · 오류율 관찰
3. Analytics → CPU time · duration 이상치 확인

---

## 7. 문제 진단

### `access key required` (403)
- Client 에서 `X-Minidamo-Key` 헤더 미전송
- 원인:
  - URL `?k=` 없이 접속 · localStorage 비어 있음
  - Server `MINIDAMO_ALLOWED_KEYS` 는 설정됐는데 client 는 미설정
- 해결: 유효한 키로 `https://…/?k=키` 접속 → localStorage 저장 확인

### `per-IP daily quota reached (100)` (429)
- 동일 IP 에서 하루 100 초과 요청
- 실사용에서 초과는 이상. 개발 재시작 loop 의심
- 해결: KV 에서 `turnq:YYYY-MM-DD:ip:{ip}` 삭제 or 다음 날 대기
- 조정: `TURN_DAILY_QUOTA_IP` 상향

### `global daily cap reached (500)` (429)
- 계정 전체 하루 상한 도달
- 다수 사용자가 몰렸거나 봇 트래픽
- 해결: `wrangler tail` 로 IP 분포 확인 · 필요 시 `MINIDAMO_ALLOWED_KEYS`
  로테이션

### `TURN upstream 401`
- CF_TURN_API_TOKEN 만료 · 취소됨
- Dashboard 에서 Key 재발급 후 `wrangler secret put CF_TURN_API_TOKEN`

### relay 0 (연결 자체는 되었지만 P2P 실패)
- CF TURN credential 발급은 성공, 하지만 relay 후보가 후보 리스트에
  나타나지 않음
- Client 로그: `[useRoom] applying remote answer with N ice candidates`
- 원인 후보:
  - Firewall 이 turn.cloudflare.com:3478 UDP/TCP 차단
  - 클라이언트 iceServers 병합 실패 (console 확인)
- 진단: `wrangler tail` → `TURN upstream` 로그 관찰

---

## 8. 비용 예상

- Realtime TURN 무료 tier: **월 1TB egress** (2026-07 기준)
- 게임당 평균 데이터:
  - 실시간 (탁구/우다다): 1-2 MB / 5분
  - 턴제 (모순/냥호): < 200 KB / 매치
- 100 유저 × 일 5게임 × 30% relay = 150 relay 세션/일 = **~300 MB/일**
- 월 약 **9 GB** — 무료 tier 여유

**소진 방어**
- Global cap 500/day = 하루 최대 ~5 GB (평균 대비 5x 여유)
- Spending Notification 으로 60% / 80% / 100% 이메일
- Allowlist 5개 키 → 실사용자 외 요청 원천 차단

---

## 9. 향후 작업 후보

- [ ] 남은 quota 를 client 에 노출 (성공 응답 header 로 X-Quota-Left 반환)
- [ ] 사용자 나가기 시 credential revoke (Realtime API `DELETE`)
- [ ] Diagnostic overlay 에 `TURN 사용 여부` 표시 (selected candidate pair 유형)
- [ ] Turnstile CAPTCHA 를 allowlist 외 요청에 강제

---

**최근 배포**
- Worker: `minidamo-api` version `62e6e833-…` (2026-07-08)
- Frontend: production 브랜치 최신 commit
