import { useEffect } from 'react'

/**
 * Bildschirm wachhalten, solange `active` gilt.
 *
 * Der gemeldete Fehler „Bildschirm geht unterwegs aus" hat drei Ursachen, die
 * hier alle behandelt werden:
 *
 * 1. Die Screen Wake Lock API gibt den Halter **automatisch frei**, sobald das
 *    Dokument versteckt wird — Bildschirm kurz aus, App gewechselt, Anruf.
 *    Danach kam er nie zurück. Wir fordern ihn bei `visibilitychange` neu an.
 * 2. Der Halter wurde an zwei Stellen gleichzeitig angefordert (Hook und
 *    JourneyMode); der zweite `request()` überschrieb den ersten, und beim
 *    Aufräumen wurde nur einer freigegeben.
 * 3. Safari kennt die API erst ab iOS 16.4. Dafür der Notnagel unten: ein
 *    stumm abspielendes Winzvideo hält den Bildschirm ebenfalls wach.
 *
 * In der Android-Hülle läuft es über `@capacitor-community/keep-awake`
 * (FLAG_KEEP_SCREEN_ON) — zuverlässiger als die Web-API in der WebView.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let released = false
    let sentinel: WakeLockSentinel | null = null
    let native = false
    let fallback: (() => void) | null = null

    const isNative = !!(
      window as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.()

    async function acquire() {
      if (released) return
      if (isNative) {
        try {
          const { KeepAwake } = await import('@capacitor-community/keep-awake')
          await KeepAwake.keepAwake()
          native = true
          return
        } catch {
          // Plugin fehlt oder Gerät kann es nicht — weiter mit der Web-API
        }
      }
      if ('wakeLock' in navigator) {
        try {
          sentinel = await navigator.wakeLock.request('screen')
          if (released) {
            sentinel.release().catch(() => {})
            sentinel = null
          }
          return
        } catch {
          // z. B. Akkusparmodus: verweigert den Halter — Notnagel unten
        }
      }
      if (!fallback) fallback = startVideoFallback()
    }

    // Nach dem Zurückkommen ist der Halter weg — neu anfordern.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel && !native) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
      fallback?.()
      if (native) {
        import('@capacitor-community/keep-awake')
          .then(({ KeepAwake }) => KeepAwake.allowSleep())
          .catch(() => {})
      }
    }
  }, [active])
}

/**
 * Notnagel für Browser ohne Wake Lock API (Safari < 16.4): ein laufendes Video
 * verhindert das Abdunkeln. Das Bild kommt aus einem 2×2-Canvas, damit keine
 * Mediendatei mitgeliefert werden muss.
 */
function startVideoFallback(): (() => void) | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const ctx = canvas.getContext('2d')
    if (!ctx || typeof canvas.captureStream !== 'function') return null

    // Ohne neue Bilder hält Safari den Strom für beendet — einmal pro Sekunde malen.
    const tick = window.setInterval(() => {
      ctx.fillStyle = ctx.fillStyle === '#000000' ? '#010101' : '#000000'
      ctx.fillRect(0, 0, 2, 2)
    }, 1000)

    const video = document.createElement('video')
    video.srcObject = canvas.captureStream(1)
    video.muted = true
    video.playsInline = true
    video.setAttribute('aria-hidden', 'true')
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(video)
    video.play().catch(() => {})

    return () => {
      window.clearInterval(tick)
      video.pause()
      video.srcObject = null
      video.remove()
    }
  } catch {
    return null
  }
}
