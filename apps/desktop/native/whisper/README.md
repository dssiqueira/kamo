# whisper-cli (bundled transcription program)

Kamo transcribes with [whisper.cpp](https://github.com/ggml-org/whisper.cpp)'s command-line program, `whisper-cli`, which ships inside the desktop app (D-042 in `docs/decisions.md`). The models it runs are **not** bundled: the app downloads one from Hugging Face only when the user asks (`src/main/packs/config.ts`).

`build.mjs` fetches whisper.cpp at one pinned commit (`WHISPER_COMMIT`, v1.7.6), builds only `whisper-cli` with CMake and writes what ships to `build/<win|mac>/`:

- **Windows (x64):** `whisper-cli.exe`, `whisper.dll`, the ggml libraries (one CPU backend per instruction set, the best one loaded at run time) and the Microsoft C++ runtime DLLs (`vcruntime140*.dll`, `msvcp140.dll`, app-local, so PCs without the Visual C++ Redistributable work). No OpenMP.
- **macOS (arm64):** one static `whisper-cli` with Metal (shaders embedded) and Accelerate, ad-hoc signed; the release signs it again with the app.

electron-builder copies the folder to `<resources>/whisper/` (`extraResources` in `electron-builder.yml`). In development the app looks in `build/<win|mac>/` (`src/main/transcription/whisper-path.ts`); without it, Transcribe says this build can't transcribe and nothing is downloaded.

## Build it locally

You need git, CMake 3.21+ and a C++ compiler: Visual Studio 2022+ (or its Build Tools) with *Desktop development with C++* on Windows, Xcode's command-line tools on a Mac.

```bash
node apps/desktop/native/whisper/build.mjs
```

The Visual Studio Build Tools bundle a CMake that is not on `PATH`; point `CMAKE` at it instead of installing another one (Git Bash):

```bash
CMAKE="/c/Program Files (x86)/Microsoft Visual Studio/18/BuildTools/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe" \
  node apps/desktop/native/whisper/build.mjs
```

No CMake at all: install it with `winget install Kitware.CMake` (Windows) or `brew install cmake` (Mac), or add the *C++ CMake tools for Windows* component in the Visual Studio Installer.

The script prints the size of every file (rule 6: the installer stays ≤ 130MB). `build/` is ignored by git.

## Without building it

For the screens and the queue, a development run can use the fake program instead: `node scripts/fake-pack-server.ts` (from `apps/desktop`) prints `KAMO_WHISPER_CLI` (a Node script that writes a canned transcript) and `KAMO_PACKS_DEV_MODELS` (fake models from a local server). Both are debug hooks a release ignores (D-038).
