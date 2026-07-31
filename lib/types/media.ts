export type SetupMedia = { coverImage?: string; exampleImages?: string[] }

export type TradeMediaUploadInput = {
  storagePath: string
  publicUrl: string
  fileName: string
  mimeType?: string | null
  byteSize?: number | null
  sortOrder: number
  isPrimary?: boolean
}

export type SetupMediaUploadInput = {
  storagePath: string
  publicUrl: string
  fileName: string
  mimeType?: string | null
  byteSize?: number | null
  sortOrder: number
  isCover?: boolean
  caption?: string | null
  mediaRole?: 'example' | 'best-practice' | 'mistake' | null
}

export type TradeMediaItem = {
  id: string
  tradeId: string
  storagePath: string
  publicUrl: string
  fileName?: string | null
  mimeType?: string | null
  byteSize?: number | null
  sortOrder: number
  isPrimary: boolean
  createdAt?: string | null
}

export type TradeMedia = { screenshotUrl?: string; screenshotUrls?: string[]; items?: TradeMediaItem[] }
