#!/usr/bin/env bash
# Zeigt die letzten Deployments — die SHAs taugen als Ziel für den Rollback.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -e ".gh-pages/.git" ]; then
  echo "Kein gh-pages-Arbeitsverzeichnis. Einmal 'npm run deploy' laufen lassen." >&2
  exit 1
fi

git -C .gh-pages fetch "${DEPLOY_REMOTE:-origin}" gh-pages --quiet
git -C .gh-pages log --format='%C(auto)%h  %ad  %s' --date=format:'%d.%m. %H:%M' -20 "${DEPLOY_REMOTE:-origin}"/gh-pages
