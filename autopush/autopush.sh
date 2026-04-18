#!/bin/bash

# Auto-push script for userscript.js
# Triggered by launchd whenever userscript.js changes

REPO_DIR="$HOME/Documents/Claude/Projects/Altheastix eBay Order Manager"
FILE="src/userscript.js"
LOG="$REPO_DIR/autopush/autopush.log"

cd "$REPO_DIR" || exit 1

# Only proceed if there are actual changes to the file
if git diff --quiet "$FILE" && git diff --cached --quiet "$FILE"; then
  echo "$(date): No changes detected in $FILE, skipping." >> "$LOG"
  exit 0
fi

# Extract version from the file for the commit message
VERSION=$(grep '@version' "$FILE" | awk '{print $3}')

git add "$FILE"
git commit -m "auto-push: $VERSION"
git push >> "$LOG" 2>&1

echo "$(date): Pushed $VERSION" >> "$LOG"
