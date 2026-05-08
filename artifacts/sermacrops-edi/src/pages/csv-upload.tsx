import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Download, CheckCircle2, XCircle,
  AlertTriangle, Loader2, FileUp, Braces, FileCode2,
} from "lucide-react";

type ResultView = "json" | "edi";

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [resultView, setResultView] = useState<ResultView>("json");
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

      const res = await fetch("/api/edi/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResult({ ...data, httpStatus: res.status });

      if (res.ok && data.success) {
        toast({
          title: "EDI Processed",
          description: `EDI ${data.detectedDocType} (${data.detectedDocLabel}) — ${data.csvRowsProcessed} row(s) processed.`,
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

        {/* ── Upload card — drop zone only ── */}
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
                  Processing Result
                </CardTitle>
                <CardDescription className="mt-1">ANSI X12 validation and EDI routing outcome</CardDescription>
              </div>
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

                {/* Detected type pill — shown on success */}
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

                {/* JSON view — full parsed EDI as JSON */}
                {result.success && resultView === "json" && result.parsedEdiJson && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      EDI Content — JSON
                    </p>
                    <pre className="bg-secondary/40 border border-border rounded-md p-4 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-[480px] overflow-y-auto">
                      {JSON.stringify(result.parsedEdiJson, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Raw EDI view */}
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
                    <pre className="bg-secondary/40 border border-border rounded-md p-4 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[480px] overflow-y-auto">
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
