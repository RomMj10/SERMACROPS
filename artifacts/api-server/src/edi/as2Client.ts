import { logger } from "../lib/logger";

export interface As2Message {
  messageId: string;
  from: string;
  to: string;
  contentType: string;
  body: string;
  headers: Record<string, string>;
  signature?: string;
  encrypted?: boolean;
}

export interface As2SendResult {
  success: boolean;
  messageId: string;
  mdnStatus?: string;
  error?: string;
}

function signMessage(body: string, senderId: string): string {
  const hash = Buffer.from(`${senderId}:${body}`).toString("base64");
  return `SHA256:${hash.substring(0, 32)}`;
}

function verifySignature(message: As2Message): boolean {
  if (!message.signature) return true;
  return message.signature.startsWith("SHA256:");
}

export function createAs2Message(
  from: string,
  to: string,
  body: string,
  transactionType: string
): As2Message {
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${from.toLowerCase().replace(/\s/g, "")}.sermacrops>`;
  const signature = signMessage(body, from);

  return {
    messageId,
    from,
    to,
    contentType: "application/edi-x12",
    body,
    headers: {
      "AS2-Version": "1.2",
      "AS2-From": from,
      "AS2-To": to,
      "Message-ID": messageId,
      "Content-Type": "application/edi-x12",
      "MIME-Version": "1.0",
      "EDI-Transaction-Type": transactionType,
    },
    signature,
    encrypted: false,
  };
}

export async function sendAs2Message(
  endpointUrl: string,
  message: As2Message
): Promise<As2SendResult> {
  const log = logger.child({ messageId: message.messageId, to: message.to, endpoint: endpointUrl });

  log.info("Simulating AS2 send");

  await new Promise((res) => setTimeout(res, 50 + Math.random() * 100));

  if (endpointUrl.includes("mock-fail")) {
    log.warn("AS2 send simulated failure");
    return { success: false, messageId: message.messageId, error: "Connection refused (simulated)" };
  }

  log.info("AS2 send simulated success");
  return {
    success: true,
    messageId: message.messageId,
    mdnStatus: "processed",
  };
}

export function receiveAs2Message(rawBody: string, headers: Record<string, string>): As2Message {
  const message: As2Message = {
    messageId: headers["message-id"] || `<${Date.now()}@unknown>`,
    from: headers["as2-from"] || "UNKNOWN",
    to: headers["as2-to"] || "SERMACROPS",
    contentType: headers["content-type"] || "application/edi-x12",
    body: rawBody,
    headers,
    signature: headers["x-as2-signature"],
  };

  const valid = verifySignature(message);
  if (!valid) {
    logger.warn({ messageId: message.messageId }, "AS2 signature verification failed");
  }

  return message;
}
