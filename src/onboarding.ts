/**
 * Ob die Einführung schon gelaufen ist.
 *
 * Eigenes Modul, damit die Bedingung prüfbar ist, ohne eine Ansicht zu bauen:
 * „erscheint genau einmal" ist die einzige Anforderung, die hier schiefgehen
 * kann, und sie ginge in einer Komponente unter.
 */
const SCHLUESSEL = 'radl.onboarding'

export function einfuehrungGesehen(): boolean {
  try {
    return localStorage.getItem(SCHLUESSEL) === 'ja'
  } catch {
    // Kein Speicher (privater Modus): dann lieber jedes Mal zeigen als gar
    // nicht — die Erklärung vor der Standortabfrage ist der Zweck.
    return false
  }
}

export function einfuehrungAbhaken(): void {
  try {
    localStorage.setItem(SCHLUESSEL, 'ja')
  } catch {
    // s. o.
  }
}
