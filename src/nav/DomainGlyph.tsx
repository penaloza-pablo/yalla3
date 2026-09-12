import { YlIcon, DOMAIN_ICON } from '../design/icons'

type DomainGlyphProps = {
  name: string
}

export function DomainGlyph({ name }: DomainGlyphProps) {
  return <YlIcon name={DOMAIN_ICON[name] ?? 'list.bullet'} size={18} variant="fill" />
}
