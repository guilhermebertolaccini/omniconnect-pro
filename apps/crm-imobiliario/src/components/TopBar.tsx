import { Bell, Search } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TopBar() {
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="h-14 border-b bg-card flex items-center gap-3 px-4 shrink-0">
      <SidebarTrigger className="text-muted-foreground" />

      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("search")}
          className="pl-9 h-9 bg-secondary border-0"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocale(locale === "pt-BR" ? "en" : "pt-BR")}
          className="text-xs font-medium text-muted-foreground"
        >
          {locale === "pt-BR" ? "🇺🇸 EN" : "🇧🇷 PT"}
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
