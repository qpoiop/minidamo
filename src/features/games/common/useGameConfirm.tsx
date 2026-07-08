import { useCallback, useState } from 'react'
import { ConfirmModal } from '../../../components/common/ConfirmModal'

interface PendingConfirm {
  message: string;
  okLabel: string;
  tone: 'default' | 'danger';
  onOk: () => void;
}

/**
 * Shared confirm helper for game screens. Games use it to guard the
 * header exit chip + host-only restart chip with the same styled
 * ConfirmModal that useAppNavigation uses for back gestures.
 *
 * Usage:
 *   const { requestConfirm, modal } = useGameConfirm()
 *   ...
 *   <GameHeader onExit={() => requestConfirm({
 *     message: '게임을 나가시겠어요?',
 *     okLabel: '나가기', tone: 'danger', onOk: onExit,
 *   })} />
 *   ...
 *   {modal}
 */
export function useGameConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const requestConfirm = useCallback((cfg: PendingConfirm) => setPending(cfg), [])
  const modal = (
    <ConfirmModal
      open={!!pending}
      message={pending?.message ?? ''}
      okLabel={pending?.okLabel}
      tone={pending?.tone}
      onOk={() => {
        const p = pending
        setPending(null)
        p?.onOk()
      }}
      onCancel={() => setPending(null)}
    />
  )
  return { requestConfirm, modal }
}
