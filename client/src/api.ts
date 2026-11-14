export type Account = { email: string; roles: string[] }
export const statuses = ['Planned', 'Active', 'Completed'] as const
export type ProjectInput = { name: string; client: string; status: typeof statuses[number] }
export type Project = ProjectInput & { id: number; createdAt: string }
export type Page = { items: Project[]; total: number; page: number; pageSize: number }
export type Summary = { total: number; active: number; completed: number }

type Problem = { title?: string; detail?: string; errors?: Record<string, string[]> }
export class ApiError extends Error {
  constructor(public status: number, public problem: Problem) {
    super(problem.detail || problem.title || `Request failed (${status}).`)
  }
}
export const message = (error: unknown) => error instanceof ApiError ? error.message : 'Could not reach the workspace. Please try again.'

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' }
  if (method !== 'GET') {
    // Get a token for the current identity; signing in and out changes it.
    headers['X-CSRF-Token'] = (await api<{ token: string }>('/auth/csrf')).token
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch('/api' + path, { method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('relay:expired'))
    throw new ApiError(response.status, await response.json().catch(() => ({})))
  }
  return response.status === 204 ? undefined as T : await response.json() as T
}
