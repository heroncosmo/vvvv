import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiRequest } from '@/lib/queryClient';
import { AlertCircle, FileUp, Loader2 } from 'lucide-react';

export interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface ContactImportModalProps {
  open: boolean;
  onClose: () => void;
  destination: 'mass-send' | 'contact-list';
  onSuccess: (contacts?: Contact[]) => void;
}

interface PreviewData {
  headers: string[];
  preview: string[][];
  suggestedMapping: {
    nameColumn: number | null;
    phoneColumn: number | null;
  };
  totalRows: number;
}

interface ImportResult {
  contacts: Contact[];
  skipped: number;
  total: number;
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  '',
]);

function isSupportedImportFile(file: File) {
  const fileName = file.name.toLowerCase();
  return (
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.csv') ||
    SUPPORTED_MIME_TYPES.has(file.type)
  );
}

function guessMimeType(file: File) {
  if (file.type) {
    return file.type;
  }

  return file.name.toLowerCase().endsWith('.csv')
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function ContactImportModal({
  open,
  onClose,
  destination,
  onSuccess,
}: ContactImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileData, setFileData] = useState('');
  const [mimetype, setMimetype] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [phoneColumn, setPhoneColumn] = useState<number | null>(null);
  const [listName, setListName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setStep(1);
    setFileData('');
    setMimetype('');
    setFileName('');
    setPreviewData(null);
    setNameColumn(null);
    setPhoneColumn(null);
    setListName('');
    setResult(null);
    setLoading(false);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Arquivo deve ser menor que 5MB');
      return;
    }

    if (!isSupportedImportFile(file)) {
      setError('Tipo de arquivo não suportado. Use .xlsx, .xls ou .csv');
      return;
    }

    setLoading(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string)?.split(',')[1] || '');
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
      });

      setFileData(base64);
      setFileName(file.name);
      setMimetype(guessMimeType(file));

      const formData = new FormData();
      formData.append('file', file);

      const response = await apiRequest('POST', '/api/contacts/import-preview', formData);
      const preview = (await response.json()) as PreviewData;

      setPreviewData(preview);
      setNameColumn(preview.suggestedMapping.nameColumn);
      setPhoneColumn(preview.suggestedMapping.phoneColumn);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMapping = async () => {
    setError(null);

    if (nameColumn === null || phoneColumn === null) {
      setError('Selecione as colunas de nome e telefone');
      return;
    }

    if (destination === 'contact-list' && !listName.trim()) {
      setError('Nome da lista é obrigatório');
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest('POST', '/api/contacts/import-confirm', {
        fileData,
        mimetype,
        fileName,
        mapping: { nameColumn, phoneColumn },
        destination,
        listName: destination === 'contact-list' ? listName.trim() : undefined,
      });

      const data = (await response.json()) as ImportResult;
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar importação');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    if (destination === 'mass-send') {
      onSuccess(result?.contacts || []);
    } else {
      onSuccess(result?.contacts || []);
    }

    handleClose();
  };

  const renderUploadStep = () => (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add('bg-gray-100');
      }}
      onDragLeave={(e) => {
        e.currentTarget.classList.remove('bg-gray-100');
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-gray-100');
        const droppedFile = e.dataTransfer.files?.[0];
        if (!droppedFile) return;

        const syntheticEvent = {
          target: { files: [droppedFile] },
        } as unknown as React.ChangeEvent<HTMLInputElement>;

        void handleFileSelect(syntheticEvent);
      }}
    >
      <FileUp className="w-8 h-8 mx-auto mb-3 text-gray-400" />
      <p className="text-sm font-medium text-gray-700">Clique ou arraste um arquivo aqui</p>
      <p className="text-xs text-gray-500 mt-1">Suportamos .xlsx, .xls e .csv até 5MB</p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        disabled={loading}
        onChange={(event) => {
          void handleFileSelect(event);
        }}
      />
    </div>
  );

  const renderMappingStep = () => {
    if (!previewData) return null;

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Arquivo: <strong>{fileName}</strong> - {previewData.totalRows} linhas detectadas
        </div>

        {destination === 'contact-list' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome da nova lista</label>
            <Input
              placeholder="Ex.: Leads Março"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              disabled={loading}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Coluna de Nome</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={nameColumn !== null ? String(nameColumn) : ''}
              onChange={(event) => setNameColumn(event.target.value ? Number(event.target.value) : null)}
              disabled={loading}
            >
              <option value="" disabled>Selecione a coluna</option>
              {previewData.headers.map((header, index) => (
                <option key={`name-${index}`} value={String(index)}>
                  {header || `Coluna ${index + 1}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Coluna de Telefone</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={phoneColumn !== null ? String(phoneColumn) : ''}
              onChange={(event) => setPhoneColumn(event.target.value ? Number(event.target.value) : null)}
              disabled={loading}
            >
              <option value="" disabled>Selecione a coluna</option>
              {previewData.headers.map((header, index) => (
                <option key={`phone-${index}`} value={String(index)}>
                  {header || `Coluna ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {previewData.headers.map((header, index) => (
                  <TableCell key={`header-${index}`} className="font-medium">
                    {header || `Coluna ${index + 1}`}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewData.preview.slice(0, 5).map((row, rowIndex) => (
                <TableRow key={`row-${rowIndex}`}>
                  {previewData.headers.map((_, colIndex) => (
                    <TableCell key={`cell-${rowIndex}-${colIndex}`}>
                      {row[colIndex] || '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderSummaryStep = () => (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4">
        <p className="text-sm">
          <strong>{result?.contacts.length || 0}</strong> contatos válidos encontrados.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {result?.skipped || 0} linhas foram ignoradas por dados inválidos.
        </p>
      </div>

      {result?.contacts?.length ? (
        <div className="border rounded-lg overflow-hidden max-h-[260px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell className="font-medium">Nome</TableCell>
                <TableCell className="font-medium">Telefone</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.contacts.slice(0, 10).map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>{contact.name}</TableCell>
                  <TableCell>{contact.phone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="z-[80] max-h-[calc(100dvh-1rem)] w-[95vw] max-w-2xl overflow-y-auto bg-white p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Importar Contatos</DialogTitle>
          <DialogDescription>
            {step === 1 && 'Selecione um arquivo .xlsx, .xls ou .csv com os contatos'}
            {step === 2 && 'Mapeie as colunas do arquivo com os dados esperados'}
            {step === 3 && 'Resumo da importação'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === 1 && renderUploadStep()}
          {step === 2 && renderMappingStep()}
          {step === 3 && renderSummaryStep()}
        </div>

        <DialogFooter>
          {step === 1 && (
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Fechar
            </Button>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Voltar
              </Button>
              <Button onClick={() => void handleConfirmMapping()} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirmar Mapeamento
              </Button>
            </>
          )}

          {step === 3 && (
            <Button onClick={handleComplete}>
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
