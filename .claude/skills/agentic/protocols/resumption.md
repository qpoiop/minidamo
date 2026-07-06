# 재개 안정성 & 체크포인트 프로토콜
## protocols/resumption.md — minidamo 전용

> 토큰 소진, 세션 강제 종료 등 중단 발생 시
> **마지막 안전 지점**에서 자동 재개.

---

## 1. 핵심 원칙

1. **모든 단계 진입은 체크포인트를 남긴다**
2. **모든 산출물 작성은 idempotent하다** — 같은 입력, 같은 결과
3. **재시작은 PM 호출로만 시작된다**
4. **불완전한 산출물 신뢰 금지** — `_in_progress` 마커 있으면 처음부터
5. **사용자 답신 대기 상태는 보호된다**

---

## 2. 체크포인트 파일 구조

```
.agent-state/cycle-{N}/
  _checkpoint.json          ← 마지막 안전 지점 (PM이 갱신)
  _in_progress.json         ← 진행 중 표식 (작업 시작 시 생성, 완료 시 삭제)
  plan-spec.md
  dev-report.md
  review-report.md
  test-report.md
  pm-decision-{seq}.md
```

### `_checkpoint.json` 스키마

```json
{
  "cycle_number": 1,
  "last_safe_point": "REVIEW_COMPLETED",
  "last_updated_at": "ISO 8601+09:00",
  "next_planned_step": "PM_REVIEW_C_TO_D",
  "agent_outputs": {
    "planning":    { "status": "completed", "file": "plan-spec.md", "completed_at": "..." },
    "development": { "status": "completed", "file": "dev-report.md", "completed_at": "...", "iteration": 1 },
    "review":      { "status": "completed", "file": "review-report.md", "completed_at": "...", "verdict": "Approved" },
    "testing":     { "status": "pending",   "file": null }
  },
  "budget_snapshot_at_checkpoint": {
    "cycle_wall_clock_pct": 0.62,
    "tool_calls_pct": 0.55
  },
  "open_blockers": [],
  "user_intervention_required": false
}
```

---

## 3. 안전 지점(Safe Points) — 재개 위치

| ID | 의미 | 재개 시 동작 |
|----|------|-------------|
| `INIT` | 사이클 시작 전 | PM 호출 후 TODO 우선순위 평가 |
| `PLANNING_STARTED` | 기획 진입 직후 | 기획을 처음부터 |
| `PLANNING_COMPLETED` | plan-spec.md 정상 완료 | PM이 개발 단계 결정 |
| `DEVELOPMENT_STARTED` | 개발 진입 직후 | 개발을 처음부터 |
| `DEVELOPMENT_SELF_VERIFIED` | npm run lint+build 통과 | Veto 자가검사 단계 |
| `DEVELOPMENT_COMPLETED` | dev-report.md 정상 완료 | PM이 검토 단계 결정 |
| `REVIEW_STARTED` | 검토 진입 직후 | 검토를 처음부터 |
| `REVIEW_COMPLETED` | review-report.md 정상 완료 | PM이 다음 단계 결정 |
| `TESTING_COMPLETED` | test-report.md 정상 완료 | PM이 사이클 완료 판단 |
| `CYCLE_COMPLETED` | 사이클 완전 종료 | 다음 사이클 시작 |

### 재개 결정 트리

```
세션 재시작
   ↓
Step 1: state.json.status 확인
   ├─ "halted" → 재개 금지, 사용자 개입 대기
   ├─ "awaiting_user_intervention" → 재개 금지, 사용자 답신 대기
   └─ "running" → 다음
   ↓
Step 2: _in_progress.json 확인
   ├─ 존재 → 부분 산출물 폐기 → 가장 최근 안전 지점에서 에이전트 재실행
   │         → _in_progress.json 삭제
   └─ 부재 → _checkpoint.json 의 last_safe_point 읽기
   ↓
Step 3: 안전 지점에서 재개 → PM 호출 → next_planned_step 이행
```

---

## 4. 각 에이전트의 체크포인트 책무

### 공통 (모든 에이전트)

**진입 시:**
1. `_in_progress.json` 작성
2. 자기 산출물 파일 존재 여부 확인:
   - 존재 + `<!-- _complete: true -->` 마커 → 즉시 PM 인계 (재실행 금지)
   - 부분 산출물 → 폐기 후 처음부터

**산출물 저장 시:**
1. 임시 파일 먼저 작성 (`{name}.md.tmp`)
2. 검증 후 정식 파일로 rename
3. 파일 끝에 `<!-- _complete: true | timestamp: ... -->` 마커 추가
4. `_in_progress.json` 삭제
5. `_checkpoint.json` 갱신

### 개발 에이전트 sub-checkpoint

```
DEV_SUB_CHECKPOINTS:
  - duplication_search_completed
  - implementation_started
  - core_files_modified        (src/ 파일 수정 후 갱신)
  - lint_passed
  - build_passed
  - veto_self_check_completed
  - dev_report_written
```

### 검토 에이전트 sub-checkpoint

```
REVIEW_SUB_CHECKPOINTS:
  - veto_trigger_scan_completed  (grep 완료)
  - axis_1_planning_alignment
  - axis_2_code_quality          (Hardcoding/DRY/CSS Variables 패턴)
  - axis_3_impact_regression
  - axis_4_scalability
  - axis_5_security
  - holistic_review_completed
  - review_report_written
```

---

## 5. 토큰 소진 시 안전 종료 절차

```
1. 현재 작업 sub-step의 부분 결과를 _in_progress.json의 intermediate_artifacts에 저장
2. 안전 종료 메시지를 pm-decision-{seq}.md에 작성
3. _checkpoint.json 갱신 — last_safe_point는 갱신 안 하고, next_planned_step에 "재개 위치" 명시
4. state.json.status = "running" 유지 (재개 가능 신호)
5. 세션 종료
```

---

## 6. 산출물 idempotency 규칙

- 정식 산출물 파일 존재 + `_complete: true` 마커 → 진실. 재실행 금지
- 마커 없음 → 부분 산출물, 폐기 후 처음부터
- `pm-decision-{seq}.md` 누적 (덮어쓰기 금지), seq 단조 증가

---

## 7. state.json resumption 필드

```json
{
  "resumption": {
    "last_session_ended_at": "ISO 8601",
    "last_session_end_reason": "completed | token_exhausted | user_interrupt | error | unknown",
    "current_cycle_checkpoint_path": ".agent-state/cycle-1/_checkpoint.json",
    "current_in_progress_path": null,
    "next_resume_action": "call_pm_at_safe_point",
    "consecutive_resume_count": 0,
    "max_consecutive_resume": 5
  }
}
```

`consecutive_resume_count >= max_consecutive_resume` → CB-6 (HALT) 발동.

---

*체크포인트 = 시스템 기억. 잘 남기면 비싼 작업 두 번 안 한다.*