import { describe, expect, it } from "vitest";
import { parseMetaTrader4ReportHtml } from "../lib/utils/metatrader4-report-import";
import {
  buildCsvImportPreview,
  inferCsvImportMapping,
} from "../lib/utils/trade-import";

const header = [
  "Ticket",
  "Open Time",
  "Type",
  "Size",
  "Item",
  "Price",
  "S / L",
  "T / P",
  "Close Time",
  "Price",
  "Commission",
  "Taxes",
  "Swap",
  "Profit",
];

function tableRow(cells: readonly string[], cellTag = "td") {
  return `<tr>${cells.map((cell) => `<${cellTag}>${cell}</${cellTag}>`).join("")}</tr>`;
}

function buildReport(rows: readonly (readonly string[])[]) {
  return [
    "<!doctype html>",
    '<html><head><title>MetaTrader 4 Account History</title></head><body>',
    "<table>",
    tableRow(header, "th"),
    ...rows.map((row) => tableRow(row)),
    "</table></body></html>",
  ].join("");
}

function buildReportWithHeader(
  customHeader: readonly string[],
  rows: readonly (readonly string[])[],
) {
  return [
    "<!doctype html>",
    '<html><head><title>MetaTrader 4 Account History</title></head><body>',
    "<table>",
    tableRow(customHeader, "th"),
    ...rows.map((row) => tableRow(row)),
    "</table></body></html>",
  ].join("");
}

describe("MetaTrader 4 HTML report adapter", () => {
  it("normalizes closed buy/sell rows and excludes open, pending and account rows", () => {
    const parsed = parseMetaTrader4ReportHtml(
      buildReport([
        [
          "1001",
          "2026.09.01 08:00:00",
          "buy",
          "1.00",
          "EURUSD",
          "1.10000",
          "1.09500",
          "1.11000",
          "2026.09.01 10:00:00",
          "1.10500",
          "-2.00",
          "-1.00",
          "-0.50",
          "100.00",
        ],
        [
          "1002",
          "2026.09.01 11:00:00",
          "sell",
          "0.50",
          "GER40&amp;Cash",
          "19000",
          "0",
          "0",
          "2026.09.01 12:00:00",
          "18950",
          "-1.50",
          "0",
          "0.25",
          "25.00",
        ],
        [
          "1003",
          "2026.09.01 13:00:00",
          "buy limit",
          "1.00",
          "EURUSD",
          "1.09000",
          "0",
          "0",
          "2026.09.01 13:30:00",
          "1.09000",
          "0",
          "0",
          "0",
          "0",
        ],
        [
          "1004",
          "2026.09.01 14:00:00",
          "buy",
          "1.00",
          "EURUSD",
          "1.10000",
          "0",
          "0",
          "",
          "0",
          "0",
          "0",
          "0",
          "0",
        ],
        [
          "1005",
          "2026.09.01 15:00:00",
          "balance",
          "",
          "",
          "",
          "",
          "",
          "2026.09.01 15:00:00",
          "",
          "",
          "",
          "",
          "1000",
        ],
      ]),
    );

    expect(parsed.delimiter).toBe("metatrader4-html");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.summary).toEqual({
      sourceRowCount: 5,
      closedTradeCount: 2,
      excludedRowCount: 3,
      derivedNetPnlCount: 2,
      incompleteNetPnlCount: 0,
    });
    expect(parsed.rows[0]).toMatchObject({
      Ticket: "1001",
      Type: "buy",
      Item: "EURUSD",
      "Open Price": "1.10000",
      "Close Price": "1.10500",
      "Net P&L": "96.5",
    });
    expect(parsed.rows[1]).toMatchObject({
      Ticket: "1002",
      Type: "sell",
      Item: "GER40&Cash",
      "Net P&L": "23.75",
    });

    const mapping = inferCsvImportMapping(
      parsed.headers,
      "metatrader4-history",
    );
    expect(mapping).toMatchObject({
      date: "Close Time",
      market: "Item",
      netPnL: "Net P&L",
      entry: "Open Price",
      exit: "Close Price",
      stopLoss: "Stop Loss",
      takeProfit: "Take Profit",
      direction: "Type",
      notes: "Import Notes",
      fees: "Commission",
      positionSize: "Size",
    });

    const blocked = buildCsvImportPreview(
      parsed.rows,
      mapping,
      "metatrader4-history",
    );
    expect(blocked.every((row) => row.status === "skip")).toBe(true);
    expect(blocked[0]?.issues.join(" ")).toContain("UTC-Offset");

    const [preview] = buildCsvImportPreview(
      parsed.rows,
      mapping,
      "metatrader4-history",
      undefined,
      120,
    );
    expect(preview?.status).toBe("importable");
    expect(preview?.sourceIdentity).toEqual({
      kind: "ticket",
      header: "Ticket",
      value: "1001",
    });
    expect(preview?.normalized).toMatchObject({
      date: "2026-09-01T08:00:00.000Z",
      market: "EURUSD",
      netPnL: "96.5",
      direction: "Long",
      fees: "2",
      positionSize: "1.00",
    });
    expect(preview?.warnings.join(" ")).toContain(
      "nicht erneut vom importierten Netto-P&L abgezogen",
    );
  });

  it("does not invent net P&L when one result component is missing", () => {
    const parsed = parseMetaTrader4ReportHtml(
      buildReport([
        [
          "2001",
          "2026.09.02 08:00:00",
          "buy",
          "1",
          "XAUUSD",
          "2500",
          "2490",
          "2520",
          "2026.09.02 09:00:00",
          "2510",
          "-3",
          "",
          "0",
          "50",
        ],
      ]),
    );

    expect(parsed.summary).toMatchObject({
      derivedNetPnlCount: 0,
      incompleteNetPnlCount: 1,
    });
    expect(parsed.rows[0]?.["Net P&L"]).toBe("");
    expect(parsed.rows[0]?.["Import Notes"]).toContain(
      "nicht abgeleitet",
    );

    const mapping = inferCsvImportMapping(
      parsed.headers,
      "metatrader4-history",
    );
    const [preview] = buildCsvImportPreview(
      parsed.rows,
      mapping,
      "metatrader4-history",
      undefined,
      0,
    );
    expect(preview?.status).toBe("importable");
    expect(preview?.normalized.netPnL).toBeNull();
    expect(preview?.normalized.entry).toBe("2500");
    expect(preview?.normalized.exit).toBe("2510");
  });

  it("rejects MT5, malformed reports and reports without closed trades", () => {
    expect(() =>
      parseMetaTrader4ReportHtml(
        "<html><title>MetaTrader 5 Report</title><table><tr><td>Deal</td></tr></table></html>",
      ),
    ).toThrow(/MetaTrader 5/);
    expect(() =>
      parseMetaTrader4ReportHtml("<html><body>Account History</body></html>"),
    ).toThrow(/Kein lesbarer/);
    expect(() =>
      parseMetaTrader4ReportHtml(
        buildReport([
          [
            "3000",
            "2026.09.03 08:00:00",
            "buy",
            "1",
            "EURUSD",
            "1.1",
            "0",
            "0",
            "2026.09.03 09:00:00",
            "1.2",
            "0",
            "0",
            "0",
            "10",
          ],
        ]).replace("MetaTrader 4 Account History", "Broker Account History"),
      ),
    ).toThrow(/nicht eindeutig als MetaTrader-4-Export/);
    expect(() =>
      parseMetaTrader4ReportHtml(
        buildReport([
          [
            "3001",
            "2026.09.03 08:00:00",
            "sell limit",
            "1",
            "EURUSD",
            "1.1",
            "0",
            "0",
            "2026.09.03 09:00:00",
            "1.1",
            "0",
            "0",
            "0",
            "0",
          ],
        ]),
      ),
    ).toThrow(/keine eindeutig geschlossenen/);
  });

  it("fails closed for structurally incomplete possible trade rows", () => {
    const incompleteTrailingCell = [
      "4001",
      "2026.09.03 08:00:00",
      "buy",
      "1",
      "EURUSD",
      "1.1",
      "0",
      "0",
      "2026.09.03 09:00:00",
      "1.2",
      "0",
      "0",
      "0",
    ];
    expect(() =>
      parseMetaTrader4ReportHtml(buildReport([incompleteTrailingCell])),
    ).toThrow(/strukturell unvollständig/);

    const incompleteMiddleCell = [...incompleteTrailingCell];
    incompleteMiddleCell.splice(6, 1);
    incompleteMiddleCell.push("10");
    expect(() =>
      parseMetaTrader4ReportHtml(buildReport([incompleteMiddleCell])),
    ).toThrow(/strukturell unvollständig/);
  });

  it("accepts the legacy MT4 Statement and Closed Transactions markers", () => {
    const legacyReport = buildReport([
      [
        "4501",
        "2026.09.03 08:00:00",
        "buy",
        "1",
        "EURUSD",
        "1.1",
        "0",
        "0",
        "2026.09.03 09:00:00",
        "1.2",
        "0",
        "0",
        "0",
        "10",
      ],
    ])
      .replace("MetaTrader 4 Account History", "Statement: 123456")
      .replace("<table>", "<p>Closed Transactions:</p><table>");
    expect(parseMetaTrader4ReportHtml(legacyReport).rows).toHaveLength(1);
  });

  it("rejects ambiguous Price columns on either side of Close Time", () => {
    const standardClosedRow = [
      "5001",
      "2026.09.03 08:00:00",
      "sell",
      "1",
      "EURUSD",
      "1.2",
      "0",
      "0",
      "2026.09.03 09:00:00",
      "1.1",
      "0",
      "0",
      "0",
      "10",
    ];
    const duplicateOpenPriceHeader = [...header];
    duplicateOpenPriceHeader.splice(6, 0, "Price");
    const duplicateOpenPriceRow = [...standardClosedRow];
    duplicateOpenPriceRow.splice(6, 0, "1.2");
    expect(() =>
      parseMetaTrader4ReportHtml(
        buildReportWithHeader(duplicateOpenPriceHeader, [
          duplicateOpenPriceRow,
        ]),
      ),
    ).toThrow(/genau eine Price-Spalte vor/);

    const duplicateClosePriceHeader = [...header];
    duplicateClosePriceHeader.splice(10, 0, "Price");
    const duplicateClosePriceRow = [...standardClosedRow];
    duplicateClosePriceRow.splice(10, 0, "1.1");
    expect(() =>
      parseMetaTrader4ReportHtml(
        buildReportWithHeader(duplicateClosePriceHeader, [
          duplicateClosePriceRow,
        ]),
      ),
    ).toThrow(/genau eine Price-Spalte vor/);
  });

  it("binds only rows from the table that contains the MT4 history header", () => {
    const report = buildReport([
      [
        "6001",
        "2026.09.03 08:00:00",
        "buy",
        "1",
        "EURUSD",
        "1.1",
        "0",
        "0",
        "2026.09.03 09:00:00",
        "1.2",
        "0",
        "0",
        "0",
        "10",
      ],
      ["Closed P/L:", "10"],
    ]).replace(
      "</table></body>",
      `</table><table>${tableRow(["7002", "buy"], "td")}</table></body>`,
    );
    const parsed = parseMetaTrader4ReportHtml(report);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.Ticket).toBe("6001");
    expect(parsed.summary).toMatchObject({
      sourceRowCount: 2,
      excludedRowCount: 1,
    });
  });
});
