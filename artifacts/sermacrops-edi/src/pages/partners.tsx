import { useListPartners } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Link as LinkIcon, Building2 } from "lucide-react";

export default function PartnersPage() {
  const { data, isLoading } = useListPartners();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trading Partners</h1>
          <p className="text-muted-foreground mt-1">Manage EDI connections across the supply chain network.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {["client", "supplier", "logistics"].map((type) => (
          <div key={type} className="bg-card border border-border rounded-lg p-6 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-medium capitalize text-lg mb-1">{type}s</h3>
            <p className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-12 mx-auto" />
              ) : (
                data?.partners?.filter(p => p.type === type).length || 0
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="border border-border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>Partner Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>EDI ID</TableHead>
              <TableHead>AS2 ID</TableHead>
              <TableHead>Endpoint URL</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : data?.partners?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No partners found.
                </TableCell>
              </TableRow>
            ) : (
              data?.partners?.map((partner) => (
                <TableRow key={partner.id} className="border-border/50 hover:bg-secondary/50 transition-colors">
                  <TableCell className="font-medium">
                    {partner.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize bg-background text-muted-foreground">
                      {partner.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {partner.ediId}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {partner.as2Id || "-"}
                  </TableCell>
                  <TableCell>
                    {partner.endpointUrl ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LinkIcon className="h-3 w-3" />
                        {partner.endpointUrl}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {partner.isActive ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10">
                        <Server className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-destructive border-destructive/50 bg-destructive/10">
                        Inactive
                      </Badge>
                    )}
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
