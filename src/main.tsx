import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/arcade.css'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme/ThemeProvider'
import { EffectsProvider } from './effects/EffectsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <EffectsProvider>
        <App />
      </EffectsProvider>
    </ThemeProvider>
  </StrictMode>,
)
