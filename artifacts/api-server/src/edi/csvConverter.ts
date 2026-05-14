/**
 * CSV ↔ ANSI X12 EDI converter for SERMACROPS
 *
 * Supports all 6 document types:
 *   850  Purchase Order
 *   855  PO Acknowledgment
 *   856  Advance Ship Notice
 *   810  Invoice
 *   204  Motor Carrier Load Tender
 *   990  Response to Load Tender
 */

const ELEMENT_SEP = "*";
const SEGMENT_SEP = "~";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type EdiDocType = "850" | "855" | "856" | "810" | "204" | "990" | "861";

export interface CsvRow {
  [key: string]: string;
}

export interface DocTypeSpec {
  code: EdiDocType;
  label: string;
  description: string;
  requiredHeaders: string[];
  allHeaders: string[];
  sampleRows: string[][];
}

export const DOC_TYPE_SPECS: Record<EdiDocType, DocTypeSpec> = {
  "850": {
    code: "850",
    label: "Purchase Order",
    description: "Inbound order from a client (e.g., Coffee Shop)",
    requiredHeaders: ["po_number", "product_id", "quantity"],
    allHeaders: ["po_number", "partner_id", "ship_date", "product_id", "description", "quantity", "unit_price", "uom"],
    sampleRows: [
      ["PO12345", "COFFEESHOP", "2026-07-01", "COFFEE001", "Arabica Coffee Beans", "500", "5.00", "LB"],
      ["PO12345", "COFFEESHOP", "2026-07-01", "COFFEE002", "Robusta Coffee Beans", "300", "3.50", "LB"],
    ],
  },
  "855": {
    code: "855",
    label: "PO Acknowledgment",
    description: "Acknowledge or reject a purchase order",
    requiredHeaders: ["po_number", "acknowledge_code"],
    allHeaders: ["po_number", "partner_id", "acknowledge_code", "date"],
    sampleRows: [
      ["PO12345", "COFFEESHOP", "AC", "2026-07-01"],
    ],
  },
  "856": {
    code: "856",
    label: "Advance Ship Notice",
    description: "Notify a partner that a shipment is on its way",
    requiredHeaders: ["shipment_id", "po_number", "product_id", "quantity"],
    allHeaders: ["shipment_id", "partner_id", "po_number", "ship_date", "product_id", "description", "quantity", "uom"],
    sampleRows: [
      ["SHP001", "COFFEESHOP", "PO12345", "2026-07-02", "COFFEE001", "Arabica Coffee Beans", "500", "LB"],
      ["SHP001", "COFFEESHOP", "PO12345", "2026-07-02", "COFFEE002", "Robusta Coffee Beans", "300", "LB"],
    ],
  },
  "810": {
    code: "810",
    label: "Invoice",
    description: "Bill a client for goods or services delivered",
    requiredHeaders: ["invoice_number", "po_number", "product_id", "quantity", "unit_price"],
    allHeaders: ["invoice_number", "partner_id", "invoice_date", "po_number", "product_id", "description", "quantity", "unit_price", "uom"],
    sampleRows: [
      ["INV001", "COFFEESHOP", "2026-07-05", "PO12345", "COFFEE001", "Arabica Coffee Beans", "500", "5.00", "LB"],
      ["INV001", "COFFEESHOP", "2026-07-05", "PO12345", "COFFEE002", "Robusta Coffee Beans", "300", "3.50", "LB"],
    ],
  },
  "204": {
    code: "204",
    label: "Motor Carrier Load Tender",
    description: "Tender a shipment to a logistics carrier",
    requiredHeaders: ["shipment_id", "po_number"],
    allHeaders: ["shipment_id", "partner_id", "po_number", "pickup_date", "carrier_code"],
    sampleRows: [
      ["SHP001", "FASTLOGISTICS", "PO12345", "2026-07-03", "FLOG"],
    ],
  },
  "990": {
    code: "990",
    label: "Response to Load Tender",
    description: "Carrier's acceptance or rejection of a load tender",
    requiredHeaders: ["shipment_id", "response_code"],
    allHeaders: ["shipment_id", "partner_id", "response_code", "date"],
    sampleRows: [
      ["SHP001", "FASTLOGISTICS", "A", "2026-07-03"],
    ],
  },
  "861": {
    code: "861",
    label: "Receiving Advice",
    description: "Confirm receipt of goods from a supplier",
    requiredHeaders: ["receipt_number", "po_number", "quantity_received"],
    allHeaders: ["receipt_number", "partner_id", "po_number", "receipt_date", "product_id", "description", "quantity_received", "uom"],
    sampleRows: [
      ["RCV001", "PHILHARVEST", "PO12345", "2026-07-10", "COFFEE001", "Arabica Coffee Beans", "500", "LB"],
      ["RCV001", "PHILHARVEST", "PO12345", "2026-07-10", "COFFEE002", "Robusta Coffee Beans", "300", "LB"],
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOC TYPE AUTO-DETECTION FROM CSV HEADERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer the EDI document type by checking which spec's required headers
 * are all present in the CSV. More-specific types (more required headers)
 * are checked first so 810 wins over 850 when invoice_number is present.
 */
export function inferDocTypeFromCsv(rows: CsvRow[]): EdiDocType {
  if (rows.length === 0) throw new Error("CSV has no data rows.");
  const headers = new Set(Object.keys(rows[0]));

  const ordered: EdiDocType[] = ["810", "861", "856", "990", "204", "855", "850"];
  for (const code of ordered) {
    const required = DOC_TYPE_SPECS[code].requiredHeaders;
    if (required.every((h) => headers.has(h))) return code;
  }
  throw new Error(
    "Cannot detect EDI document type from CSV headers. " +
    "Make sure your columns match one of the supported formats."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSING
// ─────────────────────────────────────────────────────────────────────────────

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
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function validateCsvHeaders(rows: CsvRow[], docType: EdiDocType): void {
  if (rows.length === 0) throw new Error("CSV has no data rows.");
  const spec = DOC_TYPE_SPECS[docType];
  const headers = Object.keys(rows[0]);
  const missing = spec.requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `CSV for EDI ${docType} (${spec.label}) is missing required columns: ${missing.join(", ")}`
    );
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

  if (!ids.includes("ISA")) errors.push("Missing ISA (interchange control header) segment.");
  if (!ids.includes("GS"))  errors.push("Missing GS (functional group header) segment.");
  if (!ids.includes("ST"))  errors.push("Missing ST (transaction set header) segment.");
  if (!ids.includes("SE"))  errors.push("Missing SE (transaction set trailer) segment.");
  if (!ids.includes("GE"))  errors.push("Missing GE (functional group trailer) segment.");
  if (!ids.includes("IEA")) errors.push("Missing IEA (interchange control trailer) segment.");

  if (errors.length > 0) return { valid: false, errors };

  const isa = segments.find((s) => s.id === "ISA")!;
  if (isa.elements.length < 15) {
    errors.push(`ISA segment must have 15 data elements, found ${isa.elements.length}.`);
  }

  const iea = segments.find((s) => s.id === "IEA")!;
  if (isa.elements[12]?.trim() !== iea.elements[1]?.trim()) {
    errors.push(`ISA/IEA control number mismatch: "${isa.elements[12]?.trim()}" vs "${iea.elements[1]?.trim()}".`);
  }

  const gs = segments.find((s) => s.id === "GS")!;
  const ge = segments.find((s) => s.id === "GE")!;
  if (gs.elements[5]?.trim() !== ge.elements[1]?.trim()) {
    errors.push(`GS/GE control number mismatch: "${gs.elements[5]?.trim()}" vs "${ge.elements[1]?.trim()}".`);
  }

  const st = segments.find((s) => s.id === "ST")!;
  const se = segments.find((s) => s.id === "SE")!;
  if (st.elements[1]?.trim() !== se.elements[1]?.trim()) {
    errors.push(`ST/SE control number mismatch: "${st.elements[1]?.trim()}" vs "${se.elements[1]?.trim()}".`);
  }

  const stIdx = segments.findIndex((s) => s.id === "ST");
  const seIdx = segments.findIndex((s) => s.id === "SE");
  if (stIdx !== -1 && seIdx !== -1) {
    const expected = seIdx - stIdx + 1;
    const declared = parseInt(se.elements[0] || "0", 10);
    if (declared !== expected) {
      errors.push(`SE segment count mismatch: declared ${declared}, found ${expected} (ST to SE inclusive).`);
    }
  }

  const knownTypes = ["850", "855", "856", "810", "204", "990", "861", "997", "824", "214"];
  if (st.elements[0] && !knownTypes.includes(st.elements[0])) {
    errors.push(`Unknown ANSI X12 transaction set identifier "${st.elements[0]}".`);
  }

  const versionCode = isa.elements[11];
  if (versionCode && !["00501", "00401"].includes(versionCode)) {
    errors.push(`Unsupported X12 version "${versionCode}". Expected 00501 or 00401.`);
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildEnvelope(
  transactionType: string,
  senderId: string,
  receiverId: string,
  cn: string,
  bodySegments: string[]
): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
  const timeStr = date.toISOString().slice(11, 16).replace(":", "");
  const cnPad = cn.padStart(9, "0");

  const functionalCodes: Record<string, string> = {
    "850": "PO", "855": "PR", "856": "SH",
    "810": "IN", "204": "SM", "990": "GF", "861": "RC",
  };
  const fc = functionalCodes[transactionType] || "XX";

  const segmentCount = 2 + bodySegments.length; // ST + body + SE (SE counts itself)

  const allSegments = [
    `ISA*00*          *00*          *ZZ*${senderId.padEnd(15)}*ZZ*${receiverId.padEnd(15)}*${dateStr}*${timeStr}*^*00501*${cnPad}*0*P*:`,
    `GS*${fc}*${senderId}*${receiverId}*${dateStr}*${timeStr}*${cnPad}*X*005010`,
    `ST*${transactionType}*${cnPad}`,
    ...bodySegments,
    `SE*${segmentCount}*${cnPad}`,
    `GE*1*${cnPad}`,
    `IEA*1*${cnPad}`,
  ];

  return allSegments.join(`${SEGMENT_SEP}\n`) + SEGMENT_SEP;
}

function toDateStr(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return iso.replace(/-/g, "").slice(0, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV → ANSI X12 CONVERTERS (per doc type)
// ─────────────────────────────────────────────────────────────────────────────

export function csvToEdi(
  rows: CsvRow[],
  docType: EdiDocType,
  senderId: string,
  receiverId: string,
  controlNumber: string
): string {
  validateCsvHeaders(rows, docType);

  switch (docType) {
    case "850": return buildEdi850(rows, senderId, receiverId, controlNumber);
    case "855": return buildEdi855(rows, senderId, receiverId, controlNumber);
    case "856": return buildEdi856(rows, senderId, receiverId, controlNumber);
    case "810": return buildEdi810(rows, senderId, receiverId, controlNumber);
    case "204": return buildEdi204(rows, senderId, receiverId, controlNumber);
    case "990": return buildEdi990(rows, senderId, receiverId, controlNumber);
    case "861": return buildEdi861(rows, senderId, receiverId, controlNumber);
  }
}

// 850 – Purchase Order
function buildEdi850(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const poNumber = rows[0].po_number || `PO${cn}`;
  const dateStr = toDateStr(rows[0].ship_date);

  const lineSegments = rows.map((row, i) => {
    const qty   = parseFloat(row.quantity   || "0") || 0;
    const price = parseFloat(row.unit_price || "0") || 0;
    const uom   = (row.uom         || "EA").toUpperCase();
    const pid   = row.product_id   || `ITEM${i + 1}`;
    const desc  = row.description  || pid;
    return `PO1*${i + 1}*${qty}*${uom}*${price}*PE*VP*${pid}*PI*${desc}`;
  });

  const totalCents = rows.reduce(
    (s, r) => s + parseFloat(r.quantity || "0") * parseFloat(r.unit_price || "0"), 0
  );

  const body = [
    `BEG*00*NE*${poNumber}**${toDateStr()}`,
    `DTM*002*${dateStr}`,
    ...lineSegments,
    `TDS*${Math.round(totalCents * 100).toString().padStart(10, "0")}`,
    `CTT*${rows.length}`,
  ];

  return buildEnvelope("850", senderId, receiverId, cn, body);
}

// 855 – PO Acknowledgment
function buildEdi855(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const row = rows[0];
  const poNumber = row.po_number       || "PO001";
  const ackCode  = (row.acknowledge_code || "AC").toUpperCase();
  const dateStr  = toDateStr(row.date);

  const body = [
    `BAK*00*${ackCode}*${poNumber}*${dateStr}`,
    `CTT*1`,
  ];

  return buildEnvelope("855", senderId, receiverId, cn, body);
}

// 856 – Advance Ship Notice
function buildEdi856(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const first      = rows[0];
  const shipmentId = first.shipment_id || `SHP${cn}`;
  const poNumber   = first.po_number   || "PO001";
  const dateStr    = toDateStr(first.ship_date);
  const timeStr    = new Date().toISOString().slice(11, 16).replace(":", "");

  const itemSegments = rows.flatMap((row, i) => {
    const pid = row.product_id  || `ITEM${i + 1}`;
    const qty = parseFloat(row.quantity || "0") || 0;
    const uom = (row.uom || "EA").toUpperCase();
    const desc = row.description || pid;
    return [
      `HL*${i + 3}*2*I`,
      `LIN*${i + 1}*VP*${pid}`,
      `PID*F****${desc}`,
      `SN1**${qty}*${uom}`,
    ];
  });

  const body = [
    `BSN*00*${shipmentId}*${dateStr}*${timeStr}`,
    `HL*1**S`,
    `TD5*B*2*${senderId}`,
    `HL*2*1*O`,
    `PRF*${poNumber}`,
    ...itemSegments,
    `CTT*${rows.length}`,
  ];

  return buildEnvelope("856", senderId, receiverId, cn, body);
}

// 810 – Invoice
function buildEdi810(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const first      = rows[0];
  const invNumber  = first.invoice_number || `INV${cn}`;
  const poNumber   = first.po_number      || "PO001";
  const invDate    = toDateStr(first.invoice_date);

  const lineSegments = rows.map((row, i) => {
    const pid   = row.product_id  || `ITEM${i + 1}`;
    const qty   = parseFloat(row.quantity   || "0") || 0;
    const price = parseFloat(row.unit_price || "0") || 0;
    const uom   = (row.uom || "EA").toUpperCase();
    const desc  = row.description || pid;
    return `IT1*${i + 1}*${qty}*${uom}*${price}*PE*VP*${pid}*PI*${desc}`;
  });

  const totalCents = rows.reduce(
    (s, r) => s + parseFloat(r.quantity || "0") * parseFloat(r.unit_price || "0"), 0
  );

  const body = [
    `BIG*${invDate}*${invNumber}*${invDate}*${poNumber}`,
    `N1*ST*${receiverId}*ZZ*${receiverId}`,
    ...lineSegments,
    `TDS*${Math.round(totalCents * 100).toString().padStart(10, "0")}`,
    `CTT*${rows.length}`,
  ];

  return buildEnvelope("810", senderId, receiverId, cn, body);
}

// 204 – Motor Carrier Load Tender
function buildEdi204(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const row        = rows[0];
  const shipmentId = row.shipment_id  || `SHP${cn}`;
  const poNumber   = row.po_number    || "PO001";
  const pickupDate = toDateStr(row.pickup_date);
  const carrier    = row.carrier_code || senderId;

  const body = [
    `B2**${carrier}***${shipmentId}*CC`,
    `B2A*04`,
    `L11*${poNumber}*PO`,
    `G62*37*${pickupDate}`,
    `AT5*AI*LT`,
    `N1*SH*${senderId}*ZZ*${senderId}`,
    `N1*CN*${receiverId}*ZZ*${receiverId}`,
    `CTT*1`,
  ];

  return buildEnvelope("204", senderId, receiverId, cn, body);
}

// 990 – Response to Load Tender
function buildEdi990(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const row          = rows[0];
  const shipmentId   = row.shipment_id   || `SHP${cn}`;
  const responseCode = (row.response_code || "A").toUpperCase();
  const dateStr      = toDateStr(row.date);

  const body = [
    `B1*${senderId}*${shipmentId}*${dateStr}*${responseCode === "A" ? "M" : "R"}`,
    `L11*${cn.padStart(9, "0")}*PO`,
    `CTT*1`,
  ];

  return buildEnvelope("990", senderId, receiverId, cn, body);
}

// 861 – Receiving Advice
function buildEdi861(rows: CsvRow[], senderId: string, receiverId: string, cn: string): string {
  const first       = rows[0];
  const rcvNumber   = first.receipt_number || `RCV${cn}`;
  const poNumber    = first.po_number      || "PO001";
  const dateStr     = toDateStr(first.receipt_date);

  const lineSegments = rows.map((row, i) => {
    const pid = row.product_id        || `ITEM${i + 1}`;
    const qty = parseFloat(row.quantity_received || "0") || 0;
    const uom = (row.uom || "EA").toUpperCase();
    const desc = row.description      || pid;
    return `PO1*${i + 1}*${qty}*${uom}*0*PE*VP*${pid}*PI*${desc}`;
  });

  const body = [
    `BRA*${rcvNumber}*0002*${dateStr}*00`,
    `PRF*${poNumber}`,
    ...lineSegments,
    `CTT*${rows.length}`,
  ];

  return buildEnvelope("861", senderId, receiverId, cn, body);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export function getCsvTemplate(docType: EdiDocType): string {
  const spec = DOC_TYPE_SPECS[docType];
  const lines = [
    spec.allHeaders.join(","),
    ...spec.sampleRows.map((r) => r.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
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
    "sermacrops_po", "supplier_id", "supplier_name",
    "product_id", "description", "quantity", "uom",
    "unit_price", "currency", "requested_date",
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

  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
