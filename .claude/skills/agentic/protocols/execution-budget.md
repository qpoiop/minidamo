# 실행 예산 & 스케줄링 프로토콜
## protocols/execution-budget.md — minidamo 전용

> 에이전트·사이클: **시간/호출** 예산 내 동작.

---

## 기본 예산 (state.json의 `execution_budget`)

```json
{
  "per_agent": {
    "planning":     { "wall_clock_sec": 600,  "max_tool_calls": 40 },
    "development":  { "wall_clock_sec": 1800, "max_tool_calls": 200 },
    "review":       { "wall_clock_sec": 900,  "max_tool_calls": 80 },
    "testing":      { "wall_clock_sec": 1200, "max_tool_calls": 120 },
    "pm":           { "wall_clock_sec": 300,  "max_tool_calls": 30 }
  },
  "per_cycle": {
    "wall_clock_sec": 7200,
    "max_b_iterations": 3,
    "max_total_tool_calls": 600
  },
  "per_day": {
    "wall_clock_sec": 28800,
    "max_cycles": 6
  }
}
```

프로젝트 오버라이드: `.agent-state/budget.json`

---

## 임계점 처리 (50% / 80% / 100%)

### 50% (Soft Limit) — "주의" 모드
- 탐색·실험 줄임. 핵심 산출물 완성 집중
- 세부 리팩토링 다음 사이클로

### 80% (Hard Warning) — "마무리" 모드
- 새 작업 금지
- 진행 작업 안전 중단점까지만

### 100% (Auto-Halt) — 강제 중단
- 즉시 정지. 현재 산출물 제출
- PM이 미완 항목 다음 사이클로

---

## 스케줄링 기법

### S1. Priority Queue
```
priority_score = (impact * 3) + (urgency * 2) - (effort * 1) - (risk_to_existing * 2)
```
기획 에이전트가 점수 계산 → `plan-spec.md` 기록.

### S2. Core-Time Window
```json
{
  "timezone": "Asia/Seoul",
  "weekday_window": "09:00-19:00",
  "weekend_window": null
}
```
코어 타임 외 자동 실행 금지.

### S3. Exponential Backoff

| 실패 횟수 | 다음 시도까지 대기 |
|-----------|--------------------|
| 1회 | 즉시 |
| 2회 | 30초 |
| 3회 | 5분 |
| 4회 | 30분 (그리고 CB-1 발동) |

### S4. Two-Phase Execution
위험 작업 (대규모 리팩토링, 의존성 업데이트):
- Phase 1 (Dry-run): 영향 범위 파악 + 보고서
- Phase 2 (Apply): PM 승인 후 실행

---

## minidamo 특화 안티패턴

검토 단계 차단 패턴:

- **Re-read storm**: `flutter analyze`를 변경 없이 5회 이상 반복
- **Empty diff**: 변경 없는 보고서만 반복 제출
- **Trivial grep storm**: 같은 grep을 단어만 바꿔 20회 이상 반복

---

## 예산 초과 시 PM 의사결정 트리

```
예산 초과 감지
  ├─ Per-agent budget 초과
  │   ├─ 사이클 예산 여유 있음 → 부분 산출물로 다음 단계 진행
  │   └─ 사이클 예산도 부족 → 사이클 분할 (CB-7)
  ├─ Per-cycle budget 초과
  │   ├─ 핵심 기능 완료됨 → 보조 단계 스킵 후 배포 검토
  │   └─ 핵심 기능 미완성 → TODO에 이월 후 새 사이클
  └─ Per-day budget 초과
      └─ 즉시 HALT, 다음 코어 타임까지 대기
```

---

## 측정 & 기록

에이전트 종료 시 보고서 필수 기록:

```markdown
## 실행 예산 사용량
- Wall-clock: {N}초 / {budget}초 ({pct}%)
- Tool calls: {N}회 / {budget}회 ({pct}%)
- 임계점 도달: [없음 | 50% | 80% | 100%]
- 임계점 도달 시 적용한 조치: {기록}
- 다음 사이클에 이월된 작업: {목록}
```

*예산 = 안전벨트. 조정은 PM·사용자 영역.*