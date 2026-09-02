import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import '@aws-amplify/ui-react/styles.css'
import { Authenticator } from '@aws-amplify/ui-react'
import './i18n'
import './index.css'
import App from './App.tsx'

function AuthHeader() {
  return (
    <div className="auth-brand">
      <img src="/Yalla_logo/full_logo.png" alt="Yalla!" />
    </div>
  )
}

const loadAmplifyOutputs = async () => {
  // Prefer runtime file when present (Amplify Hosting copies it into dist).
  // Fall back to the build-time import so auth still works if the file 404s.
  try {
    const response = await fetch('/amplify_outputs.json', { cache: 'no-store' })
    if (response.ok) {
      return (await response.json()) as Record<string, unknown>
    }
  } catch {
    // Ignore network/404; use bundled outputs below.
  }
  return outputs as Record<string, unknown>
}

const loadAmplifyConfigFromEnv = () => {
  const region = import.meta.env.VITE_AWS_REGION
  const userPoolId = import.meta.env.VITE_USER_POOL_ID
  const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID
  const identityPoolId = import.meta.env.VITE_IDENTITY_POOL_ID

  if (!region || !userPoolId || !userPoolClientId) {
    return {}
  }

  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        identityPoolId: identityPoolId || undefined,
        region,
      },
    },
  }
}

const startApp = async () => {
  const amplifyOutputs = await loadAmplifyOutputs()
  const envConfig = loadAmplifyConfigFromEnv()
  const hasOutputs = Object.keys(amplifyOutputs).length > 0
  Amplify.configure(hasOutputs ? amplifyOutputs : envConfig)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Authenticator components={{ Header: AuthHeader }}>
        <App />
      </Authenticator>
    </StrictMode>,
  )
}

void startApp()
