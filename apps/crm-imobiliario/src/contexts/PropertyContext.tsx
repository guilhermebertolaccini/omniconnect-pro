import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Property, Unit, UnitStatus } from "@/types/property";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  createProperty,
  listProperties,
  updateProperty as apiUpdateProperty,
  updateUnit,
  updateUnitStatus as apiUpdateUnitStatus,
} from "@/lib/api/crm";

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

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProperties(await listProperties());
    } catch (err) {
      toast({
        title: "Erro ao carregar empreendimentos",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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
      const newId = await createProperty(property);
      await refresh();
      return newId;
    } catch (err) {
      toast({
        title: "Erro ao criar empreendimento",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateProperty = async (id: string, data: Partial<Property>) => {
    // Optimistic
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    try {
      await apiUpdateProperty(id, data);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      await refresh();
    }
  };

  const patchUnit = async (
    propertyId: string,
    unitId: string,
    action: () => Promise<unknown>,
    optimistic: (u: Unit) => Unit,
  ) => {
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, units: p.units.map((u) => (u.id === unitId ? optimistic(u) : u)) } : p
      )
    );
    try {
      await action();
    } catch (err) {
      toast({
        title: "Erro ao salvar unidade",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      await refresh();
    }
  };

  const updateUnitStatus = (propertyId: string, unitId: string, status: UnitStatus) =>
    patchUnit(
      propertyId,
      unitId,
      () => apiUpdateUnitStatus(unitId, status),
      (u) => ({ ...u, status }),
    );

  const updateUnitPrice = (propertyId: string, unitId: string, price: number) =>
    patchUnit(
      propertyId,
      unitId,
      () => updateUnit(unitId, { price }),
      (u) => ({ ...u, price }),
    );

  const updateUnitClient = (propertyId: string, unitId: string, clientId: string, reservationExpiry: string) => {
    const reservedAt = new Date().toISOString();
    return patchUnit(
      propertyId,
      unitId,
      () => apiUpdateUnitStatus(unitId, "reserved", { clientId, reservationExpiry }),
      (u) => ({ ...u, clientId, reservedAt, reservationExpiry })
    );
  };

  const clearUnitReservation = (propertyId: string, unitId: string) =>
    patchUnit(
      propertyId,
      unitId,
      () => apiUpdateUnitStatus(unitId, "available", { clientId: null, reservationExpiry: null }),
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
