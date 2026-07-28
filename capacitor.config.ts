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
    StatusBar: {
      // edge-to-edge: die Karte läuft bis unter die Uhr, lesbar über den
      // Verlauf oben; useTheme setzt Stil und Durchsichtigkeit beim Start nach
      overlaysWebView: true,
      backgroundColor: '#00000000',
    },
  },
}

export default config
