import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ContactImportModal } from "@/components/contact-import-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Trash2,
  Search,
  Eye,
  BookUser,
  Users,
  Edit,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Phone,
  UserPlus,
  RefreshCw,
  X,
  Check,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface ContactList {
  id: string;
  name: string;
  description: string;
  contacts: Contact[];
  contactCount?: number;
  createdAt: string;
}

export default function ContactListsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Estados
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showAddContactsDialog, setShowAddContactsDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);

  // Form states
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [manualContacts, setManualContacts] = useState("");
  const [addContactsMode, setAddContactsMode] = useState<'manual' | 'synced'>('manual');
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [contactSearchTerm, setContactSearchTerm] = useState("");

  // Buscar listas de contatos
  const { data: rawContactLists = [], isLoading, refetch } = useQuery<ContactList[]>({
    queryKey: ["/api/contacts/lists"],
  });
  const contactLists = Array.isArray(rawContactLists) ? rawContactLists : [];

  // Buscar contatos sincronizados da agenda
  const { data: agendaData } = useQuery<{
    status: string;
    contacts: Contact[];
    total: number;
  }>({
    queryKey: ["/api/contacts/agenda-live"],
  });

  const syncedContacts = agendaData?.status === 'ready' ? agendaData.contacts : [];

  // Mutation para criar lista
  const createListMutation = useMutation({
    mutationFn: async ({ name, description, contacts }: { name: string; description: string; contacts?: Contact[] }) => {
      const response = await apiRequest("POST", "/api/contacts/lists", { name, description, contacts });
      return response.json();
    },
    onSuccess: () => {
      setShowCreateDialog(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({ title: "Lista criada com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar lista", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para atualizar lista
  const updateListMutation = useMutation({
    mutationFn: async ({ listId, name, description }: { listId: string; name: string; description: string }) => {
      const response = await apiRequest("PUT", `/api/contacts/lists/${listId}`, { name, description });
      return response.json();
    },
    onSuccess: () => {
      setShowEditDialog(false);
      setSelectedList(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({ title: "Lista atualizada!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para excluir lista
  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const response = await apiRequest("DELETE", `/api/contacts/lists/${listId}`);
      return response.json();
    },
    onSuccess: () => {
      setShowDeleteDialog(false);
      setShowDetailsDialog(false);
      setSelectedList(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({ title: "Lista excluída!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para adicionar contatos
  const addContactsMutation = useMutation({
    mutationFn: async ({ listId, contacts }: { listId: string; contacts: Contact[] }) => {
      const response = await apiRequest("POST", `/api/contacts/lists/${listId}/contacts`, { contacts });
      return response.json();
    },
    onSuccess: (data) => {
      setShowAddContactsDialog(false);
      setManualContacts("");
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({
        title: "Contatos adicionados!",
        description: `${data.addedCount || 0} novos contatos foram adicionados.`
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para remover contato
  const removeContactMutation = useMutation({
    mutationFn: async ({ listId, phone }: { listId: string; phone: string }) => {
      const response = await apiRequest("DELETE", `/api/contacts/lists/${listId}/contacts/${encodeURIComponent(phone)}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
      toast({ title: "Contato removido!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    },
  });

  // Reset form
  const resetForm = () => {
    setNewListName("");
    setNewListDescription("");
    setManualContacts("");
    setAddContactsMode('manual');
  };

  // Parsear contatos do textarea
  const parseManualContacts = (text: string): Contact[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const contacts: Contact[] = [];

    for (const line of lines) {
      const parts = line.split(/[,;\t]/).map(p => p.trim());

      if (parts.length >= 2) {
        const name = parts[0];
        const phone = parts[1].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ id: `contact_${Date.now()}_${contacts.length}`, name, phone });
        }
      } else if (parts.length === 1) {
        const phone = parts[0].replace(/\D/g, '');
        if (phone.length >= 10 && phone.length <= 15) {
          contacts.push({ id: `contact_${Date.now()}_${contacts.length}`, name: '', phone });
        }
      }
    }

    return contacts;
  };

  // Formatar telefone
  const formatPhone = (phone: string): string => {
    const clean = phone?.replace(/\D/g, '') || '';
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    } else if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return phone || '';
  };

  // Filtrar listas
  const filteredLists = useMemo(() => {
    if (!searchTerm) return contactLists;
    const term = searchTerm.toLowerCase();
    return contactLists.filter(l =>
      l.name?.toLowerCase().includes(term) ||
      l.description?.toLowerCase().includes(term)
    );
  }, [contactLists, searchTerm]);

  // Paginação
  const totalPages = Math.ceil(filteredLists.length / itemsPerPage);
  const paginatedLists = filteredLists.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Filtrar contatos na visualização
  const filteredListContacts = useMemo(() => {
    if (!selectedList?.contacts || !contactSearchTerm) return selectedList?.contacts || [];
    const term = contactSearchTerm.toLowerCase();
    return selectedList.contacts.filter(c =>
      c.name?.toLowerCase().includes(term) ||
      c.phone?.includes(contactSearchTerm)
    );
  }, [selectedList?.contacts, contactSearchTerm]);

  // Handler para abrir diálogo de edição
  const handleOpenEdit = (list: ContactList) => {
    setSelectedList(list);
    setEditName(list.name);
    setEditDescription(list.description || "");
    setShowEditDialog(true);
  };

  // Handler para abrir detalhes
  const handleOpenDetails = (list: ContactList) => {
    setSelectedList(list);
    setContactSearchTerm("");
    setShowDetailsDialog(true);
  };

  // Handler para abrir adicionar contatos
  const handleOpenAddContacts = (list: ContactList) => {
    setSelectedList(list);
    setManualContacts("");
    setAddContactsMode('manual');
    setShowAddContactsDialog(true);
  };

  // Handler para confirmar exclusão
  const handleDeleteList = (list: ContactList) => {
    setSelectedList(list);
    setShowDeleteDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header Minimalista */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <BookUser className="w-5 h-5 text-primary" />
                Listas de Contatos
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Organize contatos para envios em massa
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-1.5" />
                Nova Lista
              </Button>
              <Button onClick={() => setShowImportModal(true)} variant="outline" size="sm" className="w-full sm:w-auto">
                <Upload className="w-4 h-4 mr-1.5" />
                Importar Planilha
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-28 md:pb-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <BookUser className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{contactLists.length}</p>
                  <p className="text-xs text-blue-700">Listas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-900">
                    {contactLists.reduce((sum, l) => sum + (l.contactCount || l.contacts?.length || 0), 0)}
                  </p>
                  <p className="text-xs text-green-700">Contatos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <Phone className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-900">{syncedContacts.length}</p>
                  <p className="text-xs text-purple-700">Sincronizados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar listas..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="pl-9 h-9"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista de Listas */}
        {contactLists.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <BookUser className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-medium mb-1">Nenhuma lista criada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie sua primeira lista para organizar contatos
              </p>
              <Button onClick={() => setShowCreateDialog(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Criar Lista
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {paginatedLists.map((list) => (
              <Card
                key={list.id}
                className="hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => handleOpenDetails(list)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BookUser className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium truncate">{list.name}</h4>
                        <p className="text-xs text-muted-foreground truncate">
                          {list.description || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">
                        {list.contactCount || list.contacts?.length || 0} contatos
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDetails(list); }}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver Contatos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenAddContacts(list); }}>
                            <UserPlus className="w-4 h-4 mr-2" />
                            Adicionar Contatos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenEdit(list); }}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar Lista
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleDeleteList(list); }}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir Lista
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialog: Criar Lista */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="z-[80] max-h-[calc(100dvh-1rem)] w-[95vw] max-w-lg overflow-y-auto bg-white p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Nova Lista</DialogTitle>
            <DialogDescription>
              Crie uma lista de contatos para envio em massa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Importar planilha</p>
                  <p className="text-xs text-muted-foreground">
                    Crie a lista já com contatos de um arquivo .xlsx, .xls ou .csv.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetForm();
                  setShowImportModal(true);
                }}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Importar
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome *</Label>
                <Input
                  placeholder="Ex: Clientes VIP"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Input
                  placeholder="Opcional"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <Tabs value={addContactsMode} onValueChange={(v) => setAddContactsMode(v as 'manual' | 'synced')}>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 sm:grid-cols-2">
                <TabsTrigger value="manual" className="flex-1 text-xs">
                  Digitar Contatos
                </TabsTrigger>
                <TabsTrigger value="synced" className="flex-1 text-xs">
                  Da Agenda ({syncedContacts.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="mt-3 space-y-2">
                <Textarea
                  placeholder={`Nome, Telefone (um por linha)\n\nExemplo:\nJoão Silva, 11987654321\nMaria, 21999887766\n11912345678`}
                  value={manualContacts}
                  onChange={(e) => setManualContacts(e.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {parseManualContacts(manualContacts).length} contatos identificados
                </p>
              </TabsContent>

              <TabsContent value="synced" className="mt-3">
                {syncedContacts.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum contato sincronizado</p>
                    <p className="text-xs">Sincronize a agenda primeiro</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[140px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {syncedContacts.slice(0, 100).map((contact, idx) => (
                        <div key={contact.id || idx} className="flex items-center justify-between py-1.5 px-2 hover:bg-muted rounded text-sm">
                          <span className="truncate">{contact.name || 'Sem nome'}</span>
                          <span className="text-xs text-muted-foreground">{formatPhone(contact.phone)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const contacts = addContactsMode === 'manual'
                  ? parseManualContacts(manualContacts)
                  : syncedContacts.map(c => ({ id: c.id || `c_${Date.now()}`, name: c.name || '', phone: c.phone }));
                createListMutation.mutate({
                  name: newListName,
                  description: newListDescription,
                  contacts
                });
              }}
              disabled={!newListName.trim() || createListMutation.isPending}
            >
              {createListMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Detalhes da Lista */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {selectedList?.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedList?.description || 'Sem descrição'}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <Button variant="ghost" size="sm" onClick={() => selectedList && handleOpenAddContacts(selectedList)}>
                  <UserPlus className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => selectedList && handleOpenEdit(selectedList)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => selectedList && handleDeleteList(selectedList)} className="text-red-600 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {selectedList && (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={contactSearchTerm}
                    onChange={(e) => setContactSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Badge variant="outline" className="w-fit">
                  {filteredListContacts.length} contatos
                </Badge>
              </div>

              <ScrollArea className="h-[350px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredListContacts.map((contact, idx) => (
                      <TableRow key={contact.id || idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatPhone(contact.phone)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              removeContactMutation.mutate({ listId: selectedList.id, phone: contact.phone });
                              // Atualizar localmente
                              setSelectedList(prev => prev ? {
                                ...prev,
                                contacts: prev.contacts.filter(c => c.phone !== contact.phone)
                              } : null);
                            }}
                            disabled={removeContactMutation.isPending}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredListContacts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          {selectedList.contacts?.length === 0
                            ? "Nenhum contato na lista"
                            : "Nenhum contato encontrado"
                          }
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDetailsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar Contatos */}
      <Dialog open={showAddContactsDialog} onOpenChange={setShowAddContactsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Contatos</DialogTitle>
            <DialogDescription>
              Adicione contatos à lista "{selectedList?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={`Nome, Telefone (um por linha)\n\nExemplo:\nJoão Silva, 11987654321\n21999887766`}
              value={manualContacts}
              onChange={(e) => setManualContacts(e.target.value)}
              className="min-h-[150px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {parseManualContacts(manualContacts).length} contatos identificados
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShowAddContactsDialog(false); setManualContacts(''); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const contacts = parseManualContacts(manualContacts);
                if (selectedList && contacts.length > 0) {
                  addContactsMutation.mutate({ listId: selectedList.id, contacts });
                }
              }}
              disabled={parseManualContacts(manualContacts).length === 0 || addContactsMutation.isPending}
            >
              {addContactsMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Lista */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lista</DialogTitle>
            <DialogDescription>
              Altere o nome ou descrição da lista
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input
                placeholder="Nome da lista"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Textarea
                placeholder="Descrição (opcional)"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedList) {
                  updateListMutation.mutate({
                    listId: selectedList.id,
                    name: editName,
                    description: editDescription
                  });
                }
              }}
              disabled={!editName.trim() || updateListMutation.isPending}
            >
              {updateListMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert: Confirmar Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir a lista "{selectedList?.name}" com{' '}
              {selectedList?.contactCount || selectedList?.contacts?.length || 0} contatos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedList && deleteListMutation.mutate(selectedList.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteListMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContactImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        destination="contact-list"
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts/lists"] });
          toast({ title: "Lista importada com sucesso!" });
          setShowImportModal(false);
        }}
      />
    </div>
  );
}
