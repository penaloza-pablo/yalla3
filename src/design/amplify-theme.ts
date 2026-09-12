import { createTheme } from '@aws-amplify/ui-react'

/** Amplify Authenticator tokens aligned with Yalla + Knock Knock greens. */
export const yallaAuthTheme = createTheme({
  name: 'yalla',
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: '#eef3f2' },
          20: { value: '#d5e0de' },
          40: { value: '#8aa3a0' },
          60: { value: '#5c7a77' },
          80: { value: '#3D5B58' },
          90: { value: '#2f4846' },
          100: { value: '#243835' },
        },
      },
      font: {
        primary: { value: '#415364' },
        secondary: { value: '#5b6b78' },
      },
      background: {
        primary: { value: '#f4f6f8' },
        secondary: { value: '#ffffff' },
      },
    },
    radii: {
      small: { value: '10px' },
      medium: { value: '16px' },
      large: { value: '20px' },
    },
    fonts: {
      default: {
        variable: {
          value:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        },
        static: {
          value:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        },
      },
    },
  },
})
