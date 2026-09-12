export const BRAND_LOGO_SRC = '/brand/yalla-logo.png'
export const BRAND_MARK_SRC = '/brand/yalla-mark.png'

type BrandMarkProps = {
  compact?: boolean
  className?: string
}

export function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  return (
    <img
      className={`brand-logo ${compact ? 'brand-logo-mark' : 'brand-logo-full'} ${className}`.trim()}
      src={compact ? BRAND_MARK_SRC : BRAND_LOGO_SRC}
      alt="Yalla!"
    />
  )
}
