const { spawnSync } = require('node:child_process')
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', '../music-holo-web', 'run', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_API_MOCK: 'true' }, shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
