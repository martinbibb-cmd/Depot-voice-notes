// @ts-check
import { loadWorkerEndpoint } from "../app/worker-config.js";

/**
 * @typedef {{ sku: string; description: string; quantity: number; unitPrice: number; totalPrice: number; category: string; }} QuoteLine
 * @typedef {{ lines: QuoteLine[]; grossPriceIncVat: number; totalDiscountIncVat: number; totalPricePayableIncVat: number; }} QuoteResult
 */

function normaliseNumber(value) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? Number(num) : undefined;
}

/**
 * Derive deterministic pricebook tokens from a Depot survey session.
 * @param {import("../models/depotSession.js").DepotSurveySession} session
 * @returns {string[]}
 */
export function deriveTokensFromSession(session) {
  const tokens = [];
  const existingType = session.existingSystem?.existingSystemType || session.existingSystem?.systemType;
  const systemTypeA = session.boilerJob?.systemTypeA;

  if (existingType === "conventional" && typeof systemTypeA === "string" && systemTypeA.startsWith("A2")) {
    tokens.push("LABOUR_A2_CONV_CONV");
  }

  const totalHeatLoss = normaliseNumber(session.heatLoss?.totalHeatLossKw);
  const fuelType = session.existingSystem?.fuelType;
  if (typeof totalHeatLoss === "number" && totalHeatLoss <= 18 && fuelType === "natural_gas") {
    tokens.push("BOILER_REGULAR_15KW_WORC_RI");
  }

  const magneticFilterType = session.cleansing?.magneticFilterType;
  if (magneticFilterType && magneticFilterType.toLowerCase().includes("22mm")) {
    tokens.push("MAG_FILTER_22MM");
  }

  if (session.cleansing?.cleansingRequired === "yes") {
    tokens.push("CLEANSING_POWERFLUSH");
  }

  if (session.allowances?.charges && session.allowances.charges.some((c) => c.label?.toLowerCase().includes("asbestos"))) {
    tokens.push("ASBESTOS_CHARGE");
  }

  return tokens;
}

/**
 * Build a quote by fetching SKU and price data for the derived tokens.
 * @param {string[]} tokens
 * @returns {Promise<QuoteResult>}
 */
export async function buildQuoteFromTokens(tokens) {
  const workerUrl = loadWorkerEndpoint();
  const response = await fetch(`${workerUrl}/pricebook/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Quote build failed: ${response.status} ${response.statusText} – ${text}`);
  }

  const data = await response.json();
  const lines = Array.isArray(data?.lines)
    ? data.lines.map((line) => {
        const qty = normaliseNumber(line.quantity) ?? 1;
        const unit = normaliseNumber(line.unitPrice) ?? 0;
        return {
          sku: line.sku || "",
          description: line.description || "",
          quantity: qty,
          unitPrice: unit,
          totalPrice: normaliseNumber(line.totalPrice) ?? qty * unit,
          category: line.category || "General"
        };
      })
    : [];

  const grossPriceIncVat = normaliseNumber(data?.grossPriceIncVat) ?? lines.reduce((sum, l) => sum + l.totalPrice, 0);
  const totalDiscountIncVat = normaliseNumber(data?.totalDiscountIncVat) ?? 0;
  const totalPricePayableIncVat = normaliseNumber(data?.totalPricePayableIncVat) ?? grossPriceIncVat - totalDiscountIncVat;

  return {
    lines,
    grossPriceIncVat,
    totalDiscountIncVat,
    totalPricePayableIncVat
  };
}

export default {
  deriveTokensFromSession,
  buildQuoteFromTokens
};
