// Иконки из дизайна RadlNavi.dc.html (modernist): тонкие штриховые SVG, без эмодзи.
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

export const BikeIcon = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <circle cx="18.5" cy="17.5" r="3.5" />
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="15" cy="5" r="1" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
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

export const StarIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.2l5.9-.9z" />
  </svg>
)

export const LogoMark = ({ size = 26 }: P) => (
  <svg {...base(size)}>
    <circle cx="18.5" cy="17.5" r="3.5" />
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="15" cy="5" r="1" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  </svg>
)
