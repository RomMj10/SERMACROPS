import { useState } from "react";
import { useListPurchaseOrders } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, CheckCheck, Loader2, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-600 border-amber-400/60 bg-amber-100",
  acknowledged: "text-emerald-700 border-emerald-400/60 bg-emerald-100",
  shipped: "text-blue-700 border-blue-400/60 bg-blue-100",
  invoiced: "text-purple-700 border-purple-400/60 bg-purple-100",
  completed: "text-green-700 border-green-400/60 bg-green-100",
  cancelled: "text-destructive border-destructive/50 bg-destructive/10",
};

async function acknowledgePurchaseOrder(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/purchase-orders/${id}/acknowledge`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to acknowledge purchase order");
  }
  return res.json();
}

function downloadPoCsv(id: string, poNumber: string) {
  const a = document.createElement("a");
  a.href = `/api/purchase-orders/${id}/csv`;
  a.download = `${poNumber}_supplier_po.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListPurchaseOrders({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgePurchaseOrder,
    onSuccess: (_, id) => {
      setAcknowledgedIds((prev) => new Set(prev).add(id));
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "PO Acknowledged", description: "EDI 855 sent to trading partner." });
    },
    onError: (err: any) => {
      toast({ title: "Acknowledgment Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">Track PO lifecycle from pending to completed.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="w-[250px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="invoiced">Invoiced</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>PO Number</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Ship Date</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-28 ml-auto rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : data?.purchaseOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No purchase orders found.
                </TableCell>
              </TableRow>
            ) : (
              data?.purchaseOrders.map((po) => {
                const canAccept = po.direction === "inbound" && po.status === "pending";
                const canDownloadCsv = po.direction === "outbound";
                const isAccepting = acknowledgeMutation.isPending && acknowledgeMutation.variables === po.id;
                const justAccepted = acknowledgedIds.has(po.id);

                return (
                  <TableRow key={po.id} className="border-border/50 hover:bg-secondary/40 transition-colors">
                    <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {po.direction === "inbound" ? (
                          <ArrowDownLeft className="h-4 w-4 text-primary" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-accent-foreground" />
                        )}
                        <span className="capitalize">{po.direction}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{po.partnerName || "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{po.partnerId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {po.shipDate
                        ? new Date(po.shipDate).toLocaleDateString()
                        : <span className="text-muted-foreground">TBD</span>}
                    </TableCell>
                    <TableCell className="font-mono">
                      {po.totalAmount != null
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency: po.currency || "USD" }).format(po.totalAmount)
                        : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[po.status] || "text-muted-foreground"}>
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(po.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canAccept && (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={isAccepting || justAccepted}
                            onClick={() => acknowledgeMutation.mutate(po.id)}
                            className="gap-1.5"
                          >
                            {isAccepting ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                            ) : justAccepted ? (
                              <><CheckCheck className="h-3.5 w-3.5" />Sent</>
                            ) : (
                              <><CheckCheck className="h-3.5 w-3.5" />Accept</>
                            )}
                          </Button>
                        )}
                        {canDownloadCsv && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadPoCsv(po.id, po.poNumber)}
                            className="gap-1.5"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            CSV
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
