import { AlertTriangle, XCircle, FileText, Mail, ExternalLink, Ban } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface SuspensionBannerProps {
  suspensionReason?: string;
  suspensionType?: string;
  refundedAt?: string;
  refundAmount?: number;
}

/**
 * Banner de Suspensão de Conta
 * Aparece no topo da página quando a conta do usuário está suspensa por violação de políticas.
 * Semelhante ao banner de suspensão do Google Ads.
 */
export function SuspensionBanner({ 
  suspensionReason, 
  suspensionType,
  refundedAt,
  refundAmount 
}: SuspensionBannerProps) {
  const getViolationTypeLabel = (type?: string) => {
    switch (type) {
      case 'religious_services':
        return 'Serviços religiosos/esotéricos';
      case 'adult_content':
        return 'Conteúdo adulto';
      case 'illegal_activities':
        return 'Atividades ilegais';
      case 'scam_fraud':
        return 'Golpes/fraudes';
      case 'hate_speech':
        return 'Discurso de ódio';
      case 'harassment':
        return 'Assédio';
      case 'copyright_violation':
        return 'Violação de direitos autorais';
      case 'spam':
        return 'Spam';
      default:
        return 'Violação de políticas';
    }
  };

  const getClauseInfo = (type?: string) => {
    switch (type) {
      case 'religious_services':
        return { section: '3.1.1', title: 'Serviços não permitidos' };
      case 'adult_content':
      case 'illegal_activities':
        return { section: '3.1.2', title: 'Conteúdo adulto e atividades proibidas' };
      case 'scam_fraud':
      case 'hate_speech':
      case 'harassment':
      case 'spam':
      case 'copyright_violation':
        return { section: '3.1.3', title: 'Práticas abusivas e violações' };
      default:
        return { section: '3', title: 'Uso proibido e restrições' };
    }
  };

  const clause = getClauseInfo(suspensionType);

  return (
    <div className="w-full border-b border-destructive/20 bg-destructive/10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-foreground font-semibold text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Conta suspensa
                </h2>
                <p className="text-sm text-muted-foreground">
                  Sua conta foi suspensa por violação dos Termos de Uso.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/termos-de-uso">
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Ver Termos de Uso
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Motivo
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {getViolationTypeLabel(suspensionType)}
              </p>
              {suspensionReason && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {suspensionReason}
                </p>
              )}
            </div>

            {refundedAt && (
              <div className="rounded-lg border bg-background p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Estorno
                </div>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {refundAmount ? `R$ ${refundAmount.toFixed(2)}` : 'Processado'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Em {new Date(refundedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}

            <div className="rounded-lg border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Cláusula
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                Seção {clause.section} — {clause.title}
              </p>
              <Link href="/termos-de-uso">
                <span className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-4 cursor-pointer">
                  Consultar contrato completo
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </Link>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              Todas as funcionalidades da conta foram desativadas, incluindo o Agente de IA e o sistema de Follow-up.
            </p>
            <p className="mt-1 text-xs">
              O AgenteZap é uma ferramenta de automação comercial. Algumas categorias de uso não são permitidas na plataforma conforme nossas diretrizes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Componente wrapper que mostra o banner de suspensão se a conta estiver suspensa
 */
export function SuspensionCheck({ 
  children, 
  isSuspended,
  suspensionData
}: { 
  children: React.ReactNode;
  isSuspended: boolean;
  suspensionData?: {
    reason?: string;
    type?: string;
    refundedAt?: string;
    refundAmount?: number;
  };
}) {
  if (!isSuspended) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SuspensionBanner 
        suspensionReason={suspensionData?.reason}
        suspensionType={suspensionData?.type}
        refundedAt={suspensionData?.refundedAt}
        refundAmount={suspensionData?.refundAmount}
      />
      
      {/* Conteúdo bloqueado com overlay */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-card rounded-xl p-8 max-w-lg text-center shadow-2xl border border-destructive/20">
            <div className="mx-auto w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <Ban className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              Acesso Bloqueado
            </h3>
            <p className="text-muted-foreground mb-4">
              Sua conta foi suspensa por violação dos Termos de Uso do AgenteZap.
              Todas as funcionalidades foram desativadas.
            </p>
            <div className="space-y-2">
              <Link href="/termos-de-uso">
                <Button className="w-full" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Consultar Termos de Uso
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Se você acredita que houve um erro, entre em contato com o suporte.
              </p>
            </div>
          </div>
        </div>
        
        {/* Conteúdo original (blur) */}
        <div className="filter blur-sm pointer-events-none opacity-30">
          {children}
        </div>
      </div>
    </div>
  );
}
