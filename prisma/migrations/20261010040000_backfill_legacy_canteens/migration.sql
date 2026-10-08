UPDATE "User" u
SET "canteenId" = c."canteenId"
FROM "Counter" c
WHERE u."counterId" = c."id"
  AND u."canteenId" IS NULL
  AND u."role" = 'STAFF';

UPDATE "User"
SET "canteenId" = (SELECT id FROM "Canteen" ORDER BY id LIMIT 1)
WHERE "canteenId" IS NULL
  AND "role" IN ('ADMIN', 'KITCHEN')
  AND (SELECT COUNT(*) FROM "Canteen") = 1;
