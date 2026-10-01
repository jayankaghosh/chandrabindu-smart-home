#!/usr/bin/env bash
# Build Chandrabindu.app (menu bar app) into experiences/macos-app/build/.
#
#   scripts/build-app.sh            # release build -> build/Chandrabindu.app
#   scripts/build-app.sh --install  # ...and copy it to ~/Applications
#
# Signing: uses $CODESIGN_IDENTITY if set (e.g. "Apple Development: you@x"),
# otherwise ad-hoc signs, which is fine for running on this Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
cd "$ROOT"

echo "› Compiling (release)…"
swift build -c release
BIN_DIR="$(swift build -c release --show-bin-path)"

BUILD_DIR="$ROOT/build"
APP="$BUILD_DIR/Chandrabindu.app"
mkdir -p "$BUILD_DIR"
# build/ only ever holds this script's own output.
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/ChandrabinduBar" "$APP/Contents/MacOS/ChandrabinduBar"
cp "$ROOT/Resources/Info.plist" "$APP/Contents/Info.plist"

# App icon from the web app's logo (public/logo.png).
LOGO="$REPO/public/logo.png"
if [[ -f "$LOGO" ]]; then
  echo "› Making the app icon…"
  ICONSET="$BUILD_DIR/AppIcon.iconset"
  rm -rf "$ICONSET"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$LOGO" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$LOGO" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
  rm -rf "$ICONSET"
fi

echo "› Signing…"
codesign --force --deep --sign "${CODESIGN_IDENTITY:--}" "$APP"

echo "✓ Built $APP"

if [[ "${1:-}" == "--install" ]]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
  # Quit a running copy first so the bundle can be replaced.
  pkill -x ChandrabinduBar 2>/dev/null || true
  rm -rf "$DEST/Chandrabindu.app"
  ditto "$APP" "$DEST/Chandrabindu.app"
  echo "✓ Installed to $DEST/Chandrabindu.app"
  open "$DEST/Chandrabindu.app"
fi
