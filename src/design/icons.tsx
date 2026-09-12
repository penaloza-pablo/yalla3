import type { ReactNode } from 'react'

export const YL_ICON_NAMES = [
  'magnifyingglass',
  'xmark',
  'line.3.horizontal',
  'sidebar.left',
  'plus',
  'minus',
  'line.3.horizontal.decrease',
  'square.and.arrow.down',
  'square.and.arrow.up',
  'arrow.clockwise',
  'arrow.uturn.backward',
  'arrow.triangle.2.circlepath',
  'arrow.right.to.bracket',
  'arrow.left.to.bracket',
  'chevron.left',
  'chevron.right',
  'chevron.up',
  'chevron.down',
  'chevron.up.chevron.down',
  'star',
  'cart',
  'trash',
  'pencil',
  'info.circle',
  'person.crop.circle',
  'person.2',
  'bubble.left',
  'house',
  'rectangle.3.group',
  'shippingbox',
  'calendar',
  'drop',
  'wrench.and.screwdriver',
  'chart.bar',
  'gearshape',
  'square.grid.2x2',
  'checkmark',
  'checkmark.circle',
  'forward.end',
  'square.on.square',
  'clock',
  'list.bullet',
  'list.bullet.rectangle',
  'doc.text',
  'exclamationmark.triangle',
] as const

export type YlIconName = (typeof YL_ICON_NAMES)[number]
export type YlIconVariant = 'regular' | 'fill'

type YlIconProps = {
  name: YlIconName
  size?: number
  variant?: YlIconVariant
  className?: string
}

const outline = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Outline({ children }: { children: ReactNode }) {
  return <g {...outline}>{children}</g>
}

function regularGlyph(name: YlIconName): ReactNode {
  switch (name) {
    case 'magnifyingglass':
      return (
        <Outline>
          <circle cx="8.6" cy="8.6" r="5" />
          <path d="M12.4 12.4 16.3 16.3" />
        </Outline>
      )
    case 'xmark':
      return (
        <Outline>
          <path d="M5 5 15 15" />
          <path d="M15 5 5 15" />
        </Outline>
      )
    case 'line.3.horizontal':
      return (
        <Outline>
          <path d="M3.5 5.5h13" />
          <path d="M3.5 10h13" />
          <path d="M3.5 14.5h13" />
        </Outline>
      )
    case 'sidebar.left':
      return (
        <Outline>
          <rect x="3.4" y="4.2" width="13.2" height="11.6" rx="2.2" />
          <path d="M8.1 4.2v11.6" />
        </Outline>
      )
    case 'plus':
      return (
        <Outline>
          <path d="M10 4.5v11" />
          <path d="M4.5 10h11" />
        </Outline>
      )
    case 'minus':
      return (
        <Outline>
          <path d="M4.5 10h11" />
        </Outline>
      )
    case 'line.3.horizontal.decrease':
      return (
        <Outline>
          <path d="M3.5 5h13" />
          <path d="M5.5 10h9" />
          <path d="M7.5 15h5" />
        </Outline>
      )
    case 'square.and.arrow.down':
      return (
        <Outline>
          <path d="M6.5 16.5h7A2 2 0 0 0 15.5 14.5v-4" />
          <path d="M4.5 10.5v4A2 2 0 0 0 6.5 16.5" />
          <path d="M10 3.5v8" />
          <path d="M7 9.2 10 12.2 13 9.2" />
        </Outline>
      )
    case 'square.and.arrow.up':
      return (
        <Outline>
          <path d="M6.5 16.5h7A2 2 0 0 0 15.5 14.5v-4" />
          <path d="M4.5 10.5v4A2 2 0 0 0 6.5 16.5" />
          <path d="M10 12.5V4.5" />
          <path d="M7 7.3 10 4.3 13 7.3" />
        </Outline>
      )
    case 'arrow.clockwise':
      return (
        <Outline>
          <path d="M16 7.2V4.2h-3" />
          <path d="M15.2 6.2A6.2 6.2 0 1 0 16 10.4" />
        </Outline>
      )
    case 'arrow.uturn.backward':
      return (
        <Outline>
          <path d="M8 15.2H6.2A3.2 3.2 0 0 1 3 12V8.2A3.2 3.2 0 0 1 6.2 5h9.3" />
          <path d="M12.2 8.3 15.5 5 12.2 1.7" />
        </Outline>
      )
    case 'arrow.triangle.2.circlepath':
      return (
        <Outline>
          <path d="M4.2 9.2A5.8 5.8 0 0 1 14.6 6.4" />
          <path d="M13.2 3.8 14.8 6.6 12 7.4" />
          <path d="M15.8 10.8A5.8 5.8 0 0 1 5.4 13.6" />
          <path d="M6.8 16.2 5.2 13.4 8 12.6" />
        </Outline>
      )
    case 'arrow.right.to.bracket':
      return (
        <Outline>
          <path d="M8 4.5H5.2A1.7 1.7 0 0 0 3.5 6.2v7.6A1.7 1.7 0 0 0 5.2 15.5H8" />
          <path d="M8.2 10h8.2" />
          <path d="M13.5 6.8 16.4 10 13.5 13.2" />
        </Outline>
      )
    case 'arrow.left.to.bracket':
      return (
        <Outline>
          <path d="M12 4.5h2.8A1.7 1.7 0 0 1 16.5 6.2v7.6a1.7 1.7 0 0 1-1.7 1.7H12" />
          <path d="M11.8 10H3.6" />
          <path d="M6.5 6.8 3.6 10 6.5 13.2" />
        </Outline>
      )
    case 'chevron.left':
      return (
        <Outline>
          <path d="M12.2 4.5 6.8 10l5.4 5.5" />
        </Outline>
      )
    case 'chevron.right':
      return (
        <Outline>
          <path d="M7.8 4.5 13.2 10 7.8 15.5" />
        </Outline>
      )
    case 'chevron.up':
      return (
        <Outline>
          <path d="M4.5 12.2 10 6.8 15.5 12.2" />
        </Outline>
      )
    case 'chevron.down':
      return (
        <Outline>
          <path d="M4.5 7.8 10 13.2 15.5 7.8" />
        </Outline>
      )
    case 'chevron.up.chevron.down':
      return (
        <Outline>
          <path d="M5 8.2 10 4.4 15 8.2" />
          <path d="M5 11.8 10 15.6 15 11.8" />
        </Outline>
      )
    case 'star':
      return (
        <Outline>
          <path d="M10 3.4 11.8 7.6l4.6.5-3.5 3.1 1 4.5L10 13.6 6.1 15.7l1-4.5-3.5-3.1 4.6-.5z" />
        </Outline>
      )
    case 'cart':
      return (
        <Outline>
          <path d="M3.4 4.5h1.7l1.2 8.1h8.4l1.6-5.6H6.2" />
          <circle cx="8.1" cy="15.3" r="1.05" />
          <circle cx="13.6" cy="15.3" r="1.05" />
        </Outline>
      )
    case 'trash':
      return (
        <Outline>
          <path d="M4.3 6.2h11.4" />
          <path d="M8.2 3.6h3.6l.7 2.6H7.5l.7-2.6z" />
          <path d="M6.2 6.2 7 16.2h6l.8-10" />
          <path d="M9 8.6v5.2" />
          <path d="M11 8.6v5.2" />
        </Outline>
      )
    case 'pencil':
      return (
        <Outline>
          <path d="M12.7 3.8 16.2 7.3 8 15.5H4.5V12z" />
          <path d="M11.3 5.2 14.8 8.7" />
        </Outline>
      )
    case 'info.circle':
      return (
        <Outline>
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 9.1v4.6" />
          <path d="M10 6.4v.2" />
        </Outline>
      )
    case 'person.crop.circle':
      return (
        <Outline>
          <circle cx="10" cy="10" r="7.2" />
          <circle cx="10" cy="8.2" r="2.2" />
          <path d="M5.6 15.1a4.6 4.6 0 0 1 8.8 0" />
        </Outline>
      )
    case 'person.2':
      return (
        <Outline>
          <circle cx="7.2" cy="7" r="2.15" />
          <circle cx="13.1" cy="7.4" r="1.9" />
          <path d="M3.5 15.2c.35-2.5 2-3.9 3.7-3.9s3.35 1.4 3.7 3.9" />
          <path d="M10.6 14.9c.4-1.8 1.65-2.9 2.7-2.9 1.15 0 2.3 1 2.6 2.9" />
        </Outline>
      )
    case 'bubble.left':
      return (
        <Outline>
          <path d="M4.2 4.6h11.2A1.8 1.8 0 0 1 17.2 6.4v6.1a1.8 1.8 0 0 1-1.8 1.8H8.2L4.2 16.6V4.6z" />
        </Outline>
      )
    case 'house':
      return (
        <Outline>
          <path d="M3.8 9.3 10 3.6l6.2 5.7V16a1.4 1.4 0 0 1-1.4 1.4H5.2A1.4 1.4 0 0 1 3.8 16V9.3z" />
          <path d="M8.2 17.2v-4.4h3.6v4.4" />
        </Outline>
      )
    case 'rectangle.3.group':
      return (
        <Outline>
          <rect x="3.4" y="4.2" width="3.8" height="11.6" rx="1" />
          <rect x="8.1" y="4.2" width="3.8" height="11.6" rx="1" />
          <rect x="12.8" y="4.2" width="3.8" height="11.6" rx="1" />
        </Outline>
      )
    case 'shippingbox':
      return (
        <Outline>
          <path d="M3.6 7.2 10 3.6l6.4 3.6v6.6L10 16.8 3.6 13.8V7.2z" />
          <path d="M3.6 7.2 10 10.6 16.4 7.2" />
          <path d="M10 10.6v6.2" />
        </Outline>
      )
    case 'calendar':
      return (
        <Outline>
          <rect x="3.5" y="4.6" width="13" height="12" rx="1.6" />
          <path d="M3.5 8.2h13" />
          <path d="M7 3.4v2.8" />
          <path d="M13 3.4v2.8" />
        </Outline>
      )
    case 'drop':
      return (
        <Outline>
          <path d="M10 3.4c3.6 4.2 5.4 6.8 5.4 9.1A5.4 5.4 0 1 1 4.6 12.5C4.6 10.2 6.4 7.6 10 3.4z" />
        </Outline>
      )
    case 'wrench.and.screwdriver':
      return (
        <Outline>
          <path d="M12.8 3.6 10.4 6l2 2 2.4-2.4a3.4 3.4 0 0 1 1.4 3.6l-5.8 5.8-2-2 5.8-5.8A3.4 3.4 0 0 1 12.8 3.6z" />
          <path d="M4.2 15.8 8.8 11.2" />
          <path d="M3.5 16.5h3.2v-2.2z" />
        </Outline>
      )
    case 'chart.bar':
      return (
        <Outline>
          <path d="M4.6 16.4V9.2h2.8v7.2" />
          <path d="M8.6 16.4V4.6h2.8v11.8" />
          <path d="M12.6 16.4v-5.6h2.8v5.6" />
        </Outline>
      )
    case 'gearshape':
      return (
        <Outline>
          <circle cx="10" cy="10" r="2.4" />
          <path d="M10 3.4 10.9 5.6l2.3-.2 1.1 2.1 2 .9-.9 2.1.9 2.1-2 .9-1.1 2.1-2.3-.2L10 16.6l-.9-2.2-2.3.2-1.1-2.1-2-.9.9-2.1-.9-2.1 2-.9 1.1-2.1 2.3.2z" />
        </Outline>
      )
    case 'square.grid.2x2':
      return (
        <Outline>
          <rect x="3.6" y="3.6" width="5.2" height="5.2" rx="1.1" />
          <rect x="11.2" y="3.6" width="5.2" height="5.2" rx="1.1" />
          <rect x="3.6" y="11.2" width="5.2" height="5.2" rx="1.1" />
          <rect x="11.2" y="11.2" width="5.2" height="5.2" rx="1.1" />
        </Outline>
      )
    case 'checkmark':
      return (
        <Outline>
          <path d="M4.6 10.4 8.2 14 15.5 5.8" />
        </Outline>
      )
    case 'checkmark.circle':
      return (
        <Outline>
          <circle cx="10" cy="10" r="7.2" />
          <path d="M6.4 10.2 8.8 12.6 13.7 7.4" />
        </Outline>
      )
    case 'forward.end':
      return (
        <Outline>
          <path d="M4.4 4.8 12.4 10 4.4 15.2z" />
          <path d="M15.2 4.8v10.4" />
        </Outline>
      )
    case 'square.on.square':
      return (
        <Outline>
          <rect x="6.4" y="6.4" width="9.4" height="9.4" rx="1.4" />
          <path d="M13.4 6.2V5.2A1.6 1.6 0 0 0 11.8 3.6H5.2A1.6 1.6 0 0 0 3.6 5.2v6.6A1.6 1.6 0 0 0 5.2 13.4h1" />
        </Outline>
      )
    case 'clock':
      return (
        <Outline>
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6.2V10l3 2" />
        </Outline>
      )
    case 'list.bullet':
      return (
        <Outline>
          <path d="M7.6 5.4h8.6" />
          <path d="M7.6 10h8.6" />
          <path d="M7.6 14.6h8.6" />
          <path d="M4.2 5.4h.2" />
          <path d="M4.2 10h.2" />
          <path d="M4.2 14.6h.2" />
        </Outline>
      )
    case 'list.bullet.rectangle':
      return (
        <Outline>
          <rect x="3.4" y="4" width="13.2" height="12" rx="1.6" />
          <path d="M7.2 7.4h6.4" />
          <path d="M7.2 10h6.4" />
          <path d="M7.2 12.6h4.2" />
          <path d="M5.2 7.4h.2" />
          <path d="M5.2 10h.2" />
          <path d="M5.2 12.6h.2" />
        </Outline>
      )
    case 'doc.text':
      return (
        <Outline>
          <path d="M6.2 16.6h7.6A1.6 1.6 0 0 0 15.4 15V8.2L11.4 3.6H6.2A1.6 1.6 0 0 0 4.6 5.2v9.8A1.6 1.6 0 0 0 6.2 16.6z" />
          <path d="M11.4 3.6V8.2h4" />
          <path d="M7.4 10.6h5.2" />
          <path d="M7.4 13.2h3.6" />
        </Outline>
      )
    case 'exclamationmark.triangle':
      return (
        <Outline>
          <path d="M10 3.6 17.4 16.4H2.6z" />
          <path d="M10 8.2v3.6" />
          <path d="M10 14.2v.2" />
        </Outline>
      )
  }
}

function fillGlyph(name: YlIconName): ReactNode | null {
  switch (name) {
    case 'house':
      return (
        <path
          fill="currentColor"
          d="M10 3.2 3.2 9.4V16a1.7 1.7 0 0 0 1.7 1.7h3.1v-5.1h4V17.7h3.1A1.7 1.7 0 0 0 16.8 16V9.4z"
        />
      )
    case 'rectangle.3.group':
      return (
        <path
          fill="currentColor"
          d="M3.2 4h3.9v12H3.2V4zm4.85 0h3.9v12h-3.9V4zM12.9 4H16.8v12h-3.9V4z"
        />
      )
    case 'shippingbox':
      return (
        <path
          fill="currentColor"
          d="M10 2.8 3.1 6.6v6.8L10 17.2l6.9-3.8V6.6zm0 1.9 5 2.7-5 2.8-5-2.8z"
        />
      )
    case 'calendar':
      return (
        <path
          fill="currentColor"
          d="M7 2.8h1.6v1.6h2.8V2.8H13v1.6h1.6A1.8 1.8 0 0 1 16.4 6.2v9.6a1.8 1.8 0 0 1-1.8 1.8H5.4A1.8 1.8 0 0 1 3.6 15.8V6.2A1.8 1.8 0 0 1 5.4 4.4H7V2.8zM5.2 8.2v7.4h9.6V8.2H5.2z"
        />
      )
    case 'drop':
      return (
        <path
          fill="currentColor"
          d="M10 2.6c4 4.6 6 7.4 6 10a6 6 0 1 1-12 0c0-2.6 2-5.4 6-10z"
        />
      )
    case 'wrench.and.screwdriver':
      return (
        <path
          fill="currentColor"
          d="M13.2 2.8 10.2 5.8l2.2 2.2 3-3a3.6 3.6 0 0 1 1.2 4.2L9.4 16.4 6.2 13.2l7.2-7.2A3.6 3.6 0 0 1 13.2 2.8zM3.2 16.8 8 12l2.1 2.1-4.8 4.8H3.2z"
        />
      )
    case 'chart.bar':
      return (
        <path
          fill="currentColor"
          d="M4.2 9h2.8v7.6H4.2V9zm4.4-4.6h2.8V16.6H8.6V4.4zm4.4 5.4h2.8v6.8h-2.8v-6.8z"
        />
      )
    case 'gearshape':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M8.6 2.4h2.8l.5 1.9 1.8.6 1.6-1 2 2-1.1 1.6.5 1.8 1.9.5v2.8l-1.9.5-.5 1.8 1.1 1.6-2 2-1.6-1-1.8.6-.5 1.9H8.6l-.5-1.9-1.8-.6-1.6 1-2-2 1.1-1.6-.5-1.8-1.9-.5V8.6l1.9-.5.5-1.8-1.1-1.6 2-2 1.6 1 1.8-.6.5-1.9ZM10 12.4A2.4 2.4 0 1 0 10 7.6a2.4 2.4 0 0 0 0 4.8Z"
        />
      )
    case 'square.grid.2x2':
      return (
        <path
          fill="currentColor"
          d="M3.2 3.2h5.4v5.4H3.2V3.2zm8.2 0h5.4v5.4h-5.4V3.2zM3.2 11.4h5.4v5.4H3.2v-5.4zm8.2 0h5.4v5.4h-5.4v-5.4z"
        />
      )
    case 'person.crop.circle':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 7.4A2.7 2.7 0 1 0 10 3.9a2.7 2.7 0 0 0 0 5.5zM6.1 15.3a4.6 4.6 0 0 1 7.8 0 6.5 6.5 0 0 1-7.8 0z"
        />
      )
    case 'checkmark.circle':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm3.5 5.2-4.4 5.3-2.6-2.6 1.2-1.2 1.5 1.5 3.2-3.9 1.1.9z"
        />
      )
    case 'info.circle':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm.8 6.6H9.2v5.2h1.6V8.6zM10 5.6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
        />
      )
    case 'exclamationmark.triangle':
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M10 2.2 18.2 16.8H1.8L10 2.2zM9.2 7.6h1.6v4.2H9.2V7.6zm.8 6.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
        />
      )
    case 'star':
      return (
        <path
          fill="currentColor"
          d="M10 3.1 12 7.6l4.9.5-3.7 3.3 1.1 4.8L10 13.8 5.7 16.2l1.1-4.8-3.7-3.3 4.9-.5z"
        />
      )
    default:
      return null
  }
}

export const ICON_GROUPS: { id: string; names: YlIconName[] }[] = [
  {
    id: 'chrome',
    names: [
      'magnifyingglass',
      'xmark',
      'line.3.horizontal',
      'sidebar.left',
      'plus',
      'minus',
      'line.3.horizontal.decrease',
      'square.and.arrow.down',
      'square.and.arrow.up',
      'arrow.clockwise',
      'info.circle',
      'person.crop.circle',
      'person.2',
      'bubble.left',
    ],
  },
  {
    id: 'actions',
    names: [
      'pencil',
      'trash',
      'checkmark',
      'checkmark.circle',
      'cart',
      'forward.end',
      'square.on.square',
      'arrow.uturn.backward',
      'arrow.triangle.2.circlepath',
    ],
  },
  {
    id: 'nav',
    names: [
      'chevron.left',
      'chevron.right',
      'chevron.up',
      'chevron.down',
      'chevron.up.chevron.down',
      'star',
      'arrow.right.to.bracket',
      'arrow.left.to.bracket',
      'calendar',
      'clock',
      'list.bullet',
      'list.bullet.rectangle',
      'doc.text',
      'exclamationmark.triangle',
    ],
  },
  {
    id: 'domains',
    names: [
      'house',
      'rectangle.3.group',
      'shippingbox',
      'drop',
      'wrench.and.screwdriver',
      'chart.bar',
      'gearshape',
      'square.grid.2x2',
      'person.2',
      'bubble.left',
    ],
  },
]

export const DOMAIN_ICON: Record<string, YlIconName> = {
  'Daily Operations': 'house',
  Ops: 'rectangle.3.group',
  Inventory: 'shippingbox',
  Bookings: 'calendar',
  Cleaning: 'drop',
  Maintenance: 'wrench.and.screwdriver',
  Finance: 'chart.bar',
  Settings: 'gearshape',
  Visual: 'square.grid.2x2',
}

export const PAGE_ICON: Record<string, YlIconName> = {
  'Daily Operations': 'house',
  Inventory: 'shippingbox',
  'Spot Check': 'checkmark.circle',
  Purchases: 'cart',
  Subtractions: 'minus',
  Properties: 'list.bullet.rectangle',
  Reviews: 'star',
  'Unassigned tasks': 'list.bullet',
  'Visit templates': 'doc.text',
  'Template Auto Assign': 'arrow.triangle.2.circlepath',
  Bookings: 'calendar',
  'Bookings Plan': 'list.bullet.rectangle',
  'Bookings settings': 'gearshape',
  'Cleaning Plan': 'drop',
  'Cleaning Incidents': 'exclamationmark.triangle',
  'Cleaning Billing': 'chart.bar',
  'Cleaning settings': 'gearshape',
  'Maintenance Plan': 'wrench.and.screwdriver',
  'Maintenance Incidents': 'exclamationmark.triangle',
  'Maintenance Billing': 'chart.bar',
  'Maintenance settings': 'gearshape',
  Logs: 'clock',
  Users: 'person.crop.circle',
  Roles: 'person.2',
  Slack: 'bubble.left',
  'Property Reports': 'chart.bar',
  'Reports Settings': 'gearshape',
  'Property Groups': 'rectangle.3.group',
  Movements: 'list.bullet',
  'Services & Subscriptions': 'doc.text',
  'Visual Buttons': 'square.grid.2x2',
  'Visual Messages': 'bubble.left',
  'Visual Action bars': 'line.3.horizontal',
  'Visual Cards': 'rectangle.3.group',
  'Visual Inputs': 'pencil',
  'Visual Tokens': 'star',
  'Visual Icons': 'square.grid.2x2',
  'Visual Lab': 'plus',
}

export const ICON_HAS_FILL = new Set<YlIconName>(
  YL_ICON_NAMES.filter((name) => fillGlyph(name) !== null),
)

export function YlIcon({
  name,
  size = 18,
  variant = 'regular',
  className = '',
}: YlIconProps) {
  const filled = variant === 'fill' ? fillGlyph(name) : null
  const content = filled ?? regularGlyph(name)
  return (
    <svg
      className={`yl-icon ${className}`.trim()}
      aria-hidden="true"
      viewBox="0 0 20 20"
      width={size}
      height={size}
    >
      {content}
    </svg>
  )
}

export function YlSortIcon({
  direction = null,
  size = 12,
}: {
  direction?: 'asc' | 'desc' | null
  size?: number
}) {
  const name: YlIconName =
    direction === 'asc'
      ? 'chevron.up'
      : direction === 'desc'
        ? 'chevron.down'
        : 'chevron.up.chevron.down'
  return <YlIcon name={name} size={size} />
}

export function YlDisclosureIcon({
  open = false,
  size = 14,
}: {
  open?: boolean
  size?: number
}) {
  return <YlIcon name={open ? 'chevron.down' : 'chevron.right'} size={size} />
}
