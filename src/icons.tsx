// Icons aus RadlNavi.dc.html Design (modernist): feine SVG-Konturen, ohne Emojis.
interface P {
  size?: number
  className?: string
}
const base = (size: number) => ({
  viewBox: '0 0 24 24',
  width: size,
  height: size,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const WalkIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0Z" />
    <path d="M20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z" />
  </svg>
)

/** Fahrrad von der Seite. Der frühere Punkt über dem Rahmen las sich klein
 *  wie ein Störfleck; jetzt tragen zwei Räder und ein Rahmendreieck die Form. */
export const BikeIcon = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <circle cx="5.5" cy="17" r="4" />
    <circle cx="18.5" cy="17" r="4" />
    <path d="M5.5 17 10 7.5h4.5L18.5 17" />
    <path d="M10 7.5 12.5 17H5.5" />
    <path d="M8.5 7.5h3" />
  </svg>
)

export const BoltIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </svg>
)

export const SendIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
)

export const SwapIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
  </svg>
)

export const TargetIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)

export const ExternalIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M7 7h10v10M7 17 17 7" />
  </svg>
)

export const LockIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="11" width="18" height="11" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
)

export const TrashIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
  </svg>
)

export const CloseIcon = ({ size = 14 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const ChevronLeft = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)

export const ChevronRight = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const ChevronDown = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const ChevronUp = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="m18 15-6-6-6 6" />
  </svg>
)

export const StarIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.2l5.9-.9z" />
  </svg>
)

/** Lesezeichen — für gemerkte Strecken, klar unterscheidbar vom Stern für Orte. */
export const BookmarkIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

export const PinIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

export const ClockIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const SunIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
)

export const RainIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M6 15a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.4A3.6 3.6 0 0 1 17 15z" />
    <path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21" />
  </svg>
)

export const HomeIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
  </svg>
)

export const FilterIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 6h18M7 12h10M10 18h4" />
  </svg>
)

/** Drei Punkte für das Kopfmenü — der Glyph „⋯" wirkte im 36px-Kreis leer. */
export const DotsIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </svg>
)

/** Symbol eines gemerkten Ortes — ersetzt die früheren Emoji im Datensatz. */
export const SlotIcon = ({ id, size = 14 }: { id: string; size?: number }) => {
  if (id === 'home') return <HomeIcon size={size} />
  if (id === 'work') return <BookmarkIcon size={size} />
  if (id === 'school') return <StarIcon size={size} />
  return <PinIcon size={size} />
}

export const LogoMark = ({ size = 26 }: P) => (
  <svg {...base(size)}>
    <circle cx="18.5" cy="17.5" r="3.5" />
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="15" cy="5" r="1" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  </svg>
)
