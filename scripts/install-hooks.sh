#!/bin/bash
set -e

HOOKS_DIR=".git/hooks"
SCRIPTS_DIR="scripts/hooks"

echo "Installing VERA git hooks..."

mkdir -p "$HOOKS_DIR"
cp "$SCRIPTS_DIR/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Hooks installed successfully."
