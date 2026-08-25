#!/usr/bin/env bash
# Zeigt die letzten Deployments — die SHAs taugen als Ziel für den Rollback.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/gemeinsam.sh
source "$ROOT/scripts/gemeinsam.sh"

if [ ! -e "$WORKTREE/.git" ]; then
  echo "Kein gh-pages-Arbeitsverzeichnis. Einmal 'npm run deploy' laufen lassen." >&2
  exit 1
fi

git -C "$WORKTREE" fetch "$REMOTE" "$BRANCH" --quiet
git -C "$WORKTREE" log --format='%C(auto)%h  %ad  %s' --date=format:'%d.%m. %H:%M' -20 "$REMOTE/$BRANCH"
