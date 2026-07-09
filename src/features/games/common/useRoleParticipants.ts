import { useMemo } from 'react'
import type { PlayerInfo } from '../../../hooks/useRoom'

/**
 * Shared "who is me vs who is the opponent" resolver.
 *
 * Games used to identify themselves via `players.find(p => p.id === peerId)`
 * — that pattern silently swapped the two players on the guest side because
 * the guest's `peerId` is the roomId, which the initial `players` array
 * assigns to the HOST slot. Every game that shipped that pattern had subtle
 * winner-swap and name-swap bugs (fixed one-by-one in BombHunt / Mastermind /
 * elsewhere).
 *
 * Role (`isHost`) IS synchronised across peers via the RTC handshake, so
 * using it as the discriminator is stable. This hook centralises that
 * lookup so every game gets the same correct answer and future games can't
 * regress the pattern.
 */
export interface RoleParticipants {
  me: PlayerInfo | undefined;
  opponent: PlayerInfo | undefined;
  myName: string;
  opponentName: string;
}

export function useRoleParticipants(
  players: PlayerInfo[],
  isHost: boolean,
  fallbackMe = '나',
  fallbackOpp = '상대방',
): RoleParticipants {
  return useMemo(() => {
    const me = players.find((p) => p.isHost === isHost)
    const opponent = players.find((p) => p.isHost !== isHost)
    return {
      me,
      opponent,
      myName: me?.name ?? fallbackMe,
      opponentName: opponent?.name ?? fallbackOpp,
    }
  }, [players, isHost, fallbackMe, fallbackOpp])
}
