import { dailyNotes, setupRows, tradeTags, trades } from "@/lib/data/mock-data";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server-auth";
import {
  hasSupabaseClientEnv,
  hasSupabaseServerEnv,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DailyNoteRow,
  SetupMediaRow,
  SetupRow,
  SetupTradeLinkRow,
  TradeMediaRow,
  TradeRow,
} from "@/lib/types/db";
import type { TradeTag } from "@/lib/types/tag";
import { normalizeTradeDate } from "@/lib/utils/calendar";
import { measurePerformance } from "@/lib/server/performance";
import { signSetupMediaRows, signTradeMediaRows } from "@/lib/server/media-access";
import { DASHBOARD_TRADE_WINDOW_LIMIT } from "@/lib/utils/dashboard";

export type JournalSnapshot = {
  tradeRows: TradeRow[];
  tradeMediaRows: TradeMediaRow[];
  tradeTags: TradeTag[];
  setupRows: SetupRow[];
  setupMediaRows: SetupMediaRow[];
  setupTradeLinkRows: SetupTradeLinkRow[];
  dailyNotes: DailyNoteRow[];
  source: "supabase" | "mock";
};

export type DashboardJournalSnapshot = JournalSnapshot & {
  availability: "ready" | "unavailable" | "unauthenticated";
};

function buildMockTradeRows(): TradeRow[] {
  const pnlModes: Array<TradeRow["pnl_mode"]> = [
    "manual",
    "auto",
    "override",
    "manual",
  ];
  const costProfiles: Array<TradeRow["cost_profile"]> = [
    "futures-standard",
    "forex-tight",
    "futures-standard",
    "crypto-perps",
  ];
  const brokerProfiles: Array<TradeRow["broker_profile"]> = [
    "tradovate-futures",
    "manual",
    "tradovate-futures",
    "mexc-perps",
  ];
  const instrumentTypes: Array<TradeRow["instrument_type"]> = [
    "futures",
    "forex",
    "futures",
    "crypto",
  ];
  const accountTemplates: Array<TradeRow["account_template"]> = [
    "us-futures",
    "forex-london",
    "us-futures",
    "crypto-perps",
  ];
  const cryptoMarketTypes: Array<TradeRow["crypto_market_type"]> = [
    "manual",
    "manual",
    "manual",
    "perps",
  ];
  const quoteAssets: Array<TradeRow["quote_asset"]> = [
    null,
    null,
    null,
    "USDT",
  ];
  const leverages: Array<TradeRow["leverage"]> = [null, null, null, "4"];
  const executionTypes: Array<TradeRow["execution_type"]> = [
    "manual",
    "manual",
    "manual",
    "maker",
  ];
  const fundingDirections: Array<TradeRow["funding_direction"]> = [
    "manual",
    "manual",
    "manual",
    "received",
  ];
  const fundingRateBps: Array<TradeRow["funding_rate_bps"]> = [
    null,
    null,
    null,
    "1.25",
  ];
  const fundingIntervals: Array<TradeRow["funding_intervals"]> = [
    null,
    null,
    null,
    "2",
  ];
  const userCostProfileIds: Array<TradeRow["user_cost_profile_id"]> = [
    null,
    null,
    null,
    "demo-crypto-profile",
  ];
  const accountSizes: Array<TradeRow["account_size"]> = [
    "25000",
    null,
    "25000",
    "12000",
  ];
  const marketTemplates: Array<TradeRow["market_template"]> = [
    "nq-future",
    "eurusd-london",
    "es-future",
    "btc-perps",
  ];
  const captureStatuses: Array<TradeRow["capture_status"]> = [
    "complete",
    "incomplete",
    "complete",
    "complete",
  ];
  const captureResults: Array<TradeRow["capture_result"]> = [
    "winner",
    "loser",
    "winner",
    "winner",
  ];

  return trades.map((trade, index) => ({
    id: trade.id,
    user_id: "demo-user",
    created_at: normalizeTradeDate(trade.date).toISOString(),
    market: trade.market,
    setup: trade.setup,
    emotion: trade.emotion,
    bias: trade.result.startsWith("-") ? "Short" : "Long",
    rule_check:
      trade.id === "13 Mär 2026-EUR/USD"
        ? "Zu früher Entry"
        : trade.id === "11 Mär 2026-BTC/USD"
          ? "Kein Regelverstoß"
          : "Regelkonform",
    entry: ["22114.5", "1.0844", "22813", "68240"][index] ?? "0",
    stop_loss: ["22082.0", "1.0860", "22792", "67980"][index] ?? "0",
    take_profit: ["22180.0", "1.0828", "22858", "68820"][index] ?? "0",
    exit: ["22168.0", "1.0832", "22841", "68620"][index] ?? null,
    net_pnl: index === 1 ? null : trade.result,
    risk_percent: ["0.5", "0.35", "0.5", "0.75"][index] ?? "0.5",
    account_size: accountSizes[index] ?? null,
    r_multiple: trade.r,
    pnl_mode: pnlModes[index] ?? "manual",
    cost_profile: costProfiles[index] ?? "manual",
    broker_profile: brokerProfiles[index] ?? "manual",
    instrument_type: instrumentTypes[index] ?? "unknown",
    account_template: accountTemplates[index] ?? "manual",
    market_template: marketTemplates[index] ?? "manual",
    position_size: ["2", "100000", "1", "0.35"][index] ?? "1",
    point_value: ["5", "10", "25", null][index] ?? "1",
    fees: ["3.2", "0.8", "2.9", "4.2"][index] ?? "0",
    exchange_fees: ["1.1", "0", "0.9", "0"][index] ?? "0",
    funding_fees: ["0", "0", "0", "-1.4"][index] ?? "0",
    funding_rate_bps: fundingRateBps[index] ?? null,
    funding_intervals: fundingIntervals[index] ?? null,
    spread_cost: ["0", "1.1", "0", "0.7"][index] ?? "0",
    slippage: ["0.9", "0.4", "0.8", "2.1"][index] ?? "0",
    account_currency: ["EUR", "USD", "EUR", "USDT"][index] ?? "EUR",
    crypto_market_type: cryptoMarketTypes[index] ?? "manual",
    execution_type: executionTypes[index] ?? "manual",
    funding_direction: fundingDirections[index] ?? "manual",
    quote_asset: quoteAssets[index] ?? null,
    leverage: leverages[index] ?? null,
    user_cost_profile_id: userCostProfileIds[index] ?? null,
    capture_status: captureStatuses[index] ?? "complete",
    capture_result: captureResults[index] ?? null,
    captured_at: normalizeTradeDate(trade.date).toISOString(),
    completed_at:
      (captureStatuses[index] ?? "complete") === "complete"
        ? normalizeTradeDate(trade.date).toISOString()
        : null,
    notes:
      trade.id === "14 Mär 2026-NASDAQ"
        ? "Bestätigung abgewartet, Entry sauber, Exit diszipliniert vor Widerstand."
        : trade.id === "13 Mär 2026-EUR/USD"
          ? "Breakout im Chop zu früh gehandelt. Besser auf Bestätigung warten."
          : "Demo-Trade mit sauberem Kontext und Journaling-Grundlage.",
    screenshot_url:
      trade.id === "14 Mär 2026-NASDAQ"
        ? "/trade-screenshots/demo-trade-1.png"
        : trade.id === "13 Mär 2026-EUR/USD"
          ? "/trade-screenshots/demo-trade-2.png"
          : null,
    quality: trade.quality,
    session: trade.session,
    concept: trade.concept,
  }));
}

function buildMockTradeMediaRows(): TradeMediaRow[] {
  return buildMockTradeRows()
    .filter((trade) => trade.screenshot_url)
    .map((trade, index) => ({
      id: `trade-media-${trade.id}`,
      trade_id: trade.id,
      user_id: "demo-user",
      created_at: trade.created_at,
      storage_path: `demo/${trade.id}-${index}.png`,
      public_url: trade.screenshot_url ?? "",
      file_name: `demo-${index + 1}.png`,
      mime_type: "image/png",
      byte_size: null,
      sort_order: index,
      is_primary: true,
    }));
}

function buildMockSetupMediaRows(): SetupMediaRow[] {
  return [
    {
      id: "setup-media-1",
      setup_id: "setup-2",
      user_id: "demo-user",
      created_at: "2026-03-02T08:00:00.000Z",
      storage_path: "demo/setup/liquidity-sweep-1.png",
      public_url: "/setup-images/liquidity-sweep-1.png",
      file_name: "liquidity-sweep-1.png",
      mime_type: "image/png",
      byte_size: null,
      sort_order: 0,
      is_cover: true,
      caption: "Sweep über das Hoch, Reclaim und sauberer Trigger.",
      media_role: "best-practice",
    },
    {
      id: "setup-media-2",
      setup_id: "setup-2",
      user_id: "demo-user",
      created_at: "2026-03-02T08:01:00.000Z",
      storage_path: "demo/setup/liquidity-sweep-2.png",
      public_url: "/setup-images/liquidity-sweep-2.png",
      file_name: "liquidity-sweep-2.png",
      mime_type: "image/png",
      byte_size: null,
      sort_order: 1,
      is_cover: false,
      caption: "Gegenbeispiel: Sweep ohne Bestätigung.",
      media_role: "mistake",
    },
  ];
}

function buildMockSetupTradeLinkRows(): SetupTradeLinkRow[] {
  const setupByTitle = new Map(
    setupRows.map((setup) => [setup.title, setup.id]),
  );
  return trades
    .map((trade, index) => {
      const setupId = setupByTitle.get(trade.setup);
      if (!setupId) return null;
      return {
        id: `setup-link-${index + 1}`,
        setup_id: setupId,
        trade_id: trade.id,
        user_id: "demo-user",
        created_at: normalizeTradeDate(trade.date).toISOString(),
      } satisfies SetupTradeLinkRow;
    })
    .filter(Boolean) as SetupTradeLinkRow[];
}

function getMockSnapshot(): JournalSnapshot {
  return {
    tradeRows: buildMockTradeRows(),
    tradeMediaRows: buildMockTradeMediaRows(),
    tradeTags,
    setupRows,
    setupMediaRows: buildMockSetupMediaRows(),
    setupTradeLinkRows: buildMockSetupTradeLinkRows(),
    dailyNotes,
    source: "mock",
  };
}
function getMockSnapshotForOptions(
  options?: SnapshotFetchOptions,
): JournalSnapshot {
  const snapshot = getMockSnapshot();
  const resolved = mergeSnapshotOptions(options);
  const from = resolved.tradeOccurredFrom
    ? new Date(resolved.tradeOccurredFrom).getTime()
    : null;
  const to = resolved.tradeOccurredTo
    ? new Date(resolved.tradeOccurredTo).getTime()
    : null;

  let tradeRows = snapshot.tradeRows.filter((trade) => {
    const occurredAt = new Date(
      trade.captured_at ?? trade.created_at,
    ).getTime();
    if (from !== null && occurredAt < from) return false;
    if (to !== null && occurredAt >= to) return false;
    return true;
  });
  const tradeOffset = Math.max(0, Math.floor(resolved.tradeOffset ?? 0));
  if (resolved.tradeLimit && resolved.tradeLimit > 0)
    tradeRows = tradeRows.slice(tradeOffset, tradeOffset + resolved.tradeLimit);
  else if (tradeOffset > 0)
    tradeRows = tradeRows.slice(tradeOffset);

  const tradeIds = new Set(tradeRows.map((trade) => trade.id));
  let filteredNotes = snapshot.dailyNotes.filter((note) => {
    if (resolved.dailyNotesFrom && note.trade_date < resolved.dailyNotesFrom)
      return false;
    if (resolved.dailyNotesTo && note.trade_date >= resolved.dailyNotesTo)
      return false;
    return true;
  });
  if (resolved.dailyNotesLimit && resolved.dailyNotesLimit > 0)
    filteredNotes = filteredNotes.slice(0, resolved.dailyNotesLimit);

  return {
    tradeRows,
    tradeMediaRows: resolved.includeTradeMedia
      ? snapshot.tradeMediaRows.filter((row) => tradeIds.has(row.trade_id))
      : [],
    tradeTags: resolved.includeTradeTags
      ? snapshot.tradeTags.filter((row) => tradeIds.has(row.trade_id))
      : [],
    setupRows: resolved.includeSetupRows ? snapshot.setupRows : [],
    setupMediaRows: resolved.includeSetupMedia ? snapshot.setupMediaRows : [],
    setupTradeLinkRows: resolved.includeSetupTradeLinks
      ? snapshot.setupTradeLinkRows.filter((row) => tradeIds.has(row.trade_id))
      : [],
    dailyNotes: resolved.includeDailyNotes ? filteredNotes : [],
    source: "mock",
  };
}
function getEmptySnapshot(): JournalSnapshot {
  return {
    tradeRows: [],
    tradeMediaRows: [],
    tradeTags: [],
    setupRows: [],
    setupMediaRows: [],
    setupTradeLinkRows: [],
    dailyNotes: [],
    source: "supabase",
  };
}

export const TRADE_DETAIL_SELECT_COLUMNS = [
  "id",
  "user_id",
  "created_at",
  "market",
  "setup",
  "emotion",
  "bias",
  "rule_check",
  "review_repeatability",
  "review_state",
  "review_lesson",
  "entry",
  "stop_loss",
  "take_profit",
  "exit",
  "net_pnl",
  "risk_percent",
  "account_size",
  "partial_exits",
  "r_multiple",
  "pnl_mode",
  "cost_profile",
  "position_size",
  "point_value",
  "fees",
  "exchange_fees",
  "funding_fees",
  "funding_rate_bps",
  "funding_intervals",
  "spread_cost",
  "slippage",
  "instrument_type",
  "account_currency",
  "broker_profile",
  "account_template",
  "market_template",
  "crypto_market_type",
  "execution_type",
  "funding_direction",
  "quote_asset",
  "leverage",
  "user_cost_profile_id",
  "capture_status",
  "capture_result",
  "captured_at",
  "completed_at",
  "import_batch_id",
  "notes",
  "screenshot_url",
  "quality",
  "session",
  "concept",
].join(",");

const TRADE_DETAIL_SELECT_COLUMNS_LEGACY = TRADE_DETAIL_SELECT_COLUMNS.split(
  ",",
)
  .filter((column) => column !== "import_batch_id")
  .join(",");

const SETUP_SELECT_COLUMNS = [
  "id",
  "user_id",
  "title",
  "category",
  "description",
  "entry",
  "exit",
  "invalidation",
  "playbook",
  "checklist",
  "mistakes",
  "cover_image_url",
  "sort_order",
  "is_archived",
  "is_master",
  "created_at",
  "updated_at",
].join(",");

const SETUP_SELECT_COLUMNS_LEGACY = SETUP_SELECT_COLUMNS.split(",")
  .filter((column) => column !== "is_master")
  .join(",");

const SETUP_LINK_SELECT_COLUMNS = "id,setup_id,trade_id,user_id,created_at";
const TRADE_TAG_SELECT_COLUMNS = "id,trade_id,user_id,created_at,tag";
const TRADE_MEDIA_SELECT_COLUMNS =
  "id,trade_id,user_id,created_at,storage_path,public_url,file_name,mime_type,byte_size,sort_order,is_primary";
const SETUP_MEDIA_SELECT_COLUMNS =
  "id,setup_id,user_id,created_at,storage_path,public_url,file_name,mime_type,byte_size,sort_order,is_cover,caption,media_role";
const DAILY_NOTE_SELECT_COLUMNS =
  "id,user_id,trade_date,title,note,mood,focus,created_at";

type SnapshotFetchOptions = {
  includeTradeTags?: boolean;
  includeTradeMedia?: boolean;
  includeSetupRows?: boolean;
  includeSetupMedia?: boolean;
  includeSetupTradeLinks?: boolean;
  includeDailyNotes?: boolean;
  tradeLimit?: number;
  tradeOffset?: number;
  tradeOccurredFrom?: string;
  tradeOccurredTo?: string;
  dailyNotesLimit?: number;
  dailyNotesFrom?: string;
  dailyNotesTo?: string;
  diagnosticRoute?: string;
  failOnRelatedDataError?: boolean;
};

type JournalSnapshotLoadResult = {
  snapshot: JournalSnapshot;
  availability: DashboardJournalSnapshot["availability"];
};

function bindSnapshotAvailability(
  snapshot: JournalSnapshot,
  availability: DashboardJournalSnapshot["availability"],
): JournalSnapshotLoadResult {
  return { snapshot, availability };
}

type ResolvedSnapshotFetchOptions = SnapshotFetchOptions & {
  includeTradeTags: boolean;
  includeTradeMedia: boolean;
  includeSetupRows: boolean;
  includeSetupMedia: boolean;
  includeSetupTradeLinks: boolean;
  includeDailyNotes: boolean;
};

const fullSnapshotOptions: ResolvedSnapshotFetchOptions = {
  includeTradeTags: true,
  includeTradeMedia: true,
  includeSetupRows: true,
  includeSetupMedia: true,
  includeSetupTradeLinks: true,
  includeDailyNotes: true,
};

function mergeSnapshotOptions(
  options?: SnapshotFetchOptions,
): ResolvedSnapshotFetchOptions {
  return { ...fullSnapshotOptions, ...(options ?? {}) };
}

function isMissingColumnError(
  errorMessage: string | undefined,
  columnName: string,
) {
  return Boolean(
    errorMessage?.toLowerCase().includes(columnName.toLowerCase()),
  );
}

function buildTradeQuery(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  scopedUserId: string,
  selectColumns: string,
  options: SnapshotFetchOptions,
) {
  let query = supabase
    .from("trades")
    .select(selectColumns)
    .eq("user_id", scopedUserId);

  if (options.tradeOccurredFrom && options.tradeOccurredTo) {
    query = query.or(
      `and(captured_at.gte.${options.tradeOccurredFrom},captured_at.lt.${options.tradeOccurredTo}),and(captured_at.is.null,created_at.gte.${options.tradeOccurredFrom},created_at.lt.${options.tradeOccurredTo})`,
    );
  } else if (options.tradeOccurredFrom) {
    query = query.or(
      `captured_at.gte.${options.tradeOccurredFrom},and(captured_at.is.null,created_at.gte.${options.tradeOccurredFrom})`,
    );
  } else if (options.tradeOccurredTo) {
    query = query.or(
      `captured_at.lt.${options.tradeOccurredTo},and(captured_at.is.null,created_at.lt.${options.tradeOccurredTo})`,
    );
  }

  query = query
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.tradeLimit && options.tradeLimit > 0) {
    const offset = Math.max(0, Math.floor(options.tradeOffset ?? 0));
    const limit = Math.floor(options.tradeLimit);
    query = query.range(offset, offset + limit - 1);
  }

  return query;
}

async function fetchTradeRows(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  scopedUserId: string,
  options: SnapshotFetchOptions,
) {
  let response = await buildTradeQuery(
    supabase,
    scopedUserId,
    TRADE_DETAIL_SELECT_COLUMNS,
    options,
  );

  if (isMissingColumnError(response.error?.message, "import_batch_id")) {
    response = await buildTradeQuery(
      supabase,
      scopedUserId,
      TRADE_DETAIL_SELECT_COLUMNS_LEGACY,
      options,
    );
  }

  return response;
}

function buildDailyNotesQuery(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  scopedUserId: string,
  options: SnapshotFetchOptions,
) {
  let query = supabase
    .from("daily_notes")
    .select(DAILY_NOTE_SELECT_COLUMNS)
    .eq("user_id", scopedUserId);

  if (options.dailyNotesFrom)
    query = query.gte("trade_date", options.dailyNotesFrom);
  if (options.dailyNotesTo)
    query = query.lt("trade_date", options.dailyNotesTo);

  query = query.order("trade_date", { ascending: false });
  if (options.dailyNotesLimit && options.dailyNotesLimit > 0) {
    query = query.limit(Math.floor(options.dailyNotesLimit));
  }

  return query;
}

async function fetchSetupRows(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  scopedUserId: string,
) {
  let response = await supabase
    .from("setups")
    .select(SETUP_SELECT_COLUMNS)
    .or(`user_id.eq.${scopedUserId},is_master.eq.true`)
    .order("is_master", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (isMissingColumnError(response.error?.message, "is_master")) {
    response = await supabase
      .from("setups")
      .select(SETUP_SELECT_COLUMNS_LEGACY)
      .eq("user_id", scopedUserId)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
  }

  return response;
}

function buildFallbackSetups(
  tradeRows: TradeRow[],
  scopedUserId: string,
): SetupRow[] {
  return Array.from(
    new Map(
      tradeRows.map((trade) => [
        trade.setup,
        {
          id: `setup-${trade.setup}`,
          user_id: scopedUserId,
          title: trade.setup,
          category: trade.concept ?? null,
          description: null,
          entry: null,
          exit: null,
          invalidation: null,
          playbook: null,
          checklist: [],
          mistakes: [],
          cover_image_url: null,
          sort_order: null,
          is_archived: false,
          updated_at: null,
        } satisfies SetupRow,
      ]),
    ).values(),
  );
}

async function loadJournalSnapshotServer(
  userId?: string | null,
  options?: SnapshotFetchOptions,
): Promise<JournalSnapshotLoadResult> {
  if (!hasSupabaseClientEnv()) {
    return bindSnapshotAvailability(getMockSnapshotForOptions(options), "ready");
  }

  const fetchOptions = mergeSnapshotOptions(options);

  try {
    const scopedUserId = userId ?? null;
    const supabase =
      scopedUserId && hasSupabaseServerEnv()
        ? createSupabaseServerClient()
        : await createSupabaseAuthServerClient();

    if (!scopedUserId && hasSupabaseServerEnv()) {
      return bindSnapshotAvailability(getEmptySnapshot(), "unauthenticated");
    }
    if (!scopedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return bindSnapshotAvailability(getEmptySnapshot(), "unauthenticated");
      return loadJournalSnapshotServer(user.id, options);
    }

    const { data: tradeRows, error: tradesError } = await measurePerformance(
      "database.trades",
      "database",
      () => fetchTradeRows(supabase, scopedUserId, fetchOptions),
      { route: fetchOptions.diagnosticRoute, meta: { limit: fetchOptions.tradeLimit ?? 0, offset: fetchOptions.tradeOffset ?? 0 } },
    );
    if (tradesError || !tradeRows) {
      console.error(
        "Trades fetch failed, returning empty snapshot:",
        tradesError?.message ?? "unknown error",
      );
      return bindSnapshotAvailability(getEmptySnapshot(), "unavailable");
    }

    const normalizedTradeRows = tradeRows as unknown as TradeRow[];
    const tradeIds = normalizedTradeRows.map((trade) => trade.id);

    const [
      tagsResponse,
      tradeMediaResponse,
      setupsResponse,
      dailyNotesResponse,
    ] = await Promise.all([
      fetchOptions.includeTradeTags && tradeIds.length
        ? measurePerformance("database.trade_tags", "database", () => supabase
            .from("trade_tags")
            .select(TRADE_TAG_SELECT_COLUMNS)
            .in("trade_id", tradeIds)
            .order("created_at", { ascending: true }), { route: fetchOptions.diagnosticRoute, meta: { trades: tradeIds.length } })
        : Promise.resolve({ data: [], error: null }),
      fetchOptions.includeTradeMedia && tradeIds.length
        ? measurePerformance("database.trade_media", "database", () => supabase
            .from("trade_media")
            .select(TRADE_MEDIA_SELECT_COLUMNS)
            .in("trade_id", tradeIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }), { route: fetchOptions.diagnosticRoute, meta: { trades: tradeIds.length } })
        : Promise.resolve({ data: [], error: null }),
      fetchOptions.includeSetupRows
        ? measurePerformance("database.setups", "database", () => fetchSetupRows(supabase, scopedUserId), { route: fetchOptions.diagnosticRoute })
        : Promise.resolve({ data: [], error: null }),
      fetchOptions.includeDailyNotes
        ? measurePerformance("database.daily_notes", "database", () => buildDailyNotesQuery(supabase, scopedUserId, fetchOptions), { route: fetchOptions.diagnosticRoute, meta: { limit: fetchOptions.dailyNotesLimit ?? 0 } })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const relatedDataError = [
      tagsResponse.error,
      tradeMediaResponse.error,
      setupsResponse.error,
      dailyNotesResponse.error,
    ].find(Boolean);
    if (fetchOptions.failOnRelatedDataError && relatedDataError) {
      console.error(
        "Related journal data fetch failed, returning unavailable snapshot:",
        relatedDataError.message,
      );
      return bindSnapshotAvailability(getEmptySnapshot(), "unavailable");
    }

    const setupRowsFromDb = (setupsResponse.data ??
      []) as unknown as SetupRow[];
    const setupRows =
      fetchOptions.includeSetupRows && setupRowsFromDb.length
        ? setupRowsFromDb
        : fetchOptions.includeSetupRows
          ? buildFallbackSetups(normalizedTradeRows, scopedUserId)
          : [];
    const setupIds = setupRows.map((setup) => setup.id);

    const [setupMediaResponse, setupTradeLinksResponse] = await Promise.all([
      fetchOptions.includeSetupMedia && setupIds.length
        ? measurePerformance("database.setup_media", "database", () => supabase
            .from("setup_media")
            .select(SETUP_MEDIA_SELECT_COLUMNS)
            .in("setup_id", setupIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }), { route: fetchOptions.diagnosticRoute, meta: { setups: setupIds.length } })
        : Promise.resolve({ data: [], error: null }),
      fetchOptions.includeSetupTradeLinks && tradeIds.length
        ? measurePerformance("database.setup_trade_links", "database", () => supabase
            .from("setup_trade_links")
            .select(SETUP_LINK_SELECT_COLUMNS)
            .eq("user_id", scopedUserId)
            .in("trade_id", tradeIds)
            .order("created_at", { ascending: true }), { route: fetchOptions.diagnosticRoute, meta: { trades: tradeIds.length } })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const setupDataError = [
      setupMediaResponse.error,
      setupTradeLinksResponse.error,
    ].find(Boolean);
    if (fetchOptions.failOnRelatedDataError && setupDataError) {
      console.error(
        "Setup journal data fetch failed, returning unavailable snapshot:",
        setupDataError.message,
      );
      return bindSnapshotAvailability(getEmptySnapshot(), "unavailable");
    }

    const signedTradeMediaRows = await signTradeMediaRows(
      supabase,
      (tradeMediaResponse.data ?? []) as TradeMediaRow[],
      scopedUserId,
    );
    const signedSetupMediaRows = await signSetupMediaRows(
      supabase,
      (setupMediaResponse.data ?? []) as SetupMediaRow[],
      scopedUserId,
    );
    const primaryTradeUrlById = signedTradeMediaRows.reduce<Record<string, string>>((urls, media) => {
      if (!urls[media.trade_id] && media.public_url) urls[media.trade_id] = media.public_url;
      return urls;
    }, {});
    const coverSetupUrlById = signedSetupMediaRows.reduce<Record<string, string>>((urls, media) => {
      if ((!urls[media.setup_id] || media.is_cover) && media.public_url) urls[media.setup_id] = media.public_url;
      return urls;
    }, {});

    return bindSnapshotAvailability({
      tradeRows: normalizedTradeRows.map((trade) => ({
        ...trade,
        screenshot_url: primaryTradeUrlById[trade.id] ?? null,
      })),
      tradeTags: (tagsResponse.data ?? []) as TradeTag[],
      tradeMediaRows: signedTradeMediaRows,
      setupRows: setupRows.map((setup) => ({
        ...setup,
        cover_image_url: coverSetupUrlById[setup.id] ?? null,
      })),
      setupMediaRows: signedSetupMediaRows,
      setupTradeLinkRows: (setupTradeLinksResponse.data ??
        []) as SetupTradeLinkRow[],
      dailyNotes: (dailyNotesResponse.data ?? []) as DailyNoteRow[],
      source: "supabase",
    }, "ready");
  } catch (error) {
    console.error(
      "Journal snapshot failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return bindSnapshotAvailability(getEmptySnapshot(), "unavailable");
  }
}

export async function getJournalSnapshotServer(
  userId?: string | null,
  options?: SnapshotFetchOptions,
): Promise<JournalSnapshot> {
  const result = await loadJournalSnapshotServer(userId, options);
  return result.snapshot;
}

export function getDashboardSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.dashboard.total', 'page', async () => {
    const result = await loadJournalSnapshotServer(userId, {
      includeTradeTags: false,
      includeTradeMedia: false,
      includeSetupRows: false,
      includeSetupMedia: false,
      includeSetupTradeLinks: false,
      includeDailyNotes: true,
      tradeLimit: DASHBOARD_TRADE_WINDOW_LIMIT,
      dailyNotesLimit: 7,
      diagnosticRoute: '/dashboard',
      failOnRelatedDataError: true,
    });

    return {
      ...result.snapshot,
      availability: result.availability,
    } satisfies DashboardJournalSnapshot;
  }, { route: '/dashboard' })
}

export function getStatisticsSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.statistics.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: true,
    includeTradeMedia: false,
    includeSetupRows: true,
    includeSetupMedia: false,
    includeSetupTradeLinks: true,
    includeDailyNotes: false,
    diagnosticRoute: '/statistik',
  }), { route: '/statistik' })
}

export function getCalendarSnapshotServer(
  userId?: string | null,
  range?: { from: string; to: string },
) {
  return measurePerformance('snapshot.calendar.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: false,
    includeTradeMedia: false,
    includeSetupRows: false,
    includeSetupMedia: false,
    includeSetupTradeLinks: false,
    includeDailyNotes: false,
    tradeOccurredFrom: range?.from,
    tradeOccurredTo: range?.to,
    diagnosticRoute: '/kalender',
  }), { route: '/kalender', meta: { ranged: Boolean(range) } })
}

export function getReviewSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.review.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: true,
    includeTradeMedia: false,
    includeSetupRows: true,
    includeSetupMedia: false,
    includeSetupTradeLinks: true,
    includeDailyNotes: true,
    diagnosticRoute: '/review',
  }), { route: '/review' })
}

export function getSetupsSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.setups.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: false,
    includeTradeMedia: true,
    includeSetupRows: true,
    includeSetupMedia: true,
    includeSetupTradeLinks: true,
    includeDailyNotes: false,
    diagnosticRoute: '/setups',
  }), { route: '/setups' })
}

export function getTradesSnapshotServer(
  userId?: string | null,
  pagination?: { limit?: number; offset?: number },
) {
  return measurePerformance('snapshot.trades.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: true,
    includeTradeMedia: false,
    includeSetupRows: true,
    includeSetupMedia: false,
    includeSetupTradeLinks: true,
    includeDailyNotes: false,
    tradeLimit: pagination?.limit,
    tradeOffset: pagination?.offset,
    diagnosticRoute: '/trades',
  }), { route: '/trades', meta: { limit: pagination?.limit ?? 0, offset: pagination?.offset ?? 0 } })
}

export function getShareSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.share.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: false,
    includeTradeMedia: false,
    includeSetupRows: true,
    includeSetupMedia: false,
    includeSetupTradeLinks: true,
    includeDailyNotes: false,
    diagnosticRoute: '/share',
  }), { route: '/share' })
}

export function getReviewSessionsSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.review_sessions.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: false,
    includeTradeMedia: false,
    includeSetupRows: false,
    includeSetupMedia: false,
    includeSetupTradeLinks: false,
    includeDailyNotes: false,
    tradeLimit: 1,
    diagnosticRoute: '/review-sessions',
  }), { route: '/review-sessions' })
}

export function getDailyNoteSnapshotServer(userId?: string | null) {
  return measurePerformance('snapshot.daily_note.total', 'page', () => getJournalSnapshotServer(userId, {
    includeTradeTags: false,
    includeTradeMedia: false,
    includeSetupRows: false,
    includeSetupMedia: false,
    includeSetupTradeLinks: false,
    includeDailyNotes: true,
    diagnosticRoute: '/daily-note',
  }), { route: '/daily-note' })
}

export function getJournalDataSource(): JournalSnapshot['source'] {
  return hasSupabaseClientEnv() ? 'supabase' : 'mock'
}

export async function getCostProfileUsageServer(userId?: string | null): Promise<Record<string, number>> {
  if (!hasSupabaseClientEnv()) {
    return buildMockTradeRows().reduce<Record<string, number>>((usage, trade) => {
      if (!trade.user_cost_profile_id) return usage
      usage[trade.user_cost_profile_id] = (usage[trade.user_cost_profile_id] ?? 0) + 1
      return usage
    }, {})
  }

  try {
    const scopedUserId = userId ?? null
    const supabase = scopedUserId && hasSupabaseServerEnv()
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && hasSupabaseServerEnv()) return {}
    if (!scopedUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return {}
      return getCostProfileUsageServer(user.id)
    }

    const { data, error } = await supabase
      .from('trades')
      .select('user_cost_profile_id')
      .eq('user_id', scopedUserId)
      .not('user_cost_profile_id', 'is', null)

    if (error || !data) return {}

    return data.reduce<Record<string, number>>((usage, row) => {
      const profileId = row.user_cost_profile_id as string | null
      if (!profileId) return usage
      usage[profileId] = (usage[profileId] ?? 0) + 1
      return usage
    }, {})
  } catch {
    return {}
  }
}
