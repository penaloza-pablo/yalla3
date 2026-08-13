import { fetchAuthSession } from 'aws-amplify/auth'

const withAuthHeaders = async (init?: RequestInit): Promise<RequestInit> => {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) {
    return init ?? {}
  }
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

export const authFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => fetch(input, await withAuthHeaders(init))
