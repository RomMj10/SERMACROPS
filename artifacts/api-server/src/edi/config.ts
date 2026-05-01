export interface PartnerConfig {
  id: string;
  name: string;
  type: "client" | "supplier" | "logistics";
  ediId: string;
  as2Id: string;
  endpointUrl: string;
  isActive: boolean;
}

export const PARTNERS: Record<string, PartnerConfig> = {
  COFFEESHOP: {
    id: "COFFEESHOP",
    name: "The Coffee Shop",
    type: "client",
    ediId: "COFFEESHOP",
    as2Id: "COFFEESHOP-AS2",
    endpointUrl: "https://mock-partner.sermacrops/as2/coffeeshop",
    isActive: true,
  },
  RAWMATSUPPLY: {
    id: "PHILHARVEST",
    name: "Philharvest Co.",
    type: "supplier",
    ediId: "PHILHARVEST",
    as2Id: "PHV-AS2",
    endpointUrl: "https://mock-partner.sermacrops/as2/philharvest",
    isActive: true,
  },
  FASTLOGISTICS: {
    id: "FASTLOGISTICS",
    name: "FastTrack Logistics",
    type: "logistics",
    ediId: "FASTLOGISTICS",
    as2Id: "FASTLOG-AS2",
    endpointUrl: "https://mock-partner.sermacrops/as2/logistics",
    isActive: true,
  },
};

export const SERMACROPS_CONFIG = {
  id: "SERMACROPS",
  name: "SERMACROPS Manufacturing",
  ediId: "SERMACROPS",
  as2Id: "SERMACROPS-AS2",
};
