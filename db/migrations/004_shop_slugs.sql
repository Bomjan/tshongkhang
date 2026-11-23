ALTER TABLE sellers ADD COLUMN slug TEXT;

-- Allocate existing shops in ID order, including duplicate/reserved names.
DO $$
DECLARE
    shop RECORD;
    base TEXT;
    candidate TEXT;
    suffix INTEGER;
BEGIN
    FOR shop IN SELECT id, business_name FROM sellers ORDER BY id LOOP
        base := trim(both '-' from left(regexp_replace(lower(shop.business_name), '[^a-z0-9]+', '-', 'g'), 63));
        IF base = '' THEN base := 'shop'; END IF;
        IF base IN ('api','admin','auth','login','register','seller','store','stores',
                    'products','cart','checkout','receipt','images','assets','www',
                    'health','help','support','about','contact','settings') THEN
            base := base || '-shop';
        END IF;
        candidate := base;
        suffix := 2;
        WHILE EXISTS (SELECT 1 FROM sellers WHERE slug = candidate) LOOP
            candidate := rtrim(left(base, 63 - length('-' || suffix)), '-') || '-' || suffix;
            suffix := suffix + 1;
        END LOOP;
        UPDATE sellers SET slug = candidate WHERE id = shop.id;
    END LOOP;
END $$;

ALTER TABLE sellers ALTER COLUMN slug SET NOT NULL;
ALTER TABLE sellers ADD CONSTRAINT sellers_slug_key UNIQUE (slug);
ALTER TABLE sellers ADD CONSTRAINT sellers_slug_valid CHECK (
    length(slug) BETWEEN 1 AND 63
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND slug NOT IN ('api','admin','auth','login','register','seller','store','stores',
                    'products','cart','checkout','receipt','images','assets','www',
                    'health','help','support','about','contact','settings')
);
