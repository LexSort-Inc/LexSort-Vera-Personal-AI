#!/usr/bin/env bash
# build-module.sh — Build, package, and optionally sign a VERA Pro module
#
# Usage:
#   ./scripts/build-module.sh <module-name> [--sign]
#
# Examples:
#   ./scripts/build-module.sh promailer           # build only
#   ./scripts/build-module.sh guardian-watch --sign  # build + sign
#
# Requirements for --sign:
#   MODULE_SIGNING_PRIVATE_KEY env var (96-char hex) OR
#   .env.local file containing MODULE_SIGNING_PRIVATE_KEY=<hex>

set -euo pipefail

MODULE=$1
SIGN=${2:-}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODULE_DIR="$REPO_ROOT/lexsort-vera-pro/modules/$MODULE"
DIST_DIR="$MODULE_DIR/dist"
INSTALL_DIR="$HOME/.lexsort/modules/$MODULE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VERA Module Builder — $MODULE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -d "$MODULE_DIR" ]; then
  echo "❌ Module directory not found: $MODULE_DIR"
  exit 1
fi

# 1. Build
echo "▶ Building..."
cd "$MODULE_DIR"
npm install --legacy-peer-deps --silent
npm run build --silent
echo "✅ Build complete: $(ls -lh dist/bundle.js | awk '{print $5}') bundle.js"

# 2. Prepare dist
cp "$MODULE_DIR/manifest.json" "$DIST_DIR/manifest.json"

# 3. Sign (if requested)
if [ "$SIGN" = "--sign" ]; then
  echo "▶ Signing..."
  if [ -f "$REPO_ROOT/.env.local" ]; then
    export $(grep MODULE_SIGNING_PRIVATE_KEY "$REPO_ROOT/.env.local" | xargs)
  fi
  if [ -z "${MODULE_SIGNING_PRIVATE_KEY:-}" ]; then
    echo "❌ MODULE_SIGNING_PRIVATE_KEY not set. Add it to .env.local or export it."
    exit 1
  fi
  node "$REPO_ROOT/scripts/sign-module.js" "$MODULE_DIR"
  echo "✅ Signed: dist/signature.sig"
fi

# 4. Create ZIP
ZIP_NAME="${MODULE}-$(node -e "const m=require('$MODULE_DIR/manifest.json'); console.log(m.version)")-macos.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"
cd "$DIST_DIR"
zip -q "$ZIP_PATH" bundle.js manifest.json $([ -f signature.sig ] && echo signature.sig || echo "")
echo "✅ Packaged: dist/$ZIP_NAME"

# 5. Deploy to local module dir for testing
echo "▶ Deploying to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp bundle.js "$INSTALL_DIR/"
cp manifest.json "$INSTALL_DIR/"
echo "✅ Deployed locally"

echo ""
echo "Next steps:"
echo "  1. Restart VERA Pro to load the updated module"
echo "  2. Upload $ZIP_NAME to modules.lexsort.com/$MODULE/$(node -e "const m=require('$MODULE_DIR/manifest.json'); console.log(m.version)")/"
echo "  3. Update website/modules/index.json with sha256 and size_bytes"
echo ""
