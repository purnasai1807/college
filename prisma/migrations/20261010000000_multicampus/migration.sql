CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Campus" ("id", "name", "location")
VALUES ('default-campus', 'Default campus', '');

CREATE UNIQUE INDEX "Campus_name_location_key" ON "Campus"("name", "location");

ALTER TABLE "Canteen"
ADD COLUMN "campusId" TEXT NOT NULL DEFAULT 'default-campus';

ALTER TABLE "User"
ADD COLUMN "canteenId" TEXT;

ALTER TABLE "Canteen"
ADD CONSTRAINT "Canteen_campusId_fkey"
FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_canteenId_fkey"
FOREIGN KEY ("canteenId") REFERENCES "Canteen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
