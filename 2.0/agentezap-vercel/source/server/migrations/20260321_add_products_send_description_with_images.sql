ALTER TABLE products
  ADD COLUMN IF NOT EXISTS send_description_with_images BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN products.send_description_with_images IS
  'Quando true, apos enviar as imagens do produto o orquestrador envia a descricao cadastrada em uma mensagem separada ao final.';
