import { useState } from "react";
import { useListPurchaseOrders } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-500 border-amber-500/50 bg-amber-500/10",
  acknowledged: "text-cyan-500 border-cyan-500/50 bg-cyan-500/10",
  shipped: "text-blue-500 border-blue-500/50 bg-blue-500/10",
  invoiced: "text-purple-500 border-purple-500/50 bg-purple-500/10",
  completed: "text-green-500 border-green-500/50 bg-green-500/10",
  cancelled: "text-destructive border-destructive/50 bg-destructive/10",
};

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useListPurchaseOrders({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
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
              <TableHead>Pipeline Status</TableHead>
              <TableHead className="text-right">Created</TableHead>
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
                  <TableCell className="text-right"><Skeleton className="h-4 w-32 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.purchaseOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No purchase orders found.
                </TableCell>
              </TableRow>
            ) : (
              data?.purchaseOrders.map((po) => (
                <TableRow key={po.id} className="border-border/50 hover:bg-secondary/50 transition-colors">
                  <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {po.direction === "inbound" ? (
                        <ArrowDownLeft className="h-4 w-4 text-cyan-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
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
                    {po.shipDate ? new Date(po.shipDate).toLocaleDateString() : <span className="text-muted-foreground">TBD</span>}
                  </TableCell>
                  <TableCell className="font-mono">
                    {po.totalAmount != null ? (
                      new Intl.NumberFormat('en-US', { style: 'currency', currency: po.currency || 'USD' }).format(po.totalAmount)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={STATUS_COLORS[po.status] || "text-muted-foreground"}>
                        {po.status}
                      </Badge>
                      {po.status !== "completed" && po.status !== "cancelled" && (
                        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {new Date(po.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
