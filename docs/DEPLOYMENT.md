# minidamo — 배포 가이드

두 개의 독립 배포가 있습니다:
1. **정적 프론트** — Cloudflare Pages (`minidamo` 프로젝트, 이미 자동 배포됨)
2. **시그널링 Worker** — Cloudflare Workers + R2 (사용자가 아래 절차대로 세팅)

---

## 1. 프론트 (Cloudflare Pages)

`main` 저장소의 `production` 브랜치 push → `.github/workflows/deploy.yml`이 자동으로
`npm ci && npm run build`를 실행하고 `dist/`를 Pages로 밀어 넣습니다.

### GitHub Secrets

- `CLOUDFLARE_API_TOKEN` — CF API Token (Pages · Edit 권한)
- `CLOUDFLARE_ACCOUNT_ID` — CF 계정 ID

### Pages 환경 변수 (Cloudflare 대시보드 → Pages → minidamo → Settings)

프로덕션과 프리뷰 각각 설정:

```
VITE_SIGNALING_URL      = https://minidamo-signaling.<subdomain>.workers.dev
VITE_TURN_URL           = (선택) TURN 서버 URL
VITE_TURN_USERNAME      = (선택)
VITE_TURN_CREDENTIAL    = (선택)
```

값을 비워두면 앱은 자동으로 **오프라인 QR 모드**로만 동작합니다. Worker 배포 전에도
QR로 두 기기가 붙는 흐름은 정상 작동합니다.

---

## 2. 시그널링 Worker + R2

### 2-1. R2 버킷 준비

```
npx wrangler r2 bucket create minidamo-rooms
npx wrangler r2 bucket create minidamo-rooms-dev   # (선택) 프리뷰용
```

버킷 이름을 다르게 쓸 경우 `worker/wrangler.toml`의 `bucket_name`, `preview_bucket_name`
두 줄만 바꿔주면 됩니다.

### 2-2. Worker 배포

```
cd worker
npm install
npx wrangler deploy
```

배포 후 URL(예: `https://minidamo-signaling.<subdomain>.workers.dev`)을 위 Pages 환경 변수
`VITE_SIGNALING_URL`에 넣어주세요.

### 2-3. 시크릿 / 변수 (선택)

기본값은 `wrangler.toml`의 `[vars]` 블록에 있습니다. 별도로 지정할 값이 있으면:

```
cd worker
npx wrangler secret put MY_SECRET_KEY
```

`Env` 타입에 필드를 추가하면 `worker/src/index.ts`에서 그대로 사용할 수 있게 미리
`interface Env`를 구조화해 두었습니다.

### 2-4. 로컬 개발

```
cd worker
cp .dev.vars.example .dev.vars   # 필요 시 수정
npm run dev
```

기본적으로 `http://localhost:8787`에서 열립니다. 이 URL을 `.env`의 `VITE_SIGNALING_URL`에
넣고 프론트를 `npm run dev`로 띄우면 두 서비스가 연결됩니다.

---

## 3. R2 스키마 / 향후 확장

현재 저장되는 오브젝트는 두 종류입니다:

| Key prefix | 내용 |
|---|---|
| `rooms/<roomId>.json`   | offer + hostName + gameId + location + createdAt + expiresAt |
| `answers/<roomId>.json` | answer + guestName + createdAt |

TTL은 `ROOM_TTL_SECONDS` 초. Worker의 `scheduled` 트리거(cron `*/1 * * * *`)가
매 분 만료된 오브젝트를 청소합니다.

값(오브젝트 내용)만 추가하고 싶다면 `worker/src/index.ts`의 `RoomRecord` /
`AnswerRecord` 타입에 필드를 붙이면 됩니다. Key 구조나 API를 확장하려면
`saveRoom`, `saveAnswer` 등 저장 함수만 수정하고 라우팅은 그대로 두면 됩니다.

D1(테이블), KV(키/값), 별도 R2 버킷을 추가하고 싶다면 순서는 다음과 같습니다:

1. `worker/wrangler.toml`에 `[[d1_databases]]`/`[[kv_namespaces]]`/`[[r2_buckets]]` 항목을 추가
2. `worker/src/index.ts`의 `interface Env`에 해당 바인딩 이름을 추가
3. 저장 함수(`saveRoom`, `loadRoom`, …)를 새 백엔드에 맞게 교체

---

## 4. TURN 서버 (권장)

브라우저 간 STUN만으로 붙지 않는 NAT 환경(대칭 NAT, 방화벽)이 있습니다.
Cloudflare Realtime TURN (또는 coturn 자체 호스팅)을 붙이면 연결률이 크게 오릅니다.

`.env` / Pages env에 다음 세 값을 넣으면 `useRoom`의 `iceServers`에 자동 포함됩니다:

```
VITE_TURN_URL=turn:turn.cloudflare.com:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

---

## 5. 트러블슈팅

- **`/rooms` 응답이 항상 빈 배열** → R2 리스트가 아직 반영 안 됐거나 만료됨. 
  `wrangler r2 object list minidamo-rooms --prefix=rooms/` 로 직접 확인.
- **CORS 오류** → `worker/wrangler.toml`의 `ALLOWED_ORIGIN`을 Pages 도메인으로 좁혀도 됨.
  `access-control-allow-origin`은 이 값을 그대로 반환합니다.
- **QR 스캔 무반응** → `html5-qrcode`는 카메라 권한이 필요합니다. iOS Safari에서는
  `https://` 사이트에서만 카메라 접근이 가능합니다.
