import React from "react"
import { LayoutDashboard, FileText, ShoppingCart, Package, Users, MonitorPlay, ArrowUp, ArrowDown, ChevronDown } from "lucide-react"

export function Terminal() {
  const fontStyle = { fontFamily: "'JetBrains Mono', 'Courier New', monospace" }

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, active: false },
    { name: "Transactions", icon: FileText, active: false },
    { name: "Purchase Orders", icon: ShoppingCart, active: true },
    { name: "Inventory", icon: Package, active: false },
    { name: "Partners", icon: Users, active: false },
    { name: "EDI Simulator", icon: MonitorPlay, active: false },
  ]

  const poData = [
    {
      poNumber: "SP0000001012",
      direction: "Outbound",
      partner: "PhilHarvest / PHILHARVEST",
      shipDate: "TBD",
      amount: "$0.00",
      status: "pending",
      created: "5/1/2026",
    },
    {
      poNumber: "PO10001",
      direction: "Inbound",
      partner: "The Coffee Shop / COFFEESHOP",
      shipDate: "5/5/2026",
      amount: "$2,500.00",
      status: "completed",
      created: "5/1/2026",
    },
    {
      poNumber: "SP0000000101",
      direction: "Outbound",
      partner: "PhilHarvest",
      shipDate: "5/3/2026",
      amount: "$1,312.50",
      status: "invoiced",
      created: "5/1/2026",
    },
    {
      poNumber: "PO10002",
      direction: "Inbound",
      partner: "The Coffee Shop",
      shipDate: "5/8/2026",
      amount: "$2,000.00",
      status: "pending",
      created: "5/1/2026",
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#FF9900"
      case "completed":
        return "#00FF41"
      case "invoiced":
        return "#00BFFF"
      default:
        return "#7CFC7C"
    }
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{
        backgroundColor: "#000000",
        color: "#E8FFE8",
        ...fontStyle,
      }}
    >
      {/* Sidebar */}
      <div
        className="w-64 flex flex-col flex-shrink-0"
        style={{
          backgroundColor: "#0A0A0A",
          borderRight: "1px solid #1A1A1A",
          backgroundImage: "repeating-linear-gradient(transparent, transparent 2px, rgba(0, 255, 65, 0.03) 2px, rgba(0, 255, 65, 0.03) 4px)",
        }}
      >
        <div className="p-6 border-b border-[#1A1A1A]">
          <div className="flex items-center text-[#00FF41] font-bold text-xl tracking-wider">
            SERMACROPS<span className="animate-pulse ml-1">|</span>
          </div>
          <div className="text-[#7CFC7C] text-xs mt-2 opacity-70">SYS.CTRL.V1.0.4</div>
        </div>

        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.name}
                href="#"
                className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                  item.active
                    ? "text-[#00FF41] bg-[#001A00] border-r-2 border-[#00FF41]"
                    : "text-[#7CFC7C] hover:text-[#00FF41] hover:bg-[#001A00]"
                }`}
              >
                <Icon size={16} className={item.active ? "text-[#00FF41]" : "text-[#7CFC7C]"} />
                {item.name}
              </a>
            )
          })}
        </nav>

        <div className="p-6 border-t border-[#1A1A1A] text-xs text-[#7CFC7C] opacity-50">
          <div>STATUS: ONLINE</div>
          <div>PING: 14ms</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Subtle scanline overlay for the whole main area */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.02]" 
          style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 2px, #00FF41 2px, #00FF41 4px)" }}
        />

        <div className="p-8 flex-1 overflow-auto z-10">
          <header className="mb-8">
            <h1 className="text-3xl font-bold mb-2 text-[#E8FFE8]">Purchase Orders</h1>
            <p className="text-[#7CFC7C]">Track PO lifecycle from pending to completed.</p>
          </header>

          <div className="mb-6 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-[#7CFC7C] text-sm">&gt; FILTER_</span>
              <button 
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-[#00FF41] text-[#00FF41] hover:bg-[#001A00] transition-colors"
                style={{ outline: 'none' }}
              >
                All Statuses
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="text-xs text-[#7CFC7C]">
              ROWS: {poData.length}
            </div>
          </div>

          <div className="border border-[#1A2A1A] rounded-sm overflow-hidden bg-[#050505]">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1A2A1A] text-[#7CFC7C] bg-[#0A0A0A]">
                  <th className="px-4 py-3 font-normal uppercase">PO Number</th>
                  <th className="px-4 py-3 font-normal uppercase">Direction</th>
                  <th className="px-4 py-3 font-normal uppercase">Partner</th>
                  <th className="px-4 py-3 font-normal uppercase">Ship Date</th>
                  <th className="px-4 py-3 font-normal uppercase text-right">Total Amount</th>
                  <th className="px-4 py-3 font-normal uppercase">Pipeline Status</th>
                  <th className="px-4 py-3 font-normal uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {poData.map((row, idx) => (
                  <tr 
                    key={idx} 
                    className="border-b border-[#1A2A1A] last:border-0 hover:bg-[#001A00] transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-3 font-bold text-[#E8FFE8] group-hover:text-[#00FF41]">{row.poNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.direction === "Outbound" ? (
                          <ArrowUp size={14} className="text-[#FF9900]" />
                        ) : (
                          <ArrowDown size={14} className="text-[#00FF41]" />
                        )}
                        <span className={row.direction === "Outbound" ? "text-[#FF9900]" : "text-[#00FF41]"}>
                          {row.direction}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 truncate max-w-[200px]" title={row.partner}>
                      {row.partner}
                    </td>
                    <td className="px-4 py-3">{row.shipDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.amount}</td>
                    <td className="px-4 py-3">
                      <span 
                        className="px-2 py-0.5 text-xs uppercase inline-block"
                        style={{ 
                          color: getStatusColor(row.status),
                          border: `1px solid ${getStatusColor(row.status)}`,
                          backgroundColor: row.status === 'completed' ? '#001500' : 'transparent',
                          boxShadow: `0 0 4px ${getStatusColor(row.status)}40`
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#7CFC7C]">{row.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 flex items-center text-xs text-[#7CFC7C]">
            <span className="animate-pulse mr-2">_</span> EOF
          </div>
        </div>
      </div>
    </div>
  )
}
