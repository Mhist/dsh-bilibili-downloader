#!/usr/bin/env node
/**
 * Optional packager helper: fetch the pinned FFmpeg build into ./vendor so a
 * repackaged bundle can ship it. Most users do not need this — the plugin
 * downloads FFmpeg automatically on first DASH download.
 *
 * The bundled binary is GPL-licensed FFmpeg. If you redistribute it you must
 * comply with FFmpeg's license (see THIRD_PARTY_NOTICES.md).
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VENDOR_DIR = join(HERE, '..', 'vendor')
const TARGET = join(VENDOR_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
const TMP = join(VENDOR_DIR, '.download')
const EXPECTED_SIZE = 64_458_752
const EXPECTED_SHA256 = 'c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e'
const MIRRORS = [
  'https://registry.npmmirror.com/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
  'https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
]

if (process.platform !== 'win32') {
  console.error('This helper currently provides a Windows x64 build only.')
  process.exit(1)
}

async function download(url, dest) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const handle = await open(dest, 'w')
  try {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.length > 0) await handle.write(value)
    }
  } finally {
    await handle.close()
  }
}

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`))))
  })
}

async function main() {
  await mkdir(VENDOR_DIR, { recursive: true })
  await rm(TMP, { recursive: true, force: true })
  await mkdir(TMP, { recursive: true })
  const tarball = join(TMP, 'ffmpeg.tgz')
  let lastError
  for (const url of MIRRORS) {
    try {
      console.log(`downloading ${url}`)
      await download(url, tarball)
      await run('tar', ['-xzf', tarball, '-C', TMP])
      const extracted = join(TMP, 'package', 'ffmpeg.exe')
      const info = await stat(extracted)
      if (info.size !== EXPECTED_SIZE) throw new Error(`unexpected size ${info.size}`)
      if ((await sha256(extracted)) !== EXPECTED_SHA256) throw new Error('checksum mismatch')
      await rm(TARGET, { force: true })
      await rename(extracted, TARGET)
      console.log(`wrote ${TARGET}`)
      console.log('Remember: redistributing this binary means complying with FFmpeg\'s GPL license.')
      await rm(TMP, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      console.warn(`  failed: ${error.message}`)
    }
  }
  await rm(TMP, { recursive: true, force: true }).catch(() => {})
  throw lastError
}

main().catch(error => {
  console.error('fetch:ffmpeg failed:', error.message)
  process.exit(1)
})
