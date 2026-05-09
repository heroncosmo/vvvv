import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { Users, Plus, Pencil, Trash2, Filter, Mail, Phone } from "lucide-react";
import PremiumBlocked from "@/components/premium-overlay";

type ContactList = {
  id: string;
  nome: string;
  descricao: string;
  contatos: number;
  atualizadaEm: string;
};

type Contact = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  tags: string[];
  status: "ativo" | "em-prospeccao" | "inativo";
  listas: string[];
  criadoEm: string;
  atualizadoEm: string;
};

const contactLists: ContactList[] = [
  {
    id: "list-sales",
    nome: "Sales Prospects",
    descricao: "Leads que aguardam qualificação pelo time comercial.",
    contatos: 42,
    atualizadaEm: "08/11/2025 15:40",
  },
  {
    id: "list-vip",
    nome: "VIP Customers",
    descricao: "Clientes de alto valor com atendimento dedicado.",
    contatos: 18,
    atualizadaEm: "08/11/2025 11:10",
  },
  {
    id: "list-newsletter",
    nome: "Newsletter Subscribers",
    descricao: "Base que recebe comunicações de marketing.",
    contatos: 275,
    atualizadaEm: "07/11/2025 20:05",
  },
];

const contacts: Contact[] = [
  {
    id: "ct-001",
    nome: "Marina Costa",
    email: "marina.costa@example.com",
    telefone: "+55 11 98888-0001",
    tags: ["VIP", "SP"],
    status: "ativo",
    listas: ["list-vip", "list-newsletter"],
    criadoEm: "02/10/2025",
    atualizadoEm: "08/11/2025",
  },
  {
    id: "ct-002",
    nome: "João Santos",
    email: "joao.santos@example.com",
    telefone: "+55 21 99777-2222",
    tags: ["RJ"],
    status: "em-prospeccao",
    listas: ["list-sales"],
    criadoEm: "15/09/2025",
    atualizadoEm: "07/11/2025",
  },
  {
    id: "ct-003",
    nome: "Paula Lima",
    email: "paula.lima@example.com",
    telefone: "+55 31 97777-3333",
    tags: ["Onboarding", "MG"],
    status: "ativo",
    listas: ["list-sales", "list-newsletter"],
    criadoEm: "01/09/2025",
    atualizadoEm: "06/11/2025",
  },
  {
    id: "ct-004",
    nome: "André Castro",
    email: "andre.castro@example.com",
    telefone: "+55 48 98877-4444",
    tags: ["Suporte"],
    status: "inativo",
    listas: ["list-newsletter"],
    criadoEm: "20/08/2025",
    atualizadoEm: "25/10/2025",
  },
  {
    id: "ct-005",
    nome: "Click Story", // empresa
    email: "marketing@clickstory.com",
    telefone: "+55 41 98812-1234",
    tags: ["Agência", "PR"],
    status: "em-prospeccao",
    listas: ["list-sales"],
    criadoEm: "05/10/2025",
    atualizadoEm: "08/11/2025",
  },
];

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "em-prospeccao", label: "Em prospecção" },
  { value: "inativo", label: "Inativo" },
];

export default function ContactsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  const requireSubscription = () =>
    toast({
      title: "Recurso Premium",
      description:
        "Esta funcionalidade requer assinatura de um plano. Por favor, assine um plano para ter acesso.",
      action: (
        <ToastAction altText="Ver Planos" onClick={() => setLocation("/plans")}>
          Ver Planos
        </ToastAction>
      ),
    });

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const term = searchTerm.toLowerCase();
      const matchesTerm =
        !term ||
        contact.nome.toLowerCase().includes(term) ||
        contact.email.toLowerCase().includes(term) ||
        contact.telefone.toLowerCase().includes(term);
      const matchesList = listFilter === "all" || contact.listas.includes(listFilter);
      const matchesTag = tagFilter === "all" || contact.tags.includes(tagFilter);
      const matchesStatus = statusFilter === "all" || contact.status === statusFilter;
      return matchesTerm && matchesList && matchesTag && matchesStatus;
    });
  }, [searchTerm, listFilter, tagFilter, statusFilter]);

  const uniqueTags = Array.from(new Set(contacts.flatMap((contact) => contact.tags)));

  const toggleContactSelection = (id: string) => {
    setSelectedContacts((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleAllContacts = (checked: boolean) => {
    setSelectedContacts(checked ? filteredContacts.map((contact) => contact.id) : []);
  };

  const bulkLabel = selectedContacts.length
    ? `${selectedContacts.length} contato(s) selecionado(s)`
    : "Selecione contatos para ações em massa";

  return (
    <PremiumBlocked
      title="Continue Gerenciando Contatos"
      subtitle="Seu período de teste acabou"
      description="Assine um plano para continuar gerenciando sua base de contatos com ações em massa e segmentação."
      ctaLabel="Ativar Plano Ilimitado"
    >
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Contatos</h1>
            <p className="text-muted-foreground">
              Organize listas, personalize segmentos e mantenha a base pronta para ativação.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requireSubscription}>
              Importar CSV
            </Button>
            <Button onClick={requireSubscription}>
              <Users className="w-4 h-4 mr-2" />
              Novo Contato
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Criar nova lista</CardTitle>
              <CardDescription>Cadastre listas personalizadas para campanhas, fluxos ou relatórios.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Nome da lista" />
              <Textarea rows={3} placeholder="Descrição" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={requireSubscription}>
                  <Plus className="w-4 h-4 mr-2" />Salvar lista
                </Button>
                <Button variant="outline" onClick={requireSubscription}>
                  Importar lista existente
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operações rápidas</CardTitle>
              <CardDescription>{bulkLabel}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={requireSubscription}>
                Adicionar selecionados a uma lista
              </Button>
              <Button variant="outline" onClick={requireSubscription}>
                Remover de lista
              </Button>
              <Button variant="ghost" onClick={() => setSelectedContacts([])}>
                Limpar seleção
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Listas de contatos</CardTitle>
            <CardDescription>Visão geral das listas com total de contatos e última atualização.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {contactLists.map((list) => (
              <article key={list.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{list.nome}</p>
                    <p className="text-xs text-muted-foreground">{list.descricao}</p>
                  </div>
                  <Badge variant="secondary">{list.contatos}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Atualizada em {list.atualizadaEm}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={requireSubscription}>
                    <Pencil className="w-3 h-3 mr-1" />Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="flex-1" onClick={requireSubscription}>
                    <Trash2 className="w-3 h-3 mr-1" />Excluir
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Todos os contatos</CardTitle>
              <CardDescription>Filtre por listas, etiquetas ou status e aplique ações em massa.</CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="col-span-2">
                <div className="relative">
                  <Filter className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por nome, e-mail ou telefone"
                    className="pl-9"
                  />
                </div>
              </div>
              <select
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="all">Todas as listas</option>
                {contactLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.nome}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="all">Todas as etiquetas</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                <option value="all">Todos os status</option>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={(checked) => toggleAllContacts(Boolean(checked))}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Etiquetas</TableHead>
                  <TableHead>Listas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedContacts.includes(contact.id)}
                        onCheckedChange={() => toggleContactSelection(contact.id)}
                        aria-label={`Selecionar ${contact.nome}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{contact.nome}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> {contact.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        {contact.telefone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((tag) => (
                          <Badge key={`${contact.id}-${tag}`} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {contact.listas.map((listId) => {
                          const list = contactLists.find((item) => item.id === listId);
                          return (
                            <Badge key={`${contact.id}-${listId}`} variant="outline">
                              {list?.nome ?? listId}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          contact.status === "ativo"
                            ? "bg-emerald-100 text-emerald-700"
                            : contact.status === "inativo"
                            ? "bg-gray-200 text-gray-700"
                            : "bg-amber-100 text-amber-700"
                        }
                      >
                        {statusOptions.find((status) => status.value === contact.status)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>Criado: {contact.criadoEm}</p>
                        <p>Atualizado: {contact.atualizadoEm}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={requireSubscription}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={requireSubscription}>
                          Atribuir Lista
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredContacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum contato encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
    </PremiumBlocked>
  );
}
