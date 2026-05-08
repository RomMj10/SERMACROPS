import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Download, CheckCircle2, XCircle,
  AlertTriangle, Loader2, FileUp, Info, Braces, FileCode2,
} from "lucide-react";

interface DocTypeSpec {
  code: string;
  label: string;
  description: string;
  requiredHeaders: string[];
  allHeaders: string[];
}

const EDI_TYPES: Array<{ code: string; label: string }> = [
  { code: "850", label: "Purchase Order" },
  { code: "855", label: "PO Acknowledgment" },
  { code: "856", label: "Advance Ship Notice" },
  { code: "810", label: "Invoice" },
  { code: "204", label: "Motor Carrier Load Tender" },
  { code: "990", label: "Response to Load Tender" },
];

type ResultView = "json" | "edi";

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("850");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultView, setResultView] = useState<ResultView>("json");
  const [specs, setSpecs] = useState<Record<string, DocTypeSpec>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/edi/specs")
      .then((r) => r.json())
      .then((d) => setSpecs(d.specs || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setResult(null);
    setFile(null);
  }, [docType]);

  const currentSpec: DocTypeSpec | undefined = specs[docType];
  const docTypeInfo = EDI_TYPES.find((t) => t.code === docType);

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
    handleFileChange(e.dataTransfer.files[0] ?? null);
  }

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("transactionType", docType);

      const res = await fetch("/api/edi/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult({ ...data, httpStatus: res.status });

      if (res.ok && data.success) {
        toast({
          title: "EDI Processed",
          description: `EDI ${docType} — ${data.csvRowsProcessed} row(s) processed successfully.`,
        });
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

  // Build the JSON summary from the result for display
  function buildJsonSummary(r: any) {
    if (!r) return null;
    return {
      success: r.success,
      transactionId: r.transactionId,
      transactionType: r.transactionType,
      partnerId: r.partnerId,
      message: r.message,
      csvRowsProcessed: r.csvRowsProcessed,
      validation: r.validation,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CSV Upload</h1>
          <p className="text-muted-foreground mt-1">
            Upload a CSV file — it is converted to ANSI X12 EDI, validated, and processed automatically.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.open(`/api/edi/template/${docType}`, "_blank")}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Upload card ── */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Upload EDI CSV</CardTitle>
            <CardDescription>
              Select the document type, drop your CSV, and hit Convert.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Document type selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">EDI Document Type</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDI_TYPES.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      <span className="font-mono font-semibold mr-2">{t.code}</span>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentSpec && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3 w-3 shrink-0" />
                  {currentSpec.description}
                </p>
              )}
            </div>

            {/* Column chips */}
            {currentSpec && (
              <div className="bg-secondary/40 rounded-md p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  Expected columns
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentSpec.allHeaders.map((h) => (
                    <span
                      key={h}
                      className={[
                        "text-[11px] font-mono px-2 py-0.5 rounded border",
                        currentSpec.requiredHeaders.includes(h)
                          ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                          : "bg-secondary border-border text-muted-foreground",
                      ].join(" ")}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  <span className="text-primary font-semibold">Highlighted</span> = required &nbsp;·&nbsp; others optional
                </p>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={[
                "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
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
                  <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · click or drop to replace</span>
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

            {/* Convert button */}
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
          </CardContent>
        </Card>

        {/* ── Result card ── */}
        <Card className="border-border flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Processing Result
                </CardTitle>
                <CardDescription className="mt-1">ANSI X12 validation and EDI routing outcome</CardDescription>
              </div>
              {/* View toggle — only shown once there's a result */}
              {result?.success && (
                <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                  <button
                    onClick={() => setResultView("json")}
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      resultView === "json"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <Braces className="h-3.5 w-3.5" />
                    JSON
                  </button>
                  <button
                    onClick={() => setResultView("edi")}
                    className={[
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                      resultView === "edi"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    Raw EDI
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {!result ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <FileUp className="h-8 w-8 opacity-30" />
                <p className="text-sm">Upload a CSV to see the result</p>
              </div>
            ) : (
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
                  <div>
                    <p className="font-semibold">{result.success ? "Success" : "Failed"}</p>
                    <p className="text-sm">{result.message}</p>
                  </div>
                </div>

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

                {/* JSON view */}
                {result.success && resultView === "json" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Parsed JSON
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {result.csvRowsProcessed} row{result.csvRowsProcessed !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-mono">
                          {result.transactionType} · {docTypeInfo?.label}
                        </Badge>
                      </div>
                    </div>
                    <pre className="bg-secondary/40 border border-border rounded-md p-4 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
                      {JSON.stringify(buildJsonSummary(result), null, 2)}
                    </pre>
                  </div>
                )}

                {/* Raw EDI view */}
                {result.success && resultView === "edi" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Raw ANSI X12 EDI
                      </p>
                      <Badge variant="outline" className="text-emerald-700 border-emerald-400/60 bg-emerald-50 text-xs">
                        X12 005010 ✓
                      </Badge>
                    </div>
                    <pre className="bg-secondary/40 border border-border rounded-md p-4 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-96 overflow-y-auto">
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
