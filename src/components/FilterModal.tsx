import { BikeIcon, BoltIcon } from '../icons'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
  bikeType: 'classic' | 'any'
  maxBike: number
  lang: Language
  onSelectBikeType: (type: 'classic' | 'any') => void
  onSelectMaxBike: (max: number) => void
  onClose: () => void
}

export default function FilterModal({
  bikeType,
  maxBike,
  lang,
  onSelectBikeType,
  onSelectMaxBike,
  onClose,
}: Props) {
  return (
    <div className="filter-modal-backdrop" onClick={onClose}>
      <div className="filter-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-grabber" />

        <div className="filter-modal-head">
          <div className="filter-modal-title">
            <BikeIcon size={18} />
            <span>{t('filterTitle', lang)}</span>
          </div>
          <button className="filter-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="filter-card">
          <label className="filter-label">{t('bikeTypeLabel', lang)}</label>
          <div className="filter-type-grid">
            <div
              className={`filter-type-card${bikeType === 'classic' ? ' active' : ''}`}
              onClick={() => {
                onSelectBikeType('classic')
                localStorage.setItem('radl.biketype', 'classic')
              }}
            >
              <div className="ft-icon"><BikeIcon size={20} /></div>
              <div className="ft-name">Standard</div>
              <div className="ft-sub">{t('standardSub', lang)}</div>
            </div>

            <div
              className={`filter-type-card${bikeType === 'any' ? ' active' : ''}`}
              onClick={() => {
                onSelectBikeType('any')
                localStorage.setItem('radl.biketype', 'any')
              }}
            >
              <div className="ft-icon"><BoltIcon size={20} /></div>
              <div className="ft-name">E-Bikes</div>
              <div className="ft-sub">{t('ebikeSub', lang)}</div>
            </div>
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

        <button className="filter-modal-apply" onClick={onClose}>
          {t('applyFilter', lang)}
        </button>
      </div>
    </div>
  )
}
