import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/press-start-2p/400.css'
import '@fontsource-variable/golos-text/wght.css'
// Dwoggle brand faces. Chewy and Baloo 2 have no Cyrillic; Balsamiq Sans and Nunito set Russian and Kyrgyz.
import '@fontsource/chewy/400.css'
import '@fontsource/baloo-2/600.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/baloo-2/800.css'
import '@fontsource/balsamiq-sans/cyrillic-700.css'
import '@fontsource/balsamiq-sans/cyrillic-ext-700.css'
import '@fontsource/nunito/cyrillic-700.css'
import '@fontsource/nunito/cyrillic-ext-700.css'
import '@fontsource/nunito/cyrillic-800.css'
import '@fontsource/nunito/cyrillic-ext-800.css'
import './styles/tokens.css'
import './motion/pageTransition.css'
import './styles/base.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { I18nProvider } from './i18n/I18nProvider.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('index.html is missing the #root element')

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
