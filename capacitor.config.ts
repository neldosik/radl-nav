import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'de.radlnavi.app',
  appName: 'Radl Navi',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      // Startwert = helles Papier; beim Themenwechsel setzt useTheme die Farbe nach
      backgroundColor: '#f4f1ea',
    },
  },
}

export default config
