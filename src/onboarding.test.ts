// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { einfuehrungAbhaken, einfuehrungGesehen } from './onboarding'

beforeEach(() => localStorage.clear())

describe('Einführung', () => {
  it('erscheint beim ersten Start', () => {
    expect(einfuehrungGesehen()).toBe(false)
  })

  it('erscheint danach nicht wieder', () => {
    einfuehrungAbhaken()
    expect(einfuehrungGesehen()).toBe(true)
  })

  it('lässt sich von fremden Werten nicht täuschen', () => {
    for (const w of ['', 'nein', 'true', '1']) {
      localStorage.setItem('radl.onboarding', w)
      expect(einfuehrungGesehen()).toBe(false)
    }
  })
})
