import { fetchAuthSession } from 'aws-amplify/auth'

const readToken = async (forceRefresh = false) => {
  const session = await fetchAuthSession({ forceRefresh })
  return (
    session.tokens?.idToken?.toString() ||
    session.tokens?.accessToken?.toString() ||
    ''
  )
}

const withAuthHeaders = async (init?: RequestInit): Promise<RequestInit> => {
  let token = await readToken()
  if (!token) {
    token = await readToken(true)
  }
  if (!token) {
    throw new Error(
      'Missing Cognito session token. Sign in again and retry.',
    )
  }
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

export const authFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => fetch(input, await withAuthHeaders(init))
