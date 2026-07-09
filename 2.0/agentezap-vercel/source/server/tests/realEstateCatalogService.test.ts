import assert from "node:assert/strict";

import {
  assessRealEstatePropertyLookup,
  generateGrupoOlxCatalogPromptBlock,
  parseGrupoOlxXmlFeed,
  selectRelevantGrupoOlxListings,
} from "../realEstateCatalogService";
import type { GrupoOlxListing } from "@shared/schema";

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync">
  <Listings>
    <Listing>
      <ListingID>RP1001</ListingID>
      <Title>Apartamento frente mar na Ponta da Praia</Title>
      <TransactionType>For Sale</TransactionType>
      <PublicationType>PREMIUM</PublicationType>
      <DetailViewUrl>https://example.com/imovel/rp1001</DetailViewUrl>
      <Media>
        <Item medium="image" primary="true">https://example.com/image-1.jpg</Item>
      </Media>
      <Details>
        <PropertyType>Apartment</PropertyType>
        <Description>Imovel amplo com varanda e vista para o mar.</Description>
        <ListPrice currency="BRL">890000.00</ListPrice>
        <Bedrooms>3</Bedrooms>
        <Bathrooms>2</Bathrooms>
        <Garage type="Parking Space">1</Garage>
        <LivingArea unit="square metres">193</LivingArea>
        <Features>
          <Feature>Varanda</Feature>
          <Feature>Vista para o mar</Feature>
        </Features>
      </Details>
      <Location>
        <City>Santos</City>
        <State>SP</State>
        <Neighborhood>Ponta da Praia</Neighborhood>
        <Address>Avenida Rei Alberto I</Address>
        <StreetNumber>10</StreetNumber>
      </Location>
    </Listing>
    <Listing>
      <ListingID>RP2002</ListingID>
      <Title>Apartamento no Gonzaga</Title>
      <TransactionType>For Sale</TransactionType>
      <PublicationType>STANDARD</PublicationType>
      <DetailViewUrl>https://example.com/imovel/rp2002</DetailViewUrl>
      <Details>
        <PropertyType>Apartment</PropertyType>
        <Description>Imovel central.</Description>
        <ListPrice>650000.00</ListPrice>
      </Details>
      <Location>
        <City>Santos</City>
        <State>SP</State>
        <Neighborhood>Gonzaga</Neighborhood>
        <Address>Rua Alfa</Address>
      </Location>
    </Listing>
  </Listings>
</ListingDataFeed>`;

const parsedListings = parseGrupoOlxXmlFeed(sampleXml);

assert.equal(parsedListings.length, 2);
assert.equal(parsedListings[0].listingCode, "RP1001");
assert.equal(parsedListings[0].city, "Santos");
assert.equal(parsedListings[0].neighborhood, "Ponta da Praia");
assert.equal(parsedListings[0].imageUrl, "https://example.com/image-1.jpg");
assert.equal(parsedListings[0].price, "890000.00");
assert.equal(parsedListings[0].garage, 1);
assert.equal(parsedListings[0].livingArea, "193.00");

const mockListings = parsedListings.map((listing, index) => ({
  id: `listing-${index + 1}`,
  integrationId: "integration-1",
  externalListingId: listing.externalListingId,
  listingCode: listing.listingCode,
  title: listing.title,
  transactionType: listing.transactionType,
  propertyType: listing.propertyType,
  publicationType: listing.publicationType,
  description: listing.description,
  detailUrl: listing.detailUrl,
  imageUrl: listing.imageUrl,
  price: listing.price,
  condoFee: null,
  yearlyTax: null,
  bedrooms: listing.bedrooms,
  bathrooms: listing.bathrooms,
  suites: null,
  garage: listing.garage,
  livingArea: listing.livingArea,
  lotArea: null,
  city: listing.city,
  state: listing.state,
  neighborhood: listing.neighborhood,
  address: listing.address,
  searchableText: listing.searchableText,
  features: listing.features,
  rawPayload: listing.rawPayload,
  isActive: true,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
})) as GrupoOlxListing[];

const structuredListings = [
  {
    ...mockListings[0],
    id: "listing-alt-1",
    listingCode: "RP3003",
    externalListingId: "RP3003",
    title: "Apartamento com 2 dormitorios no Estuario",
    neighborhood: "Estuario",
    city: "Santos",
    address: "Avenida Afonso Pena, 675",
    detailUrl: "https://example.com/imovel/rp3003",
    price: "550000.00",
    searchableText: "apartamento estuario santos avenida afonso pena 675 550000",
  },
  {
    ...mockListings[0],
    id: "listing-alt-2",
    listingCode: "RP3004",
    externalListingId: "RP3004",
    title: "Apartamento com 2 dormitorios na Ponta da Praia",
    neighborhood: "Ponta da Praia",
    city: "Santos",
    address: "Rua Venancio Jose Lisboa, 53",
    detailUrl: "https://example.com/imovel/rp3004",
    price: "595000.00",
    searchableText: "apartamento ponta da praia santos rua venancio jose lisboa 53 595000",
  },
  {
    ...mockListings[0],
    id: "listing-alt-pasteur",
    listingCode: "RP24525",
    externalListingId: "RP24525",
    title: "Apto 3 quartos 1 suíte 200 M² 2 garagens no Gonzaga",
    neighborhood: "Gonzaga",
    city: "Santos",
    address: "Rua Pasteur, 63",
    detailUrl: "https://example.com/imovel/rp24525",
    price: "980000.00",
    searchableText: "rp24525 apartamento gonzaga santos rua pasteur 63 980000",
  },
];

const relevant = selectRelevantGrupoOlxListings(mockListings, "Tem algum imovel na Ponta da Praia com vista para o mar?", 5);
assert.equal(relevant.length >= 1, true);
assert.equal(relevant[0].code, "RP1001");
assert.match(relevant[0].title, /Ponta da Praia/);

const followUpRelevant = selectRelevantGrupoOlxListings(
  mockListings,
  "manda o link",
  3,
  [
    { role: "user", content: "Estou em frente ao imovel e quero mais informacoes." },
    { role: "assistant", content: "Esse imovel fica na Avenida Rei Alberto I, 10, na Ponta da Praia." },
  ],
);
assert.equal(followUpRelevant.length >= 1, true);
assert.equal(followUpRelevant[0].code, "RP1001");

const structuredRelevant = selectRelevantGrupoOlxListings(
  [...mockListings, ...structuredListings],
  "apartamentos no Gonzaga de 500k a 600k",
  3,
);
assert.equal(structuredRelevant.length, 2);
assert.deepEqual(
  structuredRelevant.map((item) => item.code).sort(),
  ["RP3003", "RP3004"],
);
assert.equal(structuredRelevant.every((item) => !/Gonzaga/i.test(item.title)), true);

const codedRelevant = selectRelevantGrupoOlxListings(
  [...mockListings, ...structuredListings],
  "Olá! Tenho interesse no anuncio RP3003 que encontrei no Zap: https://www.zapimoveis.com.br/imovel/venda-apartamento-estuario-santos-sp-185m2-id-2865825162/. Código do anúncio no Zap: 2865825162",
  1,
);

assert.equal(codedRelevant.length, 1);
assert.equal(codedRelevant[0].code, "RP3003");

const mixedHistoryListings = [
  ...mockListings,
  ...structuredListings,
  {
    ...mockListings[0],
    id: "listing-alt-3",
    listingCode: "RP03046",
    externalListingId: "RP03046",
    title: "Apartamento frente mar na Ponta da Praia",
    neighborhood: "Ponta da Praia",
    city: "Santos",
    address: "Avenida Bartholomeu de Gusmao, 132",
    detailUrl: "https://example.com/imovel/rp03046",
    price: "2450000.00",
    searchableText: "rp03046 apartamento ponta da praia santos avenida bartholomeu de gusmao 132 2450000",
  },
  {
    ...mockListings[0],
    id: "listing-alt-4",
    listingCode: "RP79654",
    externalListingId: "RP79654",
    title: "Cobertura Triplex no Estuario",
    neighborhood: "Estuario",
    city: "Santos",
    address: "Avenida Afonso Pena, 675",
    detailUrl: "https://example.com/imovel/rp79654",
    price: "550000.00",
    searchableText: "rp79654 cobertura estuario santos avenida afonso pena 675 550000",
  },
] as GrupoOlxListing[];

const mixedHistoryRelevant = selectRelevantGrupoOlxListings(
  mixedHistoryListings,
  "Lead recebido via ZAP Imoveis (WHATSAPP). Nome: Rodrigo Codigo do imovel: RP03046 Cidade: Santos Bairro: Ponta da Praia",
  1,
  [
    { role: "user", content: "Lead recebido via Grupo OLX (EMAIL). Codigo do imovel: RP79654 Bairro: Estuario Cidade: Santos" },
    { role: "assistant", content: "Esse imovel anterior e a cobertura RP79654." },
    { role: "user", content: "Tenho interesse no anuncio RP03046 que encontrei no VivaReal." },
  ],
);

assert.equal(mixedHistoryRelevant.length, 1);
assert.equal(mixedHistoryRelevant[0].code, "RP03046");

const anchoredByAssistantRelevant = selectRelevantGrupoOlxListings(
  mixedHistoryListings,
  "sim",
 1,
  [
    {
      role: "assistant",
      content: "Segue o link confirmado do anuncio RP03046: https://example.com/imovel/rp03046",
    },
  ],
);

assert.equal(anchoredByAssistantRelevant.length, 1);
assert.equal(anchoredByAssistantRelevant[0].code, "RP03046");

const promptBlock = generateGrupoOlxCatalogPromptBlock({
  active: true,
  totalCount: mockListings.length,
  retrievedCount: relevant.length,
  feedUrl: "https://example.com/feed.xml",
  listings: relevant,
  inventoryListings: mixedHistoryListings.map((listing) => ({
    code: listing.listingCode || listing.externalListingId,
    title: listing.title,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    price: listing.price,
    city: listing.city,
    neighborhood: listing.neighborhood,
    address: listing.address,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    garage: listing.garage,
    livingArea: listing.livingArea,
    detailUrl: listing.detailUrl,
    description: listing.description,
    score: 0,
  })),
  specialInstructions: [
    "Se o lead pedir imovel nos Estados Unidos, Florida ou Orlando, envie o formulario https://docs.google.com/forms/d/1ZkzOVBXpoPlNW-z8eBgDoo8Gj03Hh5KIO67X6GGWJoo/edit para ele preencher antes de continuar.",
  ],
});

assert.match(promptBlock, /CATALOGO DE IMOVEIS/);
assert.match(promptBlock, /RP1001/);
assert.match(promptBlock, /Ponta da Praia/);
assert.match(promptBlock, /INVENTARIO SINCRONIZADO COMPLETO/);
assert.match(promptBlock, /RP03046/);
assert.match(promptBlock, /Estados Unidos/);
assert.match(promptBlock, /Link confirmado/);

const anchoredPromptBlock = generateGrupoOlxCatalogPromptBlock({
  active: true,
  totalCount: structuredListings.length,
  retrievedCount: 1,
  feedUrl: "https://example.com/feed.xml",
  listings: [
    {
      ...mixedHistoryRelevant[0],
      inventoryStatus: "conversation_anchor",
    },
  ],
  inventoryListings: structuredListings.map((listing) => ({
    code: listing.listingCode || listing.externalListingId,
    title: listing.title,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    price: listing.price,
    city: listing.city,
    neighborhood: listing.neighborhood,
    address: listing.address,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    garage: listing.garage,
    livingArea: listing.livingArea,
    detailUrl: listing.detailUrl,
    description: listing.description,
    score: 0,
    inventoryStatus: "active_xml",
  })),
  specialInstructions: [],
});

assert.match(anchoredPromptBlock, /ancorado na conversa\/lead/i);
assert.doesNotMatch(anchoredPromptBlock, /Estoque: ativo na ultima sincronizacao do XML/);

const partialLookupAssessment = assessRealEstatePropertyLookup({
  customerMessage: "afonso pena em santos",
  listings: structuredListings,
});

assert.equal(partialLookupAssessment.shouldEscalateToHuman, true);
assert.equal(partialLookupAssessment.reason, "missing_required_location_data");

const cannotIdentifyAssessment = assessRealEstatePropertyLookup({
  customerMessage: "nao consigo ver",
  conversationHistory: [{ role: "user", content: "afonso pena em santos" }],
  listings: structuredListings,
});

assert.equal(cannotIdentifyAssessment.shouldEscalateToHuman, true);
assert.equal(cannotIdentifyAssessment.reason, "customer_cannot_identify_property");

const fullLookupAssessment = assessRealEstatePropertyLookup({
  customerMessage: "afonso pena 675 santos",
  listings: structuredListings,
});

assert.equal(fullLookupAssessment.shouldEscalateToHuman, false);

const canonicalAddressLookupAssessment = assessRealEstatePropertyLookup({
  customerMessage: "Affonso Penna 675 Santos",
  listings: structuredListings,
});

assert.equal(canonicalAddressLookupAssessment.shouldEscalateToHuman, false);

const singleTokenStreetLookupAssessment = assessRealEstatePropertyLookup({
  customerMessage: "Rua Pasteur, 63 em Santos",
  listings: structuredListings,
});

assert.equal(singleTokenStreetLookupAssessment.shouldEscalateToHuman, false);

const singleTokenStreetRelevant = selectRelevantGrupoOlxListings(
  structuredListings,
  "Rua Pasteur, 63 em Santos",
  1,
);

assert.equal(singleTokenStreetRelevant.length, 1);
assert.equal(singleTokenStreetRelevant[0].code, "RP24525");

const codedLookupAssessment = assessRealEstatePropertyLookup({
  customerMessage:
    "Olá! Tenho interesse em cobertura, Avenida Affonso Penna - Estuario, Santos - SP que encontrei no Zap: https://www.zapimoveis.com.br/imovel/venda-cobertura-3-quartos-com-churrasqueira-estuario-santos-sp-185m2-id-2865825162/. Código da oferta: RP79654. Código do anúncio no Zap: 2865825162",
  listings: structuredListings,
});

assert.equal(codedLookupAssessment.shouldEscalateToHuman, false);

const genericOpeningAssessment = assessRealEstatePropertyLookup({
  customerMessage: "Estou em frente a um imovel com a placa da imobiliaria e quero mais informacoes.",
  listings: structuredListings,
});

assert.equal(genericOpeningAssessment.shouldEscalateToHuman, false);

const promptBlockWithoutListings = generateGrupoOlxCatalogPromptBlock({
  active: true,
  totalCount: structuredListings.length,
  retrievedCount: 0,
  feedUrl: "https://example.com/feed.xml",
  listings: [],
  inventoryListings: structuredListings.map((listing) => ({
    code: listing.listingCode || listing.externalListingId,
    title: listing.title,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    price: listing.price,
    city: listing.city,
    neighborhood: listing.neighborhood,
    address: listing.address,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    garage: listing.garage,
    livingArea: listing.livingArea,
    detailUrl: listing.detailUrl,
    description: listing.description,
    score: 0,
  })),
  specialInstructions: [
    "Responda de forma curta dizendo que vai encaminhar o atendimento para um corretor humano da equipe continuar a identificacao correta do imovel.",
  ],
});

assert.match(promptBlockWithoutListings, /corretor humano/i);
assert.match(promptBlockWithoutListings, /inventario sincronizado completo/i);
assert.match(promptBlockWithoutListings, /Rua Pasteur, 63/i);

console.log("realEstateCatalogService.test.ts ok");
