import React from "react";
import { ArrowUpRight, ArrowDownLeft, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const navItems = [
  "Dashboard",
  "Transactions",
  "Purchase Orders",
  "Inventory",
  "Partners",
  "EDI Simulator",
];

const purchaseOrders = [
  {
    poNumber: "SP0000001012",
    direction: "outbound",
    partner: "RawMat Supply Co. / RAWMATSUPPLY",
    shipDate: "TBD",
    amount: "$0.00",
    status: "pending",
    created: "5/1/2026",
  },
  {
    poNumber: "PO10001",
    direction: "inbound",
    partner: "The Coffee Shop / COFFEESHOP",
    shipDate: "5/5/2026",
    amount: "$2,500.00",
    status: "completed",
    created: "5/1/2026",
  },
  {
    poNumber: "SP0000000101",
    direction: "outbound",
    partner: "RawMat Supply Co.",
    shipDate: "5/3/2026",
    amount: "$1,312.50",
    status: "invoiced",
    created: "5/1/2026",
  },
  {
    poNumber: "PO10002",
    direction: "inbound",
    partner: "The Coffee Shop",
    shipDate: "5/8/2026",
    amount: "$2,000.00",
    status: "pending",
    created: "5/1/2026",
  },
];

const getStatusStyle = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-[#FFF3CD] text-[#A0762C] border-none font-medium px-2 py-0.5 rounded-full text-xs";
    case "completed":
      return "bg-[#F0FFF4] text-[#2A7A4A] border-none font-medium px-2 py-0.5 rounded-full text-xs";
    case "invoiced":
      return "bg-[#F5F5F5] text-[#555555] border-none font-medium px-2 py-0.5 rounded-full text-xs";
    default:
      return "bg-gray-100 text-gray-600 border-none font-medium px-2 py-0.5 rounded-full text-xs";
  }
};

export function IceMinimal() {
  return (
    <div className="min-h-screen bg-[#FFFFFF] font-sans text-[#111111] flex overflow-hidden h-screen selection:bg-gray-100">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[#FAFAFA] border-r border-[#E5E5E5] flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-transparent">
          <span className="font-sans uppercase tracking-[0.2em] text-xs font-bold text-[#111111]">
            Sermacrops
          </span>
        </div>
        <nav className="flex flex-col py-4 gap-1">
          {navItems.map((item) => {
            const isActive = item === "Purchase Orders";
            return (
              <a
                key={item}
                href="#"
                className={`px-6 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#111111] border-l-2 border-[#111111] pl-[22px]" // 24px - 2px
                    : "text-[#888888] hover:text-[#111111] border-l-2 border-transparent pl-[22px]"
                }`}
              >
                {item}
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="px-10 py-12 max-w-6xl w-full mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#111111] mb-2">
                Purchase Orders
              </h1>
              <p className="text-[#888888] text-sm">
                Track PO lifecycle from pending to completed.
              </p>
            </div>
            
            {/* Filter Dropdown (Minimal) */}
            <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-[#E5E5E5] rounded-[4px] text-[#111111] hover:bg-[#FAFAFA] transition-colors h-8">
              All Statuses
              <ChevronDown className="w-3.5 h-3.5 text-[#888888]" strokeWidth={2} />
            </button>
          </div>

          {/* Data Table */}
          <div className="w-full">
            <Table className="[&_tr]:border-[#F0F0F0] [&_tr:hover]:bg-[#FAFAFA]/50 transition-none">
              <TableHeader>
                <TableRow className="border-b border-[#E5E5E5] hover:bg-transparent">
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom">
                    PO Number
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom w-[60px] text-center">
                    Dir
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom">
                    Partner
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom">
                    Ship Date
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom text-right">
                    Total Amount
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom">
                    Pipeline Status
                  </TableHead>
                  <TableHead className="uppercase text-[10px] tracking-[0.15em] text-[#888888] font-semibold h-10 px-4 py-3 align-bottom">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po, i) => (
                  <TableRow key={i} className="border-[#F0F0F0]">
                    <TableCell className="px-4 py-3.5 text-sm font-medium text-[#111111]">
                      {po.poNumber}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-center">
                      <div className="flex justify-center text-[#888888]">
                        {po.direction === "outbound" ? (
                          <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-sm text-[#111111]">
                      {po.partner}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-sm text-[#888888]">
                      {po.shipDate}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-sm text-[#111111] text-right font-medium tabular-nums">
                      {po.amount}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <span className={getStatusStyle(po.status)}>
                        {po.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-sm text-[#888888]">
                      {po.created}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
