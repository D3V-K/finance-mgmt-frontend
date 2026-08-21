import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'
import { apiClient } from '@/api/client'

vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn() }))

const mockedSession = vi.mocked(fetchAuthSession)

describe('apiClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('attaches the current Cognito ID token to each request', async () => {
    mockedSession.mockResolvedValue({ tokens: { idToken: { toString: () => 'current-token' } } } as never)
    let authorization: string | undefined

    await apiClient.get('/test', {
      adapter: async (config): Promise<AxiosResponse> => {
        authorization = config.headers.get('Authorization') as string | undefined
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      },
    })

    expect(authorization).toBe('Bearer current-token')
    expect(mockedSession).toHaveBeenCalledOnce()
  })

  it('normalizes unauthorized responses without retrying the request', async () => {
    mockedSession.mockResolvedValue({ tokens: { idToken: { toString: () => 'expired' } } } as never)
    let requests = 0

    const request = apiClient.get('/private', {
      adapter: async (config: InternalAxiosRequestConfig) => {
        requests += 1
        const response = { data: { detail: 'Not authenticated' }, status: 401, statusText: 'Unauthorized', headers: {}, config }
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response)
      },
    })

    await expect(request).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
    expect(requests).toBe(1)
  })

  it('distinguishes validation and network failures', async () => {
    mockedSession.mockResolvedValue({} as never)
    const validation = apiClient.post('/test', {}, {
      adapter: async (config) => {
        const response = { data: { detail: [{ msg: 'Invalid amount' }] }, status: 422, statusText: '', headers: {}, config }
        throw new AxiosError('invalid', 'ERR_BAD_REQUEST', config, undefined, response)
      },
    })
    await expect(validation).rejects.toMatchObject({ kind: 'validation', message: 'Invalid amount' })

    const network = apiClient.get('/test', {
      adapter: async (config) => { throw new AxiosError('offline', 'ERR_NETWORK', config) },
    })
    await expect(network).rejects.toMatchObject({ kind: 'network' })
  })
})
