import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Users, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/useI18n";
import { useClients } from "@/contexts/ClientContext";
import { useAuth } from "@/contexts/AuthContext";
import { Client } from "@/types/property";
import { formatCurrency } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const scoreBadge: Record<string, string> = {
  A: "bg-unit-available text-primary-foreground",
  B: "bg-primary text-primary-foreground",
  C: "bg-unit-reserved text-primary-foreground",
  D: "bg-unit-sold text-primary-foreground",
};

export default function ClientsList() {
  const { t } = useI18n();
  const { clients, addClient, updateClient, deleteClient } = useClients();
  const { canCreateProperty } = useAuth();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: "", cpfCnpj: "", phone: "", email: "", income: 0, score: "B" as Client["score"], notes: "" });

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.cpfCnpj.includes(search) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => setForm({ name: "", cpfCnpj: "", phone: "", email: "", income: 0, score: "B", notes: "" });

  const openNew = () => { resetForm(); setEditing(null); setDialogOpen(true); };
  const openEdit = (client: Client) => {
    setForm({ name: client.name, cpfCnpj: client.cpfCnpj, phone: client.phone, email: client.email, income: client.income, score: client.score, notes: client.notes || "" });
    setEditing(client);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.cpfCnpj) return;
    if (editing) {
      updateClient(editing.id, { ...form });
    } else {
      addClient({
        id: `client-${Date.now()}`,
        ...form,
        createdAt: new Date().toISOString(),
      });
    }
    setDialogOpen(false);
    resetForm();
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("clients")}</h1>
        {canCreateProperty && (
          <Button onClick={openNew} className="gap-2 font-display">
            <Plus className="h-4 w-4" /> {t("newClient")}
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t("searchClients")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clientName")}</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>{t("phone")}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{t("income")}</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("noClients")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="font-mono text-xs">{client.cpfCnpj}</TableCell>
                    <TableCell>{client.phone}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{formatCurrency(client.income)}</TableCell>
                    <TableCell>
                      <Badge className={scoreBadge[client.score]}>{client.score}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("confirmDeleteClient")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteClient(client.id)}>
                                {t("confirm")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? t("editClient") : t("newClient")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("clientName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("phone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("income")}</Label>
              <Input type="number" value={form.income} onChange={(e) => setForm({ ...form, income: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Score</Label>
              <Select value={form.score} onValueChange={(v) => setForm({ ...form, score: v as Client["score"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A - {t("excellent")}</SelectItem>
                  <SelectItem value="B">B - {t("good")}</SelectItem>
                  <SelectItem value="C">C - {t("regular")}</SelectItem>
                  <SelectItem value="D">D - {t("low")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
