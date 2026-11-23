import { useAuthStore } from '../stores/auth-store'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

type RequestOptions = RequestInit & {
  token?: string | null
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}) {
  const stateToken = useAuthStore.getState().token
  const token = options.token ?? stateToken
  const headers = new Headers(options.headers)

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const auth = useAuthStore.getState()
    if (response.status === 401 && path !== '/auth/login' && token && auth.token === token) {
      auth.clearSession()
    }
    const body = await response.text()
    let message = body
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed?.message === 'string') message = parsed.message
      if (Array.isArray(parsed?.message)) message = parsed.message.join('，')
    } catch {
      // Some gateways return plain text instead of a JSON response.
    }
    throw new Error(message || '请求失败')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function uploadFetch<T>(
  path: string,
  formData: FormData,
  token?: string | null,
) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: formData,
    token,
  })
}
