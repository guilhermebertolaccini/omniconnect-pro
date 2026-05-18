import { useQuery, type QueryKey } from '@tanstack/react-query';
import { hasActivePlatformConfig } from '@/services/platformRegistry';
import type { AdPlatform } from '@/services/platformConfigService';

interface UsePlatformDataOptions<T> {
  queryKey: QueryKey;
  fetchFn: () => Promise<T>;
  mockData: T;
  platform: AdPlatform;
  companyId?: string | null;
  enabled?: boolean;
}

interface UsePlatformDataResult<T> {
  data: T;
  isLoading: boolean;
  isLive: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Platform-aware data hook. Falls back to mock data when no config exists
 * for the given (platform, company) pair. Mirrors useMetaData but for any
 * supported ad platform.
 */
export function usePlatformData<T>(opts: UsePlatformDataOptions<T>): UsePlatformDataResult<T> {
  const { companyId, platform } = opts;

  const { data: hasConfig } = useQuery({
    queryKey: ['platformConfigActive', platform, companyId],
    queryFn: () => hasActivePlatformConfig(platform, companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const isLive = !!companyId && !!hasConfig;

  const { data, isLoading, error, refetch } = useQuery<T, Error>({
    queryKey: opts.queryKey,
    queryFn: opts.fetchFn,
    enabled: isLive && (opts.enabled ?? true),
  });

  return {
    data: isLive && data ? data : opts.mockData,
    isLoading: isLive && isLoading,
    isLive,
    error: error ?? null,
    refetch,
  };
}
