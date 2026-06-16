UPDATE "Branch"
SET "phone" = '+92 329 5196981'
WHERE "slug" = 'islamabad-g11';

UPDATE "Setting"
SET "value" = jsonb_set(("value"::jsonb), '{phone}', to_jsonb('+92 329 5196981'::text), true)
WHERE "key" = 'store.contact';
