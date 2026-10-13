#!/bin/bash
# Build StudyInk.app, install it, and make a .dmg to share.
#
#   packaging/build_app.sh                 # installs to ~/Applications, writes dist/StudyInk.dmg
#   packaging/build_app.sh /Applications   # or install anywhere else
#   NO_DMG=1 packaging/build_app.sh        # skip the disk image
#
# Needs: Xcode command-line tools (swiftc), Node 20+ (bundled into the app, so the app itself
# doesn't need it), python3 with PyMuPDF, Pillow and python-pptx, LibreOffice for .pptx decks,
# and the Ollama app with a vision model (ollama pull gemma4:e4b) to write the notes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Applications}"
cd "$HERE"

# the model the app will use: .env.local if there is one, else .env.example's defaults
envval() { grep -hE "^$1=" .env.local .env.example 2>/dev/null | head -1 | cut -d= -f2- || true; }
PROVIDER="$(envval LLM_PROVIDER)"; PROVIDER="${PROVIDER:-ollama}"
BASE_URL="$(envval LLM_BASE_URL)"; BASE_URL="${BASE_URL:-http://127.0.0.1:11434}"
MODEL="$(envval LLM_MODEL)"; MODEL="${MODEL:-gemma4:e4b}"

echo "Checking requirements"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "  node isn't on PATH (it's needed to build, and is bundled into the app)"; exit 1; }
# a python that can read slides: the one in .env.local, then the usual suspects
PY=""
for cand in "$(envval PYTHON)" "$(command -v python3 || true)" /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  [ -n "$cand" ] && [ -x "$cand" ] && "$cand" -c "import fitz, PIL" 2>/dev/null && { PY="$cand"; break; }
done
[ -n "$PY" ] || { echo "  no python3 with PyMuPDF found: python3 -m pip install pymupdf pillow python-pptx"; exit 1; }
"$PY" -c "import pptx" 2>/dev/null || echo "  warning: python-pptx missing in $PY (speaker notes from .pptx will be skipped)"
[ -d /Applications/LibreOffice.app ] || command -v soffice >/dev/null || echo "  note: LibreOffice not found; .pptx decks need it (PDF decks don't)"
[ -d /Applications/Ollama.app ] || echo "  note: Ollama.app not found; it writes the notes (https://ollama.com), then: ollama pull $MODEL"
echo "  python: $PY"
echo "  model:  $MODEL ($PROVIDER, $BASE_URL)"

echo "Building the notebook"
rm -rf .next
npm run build >/dev/null

# build outside the checkout: on an iCloud-synced Desktop, Finder metadata keeps appearing on
# new files, and codesign refuses a bundle that has it
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/studyink-build.XXXXXX")"
trap 'rm -rf "$BUILD"' EXIT
APP="$BUILD/StudyInk.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app"

echo "Building the app"
# target macOS 13+ explicitly (the compiler's default can be newer than the running system)
swiftc -O -target "$(uname -m)-apple-macos13.0" -o "$APP/Contents/MacOS/StudyInk" \
  packaging/macos/StudyInk.swift -framework Cocoa -framework WebKit
cp "$NODE" "$APP/Contents/MacOS/node"
VERSION="$(git describe --tags --always 2>/dev/null || echo 1.0)"
BUILDNO="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
sed -e "s|@PYTHON@|$PY|" -e "s|@VERSION@|1.0 ($VERSION)|" -e "s|@BUILD@|$BUILDNO|" \
  -e "s|@PROVIDER@|$PROVIDER|" -e "s|@BASE_URL@|$BASE_URL|" -e "s|@MODEL@|$MODEL|" \
  packaging/macos/Info.plist > "$APP/Contents/Info.plist"
"$PY" packaging/macos/make_icon.py "$BUILD/AppIcon.iconset"
iconutil -c icns "$BUILD/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

# the server: Next's standalone output, its static files, and the slide reader
rsync -a .next/standalone/ "$APP/Contents/Resources/app/"
rsync -a .next/static "$APP/Contents/Resources/app/.next/"
rsync -a --exclude "_test" public "$APP/Contents/Resources/app/"
rsync -a --exclude "__pycache__" extractor "$APP/Contents/Resources/app/"
cp LICENSE README.md "$APP/Contents/Resources/app/"
# sharp is only for Next's image optimiser, which StudyInk never uses (every picture is a data URL)
rm -rf "$APP/Contents/Resources/app/node_modules/sharp" "$APP/Contents/Resources/app/node_modules/@img"
# no secrets or local settings in the bundle
rm -f "$APP/Contents/Resources/app/.env" "$APP/Contents/Resources/app/".env.*

xattr -cr "$APP"                                   # Finder metadata from the Desktop blocks signing
codesign --force -s - "$APP/Contents/MacOS/node"
codesign --force -s - "$APP" >/dev/null 2>&1 || { echo "  ad-hoc signing failed:"; codesign --force -s - "$APP"; exit 1; }
codesign --verify --deep --strict "$APP" && echo "  signature verified"

echo "Installing to $DEST"
mkdir -p "$DEST"
rm -rf "$DEST/StudyInk.app"
ditto "$APP" "$DEST/StudyInk.app"            # keeps the signature intact
echo "  $DEST/StudyInk.app ($(du -sh "$DEST/StudyInk.app" | cut -f1))"

if [ "${NO_DMG:-0}" != "1" ]; then
  echo "Making the disk image"
  mkdir -p dist "$BUILD/dmg"
  ditto "$APP" "$BUILD/dmg/StudyInk.app"
  ln -s /Applications "$BUILD/dmg/Applications"
  rm -f dist/StudyInk.dmg
  hdiutil create -quiet -volname "StudyInk" -srcfolder "$BUILD/dmg" -ov -format UDZO dist/StudyInk.dmg
  echo "  dist/StudyInk.dmg ($(du -sh dist/StudyInk.dmg | cut -f1))"
fi

echo "Done."
pgrep -f "StudyInk.app/Contents/MacOS/StudyInk" >/dev/null && echo "StudyInk is running: quit and reopen it to use the new build." || true
