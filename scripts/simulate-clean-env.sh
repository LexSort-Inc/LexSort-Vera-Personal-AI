#!/bin/bash

# VERA Clean Environment Simulation Script
# This helper automates environment backup/cleanup for manual onboarding testing.

LEXSORT_DIR="$HOME/.lexsort"
BACKUP_DIR="$LEXSORT_DIR/test_backup_$(date +%s)"
ACTIVE_BACKUP_LINK="$LEXSORT_DIR/active_test_backup"

simulate() {
  echo "=== Simulating Clean Environment ==="
  
  if [ -L "$ACTIVE_BACKUP_LINK" ] || [ -d "$ACTIVE_BACKUP_LINK" ]; then
    echo "⚠️ A test backup already exists at $ACTIVE_BACKUP_LINK."
    echo "Please run '$0 restore' first or manually delete it."
    exit 1
  fi

  # Create backup directory
  mkdir -p "$BACKUP_DIR"
  echo "Created backup folder: $BACKUP_DIR"

  # Backup configuration files
  if [ -f "$LEXSORT_DIR/config.json" ]; then
    cp "$LEXSORT_DIR/config.json" "$BACKUP_DIR/config.json"
    rm "$LEXSORT_DIR/config.json"
    echo "✓ Backed up and removed config.json"
  fi

  if [ -f "$LEXSORT_DIR/installed.json" ]; then
    cp "$LEXSORT_DIR/installed.json" "$BACKUP_DIR/installed.json"
    rm "$LEXSORT_DIR/installed.json"
    echo "✓ Backed up and removed installed.json"
  fi

  # Backup portable Ollama binary
  if [ -f "$LEXSORT_DIR/bin/ollama" ]; then
    mkdir -p "$BACKUP_DIR/bin"
    mv "$LEXSORT_DIR/bin/ollama" "$BACKUP_DIR/bin/ollama"
    echo "✓ Backed up and removed portable Ollama binary"
  fi

  # Create a symbolic link to the latest backup for easy restoration
  ln -s "$BACKUP_DIR" "$ACTIVE_BACKUP_LINK"
  echo "✓ Created link to active backup at $ACTIVE_BACKUP_LINK"
  echo "✨ Ready! Launch VERA in development mode to test the clean onboarding experience."
}

restore() {
  echo "=== Restoring Original Environment ==="

  if [ ! -L "$ACTIVE_BACKUP_LINK" ] && [ ! -d "$ACTIVE_BACKUP_LINK" ]; then
    echo "❌ No active test backup link found at $ACTIVE_BACKUP_LINK."
    exit 1
  fi

  # Resolve link target
  TARGET_BACKUP=$(readlink "$ACTIVE_BACKUP_LINK" 2>/dev/null || echo "$ACTIVE_BACKUP_LINK")

  if [ -f "$TARGET_BACKUP/config.json" ]; then
    cp "$TARGET_BACKUP/config.json" "$LEXSORT_DIR/config.json"
    echo "✓ Restored config.json"
  fi

  if [ -f "$TARGET_BACKUP/installed.json" ]; then
    cp "$TARGET_BACKUP/installed.json" "$LEXSORT_DIR/installed.json"
    echo "✓ Restored installed.json"
  fi

  if [ -f "$TARGET_BACKUP/bin/ollama" ]; then
    mkdir -p "$LEXSORT_DIR/bin"
    mv "$TARGET_BACKUP/bin/ollama" "$LEXSORT_DIR/bin/ollama"
    echo "✓ Restored portable Ollama binary"
  fi

  # Remove backups
  rm -rf "$TARGET_BACKUP"
  rm -f "$ACTIVE_BACKUP_LINK"
  echo "✓ Removed backup data and link"
  echo "✨ Restored original configuration successfully!"
}

case "$1" in
  simulate)
    simulate
    ;;
  restore)
    restore
    ;;
  *)
    echo "Usage: $0 {simulate|restore}"
    exit 1
    ;;
esac
