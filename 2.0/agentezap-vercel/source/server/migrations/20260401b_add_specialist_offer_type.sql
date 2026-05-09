ALTER TABLE specialist_addons
ADD COLUMN IF NOT EXISTS offer_type varchar(50) NOT NULL DEFAULT 'specialist';

UPDATE specialist_addons
SET offer_type = 'specialist'
WHERE offer_type IS NULL OR trim(offer_type) = '';

CREATE INDEX IF NOT EXISTS idx_specialist_addons_offer_type
ON specialist_addons (offer_type);
