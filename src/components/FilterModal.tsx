import { useEffect, useRef } from 'react'
import { BikeIcon, BoltIcon, CloseIcon } from '../icons'
import { t } from '../i18n'
import type { Language } from '../i18n'

/** MyRadl gibt höchstens vier Räder pro Konto aus (AGB nextbike). */
export const MAX_BIKES_PER_ACCOUNT = 4

interface Props {
  bikeType: 'classic' | 'any'
  maxBike: number
  bikes: number
  lang: Language
  onSelectBikeType: (type: 'classic' | 'any') => void
  onSelectMaxBike: (max: number) => void
  onSelectBikes: (n: number) => void
  onClose: () => void
}

export default function FilterModal({
  bikeType,
  maxBike,
  bikes,
  lang,
  onSelectBikeType,
  onSelectMaxBike,
  onSelectBikes,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDivElement>(null)

  // Escape schließt, und der Fokus wandert in den Dialog — sonst tippt man
  // mit der Tastatur weiter im Hintergrund herum.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="filter-modal-backdrop" onClick={onClose}>
      <div
        className="filter-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('filterTitle', lang)}
        tabIndex={-1}
        ref={dialog}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-grabber" />

        <div className="filter-modal-head">
          <div className="filter-modal-title">
            <BikeIcon size={18} />
            <span>{t('filterTitle', lang)}</span>
          </div>
          <button className="filter-modal-close" onClick={onClose}>
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="filter-card">
          <label className="filter-label">{t('bikeTypeLabel', lang)}</label>
          <div className="filter-type-grid">
            <button
              type="button"
              aria-pressed={bikeType === 'classic'}
              className={`filter-type-card classic${bikeType === 'classic' ? ' active' : ''}`}
              onClick={() => {
                onSelectBikeType('classic')
                localStorage.setItem('radl.biketype', 'classic')
              }}
            >
              <div className="ft-icon"><BikeIcon size={20} /></div>
              <div className="ft-name">Standard</div>
              <div className="ft-sub">{t('standardSub', lang)}</div>
              <div className="ft-mark">✓</div>
            </button>

            <button
              type="button"
              aria-pressed={bikeType === 'any'}
              className={`filter-type-card ebike${bikeType === 'any' ? ' active' : ''}`}
              onClick={() => {
                onSelectBikeType('any')
                localStorage.setItem('radl.biketype', 'any')
              }}
            >
              <div className="ft-icon"><BoltIcon size={20} /></div>
              <div className="ft-name">E-Bikes</div>
              <div className="ft-sub">{t('ebikeSub', lang)}</div>
              <div className="ft-mark">✓</div>
            </button>
          </div>
        </div>

        <div className="filter-card">
          <label className="filter-label">{t('maxBikeTime', lang)}</label>
          <div className="filter-time-pills">
            {[10, 15, 20, 30, 9999].map(n => (
              <button
                key={n}
                className={`filter-time-pill${maxBike === n ? ' active' : ''}`}
                onClick={() => {
                  onSelectMaxBike(n)
                  localStorage.setItem('radl.maxbike', String(n))
                }}
              >
                {n === 9999 ? t('noLimit', lang) : `${n}′`}
              </button>
            ))}
          </div>
        </div>

        {/* Gruppenfahrt: die Abholplanung über mehrere Stationen gab es längst,
            nur ließ sich die Anzahl nirgends einstellen — sie stand fest auf 1. */}
        <div className="filter-card">
          <label className="filter-label">{t('bikeCount', lang)}</label>
          <div className="filter-time-pills">
            {Array.from({ length: MAX_BIKES_PER_ACCOUNT }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                className={`filter-time-pill${bikes === n ? ' active' : ''}`}
                onClick={() => {
                  onSelectBikes(n)
                  localStorage.setItem('radl.bikes', String(n))
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="filter-hint">{t('bikeCountHint', lang)}</div>
        </div>

        <button className="filter-modal-apply" onClick={onClose}>
          {t('applyFilter', lang)}
        </button>
      </div>
    </div>
  )
}
