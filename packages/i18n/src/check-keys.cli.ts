import { checkKeys } from './check-keys.ts'
import { LOCALES, SOURCE_LOCALE, loadMessages, type Messages } from './locales.ts'

const locales: Record<string, Messages> = {}
for (const locale of LOCALES) locales[locale] = await loadMessages(locale)

const errors = checkKeys(locales[SOURCE_LOCALE] as Messages, locales)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`i18n: ${LOCALES.length} locales with the same keys`)
