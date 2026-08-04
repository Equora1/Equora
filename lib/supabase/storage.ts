import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getSupabaseSetupImagePath, getSupabaseTradeScreenshotPath } from '@/lib/utils/storage-paths'
import type { SetupMediaUploadInput, TradeMediaUploadInput } from '@/lib/types/media'
import { EQUORA_MEDIA_BUCKET, EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS } from '@/lib/utils/media-security'
import { registerPendingMediaUploads, requestUncommittedMediaCleanup } from '@/app/actions/media-cleanup'

const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024
const MAX_MEDIA_PER_OPERATION = 12
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function ensureStorageReady() {
  if (!hasSupabaseClientEnv()) {
    throw new Error('Storage ist noch nicht konfiguriert. Bitte zuerst Supabase-URL und Anon-Key setzen.')
  }
}

function validateUploadFiles(files: File[]) {
  if (files.length > MAX_MEDIA_PER_OPERATION) {
    throw new Error(`Zu viele Dateien. Maximal ${MAX_MEDIA_PER_OPERATION} Medien pro Vorgang.`)
  }
  for (const file of files) {
    if (!file) continue
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`Datei zu groß: ${file.name}. Maximal 10 MB pro Upload.`)
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
      throw new Error(`Nicht unterstützter Dateityp: ${file.name}. Erlaubt sind PNG, JPEG und WebP.`)
    }
  }
}

async function getAuthenticatedUser() {
  ensureStorageReady()
  const {
    data: { user },
    error: userError,
  } = await createSupabaseBrowserClient().auth.getUser()

  if (userError || !user) {
    throw new Error('Bitte zuerst einloggen, bevor Medien hochgeladen werden.')
  }

  return user
}

export async function uploadTradeScreenshots(tradeId: string, files: File[], startIndex = 0): Promise<TradeMediaUploadInput[]> {
  if (!files.length) return []
  validateUploadFiles(files)
  const user = await getAuthenticatedUser()
  const uploaded: TradeMediaUploadInput[] = []
  const supabase = createSupabaseBrowserClient()
  const uploadedPaths = files.map((file) => getSupabaseTradeScreenshotPath(user.id, tradeId, file.name))

  try {
    const registration = await registerPendingMediaUploads({ kind: 'trade', parentId: tradeId, storagePaths: uploadedPaths })
    if (!registration.success) throw new Error('Der sichere Upload-Intent konnte nicht registriert werden.')
    for (const [index, file] of files.entries()) {
      const path = uploadedPaths[index]
      const { error } = await supabase.storage.from(EQUORA_MEDIA_BUCKET).upload(path, file, {
        cacheControl: '0',
        upsert: false,
        contentType: file.type || undefined,
      })

      if (error) throw new Error(error.message)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(EQUORA_MEDIA_BUCKET)
        .createSignedUrl(path, EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS)
      if (signedError || !signedData?.signedUrl) throw new Error('Die private Bildvorschau konnte nicht erzeugt werden.')
      uploaded.push({
        storagePath: path,
        publicUrl: signedData.signedUrl,
        fileName: file.name,
        mimeType: file.type || null,
        byteSize: Number.isFinite(file.size) ? file.size : null,
        sortOrder: startIndex + index,
        isPrimary: startIndex + index === 0,
      })
    }
  } catch (error) {
    await requestUncommittedMediaCleanup({ kind: 'trade', parentId: tradeId, storagePaths: uploadedPaths })
    throw error
  }

  return uploaded
}

export async function uploadSetupImages(setupId: string, files: File[], startIndex = 0): Promise<SetupMediaUploadInput[]> {
  if (!files.length) return []
  validateUploadFiles(files)
  const user = await getAuthenticatedUser()
  const uploaded: SetupMediaUploadInput[] = []
  const supabase = createSupabaseBrowserClient()
  const uploadedPaths = files.map((file) => getSupabaseSetupImagePath(user.id, setupId, file.name))

  try {
    const registration = await registerPendingMediaUploads({ kind: 'setup', parentId: setupId, storagePaths: uploadedPaths })
    if (!registration.success) throw new Error('Der sichere Upload-Intent konnte nicht registriert werden.')
    for (const [index, file] of files.entries()) {
      const path = uploadedPaths[index]
      const { error } = await supabase.storage.from(EQUORA_MEDIA_BUCKET).upload(path, file, {
        cacheControl: '0',
        upsert: false,
        contentType: file.type || undefined,
      })

      if (error) throw new Error(error.message)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(EQUORA_MEDIA_BUCKET)
        .createSignedUrl(path, EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS)
      if (signedError || !signedData?.signedUrl) throw new Error('Die private Bildvorschau konnte nicht erzeugt werden.')
      uploaded.push({
        storagePath: path,
        publicUrl: signedData.signedUrl,
        fileName: file.name,
        mimeType: file.type || null,
        byteSize: Number.isFinite(file.size) ? file.size : null,
        sortOrder: startIndex + index,
        isCover: startIndex + index === 0,
        caption: null,
        mediaRole: 'example',
      })
    }
  } catch (error) {
    await requestUncommittedMediaCleanup({ kind: 'setup', parentId: setupId, storagePaths: uploadedPaths })
    throw error
  }

  return uploaded
}
