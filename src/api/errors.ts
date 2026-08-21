import axios from 'axios'

export type ApiErrorKind =
  | 'unauthorized'
  | 'validation'
  | 'network'
  | 'not-found'
  | 'server'
  | 'unknown'

interface FastApiErrorBody {
  detail?: string | Array<{ loc?: Array<string | number>; msg: string; type?: string }>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function messageFromBody(body: FastApiErrorBody | undefined, fallback: string) {
  if (typeof body?.detail === 'string') return body.detail
  if (Array.isArray(body?.detail)) return body.detail.map((item) => item.msg).join(', ')
  return fallback
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!axios.isAxiosError(error)) {
    return new ApiError(error instanceof Error ? error.message : 'An unexpected error occurred.', 'unknown')
  }

  if (!error.response) {
    return new ApiError('Unable to reach the server.', 'network', undefined, error)
  }

  const status = error.response.status
  const body = error.response.data as FastApiErrorBody | undefined
  const message = messageFromBody(body, error.message || 'The request failed.')
  if (status === 401) return new ApiError(message, 'unauthorized', status, body)
  if (status === 400 || status === 409 || status === 422) {
    return new ApiError(message, 'validation', status, body)
  }
  if (status === 404) return new ApiError(message, 'not-found', status, body)
  if (status >= 500) return new ApiError(message, 'server', status, body)
  return new ApiError(message, 'unknown', status, body)
}

export function isApiError(error: unknown, kind?: ApiErrorKind): error is ApiError {
  return error instanceof ApiError && (kind === undefined || error.kind === kind)
}
