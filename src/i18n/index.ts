import { createI18n } from 'vue-i18n'
import { messages } from './messages'

let savedLocale: 'es' | 'en' = 'es'
const rawPreferences = localStorage.getItem('pokeplan.v1.preferences')

if (rawPreferences) {
  try {
    const parsed = JSON.parse(rawPreferences) as { locale?: 'es' | 'en' }
    if (parsed.locale === 'es' || parsed.locale === 'en') {
      savedLocale = parsed.locale
    }
  } catch {
    savedLocale = 'es'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'es',
  messages,
})
