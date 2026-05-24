import { prisma } from "@/lib/prisma";
import { createReservationSchema } from "@/lib/validations";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function checkIdempotency(key: string | null) {
  if (!key) return null;

  const record = await prisma.idempotencyRecord.findFirst({
    where: {
      key,
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24h TTL
    },
  });

  if (record) {
    return NextResponse.json(record.responseBody, {
      status: record.statusCode,
    });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const parsed = createReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // 2. Idempotency check
    const idempotencyKey = request.headers.get("Idempotency-Key");
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) return cached;

    // 3. Concurrency-safe reservation inside a serializable transaction
    // Using raw SQL SELECT ... FOR UPDATE to lock the inventory row
    const result = await prisma.$transaction(async (tx: any) => {
      // Lock the inventory row with SELECT ... FOR UPDATE
      const inventoryRows: any[] = await tx.$queryRaw`
        SELECT "id", "productId", "warehouseId", "totalUnits", "reservedUnits"
        FROM "Inventory"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (!inventoryRows || inventoryRows.length === 0) {
        return {
          error: "Inventory not found for this product/warehouse combination",
          status: 404,
        };
      }

      const inventory = inventoryRows[0];
      const available = inventory.totalUnits - inventory.reservedUnits;

      // Check availability
      if (available < quantity) {
        return {
          error: "Insufficient stock",
          available,
          requested: quantity,
          status: 409,
        };
      }

      // Increment reservedUnits
      await tx.$queryRaw`
        UPDATE "Inventory"
        SET "reservedUnits" = "reservedUnits" + ${quantity}
        WHERE "id" = ${inventory.id}
      `;

      // Create reservation with PENDING status, expires in 15 minutes
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey || undefined,
        },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true, location: true } },
        },
      });

      return { reservation, status: 201 };
    });

    // 4. Handle transaction result
    if ("error" in result) {
      const responseBody = { error: result.error, ...("available" in result ? { available: result.available, requested: result.requested } : {}) };

      // Store idempotency record for error responses too
      if (idempotencyKey) {
        await prisma.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            statusCode: result.status,
            responseBody: responseBody as any,
          },
        }).catch(() => {}); // Ignore if key already exists
      }

      return NextResponse.json(responseBody, { status: result.status });
    }

    // 5. Store idempotency record for success
    const responseBody = result.reservation;
    if (idempotencyKey) {
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          statusCode: 201,
          responseBody: responseBody as any,
        },
      }).catch(() => {}); // Ignore if key already exists
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
