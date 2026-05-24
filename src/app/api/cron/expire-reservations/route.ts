import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this as Authorization header)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all expired PENDING reservations
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
    });

    let releasedCount = 0;

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
        releasedCount++;
      } catch (error) {
        console.error(`Failed to expire reservation ${r.id}:`, error);
      }
    }

    return NextResponse.json({
      message: `Expired ${releasedCount} reservation(s)`,
      found: expired.length,
      released: releasedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in cron cleanup:", error);
    return NextResponse.json(
      { error: "Cron cleanup failed" },
      { status: 500 }
    );
  }
}
