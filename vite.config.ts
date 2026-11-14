import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'
import { mockAccount } from './mock/mockAccount.ts'
import { mockApi } from './mock/mockApi.ts'

/** The backend in development (backend/README.md: uvicorn on port 8000). Override with BACKEND_URL=… */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

/** The site calls /api on its own domain, as it will on Cloudflare; in development that goes to the backend. */
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: BACKEND_URL, changeOrigin: true },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // `npm run dev:mock` (mode "mock"): the report comes from mock/report.json and the account endpoints are
  // answered in memory, so no backend is needed. Signing in itself still goes to Firebase.
  plugins: [react(), mockApi({ always: mode === 'mock' }), ...(mode === 'mock' ? [mockAccount()] : [])],
  server: { proxy },
  preview: { proxy },
}))
