import { useState, useRef } from "react";
import { useListPartners } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileUp,
} from "lucide-react";

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: partnersData, isLoading: isLoadingPartners } = useListPartners();
  const clientPartners = partnersData?.partners?.filter((p) => p.type === "client") ?? [];

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    if (!selected.name.endsWith(".csv")) {
      toast({ title: "Invalid file type", description: "Please upload a .csv file.", variant: "destructive" });
      return;
    }
    setFile(selected);
    setResult(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }

  async function handleUpload() {
    if (!file || !partnerId) return;
    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("partnerId", partnerId);

      const res = await fetch("/api/edi/upload", { method: "POST", body: formData });
      const data = await res.json();

      setResult({ ...data, httpStatus: res.status });

      if (res.ok && data.success) {
        toast({ title: "EDI Processed", description: `${data.csvRowsProcessed} line item(s) processed successfully.` });
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
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

  function downloadTemplate() {
    window.open("/api/edi/template/850", "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSV Upload</h1>
          <p className="text-muted-foreground mt-1">
            Upload a purchase order CSV from a trading partner. It will be converted to ANSI X12 EDI and processed.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} className="gap-2">
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Upload card ── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Upload Purchase Order CSV</CardTitle>
            <CardDescription>
              CSV is converted to ANSI X12 EDI 850 and validated before processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Partner selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Trading Partner (Sender)</label>
              <Select value={partnerId} onValueChange={setPartnerId} disabled={isLoadingPartners}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the partner sending this PO" />
                </SelectTrigger>
                <SelectContent>
                  {clientPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
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
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                  <span className="text-xs text-muted-foreground">Click or drop to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileUp className="h-10 w-10" />
                  <span className="font-medium">Drop a CSV file here</span>
                  <span className="text-xs">or click to browse</span>
                </div>
              )}
            </div>

            {/* Format reference */}
            <div className="bg-secondary/40 rounded-md p-3 text-xs font-mono text-muted-foreground space-y-1">
              <p className="text-foreground font-semibold text-[11px] uppercase tracking-wide mb-2">Expected columns</p>
              <p>po_number, partner_id, ship_date</p>
              <p>product_id, description, quantity</p>
              <p>unit_price, uom</p>
            </div>

            <Button
              className="w-full gap-2"
              disabled={!file || !partnerId || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
              ) : (
                <><Upload className="h-4 w-4" /> Convert & Process</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Result card ── */}
        <Card className="border-border flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Processing Result
            </CardTitle>
            <CardDescription>ANSI X12 validation and EDI routing outcome</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {!result ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Upload a CSV to see the result
              </div>
            ) : (
              <div className="space-y-4">

                {/* Status banner */}
                <div className={[
                  "flex items-center gap-3 rounded-lg p-4 border",
                  result.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-red-50 border-red-300 text-red-800",
                ].join(" ")}>
                  {result.success
                    ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                    : <XCircle className="h-5 w-5 shrink-0" />}
                  <div>
                    <p className="font-semibold">{result.success ? "Success" : "Failed"}</p>
                    <p className="text-sm">{result.message}</p>
                  </div>
                </div>

                {/* Stats */}
                {result.success && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-secondary/40 rounded-md p-3">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Lines Processed</p>
                      <p className="font-bold text-xl mt-0.5">{result.csvRowsProcessed ?? "—"}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-md p-3">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Transaction ID</p>
                      <p className="font-mono text-xs mt-1 break-all">{result.transactionId ?? "—"}</p>
                    </div>
                  </div>
                )}

                {/* Validation errors */}
                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> ANSI X12 Validation Errors
                    </p>
                    <ul className="space-y-1">
                      {result.errors.map((e: string, i: number) => (
                        <li key={i} className="text-xs text-destructive bg-destructive/5 rounded px-3 py-1.5">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Generated EDI preview */}
                {result.generatedEdi && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Generated ANSI X12 EDI
                      </p>
                      <Badge variant="outline" className="text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                        X12 005010
                      </Badge>
                    </div>
                    <pre className="bg-secondary/40 border border-border rounded-md p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-56 overflow-y-auto">
                      {result.generatedEdi}
                    </pre>
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
