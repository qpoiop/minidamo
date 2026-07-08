import { findGame } from '../../../games/registry'
import { GameGuideModal } from './GameGuideModal'

interface RegistryGuideProps {
  gameId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Renders GameGuideModal using the guide config stored in the game
 * registry — single source of truth for guide copy across games.
 * Consumers just pass their `gameId` and modal state; no inline steps
 * arrays scattered per component.
 */
export function RegistryGuide({ gameId, open, onClose }: RegistryGuideProps) {
  const def = findGame(gameId)
  const guide = def?.guide
  if (!guide) return null
  return (
    <GameGuideModal
      open={open}
      onClose={onClose}
      title={guide.title}
      oneLine={guide.oneLine}
      sections={guide.sections}
      steps={guide.steps}
      warning={guide.warning}
    />
  )
}
