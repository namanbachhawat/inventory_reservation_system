import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Load reservation
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

    // 2. If already released, return idempotently
    if (reservation.status === "RELEASED") {
      return NextResponse.json(reservation, { status: 200 });
    }

    // 3. Release in a transaction: update status + decrement reservedUnits
    const updated = await prisma.$transaction(async (tx: any) => {
      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true, location: true } },
        },
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

      return updatedReservation;
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Error releasing reservation:", error);
    return NextResponse.json(
      { error: "Failed to release reservation" },
      { status: 500 }
    );
  }
}
