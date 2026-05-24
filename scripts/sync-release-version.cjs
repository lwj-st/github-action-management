const fs = require('node:fs')
const path = require('node:path')

const rawVersion = process.argv[2] || process.env.RELEASE_VERSION || ''
const normalizedVersion = rawVersion.trim().replace(/^v/, '')

if (!normalizedVersion) {
  console.error('Missing release version. Pass a tag like v1.1.1-rc3.')
  process.exit(1)
}

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
packageJson.version = normalizedVersion
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'))
tauriConfig.package = tauriConfig.package || {}
tauriConfig.package.version = normalizedVersion
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`)

console.log(`Synchronized release version to ${normalizedVersion}`)
