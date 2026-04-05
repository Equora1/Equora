export type SetupCategory = string

export type SetupImageRole = 'example' | 'best-practice' | 'mistake'

export type SetupLibraryItem = { category: SetupCategory; title: string; description: string }

export type SetupImageItem = {
  id?: string
  url: string
  caption?: string | null
  mediaRole?: SetupImageRole | null
  isCover?: boolean
}

export type SetupDetail = {
  category: SetupCategory
  entry: string
  exit: string
  invalidation: string
  mistakes: string[]
  checklist?: string[]
  playbook?: string
  bestMarket: string
  bestSession: string
  performance: string
  coverImage?: string
  exampleImages?: string[]
  exampleImageItems?: SetupImageItem[]
}

export type SetupDetailMap = Record<string, SetupDetail>

export type SavedSetupMedia = {
  id?: string
  storagePath: string
  publicUrl: string
  fileName?: string | null
  mimeType?: string | null
  byteSize?: number | null
  sortOrder: number
  isCover: boolean
  caption?: string | null
  mediaRole?: SetupImageRole | null
}

export type SavedSetup = {
  id: string
  title: string
  category: string | null
  description: string | null
  playbook: string | null
  checklist: string[]
  mistakes: string[]
  coverImageUrl: string | null
  isArchived: boolean
  sortOrder: number
  createdAt?: string | null
  updatedAt?: string | null
  media: SavedSetupMedia[]
}

export type SaveSetupInput = {
  id?: string | null
  title: string
  category: string
  description?: string
  playbook?: string
  checklist?: string[]
  mistakes?: string[]
  isArchived?: boolean
  sortOrder?: number
  media?: SavedSetupMedia[]
  removedStoragePaths?: string[]
}
