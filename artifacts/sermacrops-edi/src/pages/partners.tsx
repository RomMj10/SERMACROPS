import { useState } from "react";
import { useListPartners } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Pencil, Save, X, Server, Mail } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  type: string;
  ediId: string;
  as2Id: string;
  email?: string;
  isActive: boolean;
}

interface EditState {
  name: string;
  ediId: string;
  as2Id: string;
  email: string;
}

function PartnerRow({ partner, onSaved }: { partner: Partner; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditState>({
    name: partner.name,
    ediId: partner.ediId,
    as2Id: partner.as2Id ?? "",
    email: partner.email ?? "",
  });
  const { toast } = useToast();

  function reset() {
    setForm({ name: partner.name, ediId: partner.ediId, as2Id: partner.as2Id ?? "", email: partner.email ?? "" });
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Save failed");
      toast({ title: "Partner updated", description: `${form.name} saved successfully.` });
      onSaved();
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const typeColors: Record<string, string> = {
    client: "text-blue-600 border-blue-400/50 bg-blue-50",
    supplier: "text-emerald-600 border-emerald-400/50 bg-emerald-50",
    logistics: "text-violet-600 border-violet-400/50 bg-violet-50",
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          {editing ? (
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-8 text-base font-semibold w-56"
            />
          ) : (
            <span className="font-semibold text-base">{partner.name}</span>
          )}
          <Badge variant="outline" className={`capitalize text-xs ${typeColors[partner.type] || ""}`}>
            {partner.type}
          </Badge>
          {partner.isActive ? (
            <Badge variant="outline" className="text-green-600 border-green-400/50 bg-green-50 text-xs gap-1">
              <Server className="h-3 w-3" /> Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/5 text-xs">
              Inactive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={reset} disabled={saving} className="gap-1.5 h-8">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 h-8">
                <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5 h-8">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
        <Field label="EDI ID" editing={editing}>
          {editing ? (
            <Input value={form.ediId} onChange={(e) => setForm((f) => ({ ...f, ediId: e.target.value }))} className="h-8 font-mono text-sm" />
          ) : (
            <span className="font-mono text-sm text-muted-foreground">{partner.ediId}</span>
          )}
        </Field>
        <Field label="AS2 ID" editing={editing}>
          {editing ? (
            <Input value={form.as2Id} onChange={(e) => setForm((f) => ({ ...f, as2Id: e.target.value }))} className="h-8 font-mono text-sm" />
          ) : (
            <span className="font-mono text-sm text-muted-foreground">{partner.as2Id || "—"}</span>
          )}
        </Field>
        <Field label="Email" editing={editing}>
          {editing ? (
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-8 text-sm" placeholder="contact@company.com" />
          ) : partner.email ? (
            <a href={`mailto:${partner.email}`} className="text-sm text-primary flex items-center gap-1.5 hover:underline">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {partner.email}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground/60 italic">No email set</span>
          )}
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children, editing }: { label: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className={`px-5 py-3.5 flex flex-col gap-1.5 ${editing ? "bg-secondary/20" : ""}`}>
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function PartnersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListPartners();

  const partners: Partner[] = (data?.partners as any[]) ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["/api/partners"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trading Partners</h1>
          <p className="text-muted-foreground mt-1">Manage EDI connections across the supply chain network.</p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["client", "supplier", "logistics"].map((type) => (
          <div key={type} className="bg-card border border-border rounded-lg p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground capitalize font-medium">{type}s</p>
              {isLoading ? (
                <Skeleton className="h-7 w-10 mt-0.5" />
              ) : (
                <p className="text-2xl font-bold">{partners.filter((p) => p.type === type).length}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Partner cards */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="border border-border rounded-lg bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))
        ) : partners.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
            No trading partners found.
          </div>
        ) : (
          partners.map((partner) => (
            <PartnerRow key={partner.id} partner={partner} onSaved={invalidate} />
          ))
        )}
      </div>
    </div>
  );
}
