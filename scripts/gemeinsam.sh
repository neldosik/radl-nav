#!/usr/bin/env bash
# Von deploy.sh, deploy-list.sh und rollback.sh eingebunden.
#
# Die öffentliche Adresse stand vorher in jedem Skript einzeln — beim Umzug
# auf eine andere Domain wäre eine Stelle übrig geblieben, und im Manifest
# hätte dann eine Adresse gestanden, unter der kein Paket liegt.

# Ziel-Remote; für Tests überschreibbar: DEPLOY_REMOTE=sandbox npm run deploy
REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="gh-pages"
WORKTREE=".gh-pages"

# Öffentliche Adresse des Deployments. Steht auch in src/aktualisierung.ts —
# die Hülle liegt auf ihrem eigenen https://localhost und braucht sie absolut.
PAGES_URL="${PAGES_URL:-https://neldosik.github.io/radl-nav}"

# Prüft, dass die genannten Programme vorhanden sind, bevor etwas verändert
# wird. `zip` fehlte auf einem frischen Rechner — der Abbruch kam erst, als
# der Inhalt des Arbeitsverzeichnisses schon ausgetauscht war.
braucht() {
  local fehlt=()
  for prog in "$@"; do
    command -v "$prog" >/dev/null 2>&1 || fehlt+=("$prog")
  done
  if [ ${#fehlt[@]} -gt 0 ]; then
    echo "Fehlende Programme: ${fehlt[*]}" >&2
    echo "Unter Debian/Ubuntu: sudo apt-get install ${fehlt[*]}" >&2
    exit 1
  fi
}
