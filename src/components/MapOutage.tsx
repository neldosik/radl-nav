import { t } from '../i18n'
import type { Language } from '../i18n'

/**
 * Hinweis, wenn der Kartenstil auch nach allen Anläufen nicht kommt.
 *
 * `MapGuard` deckt den anderen Fall ab — kein WebGL, dauerhaft. Hier geht es
 * um das Funkloch: die Karte kann, sie hat nur nichts bekommen. Ohne Hinweis
 * blieb eine leere Fläche, die aussieht wie ein kaputtes Programm; mit Knopf
 * ist es ein Tipp, sobald das Netz wieder da ist.
 */
export default function MapOutage({ lang, onRetry }: { lang: Language; onRetry: () => void }) {
  return (
    <div className="map-fallback map-outage" role="status">
      <b>{t('mapOffline', lang)}</b>
      <span>{t('mapOfflineHint', lang)}</span>
      <button className="map-outage-btn" onClick={onRetry}>
        {t('retry', lang)}
      </button>
    </div>
  )
}
