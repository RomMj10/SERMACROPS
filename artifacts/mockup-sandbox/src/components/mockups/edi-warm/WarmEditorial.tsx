import { ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronRight, LayoutDashboard, ArrowLeftRight, ShoppingCart, Package, Users, Terminal } from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Purchase Orders", icon: ShoppingCart, active: true },
  { label: "Inventory", icon: Package },
  { label: "Partners", icon: Users },
  { label: "EDI Simulator", icon: Terminal },
];

const rows = [
  { po: "SP0000001012", dir: "outbound", partnerName: "PhilHarvest", partnerId: "PHILHARVEST", ship: "TBD", amount: "$0.00", status: "pending", created: "5/1/2026" },
  { po: "PO10001", dir: "inbound", partnerName: "The Coffee Shop", partnerId: "COFFEESHOP", ship: "5/5/2026", amount: "$2,500.00", status: "completed", created: "5/1/2026" },
  { po: "SP0000000101", dir: "outbound", partnerName: "PhilHarvest", partnerId: "PHILHARVEST", ship: "5/3/2026", amount: "$1,312.50", status: "invoiced", created: "5/1/2026" },
  { po: "PO10002", dir: "inbound", partnerName: "The Coffee Shop", partnerId: "COFFEESHOP", ship: "5/8/2026", amount: "$2,000.00", status: "pending", created: "5/1/2026" },
];

const statusStyle: Record<string, React.CSSProperties> = {
  pending: { background: "#FFF8E8", color: "#8B6010", border: "1px solid #D4A830" },
  completed: { background: "#EDF5EE", color: "#2A6035", border: "1px solid #7BB48A" },
  invoiced: { background: "#FDF3E3", color: "#7A4C10", border: "1px solid #C89050" },
};

export function WarmEditorial() {
  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#FAF5EC", color: "#1A0F08", display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 232, background: "#2C1810", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid #3D2218" }}>
        {/* Brand */}
        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid #3D2218" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#C68B2E" opacity="0.9" />
              <path d="M8 12 Q12 8 16 12 Q12 16 8 12Z" fill="#2C1810" />
            </svg>
            <span style={{ fontFamily: "'Playfair Display', 'Georgia', serif", fontSize: 16, fontWeight: 700, color: "#F5E8C8", letterSpacing: "0.04em" }}>
              SERMACROPS
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#9B7A5A", marginTop: 4, marginLeft: 32, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Manufacturing Co.
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {navItems.map((item) => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: 6, marginBottom: 2, cursor: "pointer",
              background: item.active ? "#3D2218" : "transparent",
              borderLeft: item.active ? "3px solid #C68B2E" : "3px solid transparent",
              color: item.active ? "#F5E8C8" : "#9B7A5A",
              fontSize: 13.5,
              fontFamily: "'Georgia', serif",
              transition: "all 0.15s",
            }}>
              <item.icon size={15} strokeWidth={1.5} />
              {item.label}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #3D2218" }}>
          <div style={{ fontSize: 11, color: "#5A3A22", letterSpacing: "0.08em" }}>EDI SYSTEM v1.0</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7BB48A" }} />
            <span style={{ fontSize: 11, color: "#7BB48A" }}>System Online</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ borderBottom: "1px solid #E8DCC8", padding: "20px 36px 18px", background: "#FAF5EC" }}>
          <h1 style={{ fontFamily: "'Playfair Display', 'Georgia', serif", fontSize: 26, fontWeight: 700, color: "#1A0F08", margin: 0, letterSpacing: "-0.01em" }}>
            Purchase Orders
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8B7355", fontStyle: "italic" }}>
            Track PO lifecycle from pending to completed.
          </p>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "24px 36px", overflowY: "auto" }}>
          {/* Filter */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", background: "#FDF8F0",
              border: "1px solid #D4C4A0", borderRadius: 6, cursor: "pointer",
              fontSize: 13, color: "#4A3520",
            }}>
              All Statuses
              <ChevronDown size={14} strokeWidth={1.5} style={{ color: "#8B7355" }} />
            </div>
          </div>

          {/* Table card */}
          <div style={{ background: "#FFFDF8", border: "1px solid #E8DCC8", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(44,24,16,0.06)" }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "190px 110px 1fr 100px 110px 120px 130px",
              padding: "12px 20px",
              borderBottom: "1px solid #E8DCC8",
              background: "#F8F0E4",
            }}>
              {["PO Number", "Direction", "Partner", "Ship Date", "Total Amount", "Pipeline Status", "Created"].map((col) => (
                <span key={col} style={{ fontSize: 10.5, fontWeight: 600, color: "#8B7355", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Georgia', serif" }}>
                  {col}
                </span>
              ))}
            </div>

            {/* Rows */}
            {rows.map((row, i) => (
              <div key={row.po} style={{
                display: "grid",
                gridTemplateColumns: "190px 110px 1fr 100px 110px 120px 130px",
                padding: "14px 20px",
                borderBottom: i < rows.length - 1 ? "1px solid #F0E6D4" : "none",
                alignItems: "center",
                background: i % 2 === 0 ? "#FFFDF8" : "#FBF6EE",
                transition: "background 0.1s",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1A0F08", letterSpacing: "0.02em" }}>{row.po}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {row.dir === "outbound"
                    ? <ArrowUpRight size={13} style={{ color: "#C68B2E" }} />
                    : <ArrowDownLeft size={13} style={{ color: "#4A8A60" }} />}
                  <span style={{ fontSize: 12, color: "#5A3A22", textTransform: "capitalize" }}>{row.dir}</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#1A0F08" }}>{row.partnerName}</div>
                  <div style={{ fontSize: 10, color: "#9B7A5A", letterSpacing: "0.06em", textTransform: "uppercase" }}>{row.partnerId}</div>
                </div>
                <span style={{ fontSize: 12.5, color: "#5A3A22" }}>{row.ship}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1A0F08", fontFamily: "'Georgia', monospace" }}>{row.amount}</span>
                <div>
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 12, fontWeight: 500, ...statusStyle[row.status] }}>
                    {row.status}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#8B7355" }}>{row.created}</span>
                  {(row.status === "pending") && <ChevronRight size={13} style={{ color: "#C68B2E" }} />}
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <p style={{ marginTop: 16, fontSize: 11.5, color: "#9B7A5A", fontStyle: "italic" }}>
            Showing 4 purchase orders — 2 inbound, 2 outbound
          </p>
        </div>
      </div>
    </div>
  );
}
