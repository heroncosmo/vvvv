export const TICO_LOCACOES_USER_ID = "58384f20-dc1b-416f-bc18-62ae9e812d85";

type TicoToy = {
  key: string;
  label: string;
  mediaName: string;
  mediaUrl?: string;
  mimeType?: string;
  measure: string;
  price1: string;
  price2?: string;
  price3?: string;
  keywords: string[];
};

type TicoMediaAction =
  | { type: "send_media"; media_name: string }
  | {
      type: "send_media_url";
      media_name: string;
      media_url: string;
      media_type: "image";
      mime_type?: string;
    };

export type TicoLocacoesTurn = {
  text: string;
  mediaActions: TicoMediaAction[];
  mode: "tico_locacoes_media";
  matchedKeys: string[];
};

export function isTicoLocacoesLegacyModuleEnabled(): boolean {
  return String(process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE || "").trim().toLowerCase() === "true";
}

const TICO_TOYS: TicoToy[] = [
  {
    key: "cama_elastica_p",
    label: "Cama Elastica P",
    mediaName: "CAMA_ELASTICA_P",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224119123_815576ff.jpg",
    measure: "2,30m",
    price1: "R$150",
    price2: "R$230",
    price3: "R$320",
    keywords: ["cama elastica p", "cama elastica pequena", "cama pequena", "cama elastica"],
  },
  {
    key: "cama_elastica_m",
    label: "Cama Elastica M",
    mediaName: "CAMA_ELASTICA_M",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224140411_45eb757d.jpg",
    measure: "3,00m",
    price1: "R$160",
    price2: "R$240",
    price3: "R$330",
    keywords: ["cama elastica m", "cama elastica media", "cama media"],
  },
  {
    key: "cama_elastica_g",
    label: "Cama Elastica G",
    mediaName: "CAMA_ELASTICA_G",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224156034_2b296ad8.jpg",
    measure: "3,70m",
    price1: "R$170",
    price2: "R$250",
    price3: "R$350",
    keywords: ["cama elastica g", "cama elastica grande", "cama grande"],
  },
  {
    key: "piscina_casinha",
    label: "Piscina de Bolinhas Casinha",
    mediaName: "PISCINA_DE_BOLINHAS_CASINHA",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224197410_5840c66d.jpg",
    measure: "1,50x1,50m",
    price1: "R$150",
    price2: "R$230",
    price3: "R$320",
    keywords: ["piscina bolinha casinha", "piscina de bolinhas casinha", "piscina casinha", "bolinhas casinha"],
  },
  {
    key: "piscina_inflavel",
    label: "Piscina de Bolinhas Inflavel",
    mediaName: "PISCINA_DE_BOLINHAS_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224231020_af59ba7b.jpg",
    measure: "2,50x2,50m",
    price1: "R$180",
    price2: "R$270",
    price3: "R$370",
    keywords: ["piscina bolinha inflavel", "piscina de bolinhas inflavel", "piscina inflavel"],
  },
  {
    key: "castelinho",
    label: "Castelinho Inflavel",
    mediaName: "CASTELINHO_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224283607_9d968603.jpg",
    measure: "3,20x3,20m",
    price1: "R$220",
    price2: "R$330",
    price3: "R$450",
    keywords: ["castelinho", "castelo"],
  },
  {
    key: "bob_esponja",
    label: "Bob Esponja Inflavel",
    mediaName: "BOB_ESPONJA_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224323465_c03d9363.jpg",
    measure: "2,20x5,50x3,30m",
    price1: "R$300",
    price2: "R$450",
    price3: "R$620",
    keywords: ["bob esponja", "bob"],
  },
  {
    key: "toboga",
    label: "Toboga Inflavel",
    mediaName: "TOBOGA_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224363286_88c4e77a.jpg",
    measure: "3,00x5,00x4,20m",
    price1: "R$350",
    price2: "R$520",
    price3: "R$720",
    keywords: ["toboga", "tobogao", "toboga inflavel"],
  },
  {
    key: "guerra_cotonetes",
    label: "Guerra de Cotonetes",
    mediaName: "GUERRA_DE_COTONETES_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224389424_42553133.jpg",
    measure: "5,20x5,20x1,80m",
    price1: "R$390",
    price2: "R$600",
    price3: "R$830",
    keywords: ["guerra de cotonete", "guerra de cotonetes", "cotonete", "cotonetes"],
  },
  {
    key: "futebol_sabao",
    label: "Futebol de Sabao Inflavel",
    mediaName: "FUTEBOL_DE_SABAO_INFLAVEL",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224439580_68d62208.png",
    mimeType: "image/png",
    measure: "4,00x8,00x1,80m",
    price1: "R$700",
    price2: "R$1070",
    price3: "R$1490",
    keywords: ["futebol de sabao", "futebol sabao", "futebol"],
  },
  {
    key: "aero_hockey",
    label: "Aero Hockey",
    mediaName: "AERO_HOCKEY",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224537532_96400f0d.jpg",
    measure: "jogo de mesa",
    price1: "R$170",
    price2: "R$260",
    price3: "R$360",
    keywords: ["aero hockey", "hockey"],
  },
  {
    key: "pebolim",
    label: "Pebolim",
    mediaName: "PEBOLIM",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224516198_8c76539c.jpg",
    measure: "jogo de mesa",
    price1: "R$170",
    price2: "R$260",
    price3: "R$360",
    keywords: ["pebolim"],
  },
  {
    key: "ping_pong",
    label: "Ping Pong",
    mediaName: "PING_PONG",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224492574_131a4d2f.jpg",
    measure: "jogo de mesa",
    price1: "R$170",
    price2: "R$260",
    price3: "R$360",
    keywords: ["ping pong", "ping-pong"],
  },
  {
    key: "algodao_doce",
    label: "Maquina de Algodao Doce",
    mediaName: "MAQUINA_DE_ALGODAO_DOCE",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224593334_27d98bb1.jpg",
    measure: "servico para evento",
    price1: "R$170",
    price2: "R$250",
    price3: "R$320",
    keywords: ["algodao doce", "maquina de algodao"],
  },
  {
    key: "mesas_cadeiras",
    label: "Mesas e Cadeiras",
    mediaName: "MESAS_E_CADEIRAS",
    mediaUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/whatsapp-media/system/1779224611763_509b04fa.jpg",
    measure: "conjunto",
    price1: "R$22",
    price2: "R$33",
    price3: "R$44",
    keywords: ["mesa", "mesas", "cadeira", "cadeiras"],
  },
];

const DEFAULT_OPTIONS = ["cama_elastica_p", "piscina_casinha", "castelinho"];
const OLDER_KIDS_OPTIONS = ["futebol_sabao", "guerra_cotonetes", "ping_pong"];
const FULL_CATALOG_OPTIONS = TICO_TOYS.map((toy) => toy.key);

export function isTicoLocacoesTenant(userId: string | null | undefined): boolean {
  return isTicoLocacoesLegacyModuleEnabled() && String(userId || "").trim() === TICO_LOCACOES_USER_ID;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function hasTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;

  for (let index = 0; index <= tokens.length - sequence.length; index++) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset++) {
      if (tokens[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

function includesAnyPhrase(normalizedText: string, terms: string[]): boolean {
  const tokens = normalizedText.split(" ").filter(Boolean);
  return terms.some((term) => {
    const phraseTokens = normalizeText(term).split(" ").filter(Boolean);
    return hasTokenSequence(tokens, phraseTokens);
  });
}

function hasTicoMediaOrPriceIntent(text: string): boolean {
  return includesAny(text, [
    "foto",
    "fotos",
    "imagem",
    "imagens",
    "video",
    "videos",
    "catalogo",
    "opcoes",
    "opcao",
    "mostrar",
    "mostra",
    "ver",
    "valor",
    "preco",
    "orcamento",
    "alugar",
    "locar",
    "brinquedo",
    "brinquedos",
  ]);
}

function findToyByKey(key: string): TicoToy | null {
  return TICO_TOYS.find((toy) => toy.key === key) || null;
}

function isGenericCamaElasticaRequest(normalizedMessage: string): boolean {
  if (!includesAnyPhrase(normalizedMessage, ["cama elastica", "camas elasticas"])) return false;

  return !includesAnyPhrase(normalizedMessage, [
    "cama elastica p",
    "cama elastica pequena",
    "cama pequena",
    "cama elastica m",
    "cama elastica media",
    "cama media",
    "cama elastica g",
    "cama elastica grande",
    "cama grande",
  ]);
}

function detectRequestedToys(normalizedMessage: string): TicoToy[] {
  const selected = new Map<string, TicoToy>();

  if (isGenericCamaElasticaRequest(normalizedMessage)) {
    for (const key of ["cama_elastica_p", "cama_elastica_m", "cama_elastica_g"]) {
      const toy = findToyByKey(key);
      if (toy) selected.set(toy.key, toy);
    }
  }

  for (const toy of TICO_TOYS) {
    if (
      toy.key === "cama_elastica_p" &&
      includesAnyPhrase(normalizedMessage, ["cama elastica grande", "cama elastica g", "cama elastica media", "cama elastica m", "cama media"])
    ) {
      continue;
    }
    if (toy.key === "cama_elastica_m" && includesAnyPhrase(normalizedMessage, ["cama elastica grande", "cama elastica g"])) {
      continue;
    }
    if (toy.key === "piscina_casinha" && normalizedMessage.includes("piscina") && normalizedMessage.includes("inflavel")) {
      continue;
    }
    if (toy.key === "piscina_inflavel" && normalizedMessage.includes("piscina") && normalizedMessage.includes("casinha")) {
      continue;
    }
    const matchesToy = toy.key.startsWith("cama_elastica")
      ? includesAnyPhrase(normalizedMessage, toy.keywords)
      : includesAny(normalizedMessage, toy.keywords.map(normalizeText));
    if (matchesToy) {
      selected.set(toy.key, toy);
    }
  }

  if (normalizedMessage.includes("piscina") && !selected.has("piscina_casinha") && !selected.has("piscina_inflavel")) {
    for (const key of ["piscina_casinha", "piscina_inflavel"]) {
      const toy = findToyByKey(key);
      if (toy) selected.set(toy.key, toy);
    }
  }

  return [...selected.values()];
}

function detectBroadOptions(normalizedMessage: string): TicoToy[] {
  const isBroadCatalog = includesAny(normalizedMessage, ["catalogo", "opcoes", "quais brinquedos", "brinquedos voces tem", "brinquedos disponiveis"]);
  if (!isBroadCatalog) return [];

  const asksOlderKids = /\b(10|11|12|13|14|15)\s*anos\b/.test(normalizedMessage) || normalizedMessage.includes("maiores");
  const keys = asksOlderKids && !normalizedMessage.includes("catalogo") ? OLDER_KIDS_OPTIONS : FULL_CATALOG_OPTIONS;
  return keys.map(findToyByKey).filter((toy): toy is TicoToy => Boolean(toy));
}

function formatToyLine(toy: TicoToy): string {
  const prices = [toy.price1 ? `1 dia ${toy.price1}` : "", toy.price2 ? `2 dias ${toy.price2}` : "", toy.price3 ? `3 dias ${toy.price3}` : ""]
    .filter(Boolean)
    .join(" | ");
  return `- ${toy.label}: ${toy.measure}${prices ? ` | ${prices}` : ""}.`;
}

function buildToyMediaAction(toy: TicoToy): TicoMediaAction {
  if (toy.mediaUrl) {
    return {
      type: "send_media_url",
      media_name: toy.mediaName,
      media_url: toy.mediaUrl,
      media_type: "image",
      mime_type: toy.mimeType || "image/jpeg",
    };
  }

  return {
    type: "send_media",
    media_name: toy.mediaName,
  };
}

export function buildTicoLocacoesDeterministicTurn(params: {
  userId: string | null | undefined;
  message: unknown;
  contextText?: unknown;
}): TicoLocacoesTurn | null {
  if (!isTicoLocacoesTenant(params.userId)) return null;

  const normalizedMessage = normalizeText(params.message);
  if (!normalizedMessage) return null;

  let requestedToys = detectRequestedToys(normalizedMessage);
  const broadOptions = requestedToys.length > 0 ? [] : detectBroadOptions(normalizedMessage);
  const asksContextualMedia =
    requestedToys.length === 0 &&
    broadOptions.length === 0 &&
    includesAny(normalizedMessage, [
      "foto",
      "fotos",
      "imagem",
      "imagens",
      "manda",
      "mande",
      "mandar",
      "envia",
      "envie",
      "enviar",
      "mostra",
      "mostrar",
      "ver",
    ]);

  if (asksContextualMedia) {
    const normalizedContext = normalizeText(params.contextText);
    requestedToys = detectRequestedToys(normalizedContext).slice(0, 3);
  }

  const selected = requestedToys.length > 0 ? requestedToys.slice(0, 3) : broadOptions;

  if (selected.length === 0 || !hasTicoMediaOrPriceIntent(normalizedMessage)) {
    return null;
  }

  const intro = selected.length === 1
    ? `Separei esta opcao para voce:`
    : `Separei ${selected.length} opcoes para voce:`;
  const text = [
    intro,
    ...selected.map(formatToyLine),
    "A disponibilidade e verificada apenas pelo nosso time apos analise dos dados, ta bom?",
    "Para fechar o orcamento, me passa a data do evento e o bairro/regiao?",
  ].join("\n");

  return {
    text,
    mediaActions: selected.map(buildToyMediaAction),
    mode: "tico_locacoes_media",
    matchedKeys: selected.map((toy) => toy.key),
  };
}
