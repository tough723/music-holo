import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config.js'

/**
 * 真机（非 Mock）E2E：直接打到 docker compose 起的真实栈（nginx + Spring Boot + MySQL/Redis）。
 * 与默认配置的差别只有两点：不启动 vite preview 的 Mock 站点；baseURL 指向 compose 的 web 网关。
 * 前置：仓库根目录 `docker compose up --build --wait`（默认 web=8088，可用 PLAYWRIGHT_BASE_URL 覆盖）。
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8088'

export default defineConfig({
  ...baseConfig,
  webServer: undefined,
  use: {
    ...baseConfig.use,
    baseURL
  }
})
