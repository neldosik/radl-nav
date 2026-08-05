import { fahrtLaeuft } from './miete'

/**
 * Selbstaktualisierung der Android-Hülle.
 *
 * ## Warum überhaupt
 *
 * Im Browser aktualisiert sich die App längst allein: der Service Worker holt
 * den neuen Stand und `controllerchange` in `main.tsx` lädt neu. In der Hülle
 * ist der Worker bewusst abgeschaltet — er legte sich vor die Auslieferung
 * durch Capacitor und schnitt damit die Brücke zu den Plugins ab, woran die
 * Ortung scheiterte. Der Preis dafür war, dass in der Hülle der Stand vom Tag
 * der APK-Erstellung eingefroren blieb: jede Änderung, und sei es eine Zeile
 * Text, verlangte eine neue APK von Hand.
 *
 * Hier holt die Hülle stattdessen den gebauten Webteil als Paket nach. Der
 * native Teil bleibt, wie er ist — eine neue APK braucht es nur noch, wenn
 * sich Plugins, Berechtigungen oder Capacitor selbst ändern. Das passiert
 * ein-, zweimal im Jahr; alles andere ist Web.
 *
 * ## Warum kein Dienst dahinter
 *
 * `@capgo/capacitor-updater` kann sich seinen Stand bei einem eigenen Server
 * holen. Braucht es hier nicht: `deploy.sh` legt neben den Deploy auf
 * GitHub Pages eine `updates.json` und ein Zip. Beides sind statische
 * Dateien — es gibt keinen Dienst, der ausfallen, ablaufen oder kosten kann.
 * Deshalb steht der Plugin-Selbstlauf auf `autoUpdate: false` und die paar
 * Zeilen Ablauf stehen hier.
 *
 * ## Zwei Vorsichtsmaßnahmen
 *
 * **Der neue Stand wird nie sofort eingesetzt.** `next()` statt `set()`: das
 * Paket wird geladen und beim *nächsten* Start gültig. `set()` lädt die
 * Oberfläche augenblicklich neu — mitten in der Navigation, an einer Kreuzung,
 * und die Uhr der laufenden Ausleihe wäre dahin. Aus demselben Grund prüft
 * schon der Service-Worker-Zweig in `main.tsx` auf `fahrtLaeuft()`. Hier wird
 * während einer Fahrt gar nicht erst geladen — Mobilfunk auf dem Rad ist ein
 * schlechter Ort für 3 MB.
 *
 * **Ein kaputtes Paket rollt sich selbst zurück.** Meldet sich der neue Stand
 * nicht binnen `appReadyTimeout` mit `notifyAppReady()`, verwirft das Plugin
 * ihn und startet den vorherigen. Ohne diesen Handschlag wäre ein fehlerhaftes
 * Deployment ein Telefon, das nur noch über Neuinstallation zu retten ist —
 * und deployt wird hier ohne Zwischenstufe, direkt auf das eigene Gerät.
 * `appBereitMelden()` ist deshalb kein Beiwerk, sondern die Bremse.
 */

/** Wo `deploy.sh` den Stand hinterlegt. Absolut, denn die Hülle liegt auf
 *  ihrem eigenen `https://localhost` und kennt keine gemeinsame Herkunft. */
const MANIFEST_URL = 'https://neldosik.github.io/radl-nav/updates.json'

/** Höchstens einmal pro Stunde nachsehen. */
const PAUSE_MS = 60 * 60_000

/** Was in `updates.json` steht. */
export interface Standmeldung {
  version: string
  url: string
}

export type Ergebnis = 'aus' | 'aktuell' | 'geladen' | 'liegt-bereit' | 'fehler'

let zuletztGesehen = 0

/** Läuft die App in der Android-Hülle? */
function inHuelle(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/** Datensparmodus oder sehr langsame Verbindung — dann kein Paket auf Verdacht. */
function schlechteLeitung(): boolean {
  const netz = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (netz?.saveData) return true
  return !!netz?.effectiveType && /(^|-)2g/.test(netz.effectiveType)
}

/**
 * Prüfen, ob `meldung` einen anderen Stand nennt als `laufend` — und ob er
 * nicht schon heruntergeladen danebenliegt.
 *
 * Ausgelagert, weil das die einzige Entscheidung mit Regeln ist und der Rest
 * nur Plugin-Aufrufe sind, die sich am Schreibtisch nicht ausführen lassen.
 */
export function brauchtPaket(
  meldung: Standmeldung | null,
  laufend: string | undefined,
  bereits: { version: string; status: string }[] = [],
): Ergebnis {
  if (!meldung?.version || !meldung.url) return 'fehler'
  if (meldung.version === laufend) return 'aktuell'
  // Schon geladen und wartet auf den nächsten Start — nicht noch einmal holen.
  const da = bereits.find(b => b.version === meldung.version)
  if (da && da.status !== 'error' && da.status !== 'deleted') return 'liegt-bereit'
  return 'geladen'
}

/**
 * Dem Plugin sagen, dass der Stand läuft. Ohne diesen Aufruf gilt er als
 * kaputt und wird beim nächsten Start verworfen — siehe oben.
 */
export async function appBereitMelden(): Promise<void> {
  if (!inHuelle()) return
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    await CapacitorUpdater.notifyAppReady()
  } catch {
    // Fehlt das Plugin (alte APK), ist nichts zu melden.
  }
}

/** Nachsehen und gegebenenfalls holen. Der Stand gilt ab dem nächsten Start. */
export async function nachAktualisierungSehen(erzwingen = false): Promise<Ergebnis> {
  if (!inHuelle()) return 'aus'
  if (fahrtLaeuft()) return 'aus'
  if (!erzwingen && schlechteLeitung()) return 'aus'
  if (!erzwingen && Date.now() - zuletztGesehen < PAUSE_MS) return 'aus'
  zuletztGesehen = Date.now()

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const [antwort, jetzt, liste] = await Promise.all([
      fetch(MANIFEST_URL, { cache: 'no-store' }),
      CapacitorUpdater.current(),
      CapacitorUpdater.list().catch(() => ({ bundles: [] })),
    ])
    if (!antwort.ok) return 'fehler'
    const meldung = (await antwort.json()) as Standmeldung

    const was = brauchtPaket(meldung, jetzt.bundle.version, liste.bundles)
    if (was !== 'geladen') return was

    const paket = await CapacitorUpdater.download({ url: meldung.url, version: meldung.version })
    // Nicht `set()`: der Stand wird beim nächsten Start gültig, nicht jetzt.
    await CapacitorUpdater.next({ id: paket.id })
    return 'geladen'
  } catch {
    // Kein Netz, kaputtes Manifest, fehlendes Plugin — alles derselbe Fall:
    // die App läuft mit dem Stand weiter, den sie hat.
    return 'fehler'
  }
}

/**
 * Bericht für die Diagnose: was läuft, was liegt bereit, was sagt der Server.
 *
 * Ohne das ist die Selbstaktualisierung auf dem Gerät nicht zu prüfen. „Bei
 * mir hat sich nichts geändert" hätte drei mögliche Ursachen — das Paket ist
 * nicht angekommen, es liegt noch und wartet auf den Neustart, oder es läuft
 * längst und die Änderung war eine andere. Von außen sehen alle drei gleich
 * aus. Der Knopf erzwingt außerdem eine Prüfung, ohne die Stundenpause und
 * ohne auf das Zurückkehren zur App zu warten.
 */
export async function aktualisierungBericht(): Promise<string> {
  if (!inHuelle()) {
    return 'web — hier hält der Service Worker den Stand aktuell, nicht der Aktualisierer.'
  }
  const zeilen: string[] = []
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
    const jetzt = await CapacitorUpdater.current()
    zeilen.push(`läuft      ${jetzt.bundle.version}  (eingebaut ${jetzt.native})`)

    const was = await nachAktualisierungSehen(true)
    zeilen.push(`prüfung    ${was}`)

    const antwort = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (antwort.ok) {
      const m = (await antwort.json()) as Standmeldung & { commit?: string; built?: string }
      zeilen.push(`server     ${m.version}  ${m.commit ?? ''} ${m.built ?? ''}`.trimEnd())
    } else {
      zeilen.push(`server     nicht erreichbar (${antwort.status})`)
    }

    const liste = await CapacitorUpdater.list().catch(() => ({ bundles: [] }))
    const wartend = liste.bundles.filter(b => b.version !== jetzt.bundle.version)
    zeilen.push(
      wartend.length
        ? `wartet     ${wartend.map(b => `${b.version} (${b.status})`).join(', ')} — gilt ab dem nächsten Start`
        : 'wartet     nichts',
    )
  } catch (e) {
    zeilen.push(`Fehler: ${(e as Error)?.message ?? e}`)
    zeilen.push('(fehlt das Plugin, stammt diese APK von vor der Selbstaktualisierung)')
  }
  return zeilen.join('\n')
}

/** Beim Start melden und danach beim Zurückkehren zur App nachsehen. */
export function aktualisierungBeobachten(): void {
  if (!inHuelle()) return
  void appBereitMelden()
  void nachAktualisierungSehen()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void nachAktualisierungSehen()
  })
}
