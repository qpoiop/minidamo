# 핸드오프 프로토콜
## protocols/handoff-protocol.md — minidamo 전용

> 에이전트 간 의사소통: 파일만.
> 모든 전환: PM 감독 경유.

---

## 디렉토리 구조

```
{프로젝트 루트}/
  .agent-state/
    state.json                    ← 전체 시스템 상태 (PM이 관리)
    _project-context-cache.md     ← README.md/ARCHITECTURE.md 압축 캐시
    cycle-001/
      plan-spec.md                ← A: 기획 에이전트 산출물
      dev-report.md               ← B: 개발 에이전트 산출물
      review-report.md            ← C: 검토 에이전트 산출물
      test-report.md              ← D: 테스트 에이전트 산출물
      pm-decision.md              ← PM 판단 기록 (여러 개 누적)
    cycle-002/
      ...
```

---

## state.json 스키마

```json
{
  "system_version": "1.0.0-minidamo",
  "project_name": "minidamo",
  "project_root": "{저장소 루트 절대 경로}",

  "current_cycle": 1,
  "current_stage": "PLANNING | DEVELOPMENT | REVIEW | TESTING | COMPLETE",
  "status": "running | paused | halted | completed | awaiting_user_intervention",

  "cycle_history": [
    {
      "cycle_number": 1,
      "started_at": "ISO 8601",
      "completed_at": "ISO 8601 or null",
      "outcome": "deployed | continued | halted | split | null",
      "work_summary": "한 문장 요약",
      "b_restart_count": 0,
      "same_failure_count": 0,
      "last_failure_reason": null,
      "wall_clock_sec_used": 0,
      "tool_calls_used": 0,
      "veto_count": 0
    }
  ],

  "current_cycle_state": {
    "cycle_number": 1,
    "stage_started_at": "ISO 8601",
    "b_restart_count": 0,
    "failure_patterns": [],
    "scope_original": "초기 기획 스펙 요약",
    "scope_current": "현재 진행 중인 작업 범위",
    "scope_delta_pct": 0.0
  },

  "todo_snapshot": {
    "last_synced_at": "ISO 8601",
    "completed_items": ["항목1", "항목2"],
    "pending_items": ["항목3", "항목4"],
    "next_priorities": ["다음 사이클 예정 항목"]
  },

  "circuit_breaker": {
    "b_restart_limit": 3,
    "same_failure_limit": 2,
    "scope_drift_threshold": 0.3,
    "total_b_restart_limit": 5,
    "veto_repeat_limit": 3,
    "different_v_trigger_limit": 5,
    "active_breakers": []
  },

  "execution_budget": {
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
    },
    "warnings": {
      "soft_limit_pct": 0.5,
      "hard_warning_pct": 0.8,
      "auto_halt_pct": 1.0
    },
    "core_time": {
      "timezone": "Asia/Seoul",
      "weekday_window": "09:00-19:00",
      "weekend_window": null,
      "blackout_periods": []
    }
  },

  "budget_usage": {
    "current_cycle": {
      "wall_clock_sec_used": 0,
      "tool_calls_used": 0,
      "tool_calls_used_by_agent": {
        "planning": 0,
        "development": 0,
        "review": 0,
        "testing": 0,
        "pm": 0
      },
      "soft_limit_hit_count": 0,
      "hard_warning_hit_count": 0
    },
    "today": {
      "date": "YYYY-MM-DD",
      "cycles_started": 0,
      "wall_clock_sec_used": 0
    }
  },

  "veto_state": {
    "pending": false,
    "active_trigger": null,
    "trigger_location": null,
    "recovery_path": null,
    "recent_triggers": [],
    "override_authorization": null,
    "override_reason": null
  },

  "veto_override": {
    "comment": "사용자가 직접 작성. 이 필드가 비어있지 않으면 PM이 active_trigger를 무력화 가능.",
    "authorized_by": "user",
    "authorized_at": "ISO 8601",
    "scope": "current_cycle | next_n_cycles | permanent"
  },

  "project_context": {
    "planning_file": "README.md",
    "architecture_file": "ARCHITECTURE.md",
    "todo_file": "TODO.md",
    "planning_dir": "planning/",
    "analyze_command": "npm run lint",
    "build_command": "npm run build"
  },

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

---

## 각 에이전트의 파일 접근 규칙

### 읽기 권한

| 에이전트 | 읽을 수 있는 파일 |
|----------|-----------------|
| PM 감독 | 모든 파일 |
| 기획(A) | state.json, 이전 pm-decision.md, 이전 test-report.md, README.md, ARCHITECTURE.md, TODO.md, planning/ |
| 개발(B) | state.json, plan-spec.md, pm-decision.md, 이전 review-report.md, src/ 전체 |
| 검토(C) | state.json, plan-spec.md, dev-report.md, pm-decision.md, 변경된 소스코드 |
| 테스트(D) | state.json, plan-spec.md, dev-report.md, review-report.md, src/ 전체 |

### 쓰기 권한

| 에이전트 | 쓸 수 있는 파일 |
|----------|----------------|
| PM 감독 | state.json, pm-decision.md |
| 기획(A) | plan-spec.md, TODO.md |
| 개발(B) | dev-report.md, src/ 소스코드 |
| 검토(C) | review-report.md |
| 테스트(D) | test-report.md, src/ 소스코드 (리팩토링) |

---

## 핸드오프 절차

1. 에이전트: 산출물 작성 → "PM 전달 준비 완료" 명시
2. PM sub-agent 실행 → state.json 업데이트 + pm-decision.md 작성
3. pm-decision.md 라우팅 따라 다음 에이전트 실행
4. 다음 에이전트: state.json + pm-decision.md 먼저 읽기

---

*컨텍스트 불명확 시 작업 중단 → PM 보고. 추측 진행 금지.*