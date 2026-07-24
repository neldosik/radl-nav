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
      backgroundColor: '#ec3013',
    },
  },
}

export default config
