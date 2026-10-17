type TradeSelectionParams = {
  tradeId?: string
  editTradeId?: string
  closeTradeId?: string
  capture?: string
}

export type TradeSelection = {
  mode: 'list' | 'details' | 'edit' | 'close' | 'capture'
  selectedTradeId: string | undefined
  drawerTradeId: string | undefined
  editTradeId: string | undefined
  closeTradeId: string | undefined
  captureMode: 'quick' | 'full' | 'import' | undefined
}

// Review IDs describe a subset, never an implicit request to open a trade.
export function resolveTradeSelection(params: TradeSelectionParams): TradeSelection {
  const tradeId = params.tradeId?.trim() || undefined
  const editTradeId = params.editTradeId?.trim() || undefined
  const closeTradeId = params.closeTradeId?.trim() || undefined
  const captureMode = params.capture === 'quick' || params.capture === 'full' || params.capture === 'import' ? params.capture : undefined
  const mode = closeTradeId ? 'close' : editTradeId ? 'edit' : captureMode ? 'capture' : tradeId ? 'details' : 'list'
  const selectedTradeId = closeTradeId ?? editTradeId ?? tradeId
  return {
    mode,
    selectedTradeId,
    drawerTradeId: mode === 'details' ? tradeId : undefined,
    editTradeId: mode === 'edit' ? editTradeId : undefined,
    closeTradeId: mode === 'close' ? closeTradeId : undefined,
    captureMode: mode === 'capture' ? captureMode : undefined,
  }
}
