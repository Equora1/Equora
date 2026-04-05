import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getSupabaseSetupImagePath, getSupabaseTradeScreenshotPath } from '@/lib/utils/storage-paths'
import type { SetupMediaUploadInput, TradeMediaUploadInput } from '@/lib/types/media'

const EQUORA_MEDIA_BUCKET = 'equora-media'
const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024

function ensureStorageReady() {
  if (!hasSupabaseClientEnv()) {
    throw new Error('Storage ist noch nicht konfiguriert. Bitte zuerst Supabase-URL und Anon-Key setzen.')
  }
}

function validateUploadFiles(files: File[]) {
  for (const file of files) {
    if (!file) continue
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`Datei zu groß: ${file.name}. Maximal 10 MB pro Upload.`)
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

  for (const [index, file] of files.entries()) {
    const path = getSupabaseTradeScreenshotPath(user.id, tradeId, file.name)
    const { error } = await createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

    if (error) throw new Error(error.message)

    const { data } = createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).getPublicUrl(path)
    uploaded.push({
      storagePath: path,
      publicUrl: data.publicUrl,
      fileName: file.name,
      mimeType: file.type || null,
      byteSize: Number.isFinite(file.size) ? file.size : null,
      sortOrder: startIndex + index,
      isPrimary: startIndex + index === 0,
    })
  }

  return uploaded
}

export async function uploadSetupImages(setupId: string, files: File[], startIndex = 0): Promise<SetupMediaUploadInput[]> {
  if (!files.length) return []
  validateUploadFiles(files)
  const user = await getAuthenticatedUser()
  const uploaded: SetupMediaUploadInput[] = []

  for (const [index, file] of files.entries()) {
    const path = getSupabaseSetupImagePath(user.id, setupId, file.name)
    const { error } = await createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

    if (error) throw new Error(error.message)

    const { data } = createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).getPublicUrl(path)
    uploaded.push({
      storagePath: path,
      publicUrl: data.publicUrl,
      fileName: file.name,
      mimeType: file.type || null,
      byteSize: Number.isFinite(file.size) ? file.size : null,
      sortOrder: startIndex + index,
      isCover: startIndex + index === 0,
      caption: null,
      mediaRole: 'example',
    })
  }

  return uploaded
}

export async function deleteTradeScreenshots(storagePaths: string[]) {
  if (!storagePaths.length) return
  ensureStorageReady()
  const { error } = await createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).remove(storagePaths)
  if (error) throw new Error(error.message)
}

export async function deleteSetupImages(storagePaths: string[]) {
  if (!storagePaths.length) return
  ensureStorageReady()
  const { error } = await createSupabaseBrowserClient().storage.from(EQUORA_MEDIA_BUCKET).remove(storagePaths)
  if (error) throw new Error(error.message)
}
