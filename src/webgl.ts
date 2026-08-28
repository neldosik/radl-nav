/**
 * Kann dieser Browser WebGL?
 *
 * maplibre-gl braucht es. Fehlt es — altes Android, abgeschaltete
 * Hardwarebeschleunigung, Firmenrichtlinie, manche Energiesparmodi —, wirft
 * `new maplibregl.Map()` im Effekt und React hängt den ganzen Baum aus.
 * `MapGuard` fragt vorher hier nach.
 */

/** Einmal geprüft und gemerkt: der Test kostet einen WebGL-Kontext. */
let webglOk: boolean | null = null

export function hasWebGL(): boolean {
  if (webglOk !== null) return webglOk
  try {
    const c = document.createElement('canvas')
    const gl =
      c.getContext('webgl2') ||
      c.getContext('webgl') ||
      c.getContext('experimental-webgl')
    webglOk = !!gl
    // Kontext sofort wieder freigeben, es gibt nur eine Handvoll davon
    const lose = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
  } catch {
    webglOk = false
  }
  return webglOk
}
