// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { inZwischenablage } from './zwischenablage'

function clipboardSetzen(wert: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: wert,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  clipboardSetzen(undefined)
  vi.restoreAllMocks()
})

describe('inZwischenablage', () => {
  it('nimmt die moderne Schnittstelle, wenn es sie gibt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboardSetzen({ writeText })

    expect(await inZwischenablage('abc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('abc')
  })

  it('fällt auf execCommand zurück, wenn die Schnittstelle fehlt', async () => {
    const copy = vi.fn().mockReturnValue(true)
    document.execCommand = copy

    expect(await inZwischenablage('abc')).toBe(true)
    expect(copy).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('fällt auf execCommand zurück, wenn die Berechtigung fehlt', async () => {
    clipboardSetzen({ writeText: vi.fn().mockRejectedValue(new Error('verboten')) })
    document.execCommand = vi.fn().mockReturnValue(true)

    expect(await inZwischenablage('abc')).toBe(true)
  })

  it('meldet false, wenn auch der alte Weg nicht geht', async () => {
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error('nicht erlaubt')
    })

    expect(await inZwischenablage('abc')).toBe(false)
  })
})
