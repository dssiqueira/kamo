#!/bin/sh
# Signs a local, unsigned Kamo.app (no Developer ID) so it launches on Apple silicon.
# Local testing only: releases are signed with the Developer ID by electron-builder (release.yml).
#
#   CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac dir --arm64 --publish never
#   sh scripts/sign-mac-local.sh release/mac-arm64/Kamo.app
#
# Privacy permissions (Screen Recording, Microphone) are tied to the signature. An ad-hoc
# signature is tied to the binary's hash, so every rebuild looks like a new app and macOS asks
# again ("Failed to match existing code requirement" in tccd's log; pinning the designated
# requirement does not help on macOS 26). To keep the grants across rebuilds, sign with a stable
# identity from your keychain (a self-signed code-signing certificate is enough):
#
#   KAMO_SIGN_IDENTITY="Kamo Local" sh scripts/sign-mac-local.sh release/mac-arm64/Kamo.app
set -eu
app="${1:?usage: sign-mac-local.sh path/to/Kamo.app}"
identity="${KAMO_SIGN_IDENTITY:--}"
codesign --force --deep --sign "$identity" "$app"
codesign --verify --deep --strict "$app"
codesign -dr - "$app" 2>&1 | grep designated
