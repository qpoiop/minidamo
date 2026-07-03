# Quick Reference — 매 세션 빠른 참조표
## protocols/_quick-reference.md — minidamo 전용

> 세부 설명 없음. 결정만. 상세 → 각 원본 protocol 파일.

---

## 1. 검토 자동 거부 트리거 (V1~V8)

| ID | 위반 | minidamo 자동 감지 |
|----|------|------------------|
| V1 | Hardcoding | 인라인 색상/간격 수치 직접 기입, 폰트픽셀값 직접사용, any 타입 및 as any 남발 |
| V2 | 동일 컴포넌트/로직 3회+ 미추출 | src/components/common/ 대조 및 공통 훅 추출 여부 확인 |
| V3 | 스펙 미충족 / 스펙 외 추가 | plan-spec 대조 |
| V4 | Silent error (`catch {} / catch (() => {})`) | 빈 catch 블록 검출 |
| V5 | 무근거 `any` 타입 사용 | ts 파일 내 `: any` 또는 `as any` 패턴 |
| V6 | 기존 빌드 및 테스트 규칙 약화 | git diff |
| V7 | 빈/에러 상태 누락 (재연결 암전 모달 등 누락) | UI 흐름 모의 |
| V8 | 사용자 입력 검증 없이 Hook/P2P 전송 | 코드 흐름 추적 |

**BLOCKING → PM 즉시 개발 자동 재라우팅. 사용자 개입 없음.**

---

## 2. 서킷 브레이커 9종

| ID | 발동 | 액션 |
|----|------|------|
| CB-1 | 개발 재시작 3회 | 기획단계로 강제 복귀 |
| CB-2 | 같은 실패 2회 연속 | 기획단계 에스컬레이션 |
| CB-3 | 스코프 30%+ 증가 | 범위 재조정 |
| CB-4 | 기획 모순 | 기획 에이전트 복귀 |
| CB-6 | HALT (보안/환경/누적) | 시스템 정지, 사용자 개입 |
| CB-7 | 사이클 시간 초과 | 사이클 분할 |
| CB-9 | Veto 반복 3회 | **사용자 에스컬레이션** |

---

## 3. 안전 지점 (Safe Points) — 재개 위치

```
INIT → PLANNING_STARTED → PLANNING_COMPLETED
  → DEVELOPMENT_STARTED → DEVELOPMENT_SELF_VERIFIED → DEVELOPMENT_COMPLETED
  → REVIEW_STARTED → REVIEW_COMPLETED
  → TESTING_COMPLETED → CYCLE_COMPLETED
```

---

## 4. PM 권한 표

| 행동 | PM 권한 |
|------|---------|
| 라우팅, 스코프 조정, Soft Reject 오버라이드 | ✅ 가능 |
| Hard Reject (Veto) 오버라이드 | ❌ 사용자만 |
| 예산 한도 변경 | ❌ 사용자만 |
| 원칙 Severity 변경 | ❌ 사용자만 |

---

## 5. 단계별 체크리스트 핵심 항목

### Pre-Flight
1. 이번 사이클 개발 스펙 요약
2. **src/components/common 공통 요소 대조 및 중복 확인 의무**
3. CSS Variables 디자인 토큰 매핑 확인
4. 시간 예산 확인

### In-Flight
1. P1 Hardcoding 위반 0 (인라인 CSS 수치 직접 기입 차단, any 타입 차단)
2. View ➔ Service P2P direct 전송 시 데이터 바운더리 체크
3. 모든 비동기 매칭 및 GPS 획득에 에러 처리 반영

### Post-Flight
1. npm run lint 0건 통과
2. npm run build 통과 (정적 빌드 완료)
3. console.log / 미사용 import 제거

---

## 6. 자주 쓰는 파일 위치

```
state.json              .agent-state/state.json
context-cache           .agent-state/_project-context-cache.md
checkpoint              .agent-state/cycle-{N}/_checkpoint.json
in-progress marker      .agent-state/cycle-{N}/_in_progress.json

minidamo 핵심 파일:
P2P 상태 제어           src/hooks/usePeer.ts
GPS 위치 추적           src/hooks/useLocation.ts
서비스 워커             src/sw.ts
설치 유도 UI            src/components/common/PWAPrompt.tsx
스타일 정의             src/styles/variables.css, src/index.css
기획 문서               README.md, TODO.md, planning/
```