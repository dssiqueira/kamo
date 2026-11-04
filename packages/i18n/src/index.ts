import i18next, { type i18n } from 'i18next'
import ICU from 'i18next-icu'
import { SOURCE_LOCALE, loadMessages, type Locale, type Messages } from './locales.ts'

export * from './format.ts'
export * from './locales.ts'

/**
 * Creates an isolated i18next instance with ICU MessageFormat, loading only the requested
 * language and English (fallback). Switch language without restarting: `changeLocale`.
 */
export async function createI18n(locale: Locale): Promise<i18n> {
  const instance = i18next.createInstance()
  await instance.use(ICU).init({
    lng: locale,
    fallbackLng: SOURCE_LOCALE,
    resources: await resourcesFor(locale),
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return instance
}

export async function changeLocale(instance: i18n, locale: Locale): Promise<void> {
  if (!instance.hasResourceBundle(locale, 'translation')) {
    instance.addResourceBundle(locale, 'translation', await loadMessages(locale))
  }
  await instance.changeLanguage(locale)
}

async function resourcesFor(locale: Locale) {
  const resources: Partial<Record<Locale, { translation: Messages }>> = {
    [SOURCE_LOCALE]: { translation: await loadMessages(SOURCE_LOCALE) },
  }
  if (locale !== SOURCE_LOCALE) resources[locale] = { translation: await loadMessages(locale) }
  return resources
}
