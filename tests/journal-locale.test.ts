import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getJournalLocale, setJournalLocale } from '@/lib/server/journal-locale'

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}))

describe('journal language preference', () => {
  beforeEach(() => {
    cookieStore.get.mockReset()
    cookieStore.set.mockReset()
  })

  it.each([
    [undefined, 'de'],
    ['fr', 'de'],
    ['de', 'de'],
    ['en', 'en'],
  ])('resolves a stored value of %s to %s', async (stored, expected) => {
    cookieStore.get.mockReturnValue(stored === undefined ? undefined : { value: stored })

    await expect(getJournalLocale()).resolves.toBe(expected)
    expect(cookieStore.get).toHaveBeenCalledWith('equora-journal-language')
  })

  it.each(['de', 'en'])('stores %s as a browser preference', async (locale) => {
    await setJournalLocale(locale)

    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith('equora-journal-language', locale, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 31_536_000,
    })
  })

  it('preserves the current preference when a submission is missing or invalid', async () => {
    await setJournalLocale(null)
    await setJournalLocale('fr')
    await setJournalLocale(new File([], 'en'))

    expect(cookieStore.set).not.toHaveBeenCalled()
  })
})
