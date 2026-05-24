import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.reservation.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create Products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Headphones",
        sku: "WH-001",
        description:
          "Premium noise-cancelling wireless headphones with 30-hour battery life",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard",
        sku: "MK-002",
        description:
          "Cherry MX Blue switch mechanical keyboard with RGB backlighting",
      },
    }),
    prisma.product.create({
      data: {
        name: "USB-C Hub",
        sku: "UC-003",
        description:
          "7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader, and PD charging",
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create Warehouses
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "London Warehouse",
        location: "London, United Kingdom",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Berlin Warehouse",
        location: "Berlin, Germany",
      },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses`);

  // Create Inventory for each product × warehouse combination
  const inventoryData = [
    { product: products[0], warehouse: warehouses[0], totalUnits: 45 },
    { product: products[0], warehouse: warehouses[1], totalUnits: 30 },
    { product: products[1], warehouse: warehouses[0], totalUnits: 20 },
    { product: products[1], warehouse: warehouses[1], totalUnits: 35 },
    { product: products[2], warehouse: warehouses[0], totalUnits: 50 },
    { product: products[2], warehouse: warehouses[1], totalUnits: 15 },
  ];

  const inventories = await Promise.all(
    inventoryData.map((item) =>
      prisma.inventory.create({
        data: {
          productId: item.product.id,
          warehouseId: item.warehouse.id,
          totalUnits: item.totalUnits,
          reservedUnits: 0,
        },
      })
    )
  );

  console.log(`✅ Created ${inventories.length} inventory records`);
  console.log("\n📦 Seed data summary:");
  for (const item of inventoryData) {
    console.log(
      `   ${item.product.name} @ ${item.warehouse.name}: ${item.totalUnits} units`
    );
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
