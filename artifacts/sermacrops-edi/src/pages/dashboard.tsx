import { useGetDashboardSummary, useGetTransactionStats, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { ArrowLeftRight, Package, ShoppingCart, Users, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-500 bg-amber-500/10",
  processed: "text-cyan-500 bg-cyan-500/10",
  acknowledged: "text-green-500 bg-green-500/10",
  failed: "text-destructive bg-destructive/10",
};

export default function DashboardPage() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: stats, isLoading: isLoadingStats } = useGetTransactionStats();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 py-1">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            System Online
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Transactions"
          value={summary?.totalTransactions}
          isLoading={isLoadingSummary}
          icon={ArrowLeftRight}
          description="All time processed"
        />
        <SummaryCard
          title="Pending Actions"
          value={summary?.pendingTransactions}
          isLoading={isLoadingSummary}
          icon={Clock}
          description="Awaiting processing"
          valueClass={summary?.pendingTransactions ? "text-amber-500" : ""}
        />
        <SummaryCard
          title="Active Partners"
          value={summary?.activePartners}
          isLoading={isLoadingSummary}
          icon={Users}
          description="Trading connections"
        />
        <SummaryCard
          title="Low Stock Alerts"
          value={summary?.lowStockItems}
          isLoading={isLoadingSummary}
          icon={AlertTriangle}
          description="Inventory below reorder point"
          valueClass={summary?.lowStockItems ? "text-destructive" : ""}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Transaction Volume by Type</CardTitle>
            <CardDescription>Distribution of EDI documents processed</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.byType || []} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="label" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }} 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '4px' }} 
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {
                        stats?.byType?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 bg-card border-border">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest EDI workflow events</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {activity?.activities?.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                    <div className="mt-1">
                      {item.status === 'failed' ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : item.status === 'processed' || item.status === 'acknowledged' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <Clock className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {item.transactionType} {item.direction === 'inbound' ? 'from' : 'to'} {item.partnerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.controlNumber || `ID: ${item.id}`} • {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[item.status] || ''}`}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {!activity?.activities?.length && (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, isLoading, icon: Icon, description, valueClass = "" }: any) {
  return (
    <Card className="bg-card border-border overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Icon className="h-16 w-16" />
      </div>
      <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="z-10 relative">
        {isLoading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <div className={`text-3xl font-bold tracking-tight ${valueClass}`}>{value ?? 0}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}
