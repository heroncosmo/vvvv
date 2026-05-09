ALTER TABLE products
  ADD COLUMN IF NOT EXISTS control_stock BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN products.control_stock IS
  'Quando true, o orquestrador trata estoque menor ou igual a zero como indisponibilidade e bloqueia envio automatico de imagens e descricao do produto.';
