export function TradeTagsList({ tags }: { tags: Array<{ id: string; tag: string }> }) {
  if (!tags.length) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">Noch keine Tags vorhanden.</div>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag.id} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85">{tag.tag}</span>
      ))}
    </div>
  )
}
