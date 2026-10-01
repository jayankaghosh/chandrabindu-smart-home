#!/usr/bin/env bash
# Builds the signed release APK -> build/Chandrabindu.apk
#
# First run: creates a release keystore in keystore/ (gitignored) with a random
# password saved to keystore/keystore.properties. KEEP A BACKUP of that folder:
# Android only installs an update signed with the same key, so losing it means
# uninstalling the app (and re-adding its tiles, controls and widget) to update.
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="$(pwd)"

# JDK 21 (AGP needs 17+; avoid bleeding-edge JDKs).
if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"21'; then
  if [ -d /opt/homebrew/Cellar/openjdk@21 ]; then
    JAVA_HOME="$(ls -d /opt/homebrew/Cellar/openjdk@21/*/libexec/openjdk.jdk/Contents/Home | tail -1)"
  elif /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  fi
fi
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"

if [ ! -f local.properties ]; then
  echo "sdk.dir=$ANDROID_HOME" > local.properties
fi

KS_DIR="$PROJECT/keystore"
KS_PROPS="$KS_DIR/keystore.properties"
KS_FILE="$KS_DIR/chandrabindu-release.jks"

if [ ! -f "$KS_PROPS" ]; then
  if [ -e "$KS_FILE" ]; then
    echo "error: $KS_FILE exists but $KS_PROPS is missing. Restore it from your backup." >&2
    exit 1
  fi
  echo "==> Creating the release keystore (first run)"
  mkdir -p "$KS_DIR"
  chmod 700 "$KS_DIR"
  PASS="$(openssl rand -hex 20)"
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$KS_FILE" -storetype PKCS12 \
    -storepass "$PASS" -keypass "$PASS" \
    -alias chandrabindu -keyalg RSA -keysize 4096 -validity 36500 \
    -dname "CN=Chandrabindu Smart Home, O=Chandrabindu" >/dev/null 2>&1
  (
    umask 077
    cat > "$KS_PROPS" <<PROPS
# Release signing for the Chandrabindu Android app. Never commit this folder.
storeFile=keystore/chandrabindu-release.jks
storePassword=$PASS
keyAlias=chandrabindu
keyPassword=$PASS
PROPS
  )
  chmod 600 "$KS_PROPS" "$KS_FILE"
  echo "    Saved to keystore/ (back this folder up somewhere safe)."
fi

echo "==> Building the release APK"
./gradlew --no-daemon -q :app:assembleRelease

mkdir -p build
cp app/build/outputs/apk/release/app-release.apk build/Chandrabindu.apk

APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | tail -1 || true)"
if [ -n "$APKSIGNER" ]; then
  "$APKSIGNER" verify --print-certs build/Chandrabindu.apk | grep -E "SHA-256" | head -1 || true
fi
echo "==> build/Chandrabindu.apk ($(du -h build/Chandrabindu.apk | cut -f1))"
