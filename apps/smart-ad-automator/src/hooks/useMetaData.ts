import { useQuery, type QueryKey } from '@tanstack/react-query';
import { hasActiveMetaConfig } from '@/services/metaConfigService';

interface UseMetaDataOptions<T> {
  queryKey: QueryKey;
  fetchFn: () => Promise<T>;
  mockData: T;
  enabled?: boolean;
  companyId?: string | null;
}

interface UseMetaDataResult<T> {
  data: T;
  isLoading: boolean;
  isLive: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMetaData<T>(options: UseMetaDataOptions<T>): UseMetaDataResult<T> {
  const companyId = options.companyId;

  // Check if this company has an active Meta config
  const { data: hasConfig } = useQuery({
    queryKey: ['metaConfigActive', companyId],
    queryFn: () => hasActiveMetaConfig(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const isLive = !!companyId && !!hasConfig;

  const { data, isLoading, error, refetch } = useQuery<T, Error>({
    queryKey: options.queryKey,
    queryFn: options.fetchFn,
    enabled: isLive && (options.enabled ?? true),
  });

  return {
    data: isLive && data ? data : options.mockData,
    isLoading: isLive && isLoading,
    isLive,
    error: error ?? null,
    refetch,
  };
}
