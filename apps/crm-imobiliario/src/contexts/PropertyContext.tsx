import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Property, Unit, UnitStatus, PropertyDocument, Tower } from "@/types/property";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface PropertyContextType {
  properties: Property[];
  loading: boolean;
  addProperty: (property: Property) => Promise<string>;
  updateProperty: (id: string, data: Partial<Property>) => Promise<void>;
  updateUnitStatus: (propertyId: string, unitId: string, status: UnitStatus) => Promise<void>;
  updateUnitPrice: (propertyId: string, unitId: string, price: number) => Promise<void>;
  updateUnitClient: (propertyId: string, unitId: string, clientId: string, reservationExpiry: string) => Promise<void>;
  clearUnitReservation: (propertyId: string, unitId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const PropertyContext = createContext<PropertyContextType | null>(null);

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop";

function rowToUnit(row: any): Unit {
  return {
    id: row.id,
    number: row.number,
    tower: row.tower ?? "",
    floor: row.floor ?? 0,
    typology: row.typology ?? "",
    area: Number(row.area ?? 0),
    price: Number(row.price ?? 0),
    status: (row.status ?? "available") as UnitStatus,
    observations: row.observations ?? undefined,
    clientId: row.client_id ?? undefined,
    reservedAt: row.reserved_at ?? undefined,
    reservationExpiry: row.reservation_expiry ?? undefined,
    proposalId: row.proposal_id ?? undefined,
    contractId: row.contract_id ?? undefined,
  };
}

function rowToProperty(row: any, units: Unit[]): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    developer: row.developer ?? "",
    image: row.image_url ?? FALLBACK_IMAGE,
    towers: (row.towers as Tower[]) ?? [],
    units,
    documents: (row.documents as PropertyDocument[]) ?? [],
  };
}

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: propRows, error: e1 }, { data: unitRows, error: e2 }] = await Promise.all([
        supabase.from("properties").select("*").order("created_at", { ascending: false }),
        supabase.from("units").select("*"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const unitsByProp = new Map<string, Unit[]>();
      (unitRows ?? []).forEach((r: any) => {
        const arr = unitsByProp.get(r.property_id) ?? [];
        arr.push(rowToUnit(r));
        unitsByProp.set(r.property_id, arr);
      });
      const list = (propRows ?? []).map((r: any) => rowToProperty(r, unitsByProp.get(r.id) ?? []));
      setProperties(list);
    } catch (err: any) {
      toast({ title: "Erro ao carregar empreendimentos", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (session) {
      refresh();
    } else {
      setProperties([]);
      setLoading(false);
    }
  }, [session, refresh]);

  const addProperty = async (property: Property): Promise<string> => {
    try {
      const { data: inserted, error } = await supabase
        .from("properties")
        .insert({
          name: property.name,
          address: property.address,
          city: property.city,
          developer: property.developer,
          image_url: property.image,
          towers: property.towers as any,
          documents: (property.documents ?? []) as any,
        })
        .select()
        .single();
      if (error) throw error;

      const newId = inserted.id;
      if (property.units.length > 0) {
        const rows = property.units.map((u) => ({
          property_id: newId,
          number: u.number,
          tower: u.tower,
          floor: u.floor,
          typology: u.typology,
          area: u.area,
          price: u.price,
          status: u.status,
        }));
        const { error: uErr } = await supabase.from("units").insert(rows);
        if (uErr) throw uErr;
      }
      await refresh();
      return newId as string;
    } catch (err: any) {
      toast({ title: "Erro ao criar empreendimento", description: err?.message ?? String(err), variant: "destructive" });
      throw err;
    }
  };

  const updateProperty = async (id: string, data: Partial<Property>) => {
    // Optimistic
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.address !== undefined) patch.address = data.address;
    if (data.city !== undefined) patch.city = data.city;
    if (data.developer !== undefined) patch.developer = data.developer;
    if (data.image !== undefined) patch.image_url = data.image;
    if (data.towers !== undefined) patch.towers = data.towers;
    if (data.documents !== undefined) patch.documents = data.documents;
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from("properties").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      await refresh();
    }
  };

  const patchUnit = async (propertyId: string, unitId: string, patch: any, optimistic: (u: Unit) => Unit) => {
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, units: p.units.map((u) => (u.id === unitId ? optimistic(u) : u)) } : p
      )
    );
    const { error } = await supabase.from("units").update(patch).eq("id", unitId);
    if (error) {
      toast({ title: "Erro ao salvar unidade", description: error.message, variant: "destructive" });
      await refresh();
    }
  };

  const updateUnitStatus = (propertyId: string, unitId: string, status: UnitStatus) =>
    patchUnit(propertyId, unitId, { status }, (u) => ({ ...u, status }));

  const updateUnitPrice = (propertyId: string, unitId: string, price: number) =>
    patchUnit(propertyId, unitId, { price }, (u) => ({ ...u, price }));

  const updateUnitClient = (propertyId: string, unitId: string, clientId: string, reservationExpiry: string) => {
    const reservedAt = new Date().toISOString();
    return patchUnit(
      propertyId,
      unitId,
      { client_id: clientId, reserved_at: reservedAt, reservation_expiry: reservationExpiry },
      (u) => ({ ...u, clientId, reservedAt, reservationExpiry })
    );
  };

  const clearUnitReservation = (propertyId: string, unitId: string) =>
    patchUnit(
      propertyId,
      unitId,
      { status: "available", client_id: null, reserved_at: null, reservation_expiry: null },
      (u) => ({ ...u, status: "available", clientId: undefined, reservedAt: undefined, reservationExpiry: undefined })
    );

  return (
    <PropertyContext.Provider
      value={{
        properties,
        loading,
        addProperty,
        updateProperty,
        updateUnitStatus,
        updateUnitPrice,
        updateUnitClient,
        clearUnitReservation,
        refresh,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function useProperties() {
  const ctx = useContext(PropertyContext);
  if (!ctx) throw new Error("useProperties must be used within PropertyProvider");
  return ctx;
}
