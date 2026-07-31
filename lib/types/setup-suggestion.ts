export type SetupSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'archived'

export type SavedSetupSuggestion = {
  id: string
  userId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  status: SetupSuggestionStatus
  title: string
  category: string | null
  description: string | null
  entry: string | null
  exit: string | null
  invalidation: string | null
  checklist: string[]
  mistakes: string[]
  adminNote: string | null
  reviewedAt?: string | null
  reviewedBy?: string | null
}

export type CreateSetupSuggestionInput = {
  title: string
  category?: string
  description?: string
  entry?: string
  exit?: string
  invalidation?: string
  checklist?: string
  mistakes?: string
}
