#!/usr/bin/env bash
#
# Setzt Prod auf ein früheres Deployment zurück.
#
#   npm run deploy:rollback          # ein Deployment zurück
#   npm run deploy:rollback -- a1b2c3 # auf genau dieses Deployment
#
# Kein Reset, kein Force-Push: der alte Stand wird als **neuer** Commit obenauf
# gelegt. Damit bleibt nachvollziehbar, wann zurückgegangen wurde, und ein
# „Rollback des Rollbacks" ist derselbe Handgriff.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Ziel-Remote; für Tests überschreibbar: DEPLOY_REMOTE=sandbox npm run deploy
REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="gh-pages"
WORKTREE=".gh-pages"

if [ ! -e "$WORKTREE/.git" ]; then
  echo "Kein gh-pages-Arbeitsverzeichnis. Einmal 'npm run deploy' laufen lassen." >&2
  exit 1
fi

git -C "$WORKTREE" fetch "$REMOTE" "$BRANCH" --quiet
git -C "$WORKTREE" reset --hard "$REMOTE/$BRANCH" --quiet

TARGET="${1:-HEAD~1}"

if ! git -C "$WORKTREE" rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null; then
  echo "Unbekanntes Ziel: $TARGET" >&2
  echo "Verfügbare Deployments:" >&2
  git -C "$WORKTREE" log --oneline -20 >&2
  exit 1
fi

TARGET_SHA="$(git -C "$WORKTREE" rev-parse --short "$TARGET")"
TARGET_SUBJECT="$(git -C "$WORKTREE" log -1 --pretty=%s "$TARGET")"
CURRENT_SHA="$(git -C "$WORKTREE" rev-parse --short HEAD)"

if [ "$TARGET_SHA" = "$CURRENT_SHA" ]; then
  echo "✓ Prod steht bereits auf $TARGET_SHA."
  exit 0
fi

echo "Prod: $CURRENT_SHA → $TARGET_SHA ($TARGET_SUBJECT)"

# Dateibaum des Ziels übernehmen, Historie behalten
git -C "$WORKTREE" checkout "$TARGET_SHA" -- .
# Dateien, die es im Ziel gar nicht gab, entfernt `checkout -- .` nicht
git -C "$WORKTREE" ls-files | while read -r f; do
  git -C "$WORKTREE" cat-file -e "$TARGET_SHA:$f" 2>/dev/null || git -C "$WORKTREE" rm -q --cached "$f"
done
git -C "$WORKTREE" clean -fdq

if [ -z "$(git -C "$WORKTREE" status --porcelain)" ]; then
  echo "✓ Inhalt ist identisch — nichts zu tun."
  exit 0
fi

git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit --quiet -m "rollback: zurück auf $TARGET_SHA — $TARGET_SUBJECT"
git -C "$WORKTREE" push "$REMOTE" "$BRANCH"

echo
echo "✓ Zurückgesetzt: $(git -C "$WORKTREE" rev-parse --short HEAD)"
echo "  https://neldosik.github.io/radl-nav/ (GitHub Pages braucht ~1 Min)"
