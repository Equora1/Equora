import { describe, expect, it } from "vitest";
import { computeNetPnLFromExecution } from "../lib/utils/calculations";
import {
  brokerImportProfiles,
  detectBrokerImportProfile,
  getBrokerImportRuntimeDefaults,
  isCsvImportPresetKey,
} from "../lib/utils/broker-import-kit";
import {
  buildCsvImportDrafts,
  buildCsvImportPreview,
  buildCsvImportSourceIdentityKey,
  csvImportPresets,
  extractCsvImportSourceIdentity,
  inferCsvImportMapping,
  getCsvImportMappingIssues,
  isExplicitCsvImportAccountLabel,
  isCsvImportDuplicate,
  normalizeCsvImportSourceIdentity,
  parseCsvText,
} from "../lib/utils/trade-import";
import {
  appendTradeImportMeta,
  extractTradeImportMeta,
} from "../lib/utils/trade-import-meta";

describe("broker import adapter kit", () => {
  it("binds every file preset to one immutable profile contract", () => {
    expect(brokerImportProfiles).toHaveLength(csvImportPresets.length);
    expect(
      new Set(brokerImportProfiles.map((profile) => profile.presetKey)).size,
    ).toBe(csvImportPresets.length);
    expect(
      brokerImportProfiles.every(
        (profile) =>
          profile.profileContractVersion ===
            "equora-broker-import-profile-v1" &&
          profile.connectorKind === "file_upload" &&
          Object.isFrozen(profile) &&
          Object.isFrozen(profile.runtimeDefaults),
      ),
    ).toBe(true);
  });

  it("validates preset keys through the static profile registry", () => {
    expect(isCsvImportPresetKey("mexc-futures")).toBe(true);
    expect(isCsvImportPresetKey("okx-futures")).toBe(true);
    expect(isCsvImportPresetKey("unknown-provider")).toBe(false);
    expect(isCsvImportPresetKey(null)).toBe(false);
  });

  it("preserves the existing server import defaults without broker branches", () => {
    expect(
      Object.fromEntries(
        csvImportPresets.map(({ key }) => [
          key,
          getBrokerImportRuntimeDefaults(key),
        ]),
      ),
    ).toEqual({
      generic: {
        noteLead: "Importiert aus CSV",
        presetLabel: "Allgemeine CSV",
        setup: "CSV Import",
        brokerProfile: "manual",
        costProfile: "manual",
        instrumentType: "unknown",
        cryptoMarketType: "manual",
        accountTemplate: "manual",
        marketTemplate: "manual",
        accountCurrency: null,
      },
      "ctrader-history": {
        noteLead: "Importiert aus cTrader Statement CSV",
        presetLabel: "cTrader Statement",
        setup: "cTrader Statement Import",
        brokerProfile: "manual",
        costProfile: "manual",
        instrumentType: "unknown",
        cryptoMarketType: "manual",
        accountTemplate: "manual",
        marketTemplate: "manual",
        accountCurrency: null,
      },
      "mexc-futures": {
        noteLead: "Importiert aus MEXC Futures CSV",
        presetLabel: "MEXC Futures",
        setup: "MEXC Futures Import",
        brokerProfile: "mexc-perps",
        costProfile: "crypto-perps",
        instrumentType: "crypto",
        cryptoMarketType: "perps",
        accountTemplate: "crypto-perps",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
      "mexc-spot": {
        noteLead: "Importiert aus MEXC Spot CSV",
        presetLabel: "MEXC Spot",
        setup: "MEXC Spot Import",
        brokerProfile: "mexc-spot",
        costProfile: "crypto-spot",
        instrumentType: "crypto",
        cryptoMarketType: "spot",
        accountTemplate: "crypto-spot",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
      "binance-futures": {
        noteLead: "Importiert aus Binance Futures CSV",
        presetLabel: "Binance Futures",
        setup: "Binance Futures Import",
        brokerProfile: "manual",
        costProfile: "crypto-perps",
        instrumentType: "crypto",
        cryptoMarketType: "perps",
        accountTemplate: "crypto-perps",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
      "bybit-futures": {
        noteLead: "Importiert aus Bybit Futures CSV",
        presetLabel: "Bybit Futures",
        setup: "Bybit Futures Import",
        brokerProfile: "bybit-perps",
        costProfile: "crypto-perps",
        instrumentType: "crypto",
        cryptoMarketType: "perps",
        accountTemplate: "crypto-perps",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
      "okx-futures": {
        noteLead: "Importiert aus OKX Futures CSV",
        presetLabel: "OKX Futures",
        setup: "OKX Futures Import",
        brokerProfile: "okx-perps",
        costProfile: "crypto-perps",
        instrumentType: "crypto",
        cryptoMarketType: "perps",
        accountTemplate: "crypto-perps",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
      "kraken-spot": {
        noteLead: "Importiert aus Kraken Spot CSV",
        presetLabel: "Kraken Spot",
        setup: "Kraken Spot Import",
        brokerProfile: "manual",
        costProfile: "crypto-spot",
        instrumentType: "crypto",
        cryptoMarketType: "spot",
        accountTemplate: "crypto-spot",
        marketTemplate: "manual",
        accountCurrency: "USDT",
      },
    });
    expect(getBrokerImportRuntimeDefaults("not-built")).toMatchObject({
      presetLabel: "Allgemeine CSV",
      brokerProfile: "manual",
      accountTemplate: "manual",
      accountCurrency: null,
    });
  });

  it("detects every distinctive broker export signature", () => {
    expect(
      detectBrokerImportProfile(
        [
          "ID",
          "Order ID",
          "Symbol",
          "Opening Direction",
          "Opening Time",
          "Closing Time",
          "Entry Price",
          "Closing Price",
          "Closing Quantity",
          "Commissions",
          "Net (USD)",
          "Label",
          "Comment",
        ],
        "ctrader_statement.csv",
      ),
    ).toMatchObject({
      presetKey: "ctrader-history",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        [
          "Time(UTC+02:00)",
          "Futures Trading Pair",
          "Direction",
          "Average Filled Price",
          "Closing PNL",
          "Filled Qty (Crypto)",
        ],
        "mexc_futures_order_history.csv",
      ),
    ).toMatchObject({
      presetKey: "mexc-futures",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        [
          "Time",
          "Symbol",
          "Position Side",
          "Realized Profit",
          "Commission",
          "Commission Asset",
        ],
        "binance-usd-m.csv",
      ),
    ).toMatchObject({
      presetKey: "binance-futures",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        ["Fill Time", "InstId", "PosSide", "Fill Px", "Fill Sz", "Fee"],
        "okx_swap_fills.csv",
      ),
    ).toMatchObject({
      presetKey: "okx-futures",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        ["Order Time", "Trading Pair", "Side", "Price", "Filled Amount", "Trading Fee"],
        "mexc_spot_orders.csv",
      ),
    ).toMatchObject({
      presetKey: "mexc-spot",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        ["Closed Time", "Symbol", "Closed PnL", "Order No", "Trading Fee"],
        "bybit_closed_pnl.csv",
      ),
    ).toMatchObject({
      presetKey: "bybit-futures",
      confidence: "high",
    });

    expect(
      detectBrokerImportProfile(
        ["txid", "ordertxid", "pair", "time", "type", "price", "vol", "fee"],
        "kraken_trades.csv",
      ),
    ).toMatchObject({
      presetKey: "kraken-spot",
      confidence: "high",
    });
  });

  it("keeps ordinary or ambiguous files on the generic mapping path", () => {
    expect(
      detectBrokerImportProfile(["Date", "Symbol", "PnL"], "trades.csv"),
    ).toMatchObject({
      presetKey: "generic",
      confidence: "none",
    });
  });

  it("normalizes an official-style cTrader statement without subtracting commissions twice", () => {
    const headers = [
      "ID",
      "Order ID",
      "Symbol",
      "Opening Direction",
      "Opening Time",
      "Closing Time",
      "Entry Price",
      "Closing Price",
      "Closing Quantity",
      "Commissions",
      "Net (USD)",
      "Label",
      "Comment",
    ];
    const mapping = inferCsvImportMapping(headers, "ctrader-history");

    expect(mapping).toMatchObject({
      date: "Closing Time",
      market: "Symbol",
      netPnL: "Net (USD)",
      entry: "Entry Price",
      exit: "Closing Price",
      direction: "Opening Direction",
      tags: "Label",
      notes: "Comment",
      fees: "Commissions",
      positionSize: "Closing Quantity",
    });

    const [preview] = buildCsvImportPreview(
      [
        {
          ID: "123",
          "Order ID": "456",
          Symbol: "EURUSD",
          "Opening Direction": "Buy",
          "Opening Time": "2026-08-30 10:00:00",
          "Closing Time": "2026-08-30 11:15:00",
          "Entry Price": "1.1000",
          "Closing Price": "1.1050",
          "Closing Quantity": "1.00",
          Commissions: "-4.50",
          "Net (USD)": "495.50",
          Label: "London Breakout",
          Comment: "Rule followed",
        },
      ],
      mapping,
      "ctrader-history",
      undefined,
      120,
    );

    expect(preview).toBeDefined();
    expect(preview?.status).toBe("importable");
    expect(preview?.sourceIdentity).toEqual({
      kind: "deal_id",
      header: "ID",
      value: "123",
    });
    expect(preview?.normalized).toMatchObject({
      market: "EURUSD",
      currency: "USD",
      netPnL: "495.50",
      entry: "1.1000",
      exit: "1.1050",
      direction: "Long",
      setup: "cTrader Statement Import",
      tags: ["London Breakout"],
      notes: "Rule followed",
      fees: "4.5",
      positionSize: "1.00",
    });
    expect(preview?.normalized.date).not.toBeNull();
    expect(preview?.normalized.date).toBe("2026-08-30T09:15:00.000Z");
    expect(preview?.sources.currency).toBe("csv");
    expect(preview?.warnings.join(" ")).toContain(
      "nicht erneut vom importierten Netto-P&L abgezogen",
    );
    expect(
      computeNetPnLFromExecution({
        explicitPnL: preview?.normalized.netPnL,
        pnlMode: "manual",
        fees: preview?.normalized.fees,
      }),
    ).toMatchObject({
      netPnL: 495.5,
      grossPnL: 500,
      fees: 4.5,
      totalCosts: 4.5,
    });

    const [draft] = buildCsvImportDrafts(preview ? [preview] : [], {
      presetKey: "ctrader-history",
    });
    expect(draft?.sourceIdentity).toEqual(preview?.sourceIdentity);

    const persistedNote = appendTradeImportMeta("Rule followed", {
      presetKey: "ctrader-history",
      sourceIdentity: preview?.sourceIdentity,
      sourceContext: {
        brokerProfile: "manual",
        accountTemplate: "manual",
        accountLabel: "cTrader Echtgeld",
      },
    });
    expect(extractTradeImportMeta(persistedNote).meta).toMatchObject({
      sourceIdentity: preview?.sourceIdentity,
      sourceContext: {
        brokerProfile: "manual",
        accountTemplate: "manual",
        accountLabel: "cTrader Echtgeld",
      },
    });
  });

  it("prefers stable provider identities over coarse value fingerprints", () => {
    const primaryKey = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity: { kind: " DEAL_ID ", header: " ID ", value: " 123 " },
      brokerProfile: "manual",
      accountTemplate: "manual",
      accountLabel: " cTrader Echtgeld ",
    });
    const aliasKey = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity: { kind: "deal_id", header: "Deal ID", value: "123" },
      brokerProfile: "MANUAL",
      accountTemplate: "MANUAL",
      accountLabel: "CTRADER   ECHTGELD",
    });
    const secondDealKey = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity: { kind: "deal_id", header: "ID", value: "124" },
      brokerProfile: "manual",
      accountTemplate: "manual",
      accountLabel: "cTrader Echtgeld",
    });
    const secondAccountKey = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity: { kind: "deal_id", header: "ID", value: "123" },
      brokerProfile: "manual",
      accountTemplate: "manual",
      accountLabel: "cTrader Demo",
    });

    expect(primaryKey).toBe(aliasKey);
    expect(secondDealKey).not.toBe(primaryKey);
    expect(secondAccountKey).not.toBe(primaryKey);

    const sameValueFingerprint = "same-values";
    expect(
      isCsvImportDuplicate({
        sourceIdentityKey: secondDealKey,
        fingerprint: sameValueFingerprint,
        existingSourceIdentityKeys: new Set([primaryKey as string]),
        seenSourceIdentityKeys: new Set(),
        existingFingerprints: new Set([sameValueFingerprint]),
        seenFingerprints: new Set(),
      }),
    ).toBe(false);
    expect(
      isCsvImportDuplicate({
        sourceIdentityKey: primaryKey,
        fingerprint: "changed-values",
        existingSourceIdentityKeys: new Set([primaryKey as string]),
        seenSourceIdentityKeys: new Set(),
        existingFingerprints: new Set(),
        seenFingerprints: new Set(),
      }),
    ).toBe(true);
    expect(
      isCsvImportDuplicate({
        sourceIdentityKey: null,
        fingerprint: sameValueFingerprint,
        existingSourceIdentityKeys: new Set(),
        seenSourceIdentityKeys: new Set(),
        existingFingerprints: new Set([sameValueFingerprint]),
        seenFingerprints: new Set(),
      }),
    ).toBe(true);
  });

  it("fails closed on ambiguous price headers until one explicit mapping resolves them", () => {
    const headers = ["Date", "Symbol", "PnL", "Filled Price"];
    const inferred = inferCsvImportMapping(headers, "generic");

    expect(inferred.entry).toBeUndefined();
    expect(inferred.exit).toBeUndefined();
    expect(getCsvImportMappingIssues(headers, inferred, "generic")).toHaveLength(
      1,
    );

    const [blocked] = buildCsvImportPreview(
      [
        {
          Date: "2026-08-30T10:00:00Z",
          Symbol: "BTCUSDT",
          PnL: "12",
          "Filled Price": "60000",
        },
      ],
      inferred,
      "generic",
    );
    expect(blocked?.status).toBe("skip");
    expect(blocked?.issues.join(" ")).toContain("passt gleich stark");

    const resolved = { ...inferred, entry: "Filled Price" };
    expect(getCsvImportMappingIssues(headers, resolved, "generic")).toEqual([]);
    expect(
      buildCsvImportPreview(
        [
          {
            Date: "2026-08-30T10:00:00Z",
            Symbol: "BTCUSDT",
            PnL: "12",
            "Filled Price": "60000",
          },
        ],
        resolved,
        "generic",
      )[0]?.status,
    ).toBe("importable");
  });

  it("blocks timezone-free cTrader timestamps until an explicit export offset is supplied", () => {
    const rows = [
      {
        ID: "123",
        Symbol: "EURUSD",
        "Closing Time": "2026-08-30 11:15:00",
        "Net (USD)": "25",
      },
    ];
    const mapping = inferCsvImportMapping(
      Object.keys(rows[0]),
      "ctrader-history",
    );

    const [blocked] = buildCsvImportPreview(
      rows,
      mapping,
      "ctrader-history",
    );
    expect(blocked?.status).toBe("skip");
    expect(blocked?.issues.join(" ")).toContain("UTC-Offset");

    const [resolved] = buildCsvImportPreview(
      rows,
      mapping,
      "ctrader-history",
      undefined,
      120,
    );
    expect(resolved?.status).toBe("importable");
    expect(resolved?.normalized.date).toBe("2026-08-30T09:15:00.000Z");
  });

  it("blocks timezone-free timestamps for every preset until an export offset is supplied", () => {
    const rows = [{ Date: "2026-08-30 11:15:00", Symbol: "BTCUSDT", PnL: "0" }];
    const mapping = inferCsvImportMapping(Object.keys(rows[0]), "generic");
    expect(buildCsvImportPreview(rows, mapping, "generic")[0]?.status).toBe(
      "skip",
    );
    const [resolved] = buildCsvImportPreview(
      rows,
      mapping,
      "generic",
      undefined,
      120,
    );
    expect(resolved?.normalized.date).toBe("2026-08-30T09:15:00.000Z");
  });

  it("keeps MEXC opening rows unpaired and imports explicit breakeven closes", () => {
    const rows = [
      {
        "Time(UTC+02:00)": "2026-08-30 10:00:00",
        "Futures Trading Pair": "BTC_USDT",
        Direction: "Open Long",
        "Average Filled Price": "60000",
        "Closing PNL": "0",
        "Trading Fee": "0.10",
        "Filled Qty (Crypto)": "0.01",
      },
      {
        "Time(UTC+02:00)": "2026-08-30 11:00:00",
        "Futures Trading Pair": "BTC_USDT",
        Direction: "Close Long",
        "Average Filled Price": "60000",
        "Closing PNL": "0",
        "Trading Fee": "0.12",
        "Filled Qty (Crypto)": "0.01",
      },
    ];
    const mapping = inferCsvImportMapping(Object.keys(rows[0]), "mexc-futures");
    const preview = buildCsvImportPreview(
      rows,
      mapping,
      "mexc-futures",
      undefined,
      120,
    );
    expect(preview[0]?.status).toBe("skip");
    expect(preview[0]?.issues.join(" ")).toContain("nicht automatisch gepaart");
    expect(preview[1]?.status).toBe("importable");
    expect(preview[1]?.normalized.netPnL).toBe("0");
    expect(preview[1]?.normalized.entry).toBeNull();
    expect(preview[1]?.normalized.exit).toBe("60000");
    expect(preview[1]?.normalized.notes).toContain("Keine heuristische Entry-Paarung");
  });

  it("rejects delimited rows wider than their header", () => {
    expect(() =>
      parseCsvText("Date,Symbol\n2026-08-30T10:00:00Z,BTCUSDT,extra"),
    ).toThrow(/mehr Zellen als die Kopfzeile/);
  });

  it("rejects unusable source identities and keeps generic CSV files id-agnostic", () => {
    expect(
      normalizeCsvImportSourceIdentity({
        kind: " DEAL_ID ",
        header: " Deal   ID ",
        value: " 123 ",
      }),
    ).toEqual({
      kind: "deal_id",
      header: "Deal ID",
      value: "123",
    });
    for (const value of ["", "-", "N/A", "null", "undefined"]) {
      expect(
        normalizeCsvImportSourceIdentity({
          kind: "deal_id",
          header: "ID",
          value,
        }),
      ).toBeNull();
    }
    expect(
      normalizeCsvImportSourceIdentity({
        kind: "deal_id",
        header: "ID",
        value: "x".repeat(161),
      }),
    ).toBeNull();
    expect(
      extractCsvImportSourceIdentity({ ID: "123" }, "generic"),
    ).toBeNull();
  });

  it("requires an explicit account namespace for provider source identities", () => {
    for (const label of [
      "",
      "Konto",
      "Hauptkonto",
      "Main Account",
      "cTrader Konto",
    ]) {
      expect(isExplicitCsvImportAccountLabel(label)).toBe(false);
    }
    expect(isExplicitCsvImportAccountLabel("IC Markets cTrader 1234")).toBe(
      true,
    );
    expect(
      isExplicitCsvImportAccountLabel("  IC Markets   cTrader 1234  "),
    ).toBe(true);
  });

  it("keeps the original import namespace stable after editable trade context changes", () => {
    const sourceIdentity = { kind: "deal_id", header: "ID", value: "123" };
    const persistedSourceContext = {
      brokerProfile: "manual",
      accountTemplate: "manual",
      accountLabel: "cTrader Echtgeld",
    };
    const originalKey = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity,
      ...persistedSourceContext,
    });
    const keyFromEditedTradeFields = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity,
      brokerProfile: "okx-perps",
      accountTemplate: "crypto-perps",
      accountLabel: "cTrader Echtgeld",
    });
    const reimportKeyFromPersistedContext = buildCsvImportSourceIdentityKey({
      presetKey: "ctrader-history",
      sourceIdentity,
      ...persistedSourceContext,
    });

    expect(keyFromEditedTradeFields).not.toBe(originalKey);
    expect(reimportKeyFromPersistedContext).toBe(originalKey);
    expect(
      isCsvImportDuplicate({
        sourceIdentityKey: reimportKeyFromPersistedContext,
        fingerprint: "edited-values",
        existingSourceIdentityKeys: new Set([originalKey as string]),
        seenSourceIdentityKeys: new Set(),
        existingFingerprints: new Set(),
        seenFingerprints: new Set(),
      }),
    ).toBe(true);
  });

  it("parses quoted delimiters, escaped quotes and multiline notes", () => {
    const parsed = parseCsvText(
      [
        "Date,Symbol,Notes,Fee,Fee",
        '"2026-08-30","BTC,USD","First line',
        'Second ""quoted"" line",1,2',
      ].join("\r\n"),
    );

    expect(parsed.headers).toEqual(["Date", "Symbol", "Notes", "Fee", "Fee 2"]);
    expect(parsed.rows).toEqual([
      {
        Date: "2026-08-30",
        Symbol: "BTC,USD",
        Notes: 'First line\r\nSecond "quoted" line',
        Fee: "1",
        "Fee 2": "2",
      },
    ]);
  });

  it("rejects malformed files with an unterminated quoted field", () => {
    expect(() => parseCsvText('Date,Symbol\n"2026-08-30,BTCUSDT')).toThrow(
      "nicht geschlossenes Anführungszeichen",
    );
  });

  it("rejects import text outside the bounded parser envelope", () => {
    expect(() => parseCsvText("x".repeat(5_000_001))).toThrow(
      "höchstens 5 MB",
    );
    expect(() =>
      parseCsvText(
        [
          Array.from({ length: 129 }, (_, index) => `H${index}`).join(","),
          Array.from({ length: 129 }, () => "1").join(","),
        ].join("\n"),
      ),
    ).toThrow("höchstens 128");
  });

  it("strips malformed technical metadata instead of exposing it as user notes", () => {
    const note = "Private journal note\n\n[EQUORA_IMPORT_META]{not-json";
    expect(extractTradeImportMeta(note)).toEqual({
      cleanNotes: "Private journal note",
      meta: null,
    });
  });
});
