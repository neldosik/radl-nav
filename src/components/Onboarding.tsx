import { useState } from 'react'
import { currentPosition } from '../geolocation'
import { einfuehrungAbhaken } from '../onboarding'
import { LogoMark, TargetIcon } from '../icons'
import { t } from '../i18n'
import type { Language } from '../i18n'

/**
 * Zwei Bilder beim ersten Start.
 *
 * Das erste erklärt, wofür die App überhaupt da ist — ohne diesen Satz ist sie
 * eine weitere Fahrplanauskunft — und stellt die eine Frage, von der jeder
 * Preis auf jedem folgenden Bildschirm abhängt: Abo ja oder nein.
 *
 * Das zweite steht vor der Standortabfrage. Ein Systemdialog, der ohne
 * Vorwarnung aufspringt, wird weggetippt; wer vorher gelesen hat, wofür der
 * Ort gebraucht wird, entscheidet bewusst. Google verlangt diese Erklärung
 * für Ortungs-Apps ohnehin („Prominent Disclosure"), sie erfüllt hier also
 * zwei Zwecke.
 */
export default function Onboarding({
  lang,
  onAbo,
  onClose,
}: {
  lang: Language
  onAbo: (hat: boolean) => void
  onClose: () => void
}) {
  const [bild, setBild] = useState<1 | 2>(1)
  const [fragt, setFragt] = useState(false)

  function fertig() {
    einfuehrungAbhaken()
    onClose()
  }

  async function ortErlauben() {
    setFragt(true)
    // Das Ergebnis ist hier gleichgültig: wer ablehnt, kann die App weiter
    // mit getippten Adressen nutzen. Gefragt wird nur einmal und mit Anlass.
    await currentPosition().catch(() => {})
    fertig()
  }

  return (
    <div className="ob">
      <div className="ob-card">
        {bild === 1 ? (
          <>
            <span className="ob-mark">
              <LogoMark size={34} />
            </span>
            <h2 className="ob-title">{t('obTitle1', lang)}</h2>
            <p className="ob-text">{t('obText1', lang)}</p>
            <p className="ob-frage">{t('obAboFrage', lang)}</p>
            <button
              className="btn-block"
              onClick={() => {
                onAbo(true)
                setBild(2)
              }}
            >
              {t('obAboJa', lang)}
            </button>
            <button
              className="ob-zweit"
              onClick={() => {
                onAbo(false)
                setBild(2)
              }}
            >
              {t('obAboNein', lang)}
            </button>
          </>
        ) : (
          <>
            <span className="ob-mark">
              <TargetIcon size={30} />
            </span>
            <h2 className="ob-title">{t('obTitle2', lang)}</h2>
            <p className="ob-text">{t('obText2', lang)}</p>
            <button className="btn-block" onClick={ortErlauben} disabled={fragt}>
              {t(fragt ? 'obOrtFragt' : 'obOrtJa', lang)}
            </button>
            <button className="ob-zweit" onClick={fertig} disabled={fragt}>
              {t('obSpaeter', lang)}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
