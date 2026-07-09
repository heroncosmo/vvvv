import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, TestTube, Eye, Sparkles, ShieldCheck, Brain, Palette, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
}

interface Product {
  name: string;
  description: string;
  price?: string;
  features?: string[];
}

interface BusinessInfo {
  hours?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  socials?: Record<string, string>;
}

interface FAQ {
  question: string;
  answer: string;
  category?: string;
}

interface Policy {
  type: string;
  description: string;
}

interface BusinessAgentConfig {
  // Identity
  agentName: string;
  agentRole: string;
  companyName: string;
  companyDescription?: string;
  personality?: string;
  
  // Knowledge
  productsServices?: Product[];
  businessInfo?: BusinessInfo;
  faqItems?: FAQ[];
  policies?: Policy[];
  
  // Guardrails
  allowedTopics?: string[];
  prohibitedTopics?: string[];
  allowedActions?: string[];
  prohibitedActions?: string[];
  
  // Personality
  toneOfVoice?: string;
  communicationStyle?: string;
  emojiUsage?: "nunca" | "raro" | "moderado" | "frequente";
  formalityLevel?: number;
  
  // Behavior
  maxResponseLength?: number;
  useCustomerName?: boolean;
  offerNextSteps?: boolean;
  escalateToHuman?: boolean;
  escalationKeywords?: string[];
  
  // System
  isActive: boolean;
  model?: string;
  triggerPhrases?: string[];
  templateType?: string;
}

export default function AgentConfig() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [preview, setPreview] = useState("");
  const [testResult, setTestResult] = useState("");
  
  const [config, setConfig] = useState<BusinessAgentConfig>({
    agentName: "",
    agentRole: "",
    companyName: "",
    companyDescription: "",
    personality: "",
    productsServices: [],
    businessInfo: {},
    faqItems: [],
    policies: [],
    allowedTopics: [],
    prohibitedTopics: [],
    allowedActions: [],
    prohibitedActions: [],
    toneOfVoice: "profissional e amigável",
    communicationStyle: "natural e conversacional",
    emojiUsage: "moderado",
    formalityLevel: 5,
    maxResponseLength: 500,
    useCustomerName: true,
    offerNextSteps: true,
    escalateToHuman: true,
    escalationKeywords: [],
    isActive: true,
    model: "mistral-medium-latest",
    triggerPhrases: [],
    templateType: "custom"
  });

  // Product form state
  const [newProduct, setNewProduct] = useState<Product>({ name: "", description: "", price: "", features: [] });
  const [newFeature, setNewFeature] = useState("");
  
  // FAQ form state
  const [newFAQ, setNewFAQ] = useState<FAQ>({ question: "", answer: "", category: "" });
  
  // Policy form state
  const [newPolicy, setNewPolicy] = useState<Policy>({ type: "", description: "" });
  
  // Topic/Action input states
  const [newAllowedTopic, setNewAllowedTopic] = useState("");
  const [newProhibitedTopic, setNewProhibitedTopic] = useState("");
  const [newAllowedAction, setNewAllowedAction] = useState("");
  const [newProhibitedAction, setNewProhibitedAction] = useState("");
  const [newEscalationKeyword, setNewEscalationKeyword] = useState("");
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");

  useEffect(() => {
    loadConfig();
    loadTemplates();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch("/api/agent/business-config", {
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig({ ...config, ...data.config });
        }
      }
    } catch (error) {
      console.error("Erro ao carregar config:", error);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await fetch("/api/agent/templates", {
        credentials: "include"
      });
      
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Erro ao carregar templates:", error);
    }
  };

  const applyTemplate = async (templateType: string) => {
    try {
      const template = templates.find(t => t.type === templateType);
      if (!template) return;

      // Apply template but keep user's company info
      setConfig({
        ...config,
        templateType,
        agentName: template.name || config.agentName,
        agentRole: template.description || config.agentRole,
        // Keep user's company name and description
        // Template will provide defaults for other fields
      });

      toast({
        title: "Template Aplicado",
        description: `Template "${template.name}" foi aplicado. Personalize conforme necessário.`
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao aplicar template",
        variant: "destructive"
      });
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agent/business-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config)
      });

      if (response.ok) {
        toast({
          title: "✅ Configuração Salva",
          description: "Seu agente está pronto para usar!"
        });
      } else {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar configuração",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const previewPrompt = async () => {
    setPreviewing(true);
    try {
      const response = await fetch("/api/agent/preview-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config)
      });

      if (response.ok) {
        const data = await response.json();
        setPreview(data.prompt);
        toast({
          title: "Preview Gerado",
          description: `Prompt tem ${data.length} caracteres (~${data.estimatedTokens} tokens)`
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar preview",
        variant: "destructive"
      });
    } finally {
      setPreviewing(false);
    }
  };

  const testConfig = async () => {
    setTesting(true);
    setTestResult("");
    try {
      const response = await fetch("/api/agent/test-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...config,
          testMessage: "Olá! Quero saber mais sobre seus serviços."
        })
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(data.response);
        toast({
          title: "✅ Teste Concluído",
          description: "Veja a resposta do agente abaixo"
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao testar configuração",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  // Helper functions for managing arrays
  const addProduct = () => {
    if (!newProduct.name || !newProduct.description) {
      toast({ title: "Erro", description: "Preencha nome e descrição", variant: "destructive" });
      return;
    }
    setConfig({
      ...config,
      productsServices: [...(config.productsServices || []), newProduct]
    });
    setNewProduct({ name: "", description: "", price: "", features: [] });
  };

  const removeProduct = (index: number) => {
    const updated = [...(config.productsServices || [])];
    updated.splice(index, 1);
    setConfig({ ...config, productsServices: updated });
  };

  const addFeatureToNewProduct = () => {
    if (!newFeature.trim()) return;
    setNewProduct({
      ...newProduct,
      features: [...(newProduct.features || []), newFeature.trim()]
    });
    setNewFeature("");
  };

  const addFAQ = () => {
    if (!newFAQ.question || !newFAQ.answer) {
      toast({ title: "Erro", description: "Preencha pergunta e resposta", variant: "destructive" });
      return;
    }
    setConfig({
      ...config,
      faqItems: [...(config.faqItems || []), newFAQ]
    });
    setNewFAQ({ question: "", answer: "", category: "" });
  };

  const removeFAQ = (index: number) => {
    const updated = [...(config.faqItems || [])];
    updated.splice(index, 1);
    setConfig({ ...config, faqItems: updated });
  };

  const addPolicy = () => {
    if (!newPolicy.type || !newPolicy.description) {
      toast({ title: "Erro", description: "Preencha tipo e descrição", variant: "destructive" });
      return;
    }
    setConfig({
      ...config,
      policies: [...(config.policies || []), newPolicy]
    });
    setNewPolicy({ type: "", description: "" });
  };

  const removePolicy = (index: number) => {
    const updated = [...(config.policies || [])];
    updated.splice(index, 1);
    setConfig({ ...config, policies: updated });
  };

  const addToArray = (field: keyof BusinessAgentConfig, value: string) => {
    if (!value.trim()) return;
    const current = (config[field] as string[]) || [];
    setConfig({
      ...config,
      [field]: [...current, value.trim()]
    });
  };

  const removeFromArray = (field: keyof BusinessAgentConfig, index: number) => {
    const current = [...((config[field] as string[]) || [])];
    current.splice(index, 1);
    setConfig({ ...config, [field]: current });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              Configuração do Agente IA
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure seu agente para qualquer tipo de negócio
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={previewPrompt} disabled={previewing}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview
            </Button>
            <Button variant="outline" onClick={testConfig} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              Testar
            </Button>
            <Button onClick={saveConfig} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Templates Prontos</CardTitle>
              <CardDescription>Comece rápido com um template pré-configurado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {templates.map((template) => (
                  <Button
                    key={template.id}
                    variant={config.templateType === template.type ? "default" : "outline"}
                    className="h-auto py-4 flex flex-col items-start text-left"
                    onClick={() => applyTemplate(template.type)}
                  >
                    <span className="font-semibold">{template.name}</span>
                    <span className="text-xs opacity-70 mt-1">{template.description}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="identity" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Identidade
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Conhecimento
            </TabsTrigger>
            <TabsTrigger value="guardrails" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Guardrails
            </TabsTrigger>
            <TabsTrigger value="personality" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Personalidade
            </TabsTrigger>
            <TabsTrigger value="behavior" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Comportamento
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Identity */}
          <TabsContent value="identity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Identidade do Agente</CardTitle>
                <CardDescription>Quem é seu agente e o que ele representa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agentName">Nome do Agente *</Label>
                    <Input
                      id="agentName"
                      placeholder="Ex: Luna, Dr. Silva, Coach Ana..."
                      value={config.agentName}
                      onChange={(e) => setConfig({ ...config, agentName: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="agentRole">Função/Papel *</Label>
                    <Input
                      id="agentRole"
                      placeholder="Ex: Assistente de vendas, Consultor..."
                      value={config.agentRole}
                      onChange={(e) => setConfig({ ...config, agentRole: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nome da Empresa *</Label>
                    <Input
                      id="companyName"
                      placeholder="Ex: Tech Store, Dr. Silva Odontologia..."
                      value={config.companyName}
                      onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="model">Modelo IA</Label>
                    <Select
                      value={config.model}
                      onValueChange={(value) => setConfig({ ...config, model: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mistral-small-latest">Rápido</SelectItem>
                        <SelectItem value="mistral-medium-latest">Balanceado</SelectItem>
                        <SelectItem value="mistral-large-latest">Avançado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyDescription">Descrição da Empresa</Label>
                  <Textarea
                    id="companyDescription"
                    placeholder="Descreva o que sua empresa faz, missão, valores..."
                    rows={3}
                    value={config.companyDescription || ""}
                    onChange={(e) => setConfig({ ...config, companyDescription: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="personality">Personalidade do Agente</Label>
                  <Textarea
                    id="personality"
                    placeholder="Ex: Sempre positivo e energético, paciente e empático, objetivo e direto..."
                    rows={2}
                    value={config.personality || ""}
                    onChange={(e) => setConfig({ ...config, personality: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Agente Ativo</Label>
                    <p className="text-sm text-muted-foreground">
                      Desative para usar modo legado
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={config.isActive}
                    onCheckedChange={(checked) => setConfig({ ...config, isActive: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Knowledge */}
          <TabsContent value="knowledge" className="space-y-4">
            {/* Products/Services */}
            <Card>
              <CardHeader>
                <CardTitle>Produtos e Serviços</CardTitle>
                <CardDescription>O que seu negócio oferece</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {config.productsServices?.map((product, index) => (
                    <div key={index} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                          {product.price && <p className="text-sm font-medium mt-1">R$ {product.price}</p>}
                          {product.features && product.features.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {product.features.map((feature, i) => (
                                <Badge key={i} variant="secondary">{feature}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeProduct(index)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="Nome do produto/serviço"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    />
                    <Input
                      placeholder="Preço (opcional)"
                      value={newProduct.price || ""}
                      onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    />
                  </div>
                  <Textarea
                    placeholder="Descrição"
                    rows={2}
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Adicionar característica"
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addFeatureToNewProduct()}
                    />
                    <Button type="button" onClick={addFeatureToNewProduct}>+</Button>
                  </div>
                  {newProduct.features && newProduct.features.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newProduct.features.map((feature, i) => (
                        <Badge key={i} variant="outline">{feature}</Badge>
                      ))}
                    </div>
                  )}
                  <Button onClick={addProduct} className="w-full">
                    Adicionar Produto/Serviço
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Perguntas Frequentes (FAQ)</CardTitle>
                <CardDescription>Ensine seu agente a responder dúvidas comuns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {config.faqItems?.map((faq, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {faq.category && (
                            <Badge variant="outline" className="mb-2">{faq.category}</Badge>
                          )}
                          <p className="font-semibold">P: {faq.question}</p>
                          <p className="text-sm text-muted-foreground mt-1">R: {faq.answer}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFAQ(index)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-3">
                  <Input
                    placeholder="Categoria (opcional)"
                    value={newFAQ.category || ""}
                    onChange={(e) => setNewFAQ({ ...newFAQ, category: e.target.value })}
                  />
                  <Input
                    placeholder="Pergunta"
                    value={newFAQ.question}
                    onChange={(e) => setNewFAQ({ ...newFAQ, question: e.target.value })}
                  />
                  <Textarea
                    placeholder="Resposta"
                    rows={3}
                    value={newFAQ.answer}
                    onChange={(e) => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                  />
                  <Button onClick={addFAQ} className="w-full">
                    Adicionar FAQ
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Policies */}
            <Card>
              <CardHeader>
                <CardTitle>Políticas e Regras</CardTitle>
                <CardDescription>Garantias, trocas, prazos, etc.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {config.policies?.map((policy, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Badge className="mb-2">{policy.type}</Badge>
                          <p className="text-sm">{policy.description}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePolicy(index)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-3">
                  <Input
                    placeholder="Tipo (Ex: Garantia, Troca, Entrega...)"
                    value={newPolicy.type}
                    onChange={(e) => setNewPolicy({ ...newPolicy, type: e.target.value })}
                  />
                  <Textarea
                    placeholder="Descrição da política"
                    rows={2}
                    value={newPolicy.description}
                    onChange={(e) => setNewPolicy({ ...newPolicy, description: e.target.value })}
                  />
                  <Button onClick={addPolicy} className="w-full">
                    Adicionar Política
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Guardrails */}
          <TabsContent value="guardrails" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tópicos Permitidos</CardTitle>
                <CardDescription>Sobre o que seu agente PODE falar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {config.allowedTopics?.map((topic, index) => (
                    <Badge key={index} variant="default">
                      {topic}
                      <button
                        className="ml-2 hover:text-destructive"
                        onClick={() => removeFromArray("allowedTopics", index)}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: produtos, preços, horário..."
                    value={newAllowedTopic}
                    onChange={(e) => setNewAllowedTopic(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addToArray("allowedTopics", newAllowedTopic);
                        setNewAllowedTopic("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      addToArray("allowedTopics", newAllowedTopic);
                      setNewAllowedTopic("");
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tópicos Proibidos</CardTitle>
                <CardDescription>Sobre o que seu agente NÃO DEVE falar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {config.prohibitedTopics?.map((topic, index) => (
                    <Badge key={index} variant="destructive">
                      {topic}
                      <button
                        className="ml-2 hover:opacity-70"
                        onClick={() => removeFromArray("prohibitedTopics", index)}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: política, religião, concorrentes..."
                    value={newProhibitedTopic}
                    onChange={(e) => setNewProhibitedTopic(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        addToArray("prohibitedTopics", newProhibitedTopic);
                        setNewProhibitedTopic("");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      addToArray("prohibitedTopics", newProhibitedTopic);
                      setNewProhibitedTopic("");
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ações Permitidas e Proibidas</CardTitle>
                <CardDescription>O que seu agente pode ou não fazer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label>Ações Permitidas</Label>
                  <div className="flex flex-wrap gap-2">
                    {config.allowedActions?.map((action, index) => (
                      <Badge key={index} variant="secondary">
                        {action}
                        <button
                          className="ml-2 hover:text-destructive"
                          onClick={() => removeFromArray("allowedActions", index)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: agendar consulta, enviar catálogo..."
                      value={newAllowedAction}
                      onChange={(e) => setNewAllowedAction(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          addToArray("allowedActions", newAllowedAction);
                          setNewAllowedAction("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        addToArray("allowedActions", newAllowedAction);
                        setNewAllowedAction("");
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Ações Proibidas</Label>
                  <div className="flex flex-wrap gap-2">
                    {config.prohibitedActions?.map((action, index) => (
                      <Badge key={index} variant="destructive">
                        {action}
                        <button
                          className="ml-2 hover:opacity-70"
                          onClick={() => removeFromArray("prohibitedActions", index)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: dar desconto, prometer prazo..."
                      value={newProhibitedAction}
                      onChange={(e) => setNewProhibitedAction(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          addToArray("prohibitedActions", newProhibitedAction);
                          setNewProhibitedAction("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        addToArray("prohibitedActions", newProhibitedAction);
                        setNewProhibitedAction("");
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Personality */}
          <TabsContent value="personality" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Estilo de Comunicação</CardTitle>
                <CardDescription>Como seu agente se expressa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="toneOfVoice">Tom de Voz</Label>
                  <Input
                    id="toneOfVoice"
                    placeholder="Ex: profissional e amigável, casual e descontraído..."
                    value={config.toneOfVoice || ""}
                    onChange={(e) => setConfig({ ...config, toneOfVoice: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="communicationStyle">Estilo de Comunicação</Label>
                  <Input
                    id="communicationStyle"
                    placeholder="Ex: direto ao ponto, detalhado e explicativo..."
                    value={config.communicationStyle || ""}
                    onChange={(e) => setConfig({ ...config, communicationStyle: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emojiUsage">Uso de Emojis</Label>
                  <Select
                    value={config.emojiUsage}
                    onValueChange={(value: any) => setConfig({ ...config, emojiUsage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nunca">Nunca 🚫</SelectItem>
                      <SelectItem value="raro">Raro (1-2 por mensagem) 😊</SelectItem>
                      <SelectItem value="moderado">Moderado (2-3 por mensagem) 😊✨</SelectItem>
                      <SelectItem value="frequente">Frequente (3+ por mensagem) 🎉😊✨🚀</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="formalityLevel">
                    Nível de Formalidade: {config.formalityLevel}
                  </Label>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Informal</span>
                    <input
                      type="range"
                      id="formalityLevel"
                      min="1"
                      max="10"
                      value={config.formalityLevel}
                      onChange={(e) => setConfig({ ...config, formalityLevel: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">Formal</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {config.formalityLevel <= 3 && "Bem informal (você, linguagem casual)"}
                    {config.formalityLevel > 3 && config.formalityLevel <= 7 && "Equilibrado"}
                    {config.formalityLevel > 7 && "Muito formal (senhor/senhora, linguagem técnica)"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 5: Behavior */}
          <TabsContent value="behavior" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Comportamento do Agente</CardTitle>
                <CardDescription>Como seu agente age em diferentes situações</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="maxResponseLength">Tamanho Máximo da Resposta (caracteres)</Label>
                  <Input
                    id="maxResponseLength"
                    type="number"
                    min="100"
                    max="2000"
                    value={config.maxResponseLength}
                    onChange={(e) => setConfig({ ...config, maxResponseLength: parseInt(e.target.value) })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Recomendado: 500-800 para WhatsApp
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Usar Nome do Cliente</Label>
                      <p className="text-sm text-muted-foreground">
                        Personalizar respostas com o nome
                      </p>
                    </div>
                    <Switch
                      checked={config.useCustomerName}
                      onCheckedChange={(checked) => setConfig({ ...config, useCustomerName: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Oferecer Próximos Passos</Label>
                      <p className="text-sm text-muted-foreground">
                        Sugerir ações após responder
                      </p>
                    </div>
                    <Switch
                      checked={config.offerNextSteps}
                      onCheckedChange={(checked) => setConfig({ ...config, offerNextSteps: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Escalar para Humano</Label>
                      <p className="text-sm text-muted-foreground">
                        Transferir casos complexos
                      </p>
                    </div>
                    <Switch
                      checked={config.escalateToHuman}
                      onCheckedChange={(checked) => setConfig({ ...config, escalateToHuman: checked })}
                    />
                  </div>
                </div>

                {config.escalateToHuman && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label>Palavras-chave para Escalação</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando detectar estas palavras, o agente sugere falar com humano
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {config.escalationKeywords?.map((keyword, index) => (
                          <Badge key={index} variant="outline">
                            {keyword}
                            <button
                              className="ml-2 hover:text-destructive"
                              onClick={() => removeFromArray("escalationKeywords", index)}
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: reclamação, cancelar, problema..."
                          value={newEscalationKeyword}
                          onChange={(e) => setNewEscalationKeyword(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addToArray("escalationKeywords", newEscalationKeyword);
                              setNewEscalationKeyword("");
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            addToArray("escalationKeywords", newEscalationKeyword);
                            setNewEscalationKeyword("");
                          }}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-3">
                  <Label>Frases Gatilho (opcional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativar agente apenas quando detectar estas frases
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {config.triggerPhrases?.map((phrase, index) => (
                      <Badge key={index} variant="secondary">
                        {phrase}
                        <button
                          className="ml-2 hover:text-destructive"
                          onClick={() => removeFromArray("triggerPhrases", index)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: menu, quero comprar..."
                      value={newTriggerPhrase}
                      onChange={(e) => setNewTriggerPhrase(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          addToArray("triggerPhrases", newTriggerPhrase);
                          setNewTriggerPhrase("");
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        addToArray("triggerPhrases", newTriggerPhrase);
                        setNewTriggerPhrase("");
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Test Result */}
        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado do Teste</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4">
                <p className="whitespace-pre-wrap">{testResult}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {preview && (
          <Card>
            <CardHeader>
              <CardTitle>Preview do Prompt do Sistema</CardTitle>
              <CardDescription>Este é o prompt que será enviado para a IA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono">{preview}</pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
