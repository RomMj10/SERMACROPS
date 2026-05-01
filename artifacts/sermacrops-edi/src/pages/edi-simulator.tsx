import { useState } from "react";
import { useSimulateEdiTransaction, useListPartners, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Terminal, Plus, Trash2, ArrowRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const EDI_TYPES = [
  { code: "850", label: "Purchase Order" },
  { code: "855", label: "PO Acknowledgment" },
  { code: "856", label: "Advance Ship Notice" },
  { code: "810", label: "Invoice" },
  { code: "204", label: "Motor Carrier Load Tender" },
  { code: "990", label: "Response to Load Tender" },
] as const;

const formSchema = z.object({
  transactionType: z.enum(["850", "855", "856", "810", "204", "990"]),
  partnerId: z.string().min(1, "Please select a partner"),
  referenceNumber: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1, "Product ID is required"),
      quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
      unitPrice: z.coerce.number().optional(),
      uom: z.string().optional()
    })
  ).optional()
});

export default function EdiSimulatorPage() {
  const [response, setResponse] = useState<any>(null);
  const { data: partnersData, isLoading: isLoadingPartners } = useListPartners();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const simulateMutation = useSimulateEdiTransaction();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      transactionType: "850",
      partnerId: "",
      referenceNumber: "",
      items: [{ productId: "", quantity: 1, unitPrice: 0, uom: "EA" }]
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchTransactionType = form.watch("transactionType");

  function onSubmit(values: z.infer<typeof formSchema>) {
    setResponse(null);
    simulateMutation.mutate(
      {
        transactionType: values.transactionType as any,
        data: {
          partnerId: values.partnerId,
          referenceNumber: values.referenceNumber,
          items: values.items
        }
      },
      {
        onSuccess: (data) => {
          setResponse(data);
          toast({
            title: "Simulation Successful",
            description: "EDI document generated and processed.",
          });
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        },
        onError: (error: any) => {
          toast({
            title: "Simulation Failed",
            description: error.message || "Failed to simulate transaction",
            variant: "destructive",
          });
        }
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">EDI Simulator</h1>
          <p className="text-muted-foreground mt-1">Generate and test raw EDI transactions in the system.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Transaction Parameters</CardTitle>
            <CardDescription>Configure the inbound EDI document details</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="transactionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>EDI Document Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EDI_TYPES.map((type) => (
                              <SelectItem key={type.code} value={type.code}>
                                {type.code} - {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="partnerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trading Partner</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingPartners}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select partner" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {partnersData?.partners?.map((partner) => (
                              <SelectItem key={partner.id} value={partner.id}>
                                {partner.name} ({partner.type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="referenceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference Number (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., PO-2023-001" {...field} />
                      </FormControl>
                      <FormDescription>
                        Custom reference or control number
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel>Line Items</FormLabel>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="h-8"
                      onClick={() => append({ productId: "", quantity: 1, unitPrice: 0, uom: "EA" })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2 bg-secondary/20 p-3 rounded-md border border-border/50">
                        <div className="grid grid-cols-12 gap-2 flex-1">
                          <div className="col-span-5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="Product ID" {...field} className="h-8 text-sm" />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input type="number" placeholder="Qty" {...field} className="h-8 text-sm" />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-4 flex gap-2">
                            <FormField
                              control={form.control}
                              name={`items.${index}.uom`}
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input placeholder="UOM" {...field} className="h-8 text-sm" />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={simulateMutation.isPending}>
                  {simulateMutation.isPending ? (
                    "Generating..."
                  ) : (
                    <>
                      Generate & Process EDI <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="bg-card border-border flex flex-col h-[calc(100vh-140px)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Terminal Output
            </CardTitle>
            <CardDescription>Raw EDI payload and system response</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0 relative">
            <ScrollArea className="h-full w-full bg-secondary/30 p-4 border-y border-border">
              {response ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Process Result</h4>
                    <div className="bg-background border border-border rounded p-3 text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-foreground">Status:</span>
                        <span className={response.success ? "text-green-500" : "text-destructive"}>
                          {response.success ? "Success" : "Failed"}
                        </span>
                      </div>
                      <div className="text-muted-foreground">{response.message}</div>
                      {response.transactionId && (
                        <div className="text-muted-foreground mt-1">
                          Transaction ID: <span className="font-mono text-primary">{response.transactionId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {response.responseEdi && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Raw EDI Document</h4>
                      <pre className="bg-background border border-border rounded p-4 text-xs font-mono text-primary/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                        {response.responseEdi}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-mono">
                  Awaiting transaction simulation...
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
