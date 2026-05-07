const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
)

const appName = 'GitHub Action Management'
const version = packageJson.version
const arch = process.arch === 'arm64' ? 'aarch64' : process.arch
const appPath = path.join(
  repoRoot,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'macos',
  `${appName}.app`
)
const dmgDir = path.join(repoRoot, 'src-tauri', 'target', 'release', 'bundle', 'dmg')
const dmgPath = path.join(dmgDir, `${appName}_${version}_${arch}.dmg`)

const tauriBuild = spawnSync(
  process.execPath,
  [path.join(repoRoot, 'scripts', 'run-tauri.cjs'), 'build', '--config', 'tauri.conf.json', '--bundles', 'app'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (tauriBuild.status !== 0) {
  process.exit(tauriBuild.status ?? 1)
}

fs.mkdirSync(dmgDir, { recursive: true })
fs.rmSync(dmgPath, { force: true })

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gham-dmg-'))
const stagedAppPath = path.join(stagingDir, `${appName}.app`)
fs.cpSync(appPath, stagedAppPath, { recursive: true })

const hdiutil = spawnSync(
  'hdiutil',
  [
    'create',
    '-volname',
    appName,
    '-srcfolder',
    stagingDir,
    '-ov',
    '-format',
    'UDZO',
    dmgPath,
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

fs.rmSync(stagingDir, { recursive: true, force: true })

process.exit(hdiutil.status ?? 1)
