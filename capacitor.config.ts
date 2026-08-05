import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'de.radlnavi.app',
  appName: 'Radl Navi',
  webDir: 'dist',
  server: {
    // Kein `cleartext`: die Hülle liefert über https aus, und offenes HTTP
    // wird von uns nirgends aufgerufen. Die Erlaubnis stand nur da.
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      // Kein Selbstlauf: der Ablauf steht in src/aktualisierung.ts und holt
      // sich seinen Stand aus einer statischen updates.json auf GitHub Pages.
      // Ein Dienst dahinter wäre eine weitere Sache, die ausfallen kann.
      autoUpdate: false,
      // Meldet sich ein frisch eingesetzter Stand nicht binnen 10 Sekunden mit
      // notifyAppReady(), gilt er als kaputt und der vorherige kommt zurück.
      // Ohne das wäre ein fehlerhaftes Deployment ein Telefon, das nur noch
      // die Neuinstallation rettet — und deployt wird hier ohne Zwischenstufe.
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // Nach einer neuen APK gilt wieder der eingebaute Stand. Sonst überlebte
      // ein alter Webteil die native Aktualisierung und liefe gegen Plugins,
      // die er nicht kennt.
      resetWhenUpdate: true,
    },
    StatusBar: {
      // edge-to-edge: die Karte läuft bis unter die Uhr, lesbar über den
      // Verlauf oben; useTheme setzt Stil und Durchsichtigkeit beim Start nach
      overlaysWebView: true,
      backgroundColor: '#00000000',
    },
  },
}

export default config
