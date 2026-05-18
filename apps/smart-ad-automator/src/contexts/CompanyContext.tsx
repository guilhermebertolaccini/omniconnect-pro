import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AdPlatform } from '@/services/platformConfigService';

interface Company {
  id: string;
  name: string;
  business_name: string;
}

interface CompanyContextType {
  companies: Company[];
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  selectedPlatform: AdPlatform;
  setSelectedPlatform: (p: AdPlatform) => void;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  selectedCompanyId: null,
  setSelectedCompanyId: () => {},
  selectedPlatform: 'meta',
  setSelectedPlatform: () => {},
  isLoading: true,
});

export function useCompany() {
  return useContext(CompanyContext);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatformState] = useState<AdPlatform>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('adpilot:platform') : null;
    return (saved as AdPlatform) || 'meta';
  });
  const [isLoading, setIsLoading] = useState(true);

  const setSelectedPlatform = (p: AdPlatform) => {
    setSelectedPlatformState(p);
    try { localStorage.setItem('adpilot:platform', p); } catch {}
  };

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('companies')
        .select('id, name, business_name')
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        setCompanies(data);
        setSelectedCompanyId(data[0].id);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  return (
    <CompanyContext.Provider value={{
      companies,
      selectedCompanyId,
      setSelectedCompanyId,
      selectedPlatform,
      setSelectedPlatform,
      isLoading,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}
