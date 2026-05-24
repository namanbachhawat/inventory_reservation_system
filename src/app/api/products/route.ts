import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Lazy cleanup: release expired PENDING reservations (fire-and-forget)
function cleanupExpiredReservations() {
  prisma.reservation
    .findMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
    })
    .then(async (expired) => {
      for (const r of expired) {
        try {
          await prisma.$transaction(async (tx: any) => {
            await tx.reservation.update({
              where: { id: r.id },
              data: { status: "RELEASED" },
            });
            await tx.inventory.update({
              where: {
                productId_warehouseId: {
                  productId: r.productId,
                  warehouseId: r.warehouseId,
                },
              },
              data: { reservedUnits: { decrement: r.quantity } },
            });
          });
        } catch {
          // Ignore errors in background cleanup — cron will retry
        }
      }
    })
    .catch(() => {
      // Ignore errors in background cleanup
    });
}

export async function GET() {
  // Fire-and-forget cleanup of expired reservations
  cleanupExpiredReservations();

  try {
    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const response = products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      inventory: product.inventory.map((inv) => ({
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        available: inv.totalUnits - inv.reservedUnits,
        total: inv.totalUnits,
        reserved: inv.reservedUnits,
      })),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
