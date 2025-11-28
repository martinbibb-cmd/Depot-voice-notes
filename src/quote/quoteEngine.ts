import { loadWorkerEndpoint } from "../app/worker-config.js";
import type { DepotSurveySession } from "../models/depotSession.js";

export interface QuoteLine {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: string;
}

export interface QuoteResult {
  lines: QuoteLine[];
  grossPriceIncVat: number;
  totalDiscountIncVat: number;
  totalPricePayableIncVat: number;
}

function normaliseNumber(value?: unknown): number | undefined {
  const num = typeof value === "string" ? Number(value) : (value as number | undefined);
  return Number.isFinite(num) ? Number(num) : undefined;
}

export function deriveTokensFromSession(session: DepotSurveySession): string[] {
  const tokens: string[] = [];
  const existingType = session.existingSystem?.existingSystemType || session.existingSystem?.systemType;
  const systemTypeA = (session.boilerJob as any)?.systemTypeA as string | undefined;

  if (existingType === "conventional" && typeof systemTypeA === "string" && systemTypeA.startsWith("A2")) {
    tokens.push("LABOUR_A2_CONV_CONV");
  }

  const totalHeatLoss = normaliseNumber(session.heatLoss?.totalHeatLossKw);
  const fuelType = session.existingSystem?.fuelType;
  if (typeof totalHeatLoss === "number" && totalHeatLoss <= 18 && fuelType === "natural_gas") {
    tokens.push("BOILER_REGULAR_15KW_WORC_RI");
  }

  const magneticFilterType = (session.cleansing as any)?.magneticFilterType as string | undefined;
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

export async function buildQuoteFromTokens(tokens: string[]): Promise<QuoteResult> {
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

  const data = (await response.json()) as Partial<QuoteResult> & { lines?: Partial<QuoteLine>[] };
  const lines: QuoteLine[] = Array.isArray(data.lines)
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

  const grossPriceIncVat = normaliseNumber(data.grossPriceIncVat) ?? lines.reduce((sum, l) => sum + l.totalPrice, 0);
  const totalDiscountIncVat = normaliseNumber(data.totalDiscountIncVat) ?? 0;
  const totalPricePayableIncVat = normaliseNumber(data.totalPricePayableIncVat) ?? grossPriceIncVat - totalDiscountIncVat;

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
