import { useState } from "react";
import { useListTransactions, useProcessTransaction, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EDI_TYPES: Record<string, string> = {
  "850": "Purchase Order",
  "855": "PO Acknowledgment",
  "856": "Advance Ship Notice",
  "810": "Invoice",
  "204": "Motor Carrier Load Tender",
  "990": "Response to Load Tender",
};

export default function TransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListTransactions({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    transactionType: typeFilter !== "all" ? typeFilter : undefined,
  });

  const processMutation = useProcessTransaction();

  const handleProcess = (id: number) => {
    processMutation.mutate({ id }, {
      onSuccess: () => {
        toast({
          title: "Transaction Processed",
          description: `Transaction ${id} has been manually processed.`,
        });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Processing Failed",
          description: error.message || "Failed to process transaction",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transaction Log</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage raw EDI document flows.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="w-[200px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[250px]">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All EDI Types</SelectItem>
              {Object.entries(EDI_TYPES).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {code} - {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>Control No.</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.transactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              data?.transactions.map((tx) => (
                <TableRow key={tx.id} className="border-border/50 hover:bg-secondary/50 group transition-colors">
                  <TableCell className="font-mono text-xs">{tx.controlNumber || `TX-${tx.id}`}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{tx.transactionType}</span>
                      <span className="text-xs text-muted-foreground">{EDI_TYPES[tx.transactionType] || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {tx.direction === "inbound" ? (
                        <ArrowDownLeft className="h-4 w-4 text-cyan-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="capitalize">{tx.direction}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{tx.partnerName || "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">{tx.partnerId}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(tx.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={
                        tx.status === "failed" ? "text-destructive border-destructive/50 bg-destructive/10" :
                        tx.status === "processed" || tx.status === "acknowledged" ? "text-green-500 border-green-500/50 bg-green-500/10" :
                        "text-amber-500 border-amber-500/50 bg-amber-500/10"
                      }
                    >
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.status === "pending" ? (
                      <Button 
                        size="sm" 
                        variant="secondary"
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 text-primary hover:bg-primary/30"
                        onClick={() => handleProcess(tx.id)}
                        disabled={processMutation.isPending}
                      >
                        <Play className="h-3 w-3 mr-2" />
                        Process
                      </Button>
                    ) : tx.status === "processed" || tx.status === "acknowledged" ? (
                       <CheckCircle2 className="h-5 w-5 text-muted-foreground/30 inline-block mr-4" />
                    ) : null}
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
