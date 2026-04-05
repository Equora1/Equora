export type NumericField = string | number | null

export type TradeRow = {
  id: string
  user_id?: string | null
  created_at: string
  market: string
  setup: string
  emotion: string | null
  bias: string | null
  rule_check: string | null
  review_repeatability?: string | null
  review_state?: string | null
  review_lesson?: string | null
  entry: NumericField
  stop_loss: NumericField
  take_profit: NumericField
  exit: NumericField
  net_pnl: NumericField
  risk_percent: NumericField
  account_size?: NumericField
  partial_exits?: Array<{ percent: number; price: number }> | null
  r_multiple: NumericField
  pnl_mode?: 'manual' | 'auto' | 'override' | null
  cost_profile?: 'manual' | 'user-custom' | 'none' | 'stocks-light' | 'futures-standard' | 'forex-tight' | 'crypto-swing' | 'crypto-spot' | 'crypto-perps' | 'cfd-standard' | null
  position_size?: NumericField
  point_value?: NumericField
  fees?: NumericField
  exchange_fees?: NumericField
  funding_fees?: NumericField
  funding_rate_bps?: NumericField
  funding_intervals?: NumericField
  spread_cost?: NumericField
  slippage?: NumericField
  instrument_type?: 'stocks' | 'futures' | 'forex' | 'crypto' | 'cfd' | 'unknown' | null
  account_currency?: string | null
  broker_profile?: 'manual' | 'ibkr-pro' | 'trade-republic' | 'tradovate-futures' | 'ftmo-cfd' | 'binance-spot' | 'coinbase-spot' | 'bybit-spot' | 'bybit-perps' | 'mexc-spot' | 'mexc-perps' | 'okx-perps' | null
  account_template?: 'manual' | 'swing-europe' | 'us-futures' | 'forex-london' | 'crypto-spot' | 'crypto-perps' | 'prop-index' | null
  market_template?: 'manual' | 'dax-cfd' | 'nq-future' | 'es-future' | 'eurusd-london' | 'btc-spot' | 'eth-spot' | 'btc-perps' | 'eth-perps' | 'spy-swing' | null
  crypto_market_type?: 'manual' | 'spot' | 'perps' | 'margin' | null
  execution_type?: 'manual' | 'maker' | 'taker' | 'mixed' | null
  funding_direction?: 'manual' | 'paid' | 'received' | 'flat' | null
  quote_asset?: string | null
  leverage?: NumericField
  user_cost_profile_id?: string | null
  capture_status?: 'incomplete' | 'complete' | null
  capture_result?: 'winner' | 'loser' | 'breakeven' | 'open' | null
  captured_at?: string | null
  completed_at?: string | null
  notes: string | null
  screenshot_url: string | null
  quality?: 'A-Setup' | 'B-Setup' | 'C-Setup' | null
  session?: string | null
  concept?: string | null
}



export type TradeMediaRow = {
  id: string
  trade_id: string
  user_id?: string | null
  created_at: string
  storage_path: string
  public_url: string
  file_name: string | null
  mime_type: string | null
  byte_size: number | null
  sort_order: number | null
  is_primary: boolean | null
}

export type SetupRow = {
  id: string
  user_id?: string | null
  title: string
  category: string | null
  description: string | null
  playbook: string | null
  checklist: string[] | null
  mistakes: string[] | null
  cover_image_url: string | null
  sort_order: number | null
  is_archived: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

export type SetupMediaRow = {
  id: string
  setup_id: string
  user_id?: string | null
  created_at: string
  storage_path: string
  public_url: string
  file_name: string | null
  mime_type: string | null
  byte_size: number | null
  sort_order: number | null
  is_cover: boolean | null
  caption: string | null
  media_role: 'example' | 'best-practice' | 'mistake' | null
}

export type DailyNoteRow = {
  id: string
  user_id?: string | null
  trade_date: string
  title: string | null
  note: string | null
  mood: string | null
  focus: string | null
  created_at?: string | null
}


export type SharedTradeSubmissionRow = {
  id: string
  user_id?: string | null
  trade_id: string
  created_at?: string | null
  updated_at?: string | null
  share_mode: 'review' | 'vault' | 'both' | null
  visibility: 'anonymous' | 'named' | null
  status: 'pending' | 'reviewed' | 'featured' | 'rejected' | 'revoked' | null
  user_note: string | null
  admin_note: string | null
  coach_feedback: string | null
  learning_category: string | null
  review_labels: string[] | null
  coach_strengths: string[] | null
  coach_mistakes: string[] | null
  coach_action: string | null
  vault_blurb: string | null
  featured_at: string | null
  vault_opt_in: boolean | null
  submitted_by_name: string | null
  shared_market: string
  shared_setup: string
  shared_result: string | null
  shared_r_multiple: NumericField
  shared_net_pnl: NumericField
  shared_capture_status: string | null
  shared_capture_result: string | null
  shared_notes: string | null
  shared_quality: string | null
  shared_tags: string[] | null
  shared_screenshot_url: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

export type ReviewSessionRow = {
  id: string
  user_id?: string | null
  title: string
  note: string | null
  focus_title: string | null
  focus_description: string | null
  chips: string[] | null
  labels: string[] | null
  trade_ids: string[] | null
  trade_count: number | null
  visible_trade_count: number | null
  net_pnl: NumericField
  average_r: NumericField
  win_rate: NumericField
  winners: number | null
  losers: number | null
  breakeven: number | null
  top_tags: string[] | null
  best_trade_id: string | null
  worst_trade_id: string | null
  session_type: 'spotlight' | 'review' | null
  session_status: 'open' | 'watch' | 'closed' | null
  is_pinned: boolean | null
  period_preset: '7d' | '14d' | '30d' | '90d' | null
  period_label: string | null
  period_start: string | null
  period_end: string | null
  created_at?: string | null
}

export type UserCostProfileRow = {
  id: string
  user_id?: string | null
  title: string
  default_account_template: TradeRow['account_template']
  default_market_template: TradeRow['market_template']
  broker_profile: TradeRow['broker_profile']
  instrument_type: TradeRow['instrument_type']
  cost_profile: TradeRow['cost_profile']
  account_currency: string | null
  crypto_market_type: TradeRow['crypto_market_type']
  execution_type: TradeRow['execution_type']
  funding_direction: TradeRow['funding_direction']
  quote_asset: string | null
  leverage: NumericField
  point_value: NumericField
  fees: NumericField
  exchange_fees: NumericField
  funding_fees: NumericField
  funding_rate_bps: NumericField
  funding_intervals: NumericField
  spread_cost: NumericField
  slippage: NumericField
  created_at?: string | null
}
