import { useState } from "react";
import { useListInventory } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle, PackageSearch } from "lucide-react";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListInventory();

  const filteredInventory = data?.inventory?.filter((item) => 
    item.productName.toLowerCase().includes(search.toLowerCase()) || 
    item.productId.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Monitor</h1>
          <p className="text-muted-foreground mt-1">Real-time stock levels and reorder thresholds across the network.</p>
        </div>
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
                const isLowStock = item.reorderPoint !== undefined && item.quantityAvailable <= item.reorderPoint;
                
                return (
                  <TableRow 
                    key={item.id} 
                    className={`border-border/50 transition-colors ${
                      isLowStock ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-secondary/50'
                    }`}
                  >
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                      {item.productId}
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background text-muted-foreground">
                        {item.category || "Uncategorized"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantityOnHand}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {item.quantityReserved || 0}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isLowStock ? 'text-destructive' : 'text-primary'}`}>
                      {item.quantityAvailable}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {item.reorderPoint ?? "-"}
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
    </div>
  );
}
