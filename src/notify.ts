/**
 * Erinnerung „Rad zurückgeben" — die einzige Warnung, die auch dann ankommen
 * muss, wenn die App nicht im Vordergrund steht.
 *
 * Bisher lebte sie ausschließlich in `JourneyMode`: ein `useEffect`, der auf
 * die Sekundenanzeige schaut. Bildschirm aus oder App gewechselt, und die
 * 30 Freiminuten liefen unbemerkt ab — genau der Fall, für den es die App gibt.
 *
 * Zwei Wege, je nachdem wo wir laufen:
 *   - Capacitor-App: `LocalNotifications` plant den Alarm im Betriebssystem.
 *     Der kommt an, auch wenn die App längst geschlossen ist.
 *   - Browser: `setTimeout` plus `ServiceWorkerRegistration.showNotification`.
 *     Solange die Seite im Hintergrund lebt, kommt die Meldung. Räumt das
 *     Betriebssystem den Tab ab, kommt sie nicht — ohne eigenen Server und
 *     Push-Dienst geht im Web nicht mehr. Das ist eine bewusste Grenze,
 *     keine Nachlässigkeit.
 */

import { dict } from './i18n'
import type { Language } from './i18n'

/** Kennungen, damit sich Alarme gezielt wieder abräumen lassen. */
const ID_WARN = 4711
const ID_DUE = 4712

let timers: number[] = []
let nativeScheduled = false
/**
 * Zählt die Planungen durch. `LocalNotifications.schedule()` braucht einen
 * dynamischen Import und einen Bridge-Aufruf; wurde in dieser Zeit abgeräumt,
 * lief die alte Planung trotzdem zu Ende und meldete sich später ungefragt.
 */
let generation = 0

function isNative(): boolean {
  return !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
}

/** Darf die App Meldungen zeigen? Fragt im Browser nach, wenn nötig. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const status = await LocalNotifications.checkPermissions()
      if (status.display === 'granted') return true
      const asked = await LocalNotifications.requestPermissions()
      return asked.display === 'granted'
    } catch {
      return false
    }
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

async function showNow(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      // Über den Service Worker, damit die Meldung auch im Hintergrund erscheint
      await reg.showNotification(title, { body, tag: 'radl-return', icon: './icon.svg' })
      return
    }
  } catch {
    // Fällt unten auf die einfache Benachrichtigung zurück
  }
  try {
    new Notification(title, { body })
  } catch {
    // Kein Weg, die Meldung zu zeigen — die Anzeige in der App bleibt ohnehin
  }
}

export interface ReturnReminderOpts {
  /** Sekunden bis zum Ende des Freifensters, ab jetzt gerechnet. */
  secondsLeft: number
  /** Vorwarnung so viele Sekunden vor Schluss. */
  warnBeforeSec?: number
  /** Name der Rückgabestation, falls bekannt — kommt in den Meldungstext. */
  stationName?: string | null
  /** Sprache der Meldung. Sie erscheint außerhalb der App, wo `t()` sonst
   *  nirgends hinreicht — vorher war sie immer deutsch. */
  lang?: Language
}

/**
 * Plant Vorwarnung und Ablaufmeldung. Ein zweiter Aufruf ersetzt die alten
 * Alarme — sonst sammeln sich bei jedem Etappenwechsel weitere an.
 */
export async function scheduleReturnReminders(opts: ReturnReminderOpts): Promise<void> {
  const { secondsLeft, warnBeforeSec = 5 * 60, stationName, lang = 'de' } = opts
  await cancelReturnReminders()
  if (secondsLeft <= 0) return
  const meine = ++generation

  const w = dict[lang] ?? dict.de
  const at = stationName ? w.notifyReturnAt(stationName) : ''
  const warnIn = secondsLeft - warnBeforeSec
  const warnTitle = w.notifyWarnTitle
  const warnBody = w.notifyWarnBody(at)
  const dueTitle = w.notifyDueTitle
  const dueBody = w.notifyDueBody(at)

  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      if (meine !== generation) return // zwischenzeitlich abgeräumt
      const notifications = []
      if (warnIn > 0) {
        notifications.push({
          id: ID_WARN,
          title: warnTitle,
          body: warnBody,
          // `allowWhileIdle`: Android schiebt Alarme im Doze-Modus sonst bis
          // zum nächsten Wartungsfenster — im Zweifel eine Viertelstunde nach
          // Ablauf der Freiminuten, also genau dann, wenn es nichts mehr nützt.
          schedule: { at: new Date(Date.now() + warnIn * 1000), allowWhileIdle: true },
        })
      }
      notifications.push({
        id: ID_DUE,
        title: dueTitle,
        body: dueBody,
        schedule: { at: new Date(Date.now() + secondsLeft * 1000), allowWhileIdle: true },
      })
      nativeScheduled = true
      await LocalNotifications.schedule({ notifications })
      if (meine !== generation) {
        // Abgeräumt, während der Alarm gestellt wurde — sofort zurücknehmen.
        await LocalNotifications.cancel({ notifications: [{ id: ID_WARN }, { id: ID_DUE }] }).catch(() => {})
      }
      return
    } catch {
      // Plugin nicht verfügbar — weiter mit den Browser-Zeitgebern
    }
  }

  if (warnIn > 0) {
    timers.push(window.setTimeout(() => showNow(warnTitle, warnBody), warnIn * 1000))
  }
  timers.push(window.setTimeout(() => showNow(dueTitle, dueBody), secondsLeft * 1000))
}

/** Alle geplanten Erinnerungen abräumen — Etappe vorbei oder Fahrt beendet. */
export async function cancelReturnReminders(): Promise<void> {
  generation++
  for (const id of timers) window.clearTimeout(id)
  timers = []
  if (!nativeScheduled) return
  nativeScheduled = false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({ notifications: [{ id: ID_WARN }, { id: ID_DUE }] })
  } catch {
    // Nichts abzuräumen
  }
}
