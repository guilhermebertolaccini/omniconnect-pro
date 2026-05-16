import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Package, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { templatesService, segmentsService, linesService, Template as APITemplate, Segment, Line } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

interface Template {
  id: string;
  name: string;
  segmentId: number | null;
  segmentName: string;
  lineId: number | null;
  lineName: string;
  category: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  body: string;
  header?: string;
  headerType?: string;
  footer?: string;
  namespace?: string;
  language?: string;
  variables?: string;
  buttons?: any[];
}

const statusColors: Record<string, string> = {
  APPROVED: "bg-success",
  PENDING: "bg-warning text-warning-foreground",
  REJECTED: "bg-destructive"
};

const statusLabels: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado"
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [filters, setFilters] = useState({ search: '', segment: '', status: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formData, setFormData] = useState<{
    name: string;
    segmentId: string;
    lineId: string;
    language: string;
    category: string;
    namespace: string;
    headerType: string;
    header: string;
    bodyText: string;
    footer: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    buttons: any[];
  }>({
    name: '',
    segmentId: '',
    lineId: '',
    language: 'pt_BR',
    category: 'MARKETING',
    namespace: '',
    headerType: 'TEXT',
    header: '',
    bodyText: '',
    footer: '',
    status: 'APPROVED',
    buttons: [] as any[]
  });

  const mapApiToLocal = useCallback((apiTemplate: APITemplate): Template => {
    const segment = segments.find(s => s.id === apiTemplate.segmentId);
    const line = lines.find(l => l.id === apiTemplate.lineId);
    return {
      id: apiTemplate.id.toString(),
      name: apiTemplate.name,
      segmentId: apiTemplate.segmentId,
      segmentName: segment?.name || 'Todos os segmentos',
      lineId: apiTemplate.lineId || null,
      lineName: line?.phone || apiTemplate.line?.phone || '-',
      category: apiTemplate.category,
      status: apiTemplate.status,
      body: apiTemplate.bodyText,
      header: apiTemplate.headerContent,
      headerType: apiTemplate.headerType,
      footer: apiTemplate.footerText,
      namespace: apiTemplate.namespace,
      language: apiTemplate.language,
      variables: apiTemplate.variables?.join(', '),
      buttons: apiTemplate.buttons,
    };
  }, [segments]);

  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await templatesService.list();
      setTemplates(data.map(mapApiToLocal));
    } catch (error) {
      toast({
        title: "Erro ao carregar templates",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [mapApiToLocal]);

  const loadSegments = useCallback(async () => {
    try {
      const data = await segmentsService.list();
      setSegments(data);
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  }, []);

  const loadLines = useCallback(async () => {
    try {
      const data = await linesService.list();
      setLines(data);
    } catch (error) {
      console.error('Error loading lines:', error);
    }
  }, []);

  useEffect(() => {
    loadSegments();
    loadLines();
  }, [loadSegments, loadLines]);

  useEffect(() => {
    if (segments.length >= 0) {
      loadTemplates();
    }
  }, [segments, loadTemplates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      if (filters.search && !t.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.segment && filters.segment !== 'all') {
        if (filters.segment === 'none' && t.segmentId !== null) return false;
        if (filters.segment !== 'none' && t.segmentId?.toString() !== filters.segment) return false;
      }
      if (filters.status && filters.status !== 'all' && t.status !== filters.status) return false;
      return true;
    });
  }, [templates, filters]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Pagination calculations
  const totalItems = filteredTemplates.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const paginatedTemplates = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTemplates.slice(startIndex, startIndex + pageSize);
  }, [filteredTemplates, currentPage, pageSize]);

  const handlePageSizeChange = useCallback((value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handleAdd = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      segmentId: '',
      lineId: '',
      language: 'pt_BR',
      category: 'MARKETING',
      namespace: '',
      headerType: 'TEXT',
      header: '',
      bodyText: '',
      footer: '',
      status: 'APPROVED',
      buttons: []
    });
    setIsFormOpen(true);
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      segmentId: template.segmentId?.toString() || '',
      lineId: template.lineId?.toString() || '',
      language: template.language || 'pt_BR',
      category: template.category || 'MARKETING',
      namespace: template.namespace || '',
      headerType: template.headerType || 'TEXT',
      header: template.header || '',
      bodyText: template.body || '',
      footer: template.footer || '',
      status: template.status,
      buttons: template.buttons || []
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (template: Template) => {
    try {
      await templatesService.delete(parseInt(template.id));
      setTemplates(templates.filter(t => t.id !== template.id));
      toast({
        title: "Template excluído",
        description: "Template removido com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Erro ao excluir template",
        variant: "destructive",
      });
    }
  };

  const handleDownloadCsv = async () => {
    setIsDownloading(true);
    try {
      // Preparar filtros para o download
      const downloadFilters: any = {};
      if (filters.search) downloadFilters.search = filters.search;
      if (filters.segment && filters.segment !== 'all' && filters.segment !== 'none') {
        downloadFilters.segmentId = parseInt(filters.segment);
      }
      if (filters.status && filters.status !== 'all') {
        downloadFilters.status = filters.status;
      }

      const blob = await templatesService.downloadCsv(downloadFilters);

      // Criar URL do blob e fazer download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `templates_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "O arquivo CSV está sendo baixado",
      });
    } catch (error) {
      toast({
        title: "Erro ao baixar",
        description: error instanceof Error ? error.message : "Erro ao baixar templates",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Nome é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (!formData.bodyText.trim()) {
      toast({
        title: "Campo obrigatório",
        description: "Corpo do template é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Construir payload removendo campos vazios/undefined
      const payload: any = {
        name: formData.name.trim(),
        bodyText: formData.bodyText.trim(),
        language: formData.language || 'pt_BR',
        category: (formData.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION') || 'MARKETING',
      };

      // Adicionar campos opcionais apenas se tiverem valor
      if (formData.segmentId) {
        payload.segmentId = parseInt(formData.segmentId);
      }

      if (formData.lineId && formData.lineId !== 'global') {
        payload.lineId = parseInt(formData.lineId);
      }

      if (formData.namespace.trim()) {
        payload.namespace = formData.namespace.trim();
      }

      if (formData.headerType) {
        payload.headerType = formData.headerType as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      }

      if (formData.header.trim()) {
        payload.headerContent = formData.header.trim();
      }

      if (formData.footer.trim()) {
        payload.footerText = formData.footer.trim();
      }

      if (formData.buttons && formData.buttons.length > 0) {
        payload.buttons = formData.buttons;
      }

      if (editingTemplate) {
        const updated = await templatesService.update(parseInt(editingTemplate.id), payload);
        setTemplates(templates.map(t => t.id === editingTemplate.id ? mapApiToLocal(updated) : t));
        toast({
          title: "Template atualizado",
          description: "Template atualizado com sucesso",
        });
      } else {
        const created = await templatesService.create(payload);
        setTemplates([...templates, mapApiToLocal(created)]);
        toast({
          title: "Template criado",
          description: "Template criado com sucesso",
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro ao salvar template",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6 animate-fade-in">
        {/* Filters */}
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Templates</h2>
              <p className="text-sm text-muted-foreground">Gerenciar templates de mensagens para campanhas</p>
            </div>
            <div className="flex gap-2">
              {(user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'digital') && (
                <Button
                  variant="outline"
                  onClick={handleDownloadCsv}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Baixando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Baixar CSV
                    </>
                  )}
                </Button>
              )}
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-10"
              />
            </div>
            <Select value={filters.segment} onValueChange={(value) => setFilters({ ...filters, segment: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os segmentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os segmentos</SelectItem>
                <SelectItem value="none">Sem segmento (Global)</SelectItem>
                {segments.map((segment) => (
                  <SelectItem key={segment.id} value={segment.id.toString()}>
                    {segment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="APPROVED">Aprovado</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="REJECTED">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </GlassCard>

        {/* Templates Table */}
        <GlassCard padding="none">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum template encontrado</p>
              <p className="text-sm">Clique em "Novo Template" para adicionar</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Nome</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Linha</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="max-w-xs">Corpo</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTemplates.map((template) => (
                      <TableRow key={template.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>
                          {template.lineName !== '-' ? (
                            <Badge variant="outline">{template.lineName}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Global</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={template.segmentId ? "default" : "secondary"}>
                            {template.segmentName}
                          </Badge>
                        </TableCell>
                        <TableCell>{template.category || '-'}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[template.status]}>
                            {statusLabels[template.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          <span className="text-xs italic">Definido na Meta</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(template)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(template)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Mostrando {startItem}-{endItem} de {totalItems}</span>
                    <span className="hidden sm:inline">|</span>
                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline">Por página:</span>
                      <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                        <SelectTrigger className="w-[70px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {pageNumbers.map((page, index) => (
                      page === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">...</span>
                      ) : (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => goToPage(page)}
                        >
                          {page}
                        </Button>
                      )
                    ))}

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </GlassCard>
      </div>

      {/* Template Form Modal */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Editar' : 'Novo'} Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do template"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="line">Linha Vinculada</Label>
              <Select
                value={formData.lineId || 'global'}
                onValueChange={(value) => setFormData({ ...formData, lineId: value === 'global' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas (Global)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todas (Global)</SelectItem>
                  {lines.map((line) => (
                    <SelectItem key={line.id} value={line.id.toString()}>
                      {line.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se vincular a uma linha, o template só aparecerá para ela.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="segment">Segmento</Label>
              <Select
                value={formData.segmentId || 'global'}
                onValueChange={(value) => setFormData({ ...formData, segmentId: value === 'global' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos (Global)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todos (Global)</SelectItem>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id.toString()}>
                      {segment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Deixe em "Global" para usar em qualquer segmento
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Idioma</Label>
              <Select value={formData.language} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utilitário</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>


            <div className="space-y-2">
              <Label htmlFor="headerType">Tipo de Cabeçalho</Label>
              <Select value={formData.headerType} onValueChange={(value) => setFormData({ ...formData, headerType: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="IMAGE">Imagem</SelectItem>
                  <SelectItem value="VIDEO">Vídeo</SelectItem>
                  <SelectItem value="DOCUMENT">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.headerType === 'TEXT' && (
              <div className="space-y-2">
                <Label htmlFor="header">Cabeçalho</Label>
                <Textarea
                  id="header"
                  value={formData.header}
                  onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                  placeholder="Texto do cabeçalho (opcional)"
                  rows={2}
                />
              </div>
            )}

            {formData.headerType !== 'TEXT' && formData.headerType && (
              <div className="space-y-2">
                <Label htmlFor="header">URL do Cabeçalho ({formData.headerType})</Label>
                <Input
                  id="header"
                  value={formData.header}
                  onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                  placeholder={`URL da ${formData.headerType.toLowerCase()}`}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bodyText">Corpo do Template *</Label>
              <Textarea
                id="bodyText"
                value={formData.bodyText}
                onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                placeholder={`Texto principal do template. Use {{1}}, {{2}}, etc. para variáveis.`}
                rows={6}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis que serão substituídas ao enviar. Ex: "Olá {'{{1}}'}, tudo bem?"
              </p>
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label>Botões (opcional, máx 3)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (formData.buttons.length < 3) {
                      setFormData({
                        ...formData,
                        buttons: [...formData.buttons, { type: 'QUICK_REPLY', text: '' }]
                      });
                    }
                  }}
                  disabled={formData.buttons.length >= 3}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Botão
                </Button>
              </div>

              {formData.buttons.map((button, index) => (
                <div key={index} className="grid gap-2 p-3 border rounded-md bg-background relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 text-destructive"
                    onClick={() => {
                      const newButtons = [...formData.buttons];
                      newButtons.splice(index, 1);
                      setFormData({ ...formData, buttons: newButtons });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={button.type}
                        onValueChange={(value) => {
                          const newButtons = [...formData.buttons];
                          newButtons[index] = { ...button, type: value, text: button.text };
                          // Reset fields based on type
                          if (value === 'URL') newButtons[index].url = '';
                          if (value === 'PHONE_NUMBER') newButtons[index].phoneNumber = '';
                          setFormData({ ...formData, buttons: newButtons });
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QUICK_REPLY">Resposta Rápida</SelectItem>
                          <SelectItem value="URL">Link (URL)</SelectItem>
                          <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Texto do Botão</Label>
                      <Input
                        value={button.text}
                        onChange={(e) => {
                          const newButtons = [...formData.buttons];
                          newButtons[index].text = e.target.value;
                          setFormData({ ...formData, buttons: newButtons });
                        }}
                        className="h-8"
                        placeholder="Ex: Sim, aceito"
                      />
                    </div>
                  </div>

                  {button.type === 'URL' && (
                    <div className="space-y-1">
                      <Label className="text-xs">URL</Label>
                      <Input
                        value={button.url || ''}
                        onChange={(e) => {
                          const newButtons = [...formData.buttons];
                          newButtons[index].url = e.target.value;
                          setFormData({ ...formData, buttons: newButtons });
                        }}
                        className="h-8"
                        placeholder="https://exemplo.com"
                      />
                    </div>
                  )}

                  {button.type === 'PHONE_NUMBER' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Telefone</Label>
                      <Input
                        value={button.phoneNumber || ''}
                        onChange={(e) => {
                          const newButtons = [...formData.buttons];
                          newButtons[index].phoneNumber = e.target.value;
                          setFormData({ ...formData, buttons: newButtons });
                        }}
                        className="h-8"
                        placeholder="+5511999999999"
                      />
                    </div>
                  )}
                </div>
              ))}
              {formData.buttons.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhum botão adicionado
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="footer">Rodapé</Label>
              <Textarea
                id="footer"
                value={formData.footer}
                onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                placeholder="Texto do rodapé (opcional)"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="namespace">Namespace</Label>
              <Input
                id="namespace"
                value={formData.namespace}
                onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                placeholder="Namespace do template (opcional)"
              />
              <p className="text-xs text-muted-foreground">
                Namespace retornado pela Meta após sincronização
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
