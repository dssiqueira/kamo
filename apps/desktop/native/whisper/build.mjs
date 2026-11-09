// Builds whisper.cpp's command-line program (whisper-cli) from one pinned commit, for the
// app to ship (D-042). Used by CI and the release before packaging, and by hand in
// development (see README.md next to this file):
//
//   node apps/desktop/native/whisper/build.mjs
//
// Output: apps/desktop/native/whisper/build/<win|mac>/ — whisper-cli(.exe) and, on Windows,
// its ggml libraries and the Microsoft C++ runtime they need. electron-builder copies that
// folder to <resources>/whisper/ (extraResources); src/main/transcription/whisper-path.ts
// finds it. No dependency beyond git, CMake and the platform's C++ compiler.
import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** whisper.cpp v1.7.6. A full commit, never a tag: a moved tag would change what ships. */
export const WHISPER_COMMIT = 'a8d002cfd879315632a579e73f0148d06959de36'
const WHISPER_REPO = 'https://github.com/ggml-org/whisper.cpp'

const here = dirname(fileURLToPath(import.meta.url))
const buildRoot = join(here, 'build')
const src = join(buildRoot, 'src')
const cmakeBuild = join(buildRoot, 'cmake')

const platform = process.platform
if (platform !== 'win32' && platform !== 'darwin') {
  console.error(`whisper-cli ships for Windows and macOS only (this is ${platform})`)
  process.exit(1)
}
const out = join(buildRoot, platform === 'win32' ? 'win' : 'mac')
/** CMake from PATH, or the one in CMAKE (e.g. the copy Visual Studio Build Tools bundles). */
const cmake = process.env.CMAKE ?? 'cmake'

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`)
  return execFileSync(command, args, { stdio: 'inherit', ...options })
}

function git(args) {
  return execFileSync('git', args, { cwd: src, encoding: 'utf8' }).trim()
}

// 1. The source, at the pinned commit (a shallow fetch of that commit only).
if (!existsSync(join(src, '.git')) || git(['rev-parse', 'HEAD']) !== WHISPER_COMMIT) {
  rmSync(src, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  run('git', ['init', '-q'], { cwd: src })
  run('git', ['fetch', '-q', '--depth', '1', WHISPER_REPO, WHISPER_COMMIT], { cwd: src })
  run('git', ['checkout', '-q', 'FETCH_HEAD'], { cwd: src })
}
if (git(['rev-parse', 'HEAD']) !== WHISPER_COMMIT) {
  console.error('whisper.cpp is not at the pinned commit')
  process.exit(1)
}

// 2. Configure. GGML_NATIVE=OFF everywhere: the build machine's CPU flags must not leak into
// what users run. No tests, server, SDL or curl: only the CLI.
const common = [
  '-DCMAKE_BUILD_TYPE=Release',
  '-DGGML_NATIVE=OFF',
  '-DWHISPER_BUILD_TESTS=OFF',
  '-DWHISPER_BUILD_SERVER=OFF',
  '-DWHISPER_SDL2=OFF',
  '-DWHISPER_CURL=OFF',
  '-DGGML_CCACHE=OFF',
]
const perPlatform =
  platform === 'win32'
    ? [
        // The CPU backend is built once per instruction set (SSE4.2 … AVX-512) as small DLLs
        // and the best one is loaded at run time, so old and new PCs both work. That needs
        // shared libraries. No OpenMP (it would need vcomp140.dll): ggml's own thread pool.
        '-DBUILD_SHARED_LIBS=ON',
        '-DGGML_BACKEND_DL=ON',
        '-DGGML_CPU_ALL_VARIANTS=ON',
        '-DGGML_OPENMP=OFF',
        '-A',
        'x64',
      ]
    : [
        // One self-contained arm64 binary: ggml linked in, Metal shaders embedded, Accelerate
        // (a system framework) for the CPU parts. macOS 12, like Electron.
        '-DBUILD_SHARED_LIBS=OFF',
        '-DGGML_METAL=ON',
        '-DGGML_METAL_EMBED_LIBRARY=ON',
        '-DCMAKE_OSX_ARCHITECTURES=arm64',
        '-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0',
      ]
run(cmake, ['-S', src, '-B', cmakeBuild, ...common, ...perPlatform])

// 3. Build only the CLI.
run(cmake, ['--build', cmakeBuild, '--config', 'Release', '-j', '--target', 'whisper-cli'])

// 4. Collect what ships.
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
if (platform === 'win32') {
  const bin = join(cmakeBuild, 'bin', 'Release')
  for (const name of readdirSync(bin)) {
    if (name === 'whisper-cli.exe' || name.endsWith('.dll')) {
      copyFileSync(join(bin, name), join(out, name))
    }
  }
  // Electron links the C++ runtime statically; a PC without the Visual C++ Redistributable
  // has no vcruntime140.dll, so the runtime goes next to the program (app-local, as the
  // Visual Studio license allows for these redistributable files).
  for (const dll of findCrt()) copyFileSync(dll, join(out, dll.split(/[\\/]/).at(-1)))
} else {
  copyFileSync(join(cmakeBuild, 'bin', 'whisper-cli'), join(out, 'whisper-cli'))
  // Apple Silicon only runs signed code: ad-hoc here; the release signs it with the app.
  run('codesign', ['--force', '--sign', '-', join(out, 'whisper-cli')])
  run('otool', ['-L', join(out, 'whisper-cli')])
}

// 5. It runs, and how much it weighs (rule 6: the installer stays ≤ 130MB).
const program = join(out, platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli')
execFileSync(program, ['--help'], { stdio: 'ignore' })
let total = 0
for (const name of readdirSync(out)) {
  const size = statSync(join(out, name)).size
  total += size
  console.log(`${name.padEnd(28)} ${(size / 1e6).toFixed(2)} MB`)
}
console.log(`whisper-cli ${WHISPER_COMMIT.slice(0, 7)}: ${(total / 1e6).toFixed(2)} MB in ${out}`)

/** vcruntime140.dll, vcruntime140_1.dll and msvcp140.dll from the newest MSVC redist. */
function findCrt() {
  const vswhere = join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  )
  const install = execFileSync(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8' },
  ).trim()
  const redist = join(install, 'VC', 'Redist', 'MSVC')
  const versions = readdirSync(redist)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  for (const version of versions.reverse()) {
    const x64 = join(redist, version, 'x64')
    if (!existsSync(x64)) continue
    const crt = readdirSync(x64).find((name) => /^Microsoft\.VC\d+\.CRT$/.test(name))
    if (!crt) continue
    const dir = join(x64, crt)
    const files = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'].map((n) =>
      join(dir, n),
    )
    if (files.every((file) => existsSync(file))) return files
  }
  throw new Error(`no MSVC C++ runtime under ${redist}`)
}
