const { spawnSync } = require('node:child_process')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const tauriBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
)

const result = spawnSync(tauriBin, process.argv.slice(2), {
  cwd: path.join(repoRoot, 'src-tauri'),
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 0)
