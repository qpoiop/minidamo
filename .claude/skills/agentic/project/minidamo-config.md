# minidamo — 프로젝트 설정
## project/minidamo-config.md

> 이 파일은 minidamo 전용 설정이다.
> 에이전트들은 컨텍스트 수집 첫 단계에서 이 파일을 읽고 프로젝트 특화 규칙을 적용한다.

---

## §1 스택 & 환경

- 언어: TypeScript / JavaScript
- 프레임워크: React (Vite)
- 스타일링: Vanilla CSS
- 네트워킹: WebRTC (PeerJS)
- 플랫폼: 모바일 웹브라우저 (Responsive Web)

---

## §2 빌드 & 검증 명령 (Build-Commands)

| 명령 | 목적 | 필수 여부 |
|------|------|----------|
| `npm run lint` | 린트/타입 오류 | **필수 게이트** — 타입스크립트 및 ESLint 경고/에러 0건 |
| `npm run build` | 프로덕션 빌드 검증 | **필수 게이트** — 실패 = 테스트 실패 |

---

## §3 아키텍처 & 경로 (Architecture)

패턴: **feature-first / layer-separation**.

| 계층 | 경로 |
|------|------|
| Pages / Views | `src/features/{feature명}/components/` |
| Hooks / Logic | `src/features/{feature명}/hooks/` |
| Context / Global | `src/context/` |
| Common Components | `src/components/common/` |
| Utils | `src/utils/` |
| Styles | `src/styles/` |

**핵심 문서:** `README.md` (아키텍처), `TODO.md` (작업), `planning/` (기획)

---

## §4 디자인 시스템 (Design-System)

스타일링은 Vanilla CSS를 사용하여 CSS Custom Properties (Variables) 형태로 관리한다.

**절대 금지 (V1 Veto 자동 발동):**
```css
/* ❌ 하드코딩 색상 및 픽셀 */
color: #ff6b35;
font-size: 14px;
margin: 16px;
```

**올바른 예:**
```css
color: var(--color-primary);
font-size: var(--font-size-md);
margin: var(--spacing-md);
```

---

## §5 상태 관리 및 P2P 패턴 (State & Connection)

1. P2P 연결은 `usePeer` 커스텀 훅을 만들어 룸 개설, QR코드용 링크 생성, 피어 연결 상태를 추적한다.
2. 각 게임 데이터는 JSON 프로토콜을 통하여 WebRTC DataChannel로 동기화된다.
3. 전역 상태가 필요한 경우 `React Context API`를 사용하고 개별 컴포넌트는 Local State (`useState`)를 우선 사용한다.

---

## §6 V1 하드코딩 탐지 명령 (V1-Detection)

```bash
# 인라인 하드코딩 스타일 속성 (style={{ ... }})
grep -rn "style={{" src/ --include="*.tsx" | grep -v test

# 하드코딩 색상코드 검출
grep -rn "#[0-9a-fA-F]\{3,6\}" src/ --include="*.css" | grep -v "var\(--"
```

---

## §7 V2 중복 탐지 명령 (V2-Detection)

```bash
# src/components/common/ 에 이미 있는 컴포넌트 목록 확인
ls src/components/common/
```

---

## §8 V4 에러 탐지 명령 (V4-Detection)

```bash
grep -rn "} catch \(.*\) {}" src/ --include="*.ts" --include="*.tsx" | grep -v test
```

---

## §9 V5 타입 안전 탐지 명령 (V5-Detection)

```bash
# TypeScript any 타입 무단 사용 검사
grep -rn ": any" src/ --include="*.ts" --include="*.tsx" | grep -v "test\|any[]"
```

---

## §10 필수 탐색 경로 (Mandatory-Search-Paths)

구현 전 이 순서로 탐색:

```bash
# 1. 공통 컴포넌트 확인
ls src/components/common/

# 2. 관련 전역 상태/컨텍스트 확인
ls src/context/

# 3. P2P 훅/유틸 확인
ls src/hooks/
```

---

## §11 자가 점검 항목 (minidamo 특화)

- [ ] 모바일 반응형 뷰포트에 맞게 레이아웃이 유연한가?
- [ ] P2P 시그널링 실패 예외 처리가 반영되었는가?
- [ ] 게임 종료 후 [다시하기], [대기방으로], [다른 게임], [나가기] 버튼이 구현되었는가?
- [ ] ESM 빌드가 오류 없이 통과하는가? (`npm run build`)
