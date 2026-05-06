ALTER TABLE public.delivery_config
  ADD COLUMN IF NOT EXISTS pix_settings jsonb NOT NULL DEFAULT '{"key":"","keyType":"","holderName":"","bankName":"","instructions":"","requireProof":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS cash_settings jsonb NOT NULL DEFAULT '{"askForChange":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_fee_settings jsonb NOT NULL DEFAULT '{"mode":"fixed","originAddress":"","baseFee":0,"baseDistanceKm":2,"additionalFeePerKm":1,"maxDistanceKm":null,"fallbackFee":0}'::jsonb;

UPDATE public.delivery_config
SET
  pix_settings = COALESCE(pix_settings, '{"key":"","keyType":"","holderName":"","bankName":"","instructions":"","requireProof":false}'::jsonb),
  cash_settings = COALESCE(cash_settings, '{"askForChange":true}'::jsonb),
  delivery_fee_settings = COALESCE(
    delivery_fee_settings,
    jsonb_build_object(
      'mode', 'fixed',
      'originAddress', '',
      'baseFee', COALESCE(delivery_fee, 0),
      'baseDistanceKm', 2,
      'additionalFeePerKm', 1,
      'maxDistanceKm', null,
      'fallbackFee', COALESCE(delivery_fee, 0)
    )
  );
