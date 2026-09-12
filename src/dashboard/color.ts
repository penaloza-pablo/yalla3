const TOKEN_HEX: Record<string, string> = {
  'var(--yl-go)': '#3d5b58',
  'var(--yl-energy)': '#c45c4e',
  'var(--yl-kk-human)': '#e3b9b3',
  'var(--yl-kk-sky)': '#a1b1c8',
  'var(--yl-ink)': '#415364',
  'var(--yl-success)': '#027a48',
  'var(--yl-warning)': '#b54708',
  'var(--yl-danger)': '#b42318',
  'var(--yl-fill)': '#eef3f2',
  'var(--yl-go-soft)': '#eef3f2',
}

const parseRgb = (value: string) => {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) {
    return null
  }
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  }
}

const parseHex = (value: string) => {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    }
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex[1] + hex[1], 16),
      g: Number.parseInt(hex[2] + hex[2], 16),
      b: Number.parseInt(hex[3] + hex[3], 16),
    }
  }
  return null
}

export const swatchToHex = (swatch: string) => {
  const trimmed = swatch.trim()
  const mapped = TOKEN_HEX[trimmed]
  if (mapped) {
    return mapped
  }
  const hex = parseHex(trimmed)
  if (hex) {
    const to = (channel: number) => channel.toString(16).padStart(2, '0')
    return `#${to(hex.r)}${to(hex.g)}${to(hex.b)}`
  }
  const rgb = parseRgb(trimmed)
  if (rgb) {
    const to = (channel: number) => channel.toString(16).padStart(2, '0')
    return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`
  }
  return '#3d5b58'
}

export const colorNeedsInk = (swatch: string) => {
  const rgb = parseHex(swatchToHex(swatch))
  if (!rgb) {
    return false
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.62
}
