import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // This dashboard intentionally hydrates persisted UI state and starts
      // polling subscriptions from effects. These are valid synchronization
      // effects, not render-derived state.
      'react-hooks/set-state-in-effect': 'off',
      // Skeleton widths are decorative and do not affect application data.
      'react-hooks/purity': 'off',
      // Camera MJPEG streams and runtime base64 evidence cannot use the Next
      // image optimizer; it would buffer or reject these continuously changing URLs.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
