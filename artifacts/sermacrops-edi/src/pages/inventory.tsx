import { useState } from "react";
import { useListInventory } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, AlertTriangle, PackageSearch, ShoppingCart, Download, Braces, FileCode2, Plus, Minus } from "lucide-react";

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  category: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: string | number;
  reorderPoint: number;
  unitOfMeasure?: string;
  unitCost?: number | null;
}

interface OrderLine {
  item: InventoryItem;
  quantity: number;
}

type PreviewMode = "json" | "csv";

function buildOrderCsv(lines: OrderLine[], supplier: string, poNumber: string, shipDate: string): string {
  const header = "po_number,partner_id,ship_date,product_id,description,quantity,unit_price,uom";
  const rows = lines.map((l) =>
    [
      poNumber,
      supplier,
      shipDate,
      l.item.productId,
      `"${l.item.productName}"`,
      l.quantity,
      l.item.unitCost ?? 0,
      l.item.unitOfMeasure ?? "EA",
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function buildOrderJson(lines: OrderLine[], supplier: string, poNumber: string, shipDate: string) {
  return {
    poNumber,
    partnerId: supplier,
    shipDate,
    transactionType: "850",
    lineItems: lines.map((l, i) => ({
      lineNumber: i + 1,
      productId: l.item.productId,
      description: l.item.productName,
      quantity: l.quantity,
      unitPrice: l.item.unitCost ?? 0,
      uom: l.item.unitOfMeasure ?? "EA",
    })),
    totalAmount: lines.reduce((s, l) => s + l.quantity * (l.item.unitCost ?? 0), 0).toFixed(2),
  };
}

function OrderDialog({
  open,
  onClose,
  inventory,
}: {
  open: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
}) {
  const [supplier, setSupplier] = useState("PHILHARVEST");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("json");
  const { toast } = useToast();

  const poNumber = `PO-${Date.now().toString().slice(-7)}`;
  const shipDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  function addLine(item: InventoryItem) {
    setLines((prev) => {
      if (prev.find((l) => l.item.id === item.id)) return prev;
      return [...prev, { item, quantity: item.reorderPoint || 1 }];
    });
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.item.id !== id));
  }

  function setQty(id: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.item.id === id ? { ...l, quantity: Math.max(1, qty) } : l)));
  }

  function downloadCsv() {
    if (!lines.length) { toast({ title: "No items selected", variant: "destructive" }); return; }
    const csv = buildOrderCsv(lines, supplier, poNumber, shipDate);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order_${poNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV downloaded", description: `${poNumber} — ${lines.length} line(s)` });
  }

  const csvText = lines.length ? buildOrderCsv(lines, supplier, poNumber, shipDate) : "";
  const jsonObj = lines.length ? buildOrderJson(lines, supplier, poNumber, shipDate) : null;

  const lowStockItems = inventory.filter(
    (i) => i.reorderPoint !== undefined && Number(i.quantityAvailable) <= i.reorderPoint
  );
  const allItems = inventory;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Order from Supplier
          </DialogTitle>
          <DialogDescription>
            Select items and quantities to build a purchase order CSV ready for EDI upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Supplier select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier</Label>
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PHILHARVEST">PhilHarvest Supply Co.</SelectItem>
                <SelectItem value="COFFEESHOP">The Coffee Shop</SelectItem>
                <SelectItem value="FASTLOGISTICS">FastTrack Logistics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Low stock quick-add */}
          {lowStockItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Low Stock — Quick Add
              </Label>
              <div className="flex flex-wrap gap-2">
                {lowStockItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addLine(item)}
                    disabled={!!lines.find((l) => l.item.id === item.id)}
                    className="text-xs px-2.5 py-1 rounded border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    + {item.productName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add any item */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Item</Label>
            <div className="flex flex-wrap gap-2">
              {allItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addLine(item)}
                  disabled={!!lines.find((l) => l.item.id === item.id)}
                  className="text-xs px-2.5 py-1 rounded border border-border bg-card hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  + {item.productId}
                </button>
              ))}
            </div>
          </div>

          {/* Order lines */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Lines</Label>
              <div className="border border-border rounded-md divide-y divide-border overflow-hidden">
                {lines.map((line) => (
                  <div key={line.item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{line.item.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{line.item.productId} · {line.item.unitOfMeasure ?? "EA"} · ${line.item.unitCost ?? 0}/unit</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(line.item.id, line.quantity - 1)} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-secondary/60 transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input
                        type="number"
                        value={line.quantity}
                        min={1}
                        onChange={(e) => setQty(line.item.id, parseInt(e.target.value) || 1)}
                        className="h-7 w-20 text-center text-sm font-mono"
                      />
                      <button onClick={() => setQty(line.item.id, line.quantity + 1)} className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-secondary/60 transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="w-20 text-right text-sm font-medium font-mono">
                      ${(line.quantity * (line.item.unitCost ?? 0)).toFixed(2)}
                    </p>
                    <button onClick={() => removeLine(line.item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-end px-3 py-2.5 bg-secondary/20">
                  <p className="text-sm font-semibold">
                    Total: ${lines.reduce((s, l) => s + l.quantity * (l.item.unitCost ?? 0), 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</Label>
                <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                  <button
                    onClick={() => setPreviewMode("json")}
                    className={[
                      "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      previewMode === "json" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <Braces className="h-3 w-3" /> JSON
                  </button>
                  <button
                    onClick={() => setPreviewMode("csv")}
                    className={[
                      "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      previewMode === "csv" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <FileCode2 className="h-3 w-3" /> CSV
                  </button>
                </div>
              </div>
              <pre className="bg-secondary/40 border border-border rounded-md p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto leading-relaxed">
                {previewMode === "json" ? JSON.stringify(jsonObj, null, 2) : csvText}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={downloadCsv} disabled={!lines.length} className="gap-2">
            <Download className="h-4 w-4" />
            Download Order CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const { data, isLoading } = useListInventory();

  const inventory: InventoryItem[] = (data?.inventory as any[]) ?? [];

  const filteredInventory = inventory.filter(
    (item) =>
      item.productName.toLowerCase().includes(search.toLowerCase()) ||
      item.productId.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = inventory.filter(
    (i) => i.reorderPoint !== undefined && Number(i.quantityAvailable) <= i.reorderPoint
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Monitor</h1>
          <p className="text-muted-foreground mt-1">Real-time stock levels and reorder thresholds across the network.</p>
        </div>
        <Button onClick={() => setOrderOpen(true)} className="gap-2">
          <ShoppingCart className="h-4 w-4" />
          Order from Supplier
          {lowStockCount > 0 && (
            <Badge variant="secondary" className="ml-1 bg-destructive/20 text-destructive border-0 text-xs">
              {lowStockCount} low
            </Badge>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by product name or ID..."
            className="pl-8 bg-background border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {lowStockCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-destructive font-medium">
            <AlertTriangle className="h-4 w-4" />
            {lowStockCount} item{lowStockCount !== 1 ? "s" : ""} below reorder point
          </div>
        )}
      </div>

      <div className="border border-border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>Product ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Qty On Hand</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : filteredInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
                    <p>No inventory items found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredInventory.map((item) => {
                const isLowStock =
                  item.reorderPoint !== undefined && Number(item.quantityAvailable) <= item.reorderPoint;
                return (
                  <TableRow
                    key={item.id}
                    className={`border-border/50 transition-colors ${
                      isLowStock ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-secondary/50"
                    }`}
                  >
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                      {item.productId}
                    </TableCell>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background text-muted-foreground">
                        {item.category || "Uncategorized"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.quantityOnHand}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {item.quantityReserved || 0}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        isLowStock ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {item.quantityAvailable}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {item.reorderPoint ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {isLowStock ? (
                        <Badge variant="outline" className="text-destructive border-destructive/50 bg-destructive/10">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10">
                          Optimal
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <OrderDialog open={orderOpen} onClose={() => setOrderOpen(false)} inventory={inventory} />
    </div>
  );
}
