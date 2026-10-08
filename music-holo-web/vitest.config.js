import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Keep browser-only Playwright specs out of the jsdom unit/integration test runner.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['tests/**/*.test.js']
  }
}))
