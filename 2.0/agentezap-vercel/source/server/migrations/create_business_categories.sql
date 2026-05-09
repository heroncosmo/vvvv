-- ============================================================
-- ETAPA 3: business_categories table
-- Mapeamento de tipos de negócio → macrocategoria → ferramenta
-- Dados semeados a partir da análise real do banco (26/02/2026)
-- 316 usuários analisados, 14 categorias identificadas
-- ============================================================

CREATE TABLE IF NOT EXISTS business_categories (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              VARCHAR(100) NOT NULL UNIQUE,          -- ex: "lanchonete", "barbearia"
  name              VARCHAR(200) NOT NULL,                  -- ex: "Lanchonete", "Barbearia"
  category_group    VARCHAR(50)  NOT NULL,                  -- ex: "delivery", "beleza", "saude"
  group_label       VARCHAR(100) NOT NULL,                  -- ex: "Delivery / Alimentação"
  icon              VARCHAR(10)  NOT NULL DEFAULT '💬',    -- emoji
  description       TEXT,                                   -- usado em SEO e tooltip
  target_tool       VARCHAR(50)  NOT NULL DEFAULT 'generic',-- "delivery", "agendamento", "vendas", "generic"
  welcome_message   TEXT,                                   -- mensagem pré-preenchida no QR Code
  color             VARCHAR(20)  NOT NULL DEFAULT '#2c3e50',-- cor do tema (hex)
  user_count        INTEGER      NOT NULL DEFAULT 0,        -- qtd de usuários reais identificados
  sort_order        INTEGER      NOT NULL DEFAULT 99,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_categories_group    ON business_categories(category_group);
CREATE INDEX IF NOT EXISTS idx_business_categories_tool     ON business_categories(target_tool);
CREATE INDEX IF NOT EXISTS idx_business_categories_active   ON business_categories(is_active, sort_order);

-- ============================================================
-- SEED: Categorias identificadas na análise do banco
-- Source: RELATORIO_TIPOS_NEGOCIO_CLIENTES.md (26/02/2026)
-- ============================================================

INSERT INTO business_categories
  (slug, name, category_group, group_label, icon, description, target_tool, welcome_message, color, user_count, sort_order)
VALUES

-- ── DELIVERY / ALIMENTAÇÃO (70 usuários – 22.4%) ─────────────────────────────
('lanchonete',    'Lanchonete / Fast Food',    'delivery', 'Delivery / Alimentação', '🍔',
 'Lanchonetes, hamburguerias e fast food que recebem pedidos via WhatsApp',
 'delivery',
 'Olá! Quero fazer um pedido 🍔',
 '#e65c00', 12, 10),

('pizzaria',      'Pizzaria',                   'delivery', 'Delivery / Alimentação', '🍕',
 'Pizzarias que recebem pedidos e agendamentos via WhatsApp',
 'delivery',
 'Olá! Quero ver o cardápio de pizzas 🍕',
 '#c0392b', 8, 11),

('restaurante',   'Restaurante',                'delivery', 'Delivery / Alimentação', '🍽️',
 'Restaurantes com atendimento e delivery pelo WhatsApp',
 'delivery',
 'Olá! Quero fazer um pedido 🍽️',
 '#27ae60', 7, 12),

('hamburgueria',  'Hamburgueria',               'delivery', 'Delivery / Alimentação', '🍔',
 'Hamburguerias artesanais e smash burgers',
 'delivery',
 'Olá! Quero ver o cardápio de burgers 🍔',
 '#d35400', 5, 13),

('marmitaria',    'Marmitaria / Quentinha',     'delivery', 'Delivery / Alimentação', '🥡',
 'Marmitarias e quentinhas com entrega por WhatsApp',
 'delivery',
 'Olá! Quero pedir uma marmita 🥡',
 '#16a085', 6, 14),

('acai_sorveteria','Açaí / Sorveteria',         'delivery', 'Delivery / Alimentação', '🍧',
 'Lojas de açaí, sorveterias e gelaterias',
 'delivery',
 'Olá! Quero fazer um pedido 🍧',
 '#8e44ad', 5, 15),

('confeitaria',   'Confeitaria / Bolos',        'delivery', 'Delivery / Alimentação', '🎂',
 'Confeitarias, bolos artesanais e doces finos',
 'delivery',
 'Olá! Gostaria de informações sobre bolos e doces 🎂',
 '#e91e8c', 4, 16),

('salgaderia',    'Salgaderia / Doceria',       'delivery', 'Delivery / Alimentação', '🥐',
 'Salgaderias, doceiras e serviços de encomenda',
 'delivery',
 'Olá! Quero fazer uma encomenda 🥐',
 '#f39c12', 4, 17),

('delivery_outros','Outros Delivery',           'delivery', 'Delivery / Alimentação', '🛵',
 'Outros segmentos de entrega de alimentos e bebidas',
 'delivery',
 'Olá! Quero fazer um pedido 🛵',
 '#7f8c8d', 19, 18),

-- ── BELEZA / ESTÉTICA (81 usuários – 25.6% – MAIOR CATEGORIA) ────────────────
('salao_beleza',  'Salão de Beleza',            'beleza', 'Beleza / Estética', '💇',
 'Salões de beleza, cortes, coloração e tratamentos capilares',
 'agendamento',
 'Olá! Gostaria de agendar um horário 💇',
 '#e91e8c', 18, 20),

('barbearia',     'Barbearia',                  'beleza', 'Beleza / Estética', '✂️',
 'Barbearias com serviços de corte, barba e sobrancelha masculina',
 'agendamento',
 'Olá! Quero agendar um corte ✂️',
 '#2c3e50', 12, 21),

('estetica',      'Clínica de Estética',        'beleza', 'Beleza / Estética', '💆',
 'Clínicas de estética, procedimentos corporais e faciais',
 'agendamento',
 'Olá! Gostaria de informações sobre os procedimentos 💆',
 '#9b59b6', 15, 22),

('sobrancelhas',  'Sobrancelhas / Micropigmentação', 'beleza', 'Beleza / Estética', '👁️',
 'Estúdios de design de sobrancelhas, micropigmentação e PMU',
 'agendamento',
 'Olá! Quero agendar um procedimento de sobrancelhas 👁️',
 '#8e44ad', 10, 23),

('manicure',      'Manicure / Nail Designer',   'beleza', 'Beleza / Estética', '💅',
 'Manicures, pedicures e nail designers',
 'agendamento',
 'Olá! Quero agendar manicure/pedicure 💅',
 '#e74c3c', 8, 24),

('cilios_lash',   'Extensão de Cílios / Lash',  'beleza', 'Beleza / Estética', '👁️',
 'Extensão de cílios, lash lifting e designer',
 'agendamento',
 'Olá! Quero agendar extensão de cílios 👁️',
 '#c0392b', 6, 25),

('depilacao',     'Depilação',                  'beleza', 'Beleza / Estética', '✨',
 'Serviços de depilação a laser, cera e outros',
 'agendamento',
 'Olá! Quero agendar uma depilação ✨',
 '#e67e22', 5, 26),

('spa',           'Spa / Terapias',             'beleza', 'Beleza / Estética', '🧖',
 'Spas, massagens e terapias de relaxamento',
 'agendamento',
 'Olá! Quero agendar uma sessão de spa 🧖',
 '#1abc9c', 7, 27),

-- ── SAÚDE (56 usuários – 17.9%) ───────────────────────────────────────────────
('clinica_medica', 'Clínica Médica',            'saude', 'Saúde', '🏥',
 'Clínicas médicas, consultórios e especialidades médicas',
 'agendamento',
 'Olá! Gostaria de agendar uma consulta 🏥',
 '#2980b9', 15, 30),

('dentista',      'Dentista / Odontologia',     'saude', 'Saúde', '🦷',
 'Dentistas, clínicas odontológicas e ortodontia',
 'agendamento',
 'Olá! Gostaria de agendar uma consulta odontológica 🦷',
 '#1abc9c', 10, 31),

('fisioterapia',  'Fisioterapia / Pilates',     'saude', 'Saúde', '🏃',
 'Clínicas de fisioterapia, pilates e reabilitação',
 'agendamento',
 'Olá! Quero agendar uma sessão de fisioterapia 🏃',
 '#27ae60', 8, 32),

('psicologia',    'Psicólogo / Terapeuta',      'saude', 'Saúde', '🧠',
 'Psicólogos, psicoterapeutas e terapias alternativas',
 'agendamento',
 'Olá! Gostaria de agendar uma consulta 🧠',
 '#8e44ad', 7, 33),

('nutricionista', 'Nutricionista',              'saude', 'Saúde', '🥗',
 'Nutricionistas e acompanhamento nutricional',
 'agendamento',
 'Olá! Gostaria de agendar uma consulta com nutricionista 🥗',
 '#2ecc71', 5, 34),

('veterinario',   'Veterinário / Pet Care',     'saude', 'Saúde', '🐾',
 'Veterinários, clínicas veterinárias e petshops com serviços',
 'agendamento',
 'Olá! Quero agendar uma consulta para meu pet 🐾',
 '#f39c12', 6, 35),

('saude_outros',  'Outros Serviços de Saúde',   'saude', 'Saúde', '💊',
 'Outros profissionais e clínicas de saúde',
 'agendamento',
 'Olá! Gostaria de agendar um atendimento 💊',
 '#3498db', 5, 36),

-- ── EDUCAÇÃO / FITNESS (29 usuários – 9.2%) ──────────────────────────────────
('academia',      'Academia / Fitness',         'educacao', 'Educação / Fitness', '🏋️',
 'Academias de musculação, crossfit e fitness em geral',
 'agendamento',
 'Olá! Quero informações sobre planos e horários 🏋️',
 '#e74c3c', 8, 40),

('artes_marciais','Artes Marciais / Luta',      'educacao', 'Educação / Fitness', '🥊',
 'Academias de BJJ, jiu-jitsu, kung fu e outras lutas',
 'agendamento',
 'Olá! Quero informações sobre aulas e horários 🥊',
 '#c0392b', 6, 41),

('personal',      'Personal Trainer',           'educacao', 'Educação / Fitness', '💪',
 'Personal trainers e treinos personalizados',
 'agendamento',
 'Olá! Quero informações sobre treinos personalizados 💪',
 '#e67e22', 4, 42),

('escola_cursos', 'Escola / Cursos',            'educacao', 'Educação / Fitness', '📚',
 'Escolas, cursos presenciais e online',
 'agendamento',
 'Olá! Quero informações sobre cursos e matrículas 📚',
 '#2980b9', 7, 43),

('idiomas',       'Escola de Idiomas',          'educacao', 'Educação / Fitness', '🌎',
 'Cursos de inglês e outros idiomas',
 'agendamento',
 'Olá! Quero informações sobre as aulas de idiomas 🌎',
 '#1abc9c', 4, 44),

-- ── VAREJO / LOJA (13 usuários – 4.1%) ───────────────────────────────────────
('loja_roupas',   'Loja de Roupas / Moda',      'varejo', 'Varejo / Loja', '👗',
 'Lojas de roupas, calçados e moda em geral',
 'vendas',
 'Olá! Quero ver os produtos disponíveis 👗',
 '#e74c3c', 5, 50),

('loja_geral',    'Loja / Varejo Geral',        'varejo', 'Varejo / Loja', '🛍️',
 'Lojas de produtos diversos, eletrônicos, presentes e acessórios',
 'vendas',
 'Olá! Quero ver os produtos disponíveis 🛍️',
 '#9b59b6', 8, 51),

-- ── TECNOLOGIA / TI (9 usuários – 2.8%) ──────────────────────────────────────
('assistencia_tecnica','Assistência Técnica',   'tecnologia', 'Tecnologia / TI', '🔧',
 'Assistências técnicas de celulares, computadores e eletrônicos',
 'agendamento',
 'Olá! Preciso de um orçamento técnico 🔧',
 '#2980b9', 5, 60),

('empresa_ti',    'Empresa de TI / Software',   'tecnologia', 'Tecnologia / TI', '💻',
 'Empresas de tecnologia, software e marketing digital',
 'generic',
 'Olá! Gostaria de informações sobre os serviços de TI 💻',
 '#34495e', 4, 61),

-- ── IMOBILIÁRIO (8 usuários – 2.5%) ─────────────────────────────────────────
('imobiliaria',   'Imobiliária / Corretor',     'imobiliario', 'Imobiliário', '🏠',
 'Imobiliárias e corretores de imóveis (venda e locação)',
 'generic',
 'Olá! Tenho interesse em imóveis 🏠',
 '#27ae60', 8, 70),

-- ── FINANCEIRO / SEGUROS (7 usuários – 2.2%) ─────────────────────────────────
('contabilidade', 'Contabilidade / Financeiro', 'financeiro', 'Financeiro / Seguros', '💼',
 'Escritórios contábeis, financeiras e seguradoras',
 'generic',
 'Olá! Gostaria de informações sobre os serviços 💼',
 '#f39c12', 7, 80),

-- ── AUTOMOTIVO (6 usuários – 1.9%) ───────────────────────────────────────────
('oficina',       'Oficina Mecânica',           'automotivo', 'Automotivo', '🔧',
 'Oficinas mecânicas, elétricas e funilarias',
 'agendamento',
 'Olá! Preciso de um orçamento mecânico 🔧',
 '#2c3e50', 4, 90),

('automovel_outros','Serviços Automotivos',     'automotivo', 'Automotivo', '🚗',
 'Lava-rápido, acessórios automotivos e rastreamento veicular',
 'agendamento',
 'Olá! Quero informações sobre os serviços automotivos 🚗',
 '#7f8c8d', 2, 91),

-- ── EVENTOS (3 usuários – 0.9%) ──────────────────────────────────────────────
('eventos',       'Eventos / Fotografia',       'eventos', 'Eventos', '🎉',
 'Fotógrafos, organizadores de eventos e recreação infantil',
 'agendamento',
 'Olá! Gostaria de informações sobre os serviços 🎉',
 '#e74c3c', 3, 100),

-- ── SERVIÇOS GERAIS (3 usuários – 0.9%) ──────────────────────────────────────
('servicos_gerais','Serviços Gerais',           'servicos', 'Serviços Gerais', '🔨',
 'Limpeza, segurança, transporte e outros serviços gerais',
 'generic',
 'Olá! Gostaria de informações sobre os serviços 🔨',
 '#95a5a6', 3, 110),

-- ── CONSTRUÇÃO / REFORMA (1 usuário) ─────────────────────────────────────────
('construcao',    'Construção / Reforma',       'construcao', 'Construção / Reforma', '🏗️',
 'Construtoras, reformas, elétrica e hidráulica',
 'generic',
 'Olá! Preciso de um orçamento para reforma 🏗️',
 '#7f8c8d', 1, 120),

-- ── JURÍDICO (1 usuário) ─────────────────────────────────────────────────────
('juridico',      'Advocacia / Jurídico',       'juridico', 'Jurídico', '⚖️',
 'Advogados e escritórios jurídicos',
 'generic',
 'Olá! Gostaria de informações sobre os serviços jurídicos ⚖️',
 '#2c3e50', 1, 130),

-- ── GENÉRICO (fallback) ───────────────────────────────────────────────────────
('negocio_geral', 'Negócio Geral',             'geral', 'Geral', '💬',
 'Negócios não classificados nas categorias acima',
 'generic',
 'Olá! Gostaria de mais informações 💬',
 '#bdc3c7', 0, 999)

ON CONFLICT (slug) DO UPDATE SET
  name         = EXCLUDED.name,
  group_label  = EXCLUDED.group_label,
  icon         = EXCLUDED.icon,
  description  = EXCLUDED.description,
  target_tool  = EXCLUDED.target_tool,
  welcome_message = EXCLUDED.welcome_message,
  color        = EXCLUDED.color,
  user_count   = EXCLUDED.user_count,
  sort_order   = EXCLUDED.sort_order,
  updated_at   = NOW();
