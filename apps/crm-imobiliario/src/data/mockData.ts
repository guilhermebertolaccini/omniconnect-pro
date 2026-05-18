import { Property, Unit, UnitStatus, User, Client } from "@/types/property";

const typologies = ["Studio", "1 Quarto", "2 Quartos", "3 Quartos", "Cobertura"];
const areas = [28, 45, 65, 90, 140];
const basePrices = [320000, 480000, 720000, 1100000, 2200000];

function generateUnits(
  propertyId: string,
  towerName: string,
  floors: number,
  unitsPerFloor: number,
  priceMultiplier: number
): Unit[] {
  const units: Unit[] = [];
  for (let floor = 1; floor <= floors; floor++) {
    for (let u = 1; u <= unitsPerFloor; u++) {
      const typeIndex = (u - 1) % typologies.length;
      const floorPremium = 1 + (floor - 1) * 0.02;
      const rand = Math.random();
      let status: UnitStatus = "available";
      if (rand < 0.25) status = "sold";
      else if (rand < 0.4) status = "reserved";

      units.push({
        id: `${propertyId}-${towerName}-${floor}${String(u).padStart(2, "0")}`,
        number: `${floor}${String(u).padStart(2, "0")}`,
        tower: towerName,
        floor,
        typology: typologies[typeIndex],
        area: areas[typeIndex],
        price: Math.round(basePrices[typeIndex] * priceMultiplier * floorPremium),
        status,
      });
    }
  }
  return units;
}

export const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "Residencial Aurora",
    address: "Av. Paulista, 1500",
    city: "São Paulo",
    developer: "Construtora Horizonte",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=400&fit=crop",
    towers: [
      { name: "Torre A", floors: 20, unitsPerFloor: 4 },
      { name: "Torre B", floors: 20, unitsPerFloor: 4 },
    ],
    units: [
      ...generateUnits("prop-1", "Torre A", 20, 4, 1.2),
      ...generateUnits("prop-1", "Torre B", 20, 4, 1.15),
    ],
  },
  {
    id: "prop-2",
    name: "Parque das Águas",
    address: "Rua das Palmeiras, 300",
    city: "Campinas",
    developer: "MRV Engenharia",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop",
    towers: [
      { name: "Torre Ipê", floors: 15, unitsPerFloor: 6 },
    ],
    units: generateUnits("prop-2", "Torre Ipê", 15, 6, 0.8),
  },
  {
    id: "prop-3",
    name: "Edifício Atlântica",
    address: "Av. Beira Mar, 800",
    city: "Florianópolis",
    developer: "Cyrela",
    image: "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=600&h=400&fit=crop",
    towers: [
      { name: "Torre Norte", floors: 25, unitsPerFloor: 3 },
      { name: "Torre Sul", floors: 25, unitsPerFloor: 3 },
      { name: "Torre Leste", floors: 18, unitsPerFloor: 4 },
    ],
    units: [
      ...generateUnits("prop-3", "Torre Norte", 25, 3, 1.5),
      ...generateUnits("prop-3", "Torre Sul", 25, 3, 1.45),
      ...generateUnits("prop-3", "Torre Leste", 18, 4, 1.3),
    ],
  },
];

export const mockClients: Client[] = [
  { id: "client-1", name: "Maria Silva Santos", cpfCnpj: "123.456.789-00", phone: "(11) 99999-1234", email: "maria.silva@email.com", income: 15000, score: "A", createdAt: "2025-01-15T10:00:00Z" },
  { id: "client-2", name: "João Pedro Oliveira", cpfCnpj: "987.654.321-00", phone: "(11) 98888-5678", email: "joao.oliveira@email.com", income: 8500, score: "B", createdAt: "2025-02-20T14:30:00Z" },
  { id: "client-3", name: "Ana Carolina Ferreira", cpfCnpj: "456.789.123-00", phone: "(19) 97777-9012", email: "ana.ferreira@email.com", income: 22000, score: "A", createdAt: "2025-03-01T09:00:00Z" },
  { id: "client-4", name: "Roberto Carlos Lima", cpfCnpj: "12.345.678/0001-90", phone: "(48) 96666-3456", email: "roberto.lima@empresa.com", income: 45000, score: "A", notes: "Investidor", createdAt: "2025-01-10T08:00:00Z" },
  { id: "client-5", name: "Fernanda Costa Souza", cpfCnpj: "321.654.987-00", phone: "(11) 95555-7890", email: "fernanda.souza@email.com", income: 6000, score: "C", createdAt: "2025-03-10T16:00:00Z" },
];

export const mockUsers: User[] = [
  { id: "user-1", name: "Carlos Admin", role: "admin" },
  { id: "user-2", name: "Ana Gerente", role: "manager" },
  { id: "user-3", name: "João Corretor", role: "broker" },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getPropertyStats(property: Property) {
  const total = property.units.length;
  const available = property.units.filter((u) => u.status === "available").length;
  const reserved = property.units.filter((u) => u.status === "reserved").length;
  const sold = property.units.filter((u) => u.status === "sold").length;
  const totalVGV = property.units.reduce((sum, u) => sum + u.price, 0);
  const soldVGV = property.units.filter((u) => u.status === "sold").reduce((sum, u) => sum + u.price, 0);
  const availableVGV = property.units.filter((u) => u.status === "available").reduce((sum, u) => sum + u.price, 0);

  return { total, available, reserved, sold, totalVGV, soldVGV, availableVGV };
}
