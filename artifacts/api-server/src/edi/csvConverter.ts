/**
 * CSV ↔ ANSI X12 EDI converter for SERMACROPS
 *
 * Inbound CSV format (850 Purchase Order from client):
 *   po_number, partner_id, ship_date, product_id, description, quantity, unit_price, uom
 *
 * Outbound CSV format (850 Purchase Order to supplier):
 *   sermacrops_po, supplier_id, supplier_name, product_id, description, quantity, uom, unit_price, requested_date
 */

const ELEMENT_SEP = "*";
const SEGMENT_SEP = "~";

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSING
// ─────────────────────────────────────────────────────────────────────────────

export interface CsvRow {
  [key: string]: string;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_850_HEADERS = ["po_number", "product_id", "quantity"];

export function validateCsvHeaders(rows: CsvRow[]): void {
  if (rows.length === 0) throw new Error("CSV has no data rows.");
  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_850_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSI X12 VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface X12ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAnsiX12(rawEdi: string): X12ValidationResult {
  const errors: string[] = [];

  const cleaned = rawEdi.replace(/\r\n|\r/g, "").trim();
  const segments = cleaned
    .split(SEGMENT_SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(ELEMENT_SEP);
      return { id: parts[0], elements: parts.slice(1) };
    });

  const ids = segments.map((s) => s.id);

  // Required envelope segments
  if (!ids.includes("ISA")) errors.push("Missing ISA (interchange control header) segment.");
  if (!ids.includes("GS")) errors.push("Missing GS (functional group header) segment.");
  if (!ids.includes("ST")) errors.push("Missing ST (transaction set header) segment.");
  if (!ids.includes("SE")) errors.push("Missing SE (transaction set trailer) segment.");
  if (!ids.includes("GE")) errors.push("Missing GE (functional group trailer) segment.");
  if (!ids.includes("IEA")) errors.push("Missing IEA (interchange control trailer) segment.");

  if (errors.length > 0) return { valid: false, errors };

  // ISA must have exactly 15 data elements (16 total with segment id)
  const isa = segments.find((s) => s.id === "ISA")!;
  if (isa.elements.length < 15) {
    errors.push(`ISA segment must have 15 data elements, found ${isa.elements.length}.`);
  }

  // Control number consistency: ISA[12] must match IEA[1]
  const isaControlNum = isa.elements[12];
  const iea = segments.find((s) => s.id === "IEA")!;
  const ieaControlNum = iea.elements[1];
  if (isaControlNum && ieaControlNum && isaControlNum.trim() !== ieaControlNum.trim()) {
    errors.push(
      `ISA/IEA control number mismatch: ISA has "${isaControlNum.trim()}", IEA has "${ieaControlNum.trim()}".`
    );
  }

  // GS[5] must match GE[1]
  const gs = segments.find((s) => s.id === "GS")!;
  const ge = segments.find((s) => s.id === "GE")!;
  const gsControlNum = gs.elements[5];
  const geControlNum = ge.elements[1];
  if (gsControlNum && geControlNum && gsControlNum.trim() !== geControlNum.trim()) {
    errors.push(
      `GS/GE control number mismatch: GS has "${gsControlNum.trim()}", GE has "${geControlNum.trim()}".`
    );
  }

  // ST[1] must match SE[1]
  const st = segments.find((s) => s.id === "ST")!;
  const se = segments.find((s) => s.id === "SE")!;
  const stControlNum = st.elements[1];
  const seControlNum = se.elements[1];
  if (stControlNum && seControlNum && stControlNum.trim() !== seControlNum.trim()) {
    errors.push(
      `ST/SE control number mismatch: ST has "${stControlNum.trim()}", SE has "${seControlNum.trim()}".`
    );
  }

  // SE[0] must equal segment count between ST and SE (inclusive)
  const stIdx = segments.findIndex((s) => s.id === "ST");
  const seIdx = segments.findIndex((s) => s.id === "SE");
  if (stIdx !== -1 && seIdx !== -1) {
    const expectedCount = seIdx - stIdx + 1; // ST through SE inclusive
    const seCount = parseInt(se.elements[0] || "0", 10);
    if (seCount !== expectedCount) {
      errors.push(
        `SE segment count mismatch: SE declares ${seCount} segments, but found ${expectedCount} (ST to SE inclusive).`
      );
    }
  }

  // ST[0] must be a recognised X12 transaction type
  const transactionType = st.elements[0];
  const knownTypes = ["850", "855", "856", "810", "204", "990", "997", "824", "214"];
  if (transactionType && !knownTypes.includes(transactionType)) {
    errors.push(`Unknown ANSI X12 transaction set identifier "${transactionType}".`);
  }

  // Verify ISA version is 00501 (X12 5010) or 00401 (X12 4010)
  const versionCode = isa.elements[11];
  if (versionCode && !["00501", "00401"].includes(versionCode)) {
    errors.push(`Unsupported X12 version "${versionCode}". Expected 00501 or 00401.`);
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV → EDI 850
// ─────────────────────────────────────────────────────────────────────────────

export function csvToEdi850(
  rows: CsvRow[],
  senderId: string,
  receiverId: string,
  controlNumber: string
): string {
  validateCsvHeaders(rows);

  // Group rows by po_number (take first PO number from first row)
  const poNumber = rows[0].po_number || `PO${controlNumber}`;
  const shipDate = rows[0].ship_date || "";

  const date = new Date();
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
  const timeStr = date.toISOString().slice(11, 16).replace(":", "");
  const cn = controlNumber.padStart(9, "0");

  const lineSegments = rows.map((row, i) => {
    const qty = parseFloat(row.quantity || "0") || 0;
    const price = parseFloat(row.unit_price || "0") || 0;
    const uom = (row.uom || "EA").toUpperCase();
    const productId = row.product_id || `ITEM${i + 1}`;
    const desc = row.description || productId;
    return `PO1*${i + 1}*${qty}*${uom}*${price}*PE*VP*${productId}*PI*${desc}`;
  });

  const totalAmount = rows.reduce((sum, row) => {
    return sum + (parseFloat(row.quantity || "0") * parseFloat(row.unit_price || "0"));
  }, 0);

  const bodySegments = [
    `BEG*00*NE*${poNumber}**${dateStr}`,
    shipDate ? `DTM*002*${shipDate.replace(/-/g, "")}` : `DTM*002*${dateStr}`,
    ...lineSegments,
    `TDS*${Math.round(totalAmount * 100).toString().padStart(10, "0")}`,
    `CTT*${rows.length}`,
  ];

  const segmentCount = 2 + bodySegments.length; // ST + SE

  const allSegments = [
    `ISA*00*          *00*          *ZZ*${senderId.padEnd(15)}*ZZ*${receiverId.padEnd(15)}*${dateStr}*${timeStr}*^*00501*${cn}*0*P*:`,
    `GS*PO*${senderId}*${receiverId}*${dateStr}*${timeStr}*${cn}*X*005010`,
    `ST*850*${cn}`,
    ...bodySegments,
    `SE*${segmentCount}*${cn}`,
    `GE*1*${cn}`,
    `IEA*1*${cn}`,
  ];

  return allSegments.join(`${SEGMENT_SEP}\n`) + SEGMENT_SEP;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER PO → CSV (outbound)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierPoItem {
  productId: string;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
}

export interface SupplierPoData {
  poNumber: string;
  supplierId: string;
  supplierName: string;
  requestedDate?: string;
  items: SupplierPoItem[];
  currency?: string;
}

export function generateSupplierPoCsv(po: SupplierPoData): string {
  const headers = [
    "sermacrops_po",
    "supplier_id",
    "supplier_name",
    "product_id",
    "description",
    "quantity",
    "uom",
    "unit_price",
    "currency",
    "requested_date",
  ];

  const rows = po.items.map((item) => [
    po.poNumber,
    po.supplierId,
    po.supplierName,
    item.productId,
    item.description || item.productId,
    String(item.quantity),
    item.uom || "EA",
    String(item.unitPrice || 0),
    po.currency || "USD",
    po.requestedDate || new Date().toISOString().slice(0, 10),
  ]);

  const lines = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))];
  return lines.join("\n");
}

/** Wrap a CSV field in quotes if it contains commas, quotes or newlines. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV TEMPLATE (downloadable by the user)
// ─────────────────────────────────────────────────────────────────────────────

export function getInbound850CsvTemplate(): string {
  return [
    "po_number,partner_id,ship_date,product_id,description,quantity,unit_price,uom",
    "PO12345,COFFEESHOP,2026-07-01,COFFEE001,Arabica Coffee Beans,500,5.00,LB",
    "PO12345,COFFEESHOP,2026-07-01,COFFEE002,Robusta Coffee Beans,300,3.50,LB",
  ].join("\n");
}
