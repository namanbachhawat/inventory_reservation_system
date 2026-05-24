import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Idempotency check
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const record = await prisma.idempotencyRecord.findFirst({
        where: {
          key: idempotencyKey,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (record) {
        return NextResponse.json(record.responseBody, {
          status: record.statusCode,
        });
      }
    }

    // 2. Load reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // 3. Check if expired or already released
    if (reservation.expiresAt < new Date() || reservation.status === "RELEASED") {
      // If it was pending and expired, also release the reserved units
      if (reservation.status === "PENDING") {
        await prisma.$transaction(async (tx: any) => {
          await tx.reservation.update({
            where: { id },
            data: { status: "RELEASED" },
          });
          await tx.inventory.update({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: { reservedUnits: { decrement: reservation.quantity } },
          });
        });
      }

      return NextResponse.json(
        { error: "Reservation expired" },
        { status: 410 }
      );
    }

    // 4. If already confirmed, return idempotently
    if (reservation.status === "CONFIRMED") {
      const responseBody = reservation;
      if (idempotencyKey) {
        await prisma.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            statusCode: 200,
            responseBody: responseBody as any,
          },
        }).catch(() => {});
      }
      return NextResponse.json(responseBody, { status: 200 });
    }

    // 5. Update status to CONFIRMED
    const updated = await prisma.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true, location: true } },
      },
    });

    // 6. Store idempotency record
    if (idempotencyKey) {
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          statusCode: 200,
          responseBody: updated as any,
        },
      }).catch(() => {});
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error confirming reservation:", error);
    return NextResponse.json(
      { error: "Failed to confirm reservation" },
      { status: 500 }
    );
  }
}
