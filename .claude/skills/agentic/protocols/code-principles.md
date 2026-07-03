# 코드 원칙 & 단계별 체크리스트
## protocols/code-principles.md — minidamo 전용

> 모든 에이전트 공유 **단일 진실 공급원(Single Source of Truth)**.
> minidamo (React/TypeScript/PWA) 전용 원칙.
>
> 우선순위: **사용자 안전 > 데이터 무결성 > 기획 부합도 > 코드 품질 > 개발 속도**

---

## 0. 메타 원칙

원칙 위반 상황 발견 시 코드 깎지 말고
**원칙 자체를 PM에 정식 제안하여 갱신**.

| Severity | 의미 | 위반 시 처리 |
|----------|------|--------------|
| `BLOCKING` | 거부권 자동 발동 | 검토 에이전트 미승인 처리 |
| `MUST` | 반드시 준수 | 위반 시 미승인. PM 사유서 작성 시 일시 통과 가능 |
| `SHOULD` | 강력 권고 | 위반 시 지적 + 다음 사이클 기술 부채 등록 |
| `MAY` | 권장 | 통과하되 개선 제안 기록 |

---

## P1. Hardcoding is a Crime [BLOCKING]

### minidamo 정의: 무엇이 하드코딩인가

- **색상값 직접 사용**: `#6366f1`, `rgb(99, 102, 241)` 직접 CSS/JS에 기입 ➔ `var(--color-primary)` 등 CSS Custom Properties 사용
- **폰트 크기 직접 지정**: `font-size: 14px` ➔ `var(--font-size-md)` 사용
- **간격/크기 수치 직접 사용**: `margin: 16px`, `padding: 12px` ➔ `var(--spacing-md)` 사용
- **테두리 반경 직접 사용**: `border-radius: 8px` ➔ `var(--radius-md)` 사용
- **UI 노출 문자열 리터럴**: 게임 카드 설명문 등 ➔ `GAMES_LIST` 상수 모듈 등에서 가져옴
- **타입 단축 목적 any 캐스팅**: `as any`, `: any` ➔ 올바른 인터페이스 및 타입 선언 구조로 대체

### 합법적인 예외

- **`0`, `1`** 등 수학적으로 자명한 인덱스 또는 계산값
- **`flex: 1`**, `opacity: 0`, `z-index: 1000` 등 레이아웃 처리를 위한 고정 속성값

### Check
- [ ] 새 색상이 CSS 변수(`var(--color-primary)` 등)를 사용하는가?
- [ ] 새 간격/반경이 `var(--spacing-*)`, `var(--radius-*)`를 사용하는가?
- [ ] 임의로 편의상 `any` 타입을 지정한 곳이 없는가?

---

## P2. DRY — Don't Repeat Yourself [MUST]

### minidamo 정의: 무엇이 중복인가

- **컴포넌트 중복**: `src/components/common/`에 이미 있는 Button, Card 등을 각 feature에 새로 중복 만듦
- **로직 중복**: WebRTC P2P 데이터 수신 이벤트나 하버사인 거리 계산 등이 중복으로 흩어져 구현됨
- **타입 선언 중복**: `P2PMessage`나 `UserLocation` 등의 인터페이스가 개별 파일마다 개별 선언됨 ➔ 공유 타입 파일에서 import

### Rule of Three
- **1회 등장**: 그대로
- **2회 등장**: 추상화 검토
- **3회 등장**: 무조건 공통 추출 (`src/components/common` 또는 `src/hooks`, `src/utils`로)

### Check
- [ ] 구현 전 `src/components/common` 내 공통 요소가 이미 존재하는지 대조했는가?
- [ ] 동일 인터페이스 구조체가 중복 선언되어 있지 않고 한곳에서 import되는가?

---

## P3. YAGNI — You Aren't Gonna Need It [MUST]

### Smell
- "나중에 블루투스 직접 연동할지도 모르니" 미리 작성하는 백업 브릿지 코드
- 현재 사용처가 1개인데 과도하게 Generics 인터페이스로 설계된 상태
- 쓰지 않는 옵션 파라미터가 가득한 컴포넌트 Props 구조

---

## P4. SRP — Single Responsibility Principle [MUST]

### minidamo 적용

- **View 계층 분리**: React 컴포넌트는 오직 렌더링에만 집중하고, P2P 제어나 위치 추적 비즈니스 로직은 커스텀 훅(`usePeer`, `useLocation`)으로 완벽히 위임함.
- **Context 역할**: 전역 상태 및 인스턴스 전파에만 활용. 복잡한 계산 연산은 포함하지 않음.

### Check
- [ ] UI 컴포넌트 파일이 300줄을 초과하는 경우 서브 컴포넌트로 리팩토링했는가?
- [ ] 게임 데이터 수신 처리와 물리 처리가 한 컴포넌트에 뭉쳐 있지 않는가?

---

## P5. Boundaries — 신뢰 경계의 명확성 [MUST]

### minidamo 경계 정의

- **P2P 기기간 통신 수신값**: WebRTC DataChannel을 통해 수신된 JSON 데이터(`P2PMessage`)는 신뢰하지 않고, 파싱 단계에서 `type` 및 `payload` 규격을 철저하게 체크함.
- **GPS 수집값**: `accuracy`를 검증하여 정밀도가 너무 떨어질 경우 예외 경고 처리.

---

## P6. Errors are Not Surprises [MUST]

### 금지 패턴
```typescript
// ❌ V4 Veto 자동 발동
try { ... } catch (e) {}
try { ... } catch (_) {}
.catch(() => {})
```

### 올바른 패턴
```typescript
// ✅ 에러 처리 및 경고 노출
try {
  ...
} catch (e) {
  console.error('Lobby connection error:', e);
  setError('방 연결에 실패했습니다.');
}
```

---

## P8. Tests are Specifications [SHOULD]

- 빌드 명령어인 `npm run build` 및 `npm run lint`가 에러 없이 성공하는가?

---

## 단계별 체크리스트 — Pre / In / Post Flight

### Pre-Flight Checklist (착수 전)
```
[ ] plan-spec.md 의 이번 사이클 목표를 요약할 수 있는가?
[ ] 영향받는 파일 목록 및 타입 선언이 올바른 경로에 정의되어 있는가?
[ ] 공통 컴포넌트 중복 여부 확인
[ ] CSS Variables 토큰 구조 확인
```

### In-Flight Checklist (작업 중)
```
[ ] 추가하는 색상/간격/폰트가 P1(하드코딩) 위반이 아닌가? (CSS 변수 사용)
[ ] any 타입이나 as any 캐스팅 없이 완벽한 타입이 지정되어 있는가?
[ ] 비동기 WebRTC 매칭 및 GPS 획득 시 에러 처리가 반영되었는가?
```

### Post-Flight Checklist (산출물 제출 전)
```
[ ] npm run lint 0건 통과하는가?
[ ] npm run build 빌드가 오류 없이 통과하는가?
[ ] 콘솔 로그 디버그 코드 및 사용하지 않는 import 제거했는가?
[ ] BLOCKING 항목 위반이 없는가?
```