/**
 * Text in die Zwischenablage legen — auch dort, wo es die moderne Schnittstelle
 * nicht gibt.
 *
 * `navigator.clipboard` verlangt einen sicheren Kontext. Die Diagnose wird aber
 * genau dann gebraucht, wenn etwas ungewöhnlich ist: eine Hülle mit
 * `http://localhost`, eine eingebettete Webansicht, ein Gerät ohne
 * Berechtigung. Fällt das Kopieren dort aus, muss der Nutzer die Zahlen
 * abtippen — und tut es nicht.
 *
 * Der alte Weg über ein unsichtbares Feld und `execCommand('copy')` ist
 * überall vorhanden. Er ist abgekündigt, aber nicht entfernt, und als zweiter
 * Versuch kostet er nichts.
 */
export async function inZwischenablage(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Weiter mit dem alten Weg.
  }

  try {
    const feld = document.createElement('textarea')
    feld.value = text
    // Außerhalb des Bildes, aber im Dokument: nur was gerendert wird, lässt
    // sich auswählen. `readOnly` verhindert, dass Mobilbrowser die Tastatur
    // aufklappen.
    feld.setAttribute('readonly', '')
    feld.style.cssText = 'position:fixed;top:-1000px;opacity:0'
    document.body.appendChild(feld)
    feld.select()
    const ok = document.execCommand('copy')
    feld.remove()
    return ok
  } catch {
    return false
  }
}
