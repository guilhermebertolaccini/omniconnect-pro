import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/contexts/CompanyContext';
import type { AdPlatform } from '@/services/platformConfigService';
import { Layers } from 'lucide-react';

interface PlatformSelectorProps {
  className?: string;
}

export function PlatformSelector({ className }: PlatformSelectorProps) {
  const { selectedPlatform, setSelectedPlatform } = useCompany();

  return (
    <Select value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as AdPlatform)}>
      <SelectTrigger className={`h-9 w-[160px] bg-muted/50 ${className ?? ''}`}>
        <Layers className="h-4 w-4 mr-2 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="meta">Meta Ads</SelectItem>
        <SelectItem value="google_ads">Google Ads</SelectItem>
        <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
      </SelectContent>
    </Select>
  );
}
