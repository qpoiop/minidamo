/*
 * Lobby scanner state machine + payload dispatcher.
 *
 * The scanner is opened for one of two purposes:
 *   - 'ingest-host'  : guest scans host's invite QR
 *   - 'ingest-guest' : host scans guest's response QR
 *
 * ingest-host inputs can arrive in three shapes (share URL, room-id text,
 * or SDP JSON). Rather than teach each caller how to switch on the raw
 * string, we classify here and route to the correct room action.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type ScannerMode = 'off' | 'ingest-host' | 'ingest-guest'

interface UseLobbyScannerArgs {
  ingestHostSignal: (raw: string) => Promise<void>;
  ingestGuestSignal: (raw: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
}

const ROOM_ID_PATTERN = /^\d{4}$/

export function useLobbyScanner({ ingestHostSignal, ingestGuestSignal, joinRoom }: UseLobbyScannerArgs) {
  const [mode, setMode] = useState<ScannerMode>('off')
  const [error, setError] = useState<string | null>(null)
  const modeRef = useRef<ScannerMode>('off')
  useEffect(() => { modeRef.current = mode }, [mode])

  const open = useCallback((next: 'ingest-host' | 'ingest-guest') => {
    setError(null)
    setMode(next)
  }, [])

  const close = useCallback(() => setMode('off'), [])

  const handleResult = useCallback(
    async (raw: string) => {
      const current = modeRef.current
      setMode('off')
      if (current === 'off') return
      const text = raw.trim()
      try {
        if (current === 'ingest-guest') {
          await ingestGuestSignal(text)
        } else if (text.startsWith('http://') || text.startsWith('https://')) {
          const url = new URL(text)
          const roomId = url.searchParams.get('room')
          if (!roomId) throw new Error('URL에 room 파라미터가 없어요.')
          await joinRoom(roomId)
        } else if (ROOM_ID_PATTERN.test(text)) {
          await joinRoom(text)
        } else {
          await ingestHostSignal(text)
        }
        setError(null)
      } catch (e) {
        console.error('scan ingest failed', e)
        setError(e instanceof Error ? e.message : 'QR 처리 실패')
      }
    },
    [ingestGuestSignal, ingestHostSignal, joinRoom],
  )

  const handleError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : '카메라 오류')
  }, [])

  return { mode, error, open, close, handleResult, handleError }
}
