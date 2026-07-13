/**
 * Shared copy for confirm modals used by GameHeader + useAppNavigation.
 * Kept in one place so the wording stays consistent across back-gesture
 * and header-chip triggers.
 */

export const CONFIRM_EXIT_GAME = {
  message: '게임을 나가시겠어요?\n상대방과의 연결이 끊어져요.',
  okLabel: '게임 나가기',
  tone: 'danger' as const,
}

export const CONFIRM_RESTART_MATCH = {
  message: '매치를 처음부터 다시 시작할까요?\n현재 진행 상황은 전부 사라져요.',
  okLabel: '다시 시작',
  tone: 'default' as const,
}

export const CONFIRM_EXIT_LOBBY = {
  message: '대기방을 나가시겠어요?',
  okLabel: '방 나가기',
  tone: 'default' as const,
}

export const CONFIRM_TEST_EXIT = {
  message: '테스트 모드를 종료할까요?',
  okLabel: '종료',
  tone: 'danger' as const,
}
