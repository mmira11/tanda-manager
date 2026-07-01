import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../utils/github', () => ({
  loadGitHubToken: vi.fn(() => 'tok_test'),
  saveGitHubToken: vi.fn(),
  publishToGitHub: vi.fn(),
}))

import { loadGitHubToken, publishToGitHub } from '../utils/github'
import { usePublish } from '../hooks/usePublish'

const store = { lastModified: 5000, config: {}, participants: [], rounds: [] }

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  loadGitHubToken.mockReturnValue('tok_test')
})

describe('usePublish', () => {
  it('reports unpublished changes when store is newer than last publish', () => {
    localStorage.setItem('tanda_last_published', '1000')
    const { result } = renderHook(() => usePublish(store))
    expect(result.current.hasUnpublishedChanges).toBe(true)
  })

  it('publish success records timestamp and sets ok status', async () => {
    publishToGitHub.mockResolvedValueOnce()
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(result.current.status).toBe('ok')
    expect(localStorage.getItem('tanda_last_published')).toBe('5000')
    expect(result.current.hasUnpublishedChanges).toBe(false)
  })

  it('publish failure sets error status and message', async () => {
    publishToGitHub.mockRejectedValueOnce(new Error('Bad credentials'))
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('Bad credentials')
  })

  it('does nothing without a token', async () => {
    loadGitHubToken.mockReturnValue('')
    const { result } = renderHook(() => usePublish(store))
    await act(() => result.current.publish())
    expect(publishToGitHub).not.toHaveBeenCalled()
  })
})
