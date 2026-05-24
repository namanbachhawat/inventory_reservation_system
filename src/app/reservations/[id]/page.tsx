"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Reservation = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  product: { name: string; sku: string };
  warehouse: { name: string; location: string };
};

function getStatusColor(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "CONFIRMED":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "RELEASED":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    default:
      return "";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "PENDING":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "CONFIRMED":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "RELEASED":
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [percentage, setPercentage] = useState(100);

  useEffect(() => {
    const totalDuration = 15 * 60 * 1000; // 15 minutes in ms

    const update = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        setIsExpired(true);
        setPercentage(0);
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
      setPercentage(Math.min(100, (diff / totalDuration) * 100));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const color = isExpired
    ? "text-red-400"
    : percentage < 20
      ? "text-red-400"
      : percentage < 50
        ? "text-amber-400"
        : "text-emerald-400";

  const barColor = isExpired
    ? "bg-red-500"
    : percentage < 20
      ? "bg-red-500"
      : percentage < 50
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Time Remaining</span>
        <span className={`text-2xl font-mono font-bold tabular-nums ${color}`}>
          {timeLeft}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-1000 ease-linear`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isExpired && (
        <p className="text-sm text-red-400 animate-pulse">
          ⚠ This reservation has expired
        </p>
      )}
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-8 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-1/2 mt-3" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="h-20 bg-muted rounded" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
          <div className="flex gap-3">
            <div className="h-12 bg-muted rounded flex-1" />
            <div className="h-12 bg-muted rounded flex-1" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        toast.error("Reservation not found");
        router.push("/");
        return;
      }
      const data = await res.json();
      setReservation(data);
    } catch {
      toast.error("Failed to load reservation");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
        headers: {
          "Idempotency-Key": `confirm-${id}-${Date.now()}`,
        },
      });

      if (res.status === 410) {
        toast.error("Reservation Expired", {
          description: "This reservation has expired and can no longer be confirmed.",
        });
        setReservation((prev) =>
          prev ? { ...prev, status: "RELEASED" } : null
        );
        return;
      }

      if (!res.ok) {
        toast.error("Confirmation Failed");
        return;
      }

      const data = await res.json();
      setReservation(data);
      toast.success("Purchase Confirmed!", {
        description: "Your reservation has been confirmed successfully.",
      });
    } catch {
      toast.error("Network Error");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      if (!res.ok) {
        toast.error("Cancellation Failed");
        return;
      }

      const data = await res.json();
      setReservation(data);
      toast.success("Reservation Cancelled", {
        description: "Stock has been released back to inventory.",
      });
    } catch {
      toast.error("Network Error");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <SkeletonDetail />;
  if (!reservation) return null;

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Back Button */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Products
      </button>

      <Card className={`glow-sm ${isConfirmed ? "border-emerald-500/30" : ""}`}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                Reservation Detail
              </CardTitle>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {reservation.id}
              </p>
            </div>
            <Badge
              variant="outline"
              className={`flex items-center gap-1.5 px-3 py-1 ${getStatusColor(reservation.status)}`}
            >
              {getStatusIcon(reservation.status)}
              {reservation.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Countdown Timer - only show for PENDING */}
          {isPending && (
            <div className="p-4 rounded-xl bg-accent/50 border border-border">
              <CountdownTimer expiresAt={reservation.expiresAt} />
            </div>
          )}

          {/* Confirmed Banner */}
          {isConfirmed && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-emerald-400">Purchase Confirmed</p>
                <p className="text-sm text-muted-foreground">
                  Your order has been locked in and confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Released Banner */}
          {isReleased && (
            <div className="p-4 rounded-xl bg-zinc-500/10 border border-zinc-500/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-zinc-400">Reservation Released</p>
                <p className="text-sm text-muted-foreground">
                  Stock has been returned to inventory.
                </p>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-accent/30 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Product
              </p>
              <p className="font-semibold">{reservation.product.name}</p>
              <Badge variant="outline" className="mt-1 font-mono text-xs">
                {reservation.product.sku}
              </Badge>
            </div>

            <div className="p-4 rounded-xl bg-accent/30 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Warehouse
              </p>
              <p className="font-semibold">{reservation.warehouse.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {reservation.warehouse.location}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-accent/30 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Quantity
              </p>
              <p className="text-2xl font-bold">{reservation.quantity}</p>
              <p className="text-xs text-muted-foreground">units reserved</p>
            </div>

            <div className="p-4 rounded-xl bg-accent/30 border border-border/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Created
              </p>
              <p className="font-semibold">
                {new Date(reservation.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(reservation.createdAt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Action Buttons - only for PENDING */}
          {isPending && (
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={handleCancel}
                disabled={cancelling || confirming}
              >
                {cancelling ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cancelling...
                  </span>
                ) : (
                  "Cancel Reservation"
                )}
              </Button>
              <Button
                className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleConfirm}
                disabled={confirming || cancelling}
              >
                {confirming ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Confirming...
                  </span>
                ) : (
                  "✓ Confirm Purchase"
                )}
              </Button>
            </div>
          )}

          {/* Back to Products for terminal states */}
          {(isConfirmed || isReleased) && (
            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => router.push("/")}
            >
              ← Back to Products
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
