export interface EdiEnvelope {
  isaHeader: Record<string, string>;
  gsHeader: Record<string, string>;
  transactions: EdiTransaction[];
  gsTrailer: Record<string, string>;
  isaTrailer: Record<string, string>;
}

export interface EdiTransaction {
  stHeader: Record<string, string>;
  segments: EdiSegment[];
  seTrailer: Record<string, string>;
  transactionType: string;
  controlNumber: string;
}

export interface EdiSegment {
  id: string;
  elements: string[];
}

export interface ParsedEdiDocument {
  transactionType: string;
  senderId: string;
  receiverId: string;
  controlNumber: string;
  date: string;
  time: string;
  segments: EdiSegment[];
  envelope: EdiEnvelope;
  summary: Record<string, unknown>;
}

const ELEMENT_SEPARATOR = "*";
const SEGMENT_SEPARATOR = "~";
const COMPONENT_SEPARATOR = ":";

export function parseEdi(rawEdi: string): ParsedEdiDocument {
  const cleaned = rawEdi.replace(/\r\n|\r/g, "").trim();
  const segmentStrings = cleaned.split(SEGMENT_SEPARATOR).map((s) => s.trim()).filter(Boolean);

  const segments: EdiSegment[] = segmentStrings.map((seg) => {
    const elements = seg.split(ELEMENT_SEPARATOR);
    return { id: elements[0], elements: elements.slice(1) };
  });

  const isaSegment = segments.find((s) => s.id === "ISA");
  const gsSegment = segments.find((s) => s.id === "GS");
  const stSegment = segments.find((s) => s.id === "ST");

  if (!isaSegment || !gsSegment || !stSegment) {
    throw new Error("Invalid EDI: missing required envelope segments (ISA, GS, ST)");
  }

  const transactionType = stSegment.elements[0];
  const controlNumber = stSegment.elements[1];
  const senderId = isaSegment.elements[5].trim();
  const receiverId = isaSegment.elements[7].trim();
  const date = isaSegment.elements[8];
  const time = isaSegment.elements[9];

  const envelope: EdiEnvelope = {
    isaHeader: {
      authorizationInfoQualifier: isaSegment.elements[0],
      authorizationInformation: isaSegment.elements[1],
      securityInfoQualifier: isaSegment.elements[2],
      securityInformation: isaSegment.elements[3],
      interchangeSenderIdQualifier: isaSegment.elements[4],
      interchangeSenderId: isaSegment.elements[5],
      interchangeReceiverIdQualifier: isaSegment.elements[6],
      interchangeReceiverId: isaSegment.elements[7],
      interchangeDate: isaSegment.elements[8],
      interchangeTime: isaSegment.elements[9],
      interchangeControlVersionNumber: isaSegment.elements[11],
      interchangeControlNumber: isaSegment.elements[12],
    },
    gsHeader: {
      functionalIdentifierCode: gsSegment.elements[0],
      applicationSenderCode: gsSegment.elements[1],
      applicationReceiverCode: gsSegment.elements[2],
      date: gsSegment.elements[3],
      time: gsSegment.elements[4],
      groupControlNumber: gsSegment.elements[5],
      responsibleAgencyCode: gsSegment.elements[6],
      versionCode: gsSegment.elements[7],
    },
    transactions: [],
    gsTrailer: {},
    isaTrailer: {},
  };

  const summary = buildSummary(transactionType, segments);

  return {
    transactionType,
    senderId,
    receiverId,
    controlNumber,
    date,
    time,
    segments,
    envelope,
    summary,
  };
}

function buildSummary(type: string, segments: EdiSegment[]): Record<string, unknown> {
  switch (type) {
    case "850": return build850Summary(segments);
    case "855": return build855Summary(segments);
    case "856": return build856Summary(segments);
    case "810": return build810Summary(segments);
    case "204": return build204Summary(segments);
    case "990": return build990Summary(segments);
    default: return { type, rawSegmentCount: segments.length };
  }
}

function build850Summary(segments: EdiSegment[]): Record<string, unknown> {
  const beg = segments.find((s) => s.id === "BEG");
  const dtm = segments.find((s) => s.id === "DTM");
  const po1Segments = segments.filter((s) => s.id === "PO1");

  const lineItems = po1Segments.map((seg, i) => ({
    lineNumber: i + 1,
    quantity: parseFloat(seg.elements[1] || "0"),
    uom: seg.elements[2] || "EA",
    unitPrice: parseFloat(seg.elements[3] || "0"),
    basisCode: seg.elements[4] || "PE",
    productId: seg.elements[6] || "",
    description: seg.elements[7] || "",
  }));

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return {
    purchaseOrderNumber: beg?.elements[2] || "",
    purchaseOrderDate: dtm?.elements[1] || "",
    lineItems,
    totalAmount: totalAmount.toFixed(2),
    lineCount: lineItems.length,
  };
}

function build855Summary(segments: EdiSegment[]): Record<string, unknown> {
  const bak = segments.find((s) => s.id === "BAK");
  return {
    purchaseOrderNumber: bak?.elements[2] || "",
    acknowledgeCode: bak?.elements[1] || "",
    date: bak?.elements[3] || "",
  };
}

function build856Summary(segments: EdiSegment[]): Record<string, unknown> {
  const bsn = segments.find((s) => s.id === "BSN");
  const hlSegments = segments.filter((s) => s.id === "HL");
  return {
    shipmentId: bsn?.elements[1] || "",
    shipDate: bsn?.elements[2] || "",
    hierarchicalLevels: hlSegments.length,
  };
}

function build810Summary(segments: EdiSegment[]): Record<string, unknown> {
  const big = segments.find((s) => s.id === "BIG");
  const tds = segments.find((s) => s.id === "TDS");
  return {
    invoiceNumber: big?.elements[2] || "",
    invoiceDate: big?.elements[0] || "",
    purchaseOrderNumber: big?.elements[4] || "",
    totalAmount: tds?.elements[0] || "0",
  };
}

function build204Summary(segments: EdiSegment[]): Record<string, unknown> {
  const b2 = segments.find((s) => s.id === "B2");
  const l11Segments = segments.filter((s) => s.id === "L11");
  return {
    shipmentId: b2?.elements[3] || "",
    carrierAlpha: b2?.elements[1] || "",
    referencePairs: l11Segments.map((s) => ({ ref: s.elements[0], qualifier: s.elements[1] })),
  };
}

function build990Summary(segments: EdiSegment[]): Record<string, unknown> {
  const b1 = segments.find((s) => s.id === "B1");
  return {
    standardCarrierAlphaCode: b1?.elements[1] || "",
    shipmentId: b1?.elements[2] || "",
    date: b1?.elements[3] || "",
  };
}

export function generateEdi(
  transactionType: string,
  senderId: string,
  receiverId: string,
  controlNumber: string,
  payload: Record<string, unknown>
): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(2, 10).replace(/-/g, "");
  const timeStr = date.toISOString().slice(11, 16).replace(":", "");
  const cn = controlNumber.padStart(9, "0");

  const isaHeader = `ISA*00*          *00*          *ZZ*${senderId.padEnd(15)}*ZZ*${receiverId.padEnd(15)}*${dateStr}*${timeStr}*^*00501*${cn}*0*P*:`;
  const gsHeader = `GS*${getFunctionalCode(transactionType)}*${senderId}*${receiverId}*${dateStr}*${timeStr}*${cn}*X*005010`;
  const stHeader = `ST*${transactionType}*${cn}`;

  let bodySegments = "";
  let segmentCount = 2;

  switch (transactionType) {
    case "855": {
      const body = payload as { purchaseOrderNumber?: string; lineItems?: Array<{ quantity: number; uom: string; unitPrice: number; productId: string }> };
      bodySegments = `BAK*00*AC*${body.purchaseOrderNumber || "PO001"}*${dateStr}`;
      segmentCount++;
      break;
    }
    case "856": {
      const body = payload as { poNumber?: string; items?: Array<{ productId: string; description?: string; quantity: number }> };
      const shipmentId = `SHP${cn}`;
      bodySegments = [
        `BSN*00*${shipmentId}*${dateStr}*${timeStr}`,
        `HL*1**S`,
        `TD5*B*2*${senderId}`,
        `HL*2*1*O`,
        `PRF*${body.poNumber || "PO001"}`,
        `HL*3*2*P`,
        `PID*F****${body.items?.[0]?.description || "Shipment Package"}`,
        `HL*4*3*I`,
        `LIN*1*VP*${body.items?.[0]?.productId || "ITEM001"}`,
        `SN1**${body.items?.[0]?.quantity || 1}*EA`,
      ].join(SEGMENT_SEPARATOR + "\n");
      segmentCount += 10;
      break;
    }
    case "810": {
      const body = payload as { poNumber?: string; invoiceNumber?: string; totalAmount?: number; items?: Array<{ productId: string; quantity: number; unitPrice: number }> };
      const invNum = body.invoiceNumber || `INV${cn}`;
      const total = (body.totalAmount || 0).toFixed(2).replace(".", "").padStart(10, "0");
      bodySegments = [
        `BIG*${dateStr}*${invNum}*${dateStr}*${body.poNumber || "PO001"}`,
        `N1*ST*${receiverId}*ZZ*${receiverId}`,
        `IT1*1*${body.items?.[0]?.quantity || 1}*EA*${body.items?.[0]?.unitPrice || 0}*PE*VP*${body.items?.[0]?.productId || "ITEM001"}`,
        `TDS*${total}`,
        `CTT*${body.items?.length || 1}`,
      ].join(SEGMENT_SEPARATOR + "\n");
      segmentCount += 5;
      break;
    }
    case "850": {
      const body = payload as { poNumber?: string; items?: Array<{ productId: string; description?: string; quantity: number; unitPrice?: number }> };
      const items = body.items || [{ productId: "RAW001", description: "Raw Coffee Beans", quantity: 1000, unitPrice: 2.50 }];
      const lineSegments = items.map((item, i) =>
        `PO1*${i + 1}*${item.quantity}*LB*${item.unitPrice || 0}*PE*VP*${item.productId}`
      );
      bodySegments = [
        `BEG*00*NE*${body.poNumber || `PO${cn}`}**${dateStr}`,
        `DTM*002*${dateStr}`,
        ...lineSegments,
        `CTT*${items.length}`,
      ].join(SEGMENT_SEPARATOR + "\n");
      segmentCount += 3 + items.length;
      break;
    }
    case "204": {
      const body = payload as { poNumber?: string; shipmentId?: string };
      bodySegments = [
        `B2**${senderId}***${body.shipmentId || `SHP${cn}`}*CC`,
        `B2A*04`,
        `L11*${body.poNumber || "PO001"}*PO`,
        `G62*37*${dateStr}`,
        `AT5*AI*LT`,
        `N1*SH*${senderId}*ZZ*${senderId}`,
        `N1*CN*${receiverId}*ZZ*${receiverId}`,
      ].join(SEGMENT_SEPARATOR + "\n");
      segmentCount += 7;
      break;
    }
    case "990": {
      const body = payload as { shipmentId?: string };
      bodySegments = [
        `B1*${senderId}*${body.shipmentId || `SHP${cn}`}*${dateStr}*M`,
        `L11*${cn}*PO`,
      ].join(SEGMENT_SEPARATOR + "\n");
      segmentCount += 2;
      break;
    }
    default:
      bodySegments = `NTE**Unknown transaction type ${transactionType}`;
      segmentCount++;
  }

  const seTrailer = `SE*${segmentCount}*${cn}`;
  const geTrailer = `GE*1*${cn}`;
  const ieaTrailer = `IEA*1*${cn}`;

  return [isaHeader, gsHeader, stHeader, bodySegments, seTrailer, geTrailer, ieaTrailer].join(SEGMENT_SEPARATOR + "\n") + SEGMENT_SEPARATOR;
}

function getFunctionalCode(transactionType: string): string {
  const codes: Record<string, string> = {
    "850": "PO",
    "855": "PR",
    "856": "SH",
    "810": "IN",
    "204": "SM",
    "990": "GF",
  };
  return codes[transactionType] || "XX";
}
