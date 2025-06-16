

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/citycouncilgame/', // THIS LINE IS CRITICAL
  plugins: [react()],
})
