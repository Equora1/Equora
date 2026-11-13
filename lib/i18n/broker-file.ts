import type { JournalLocale } from '@/lib/i18n/journal'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'

export function getBrokerFileImportCopy(locale: JournalLocale) {
  if (locale === 'en') {
    return {
      preview: 'Preview file',
      blocked: 'Import unavailable',
      reason: 'You can preview the file. Saving trades from a file is unavailable.',
    }
  }

  return {
    preview: brokerFileImportCapability.previewActionLabel,
    blocked: brokerFileImportCapability.blockedActionLabel,
    reason: brokerFileImportCapability.blockedReason,
  }
}
