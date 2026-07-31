import { isEquoraAdminUser } from '@/lib/server/admin'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { SetupSuggestionRow } from '@/lib/types/db'
import type { SavedSetupSuggestion } from '@/lib/types/setup-suggestion'

function mapSetupSuggestionRow(row: SetupSuggestionRow): SavedSetupSuggestion {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    status: row.status ?? 'pending',
    title: row.title,
    category: row.category,
    description: row.description,
    entry: row.entry,
    exit: row.exit,
    invalidation: row.invalidation,
    checklist: row.checklist ?? [],
    mistakes: row.mistakes ?? [],
    adminNote: row.admin_note,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  }
}

export async function getSetupSuggestionsServer(userId?: string | null) {
  if (!hasSupabaseClientEnv() || !userId) return [] as SavedSetupSuggestion[]

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id || user.id !== userId) return []

    const isAdmin = await isEquoraAdminUser(user)
    let query = supabase
      .from('setup_suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)

    if (!isAdmin) query = query.eq('user_id', userId)

    const { data, error } = await query
    if (error) {
      console.warn('Setup suggestions unavailable:', error.message)
      return []
    }

    return ((data ?? []) as SetupSuggestionRow[]).map(mapSetupSuggestionRow)
  } catch (error) {
    console.warn('Setup suggestions fetch failed:', error instanceof Error ? error.message : 'unknown error')
    return []
  }
}
