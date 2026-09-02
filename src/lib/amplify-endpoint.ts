import { Amplify } from 'aws-amplify'
import outputs from '../../amplify_outputs.json'

export const getAmplifyEndpoint = (key: string, fallback?: string) => {
  const config = Amplify.getConfig() as { custom?: Record<string, string> }
  const outputCustom = (outputs as { custom?: Record<string, string> }).custom
  const fromAmplify = config.custom?.[key] ?? outputCustom?.[key]
  const preferEnv = import.meta.env.VITE_PREFER_ENV_ENDPOINTS === 'true'
  if (preferEnv && fallback) {
    return fallback
  }
  return fromAmplify ?? (fallback || undefined)
}
