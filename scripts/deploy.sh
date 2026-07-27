#!/usr/bin/env bash
#
# Deployt dist/ nach gh-pages — mit Historie.
#
# Der alte Einzeiler machte `git init` in dist/ und einen Force-Push. Jedes
# Deployment war damit ein neuer Root-Commit und überschrieb den vorherigen
# Stand vollständig: ein Rückzug auf die Version von gestern war unmöglich.
#
# Hier hängt gh-pages stattdessen als eigenes Arbeitsverzeichnis (git worktree)
# unter .gh-pages/. Jedes Deployment ist ein normaler Commit obendrauf, der
# Push braucht kein -f, und `npm run deploy:rollback` setzt den Stand als
# neuen Commit zurück.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Ziel-Remote; für Tests überschreibbar: DEPLOY_REMOTE=sandbox npm run deploy
REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="gh-pages"
WORKTREE=".gh-pages"

# Aus welchem Stand wurde gebaut? Steht später in der Deploy-Nachricht.
SOURCE_SHA="$(git rev-parse --short HEAD)"
SOURCE_SUBJECT="$(git log -1 --pretty=%s)"
SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠  Arbeitsverzeichnis nicht sauber — es wird der Stand auf der Platte deployt,"
  echo "   nicht der von $SOURCE_SHA."
  SOURCE_SHA="$SOURCE_SHA+dirty"
  # Ohne Terminal (CI, Skript) nicht auf eine Eingabe warten, die nie kommt.
  if [ -t 0 ]; then
    echo "   Weiter mit Enter, Abbruch mit Strg-C."
    read -r _
  fi
fi

echo "→ Baue …"
# Altlast: der frühere Einzeiler legte ein Repo in dist/ an, und Vite lässt
# .git beim Leeren des Ausgabeordners stehen. Weg damit, sonst wandert es ins
# Deployment.
rm -rf dist/.git
npm run build

# ── gh-pages als Arbeitsverzeichnis bereitstellen ──────────────────────────
git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null || true

if [ ! -d "$WORKTREE/.git" ] && [ ! -f "$WORKTREE/.git" ]; then
  rm -rf "$WORKTREE"
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git worktree add "$WORKTREE" "$BRANCH" --quiet
  elif git show-ref --verify --quiet "refs/remotes/$REMOTE/$BRANCH"; then
    git worktree add "$WORKTREE" -b "$BRANCH" "$REMOTE/$BRANCH" --quiet
  else
    # Allererstes Deployment: Zweig ohne gemeinsame Historie mit main
    git worktree add "$WORKTREE" --orphan -b "$BRANCH" --quiet
  fi
fi

git -C "$WORKTREE" fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null || true
# Fremde Deployments (anderer Rechner) nicht überfahren
if git show-ref --verify --quiet "refs/remotes/$REMOTE/$BRANCH"; then
  git -C "$WORKTREE" reset --hard "$REMOTE/$BRANCH" --quiet
fi

# ── Inhalt austauschen ─────────────────────────────────────────────────────
# Alles außer .git löschen: sonst bleiben Dateien alter Builds liegen, deren
# Namen sich geändert haben (gehashte Assets).
find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
# .git im Worktree ist eine Datei, kein Ordner — sie darf nie überschrieben
# werden, auch nicht von einem versehentlich in dist/ gelandeten Repo.
find dist -mindepth 1 -maxdepth 1 ! -name '.git' -exec cp -R {} "$WORKTREE/" \;

if [ -z "$(git -C "$WORKTREE" status --porcelain)" ]; then
  echo "✓ Nichts geändert — Prod ist bereits auf diesem Stand."
  exit 0
fi

git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit --quiet -m "deploy: $SOURCE_SHA ($SOURCE_BRANCH) — $SOURCE_SUBJECT"
git -C "$WORKTREE" push "$REMOTE" "$BRANCH"

echo
echo "✓ Deployt: $(git -C "$WORKTREE" rev-parse --short HEAD) ← $SOURCE_SHA"
echo "  https://neldosik.github.io/radl-nav/ (GitHub Pages braucht ~1 Min)"
echo "  Zurück: npm run deploy:rollback"
