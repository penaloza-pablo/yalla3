import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from "../amplify_outputs.json";
import '@aws-amplify/ui-react/styles.css'
import { Authenticator } from '@aws-amplify/ui-react'
import './index.css'
import App from './App.tsx'

const loadAmplifyOutputs = async () => {
  try {
    const response = await fetch('/amplify_outputs.json')
    if (response.ok) {
      return (await response.json()) as Record<string, unknown>
    }
  } catch {
    // No-op: fallback to empty config for non-Amplify builds.
  }
  return {}
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
  const outputs = await loadAmplifyOutputs()
  const envConfig = loadAmplifyConfigFromEnv()
  const hasOutputs = Object.keys(outputs).length > 0
  Amplify.configure(hasOutputs ? outputs : envConfig)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <Authenticator>
    <App />
      </Authenticator>
  </StrictMode>,
)
}

void startApp()
