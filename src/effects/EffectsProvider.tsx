import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createEffectsEngine } from './particles'
import type { EffectKind, EffectsEngine } from './particles'

interface EffectsAPI {
  fire: EffectsEngine['fire'];
}

const EffectsContext = createContext<EffectsAPI | null>(null)

interface EffectsProviderProps {
  children: ReactNode;
}

/**
 * Mounts a viewport-covering canvas (pointer-events:none) at the very top
 * of the app tree and exposes fire(kind, opts) via context. A tap ripple
 * fires automatically for every pointerdown on the document.
 */
export function EffectsProvider({ children }: EffectsProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<EffectsEngine | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = createEffectsEngine(canvasRef.current)
    engineRef.current = engine

    const onPointerDown = (e: PointerEvent) => {
      // Only fire for direct user taps, skip synthetic events / drags
      if (!e.isPrimary) return
      engine.fire('ripple', { x: e.clientX, y: e.clientY, color: '#c7e06a' })
    }
    document.addEventListener('pointerdown', onPointerDown, { passive: true })

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  const fire = useCallback<EffectsAPI['fire']>((kind, opts) => {
    engineRef.current?.fire(kind, opts)
  }, [])

  return (
    <EffectsContext.Provider value={{ fire }}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 500, /* under all modals; matches --z-effects-canvas token */
        }}
      />
      {children}
    </EffectsContext.Provider>
  )
}

export function useEffectsFire(): (kind: EffectKind, opts?: Parameters<EffectsAPI['fire']>[1]) => void {
  const ctx = useContext(EffectsContext)
  if (!ctx) throw new Error('useEffectsFire must be used inside EffectsProvider')
  return ctx.fire
}
