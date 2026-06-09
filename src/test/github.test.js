import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPublicData } from '../utils/github'

describe('fetchPublicData', () => {
  afterEach(() => vi.restoreAllMocks())

  it('appends a cache-busting timestamp to the fetch URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', mockFetch)
    await fetchPublicData()
    const calledUrl = mockFetch.mock.calls[0][0]
    expect(calledUrl).toMatch(/\?t=\d+$/)
  })
})
