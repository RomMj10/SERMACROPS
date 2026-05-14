import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Download, CheckCircle2, XCircle,
  AlertTriangle, Loader2, FileUp, Braces, FileCode2,
  ClipboardCheck, TrendingDown, PackageCheck,
} from "lucide-react";

type ResultView = "json" | "edi";
type PostAcceptDoc = "855" | "810" | "204";

interface InventoryComparison {
  productId: string;
  description: string;
  orderedQty: number;
  uom: string;
  unitPrice: number;
  beforeAvailable: number;
  afterAvailable: number;
  reorderPoint: number;
  canFulfill: boolean;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-secondary/40 border border-border rounded-md p-4 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-[400px] overflow-y-auto">
      {children}
    </pre>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ResultView;
  onChange: (v: ResultView) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
      <button
        onClick={() => onChange("json")}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
          value === "json"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <Braces className="h-3.5 w-3.5" /> JSON
      </button>
      <button
        onClick={() => onChange("edi")}
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
          value === "edi"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <FileCode2 className="h-3.5 w-3.5" /> Raw EDI
      </button>
    </div>
  );
}

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultView, setResultView] = useState<ResultView>("json");
  const [pendingView, setPendingView] = useState<ResultView>("json");
  const [accepted, setAccepted] = useState(false);
  const [acceptDetails, setAcceptDetails] = useState<any>(null);
  const [postAcceptDoc, setPostAcceptDoc] = useState<PostAcceptDoc>("855");
  const [postAcceptView, setPostAcceptView] = useState<ResultView>("edi");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    if (!selected.name.endsWith(".csv")) {
      toast({ title: "Invalid file type", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    setFile(selected);
    setResult(null);
    setAccepted(false);
    setAcceptDetails(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files[0] ?? null);
  }

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    setResult(null);
    setAccepted(false);
    setAcceptDetails(null);
    setPendingView("json");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/edi/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult({ ...data, httpStatus: res.status });

      if (res.ok && data.success) {
        if (data.pending) {
          toast({
            title: "EDI 850 Parsed — Awaiting Acceptance",
            description: `${data.csvRowsProcessed} line(s) from ${data.partnerName}. Review inventory and accept to process.`,
          });
        } else {
          toast({
            title: "EDI Processed",
            description: `EDI ${data.detectedDocType} (${data.detectedDocLabel}) — ${data.csvRowsProcessed} row(s) processed.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        }
      } else {
        toast({
          title: "Processing Failed",
          description: data.message || "Failed to process CSV",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAccept() {
    if (!result?.transactionId) return;
    setIsAccepting(true);
    try {
      const res = await fetch(`/api/edi/accept-850/${result.transactionId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setAccepted(true);
        setAcceptDetails(data);
        setPostAcceptDoc("855");
        setPostAcceptView("edi");
        toast({ title: "PO Accepted", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      } else {
        toast({ title: "Acceptance Failed", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsAccepting(false);
    }
  }

  const isPending850 = result?.success && result?.pending && result?.detectedDocType === "850";
  const comparison: InventoryComparison[] = result?.inventoryComparison || [];
  const canFullyFulfill = comparison.length > 0 && comparison.every((c) => c.canFulfill);

  const activePostAcceptEdi =
    postAcceptDoc === "855" ? acceptDetails?.edi855 :
    postAcceptDoc === "810" ? acceptDetails?.edi810 :
    acceptDetails?.edi204;
  const activePostAcceptJson =
    postAcceptDoc === "855"
      ? { type: "855", purchaseOrderNumber: result?.parsedEdiJson?.summary?.purchaseOrderNumber, acknowledgeCode: "AC", action: "po_acknowledged" }
    : postAcceptDoc === "810"
      ? { type: "810", invoiceNumber: acceptDetails?.invoiceNumber, purchaseOrderNumber: result?.parsedEdiJson?.summary?.purchaseOrderNumber, totalAmount: acceptDetails?.totalAmount, currency: "USD", action: "invoice_sent_to_client" }
    : { type: "204", shipmentId: acceptDetails?.shipmentId, poNumber: acceptDetails?.poNumber, logisticsPartner: acceptDetails?.logisticsPartnerName, action: "load_tender_sent" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSV Upload</h1>
          <p className="text-muted-foreground mt-1">
            Drop a CSV — the document type and partner are detected automatically, converted to ANSI X12 EDI, and processed.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Upload card ── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
            <CardDescription>
              The EDI type is detected automatically from your column headers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                "border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : file
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-border hover:border-primary/50 hover:bg-secondary/30",
              ].join(" ")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-emerald-600" />
                  <span className="font-medium text-emerald-800">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · click or drop to replace
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <FileUp className="h-10 w-10" />
                  <div>
                    <p className="font-medium">Drop a CSV file here</p>
                    <p className="text-xs mt-0.5">or click to browse</p>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full gap-2"
              disabled={!file || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><Upload className="h-4 w-4" /> Convert &amp; Process</>
              )}
            </Button>

            {/* Download links */}
            <div className="border border-border rounded-md divide-y divide-border text-sm">
              {[
                { code: "850", label: "Purchase Order" },
                { code: "855", label: "PO Acknowledgment" },
                { code: "856", label: "Advance Ship Notice" },
                { code: "810", label: "Invoice" },
                { code: "204", label: "Load Tender" },
                { code: "990", label: "Response to Load Tender" },
                { code: "861", label: "Receiving Advice" },
              ].map((t) => (
                <a
                  key={t.code}
                  href={`/api/edi/template/${t.code}`}
                  download
                  className="flex items-center justify-between px-3 py-2 hover:bg-secondary/40 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <span>
                    <span className="font-mono font-semibold text-foreground mr-2">{t.code}</span>
                    {t.label}
                  </span>
                  <Download className="h-3.5 w-3.5 shrink-0" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Result card ── */}
        <Card className="border-border flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {isPending850 ? "Purchase Order Review" : "Processing Result"}
                </CardTitle>
                <CardDescription className="mt-1">
                  {isPending850
                    ? "Review inventory impact before accepting"
                    : "ANSI X12 validation and EDI routing outcome"}
                </CardDescription>
              </div>
              {result?.success && !isPending850 && (
                <ViewToggle value={resultView} onChange={setResultView} />
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {!result ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <FileUp className="h-8 w-8 opacity-30" />
                <p className="text-sm">Upload a CSV to see the result</p>
              </div>

            ) : isPending850 ? (
              /* ── 850 Pending Acceptance View ── */
              <div className="space-y-5">
                {/* Partner + PO info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-mono font-semibold">850</Badge>
                  <span className="text-sm text-muted-foreground">Purchase Order from</span>
                  <span className="text-sm font-semibold">{result.partnerName}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {result.csvRowsProcessed} line{result.csvRowsProcessed !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {/* Inventory comparison table */}
                {comparison.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Inventory Impact
                      </p>
                      {canFullyFulfill ? (
                        <Badge variant="outline" className="ml-auto text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                          Can Fully Fulfill
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-auto text-destructive border-destructive/50 bg-destructive/5 text-xs">
                          Stock Insufficient
                        </Badge>
                      )}
                    </div>
                    <div className="border border-border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-secondary/40 border-b border-border">
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Product</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Ordered</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Before</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">After</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {comparison.map((row) => (
                            <tr key={row.productId} className={row.canFulfill ? "" : "bg-destructive/5"}>
                              <td className="px-3 py-2">
                                <p className="font-medium text-foreground">{row.description}</p>
                                <p className="font-mono text-muted-foreground">{row.productId}</p>
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-semibold">
                                {row.orderedQty} <span className="text-muted-foreground">{row.uom}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {row.beforeAvailable}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-bold ${row.canFulfill ? "text-primary" : "text-destructive"}`}>
                                {row.afterAvailable}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {row.canFulfill ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-destructive font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Low
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!canFullyFulfill && (
                      <p className="text-xs text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Some items exceed current available stock. You can still accept — inventory will go negative.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Inbound EDI preview (before accept) ── */}
                {!accepted && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <FileCode2 className="h-3.5 w-3.5" />
                        Inbound EDI 850 Document
                      </p>
                      <ViewToggle value={pendingView} onChange={setPendingView} />
                    </div>

                    {pendingView === "json" && result.parsedEdiJson && (
                      <CodeBlock>
                        {JSON.stringify(result.parsedEdiJson, null, 2)}
                      </CodeBlock>
                    )}

                    {pendingView === "edi" && result.generatedEdi && (
                      <div className="space-y-1">
                        <div className="flex justify-end">
                          <Badge variant="outline" className="text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                            X12 005010 ✓
                          </Badge>
                        </div>
                        <CodeBlock>{result.generatedEdi}</CodeBlock>
                      </div>
                    )}
                  </div>
                )}

                {/* Accept button */}
                {!accepted && (
                  <Button
                    className="w-full gap-2"
                    disabled={isAccepting}
                    onClick={handleAccept}
                  >
                    {isAccepting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Accepting…</>
                    ) : (
                      <><ClipboardCheck className="h-4 w-4" /> Accept Purchase Order</>
                    )}
                  </Button>
                )}

                {/* ── Post-acceptance view ── */}
                {accepted && acceptDetails && (
                  <div className="space-y-4">
                    {/* Success banner */}
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 space-y-2">
                      <p className="font-semibold text-emerald-800 flex items-center gap-2">
                        <PackageCheck className="h-5 w-5" /> Purchase Order Accepted
                      </p>
                      <p className="text-sm text-emerald-700">{acceptDetails.message}</p>
                      <div className="flex gap-3 text-xs font-mono text-emerald-700 flex-wrap">
                        <span>Invoice: {acceptDetails.invoiceNumber}</span>
                        <span>Total: ${Number(acceptDetails.totalAmount || 0).toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-emerald-600 mt-1">
                        EDI 855 (Acknowledgment) + EDI 810 (Invoice) sent to {acceptDetails.partnerName}.
                        EDI 204 (Load Tender) dispatched to {acceptDetails.logisticsPartnerName}.
                        Inventory updated.
                      </p>
                    </div>

                    {/* Generated EDI preview (855 / 810) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <FileCode2 className="h-3.5 w-3.5" />
                          Generated EDI Response
                        </p>
                        <ViewToggle value={postAcceptView} onChange={setPostAcceptView} />
                      </div>

                      {/* Doc selector tabs */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {(
                          [
                            { code: "855", label: "ACK", to: acceptDetails.partnerName },
                            { code: "810", label: "Invoice", to: acceptDetails.partnerName },
                            { code: "204", label: "Load Tender", to: acceptDetails.logisticsPartnerName },
                          ] as { code: PostAcceptDoc; label: string; to: string }[]
                        ).map(({ code, label, to }) => (
                          <button
                            key={code}
                            onClick={() => setPostAcceptDoc(code)}
                            className={[
                              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-semibold border transition-colors",
                              postAcceptDoc === code
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50",
                            ].join(" ")}
                          >
                            {code}
                            <span className="font-sans font-normal opacity-70">{label}</span>
                            {to && (
                              <span className="font-sans font-normal opacity-50 hidden sm:inline">→ {to}</span>
                            )}
                          </button>
                        ))}
                      </div>

                      {postAcceptView === "json" && (
                        <CodeBlock>
                          {JSON.stringify(activePostAcceptJson, null, 2)}
                        </CodeBlock>
                      )}

                      {postAcceptView === "edi" && activePostAcceptEdi && (
                        <div className="space-y-1">
                          <div className="flex justify-end">
                            <Badge variant="outline" className="text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                              X12 005010 ✓
                            </Badge>
                          </div>
                          <CodeBlock>{activePostAcceptEdi}</CodeBlock>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            ) : (
              /* ── Standard result view ── */
              <div className="space-y-4">
                {/* Status banner */}
                <div className={[
                  "flex items-start gap-3 rounded-lg p-4 border",
                  result.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-red-50 border-red-300 text-red-800",
                ].join(" ")}>
                  {result.success
                    ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                    : <XCircle className="h-5 w-5 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="font-semibold">{result.success ? "Success" : "Failed"}</p>
                    <p className="text-sm">{result.message}</p>
                    {result.success && (
                      <p className="text-xs mt-1 opacity-80 font-mono break-all">
                        tx: {result.transactionId}
                      </p>
                    )}
                  </div>
                </div>

                {result.success && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono font-semibold">
                      {result.detectedDocType}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{result.detectedDocLabel}</span>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {result.csvRowsProcessed} row{result.csvRowsProcessed !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                )}

                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> ANSI X12 Validation Errors
                    </p>
                    <ul className="space-y-1">
                      {result.errors.map((e: string, i: number) => (
                        <li key={i} className="text-xs text-destructive bg-destructive/5 rounded px-3 py-1.5">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.success && resultView === "json" && result.parsedEdiJson && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      EDI Content — JSON
                    </p>
                    <CodeBlock>
                      {JSON.stringify(result.parsedEdiJson, null, 2)}
                    </CodeBlock>
                  </div>
                )}

                {result.success && resultView === "edi" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Raw ANSI X12 EDI
                      </p>
                      <Badge variant="outline" className="text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                        X12 005010 ✓
                      </Badge>
                    </div>
                    <CodeBlock>{result.generatedEdi}</CodeBlock>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
