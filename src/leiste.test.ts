// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { leisteMessen } from './leiste'

/**
 * Der Sinn dieser Datei: die reservierte Höhe darf nicht mehr geraten werden.
 * Vorher stand `calc(63px + …)` im Blatt — eine zweite Fassung derselben Zahl,
 * die auf einem Gerät mit 24 Punkt Sicherheitsabstand 18 Punkte danebenlag.
 */

function leiste(hoehe: number): HTMLElement {
  const el = document.createElement('nav')
  el.getBoundingClientRect = () => ({ height: hoehe }) as DOMRect
  document.body.appendChild(el)
  return el
}

const gesetzt = () => document.documentElement.style.getPropertyValue('--tabbar-h')

afterEach(() => {
  leisteMessen(null)
  document.body.innerHTML = ''
})

describe('leisteMessen', () => {
  it('schreibt die gemessene Höhe', () => {
    leisteMessen(leiste(79))
    expect(gesetzt()).toBe('79px')
  })

  it('rundet auf ganze Punkte — halbe Pixel ergeben eine Haarlinie', () => {
    leisteMessen(leiste(78.6))
    expect(gesetzt()).toBe('79px')
  })

  it('räumt beim Aushängen auf, damit wieder die Formel aus dem Blatt gilt', () => {
    leisteMessen(leiste(79))
    leisteMessen(null)
    expect(gesetzt()).toBe('')
  })

  it('schreibt keine 0 — eine noch nicht vermessene Leiste würde den Platz verschlucken', () => {
    leisteMessen(leiste(0))
    expect(gesetzt()).toBe('')
  })

  it('folgt einem Wechsel der Leiste, etwa beim Reiterwechsel', () => {
    leisteMessen(leiste(79))
    leisteMessen(leiste(96))
    expect(gesetzt()).toBe('96px')
  })
})
