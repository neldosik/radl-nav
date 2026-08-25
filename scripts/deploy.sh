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

# shellcheck source=scripts/gemeinsam.sh
source "$ROOT/scripts/gemeinsam.sh"

# Erst prüfen, dann anfassen: das Paket entsteht, nachdem der Inhalt des
# Arbeitsverzeichnisses bereits ausgetauscht wurde.
braucht git npm zip
# Ordner für die Pakete, aus denen sich die Android-Hülle selbst aktualisiert.
BUNDLE_DIR="bundles"
# So viele alte Pakete bleiben liegen. Wer eine Weile nicht gestartet hat,
# findet seinen Stand sonst nicht mehr — und wer zurückrollt, braucht ihn auch.
BUNDLE_KEEP=5

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
# `bundles/` und `updates.json` bleiben stehen. Die Pakete, weil ein Gerät,
# das eine Weile aus war, seines noch holt. Das Manifest, weil es sonst als
# gelöscht in der Statusabfrage stünde und die Abkürzung „Prod ist schon auf
# diesem Stand" nie mehr griffe — beides kommt weder aus dist/ noch zurück.
find "$WORKTREE" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name "$BUNDLE_DIR" ! -name 'updates.json' -exec rm -rf {} +
# .git im Worktree ist eine Datei, kein Ordner — sie darf nie überschrieben
# werden, auch nicht von einem versehentlich in dist/ gelandeten Repo.
find dist -mindepth 1 -maxdepth 1 ! -name '.git' -exec cp -R {} "$WORKTREE/" \;

if [ -z "$(git -C "$WORKTREE" status --porcelain)" ]; then
  echo "✓ Nichts geändert — Prod ist bereits auf diesem Stand."
  exit 0
fi

# ── Paket für die Selbstaktualisierung der Hülle ───────────────────────────
# Der Webteil ist mit `base: './'` gebaut und läuft deshalb unverändert unter
# /radl-nav/ wie auch an der Wurzel der WebView. Das Paket ist damit schlicht
# dasselbe dist/ als Zip.
#
# Die Nummer zählt die Commits — monoton und ohne zusätzlichen Zustand. Bei
# unsauberem Arbeitsverzeichnis kommt die Uhrzeit dazu, sonst trüge ein
# zweites Deployment desselben Commits dieselbe Nummer und kein Gerät würde
# es holen.
VERSION="1.0.$(git rev-list --count HEAD)"
case "$SOURCE_SHA" in *+dirty) VERSION="$VERSION-$(date +%s)" ;; esac

mkdir -p "$WORKTREE/$BUNDLE_DIR"
ZIP="$WORKTREE/$BUNDLE_DIR/$VERSION.zip"
rm -f "$ZIP"
(cd dist && zip -qr "$OLDPWD/$ZIP" . -x '.git/*')

cat > "$WORKTREE/updates.json" <<JSON
{
  "version": "$VERSION",
  "url": "$PAGES_URL/$BUNDLE_DIR/$VERSION.zip",
  "commit": "$SOURCE_SHA",
  "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# Alte Pakete abräumen — sonst wächst der Zweig um ~3 MB je Deployment.
ls -1t "$WORKTREE/$BUNDLE_DIR"/*.zip 2>/dev/null | tail -n +$((BUNDLE_KEEP + 1)) | while read -r alt; do
  rm -f "$alt"
done

echo "→ Paket $VERSION ($(du -h "$ZIP" | cut -f1))"

git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit --quiet -m "deploy: $SOURCE_SHA ($SOURCE_BRANCH) — $SOURCE_SUBJECT"
git -C "$WORKTREE" push "$REMOTE" "$BRANCH"

echo
echo "✓ Deployt: $(git -C "$WORKTREE" rev-parse --short HEAD) ← $SOURCE_SHA"
echo "  $PAGES_URL/ (GitHub Pages braucht ~1 Min)"
echo "  Hülle holt sich $VERSION beim nächsten Start"
echo "  Zurück: npm run deploy:rollback"
