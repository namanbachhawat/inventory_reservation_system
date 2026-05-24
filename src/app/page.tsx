"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InventoryItem = {
  warehouseId: string;
  warehouseName: string;
  available: number;
  total: number;
  reserved: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  inventory: InventoryItem[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-6 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded w-5/6" />
          <div className="h-10 bg-muted rounded mt-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function StockBar({ available, total }: { available: number; total: number }) {
  const percentage = total > 0 ? (available / total) * 100 : 0;
  const color =
    percentage > 60
      ? "bg-emerald-500"
      : percentage > 25
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {available}/{total}
      </span>
    </div>
  );
}

function ReservationModal({
  product,
  warehouse,
  open,
  onClose,
}: {
  product: Product;
  warehouse: InventoryItem;
  open: boolean;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `reserve-${product.id}-${warehouse.warehouseId}-${Date.now()}`,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: warehouse.warehouseId,
          quantity,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        toast.error("Insufficient Stock", {
          description: data.available !== undefined
            ? `Only ${data.available} unit(s) available`
            : "Not enough stock to fulfill this reservation",
        });
        return;
      }

      if (!res.ok) {
        toast.error("Reservation Failed", {
          description: "Something went wrong. Please try again.",
        });
        return;
      }

      const reservation = await res.json();
      toast.success("Reservation Created!", {
        description: `${quantity} × ${product.name} reserved for 15 minutes`,
      });
      onClose();
      router.push(`/reservations/${reservation.id}`);
    } catch {
      toast.error("Network Error", {
        description: "Could not connect to the server.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reserve Stock</DialogTitle>
          <DialogDescription>
            Reserve {product.name} from {warehouse.warehouseName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{product.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SKU</span>
              <Badge variant="outline" className="font-mono text-xs">
                {product.sku}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Warehouse</span>
              <span className="font-medium">{warehouse.warehouseName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Available</span>
              <span className="font-medium text-emerald-400">
                {warehouse.available} units
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="quantity-input"
              className="text-sm font-medium"
            >
              Quantity
            </label>
            <Input
              id="quantity-input"
              type="number"
              min={1}
              max={warehouse.available}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="text-center text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Max: {warehouse.available} units
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || quantity < 1 || quantity > warehouse.available}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Reserving...
                </span>
              ) : (
                `Reserve ${quantity} unit${quantity !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function HomePage() {
  const { data: products, isLoading, error } = useSWR<Product[]>("/api/products", fetcher, {
    refreshInterval: 10000,
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] =
    useState<InventoryItem | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          <span className="gradient-text">Inventory</span>{" "}
          <span className="text-foreground">Management</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Real-time stock tracking with concurrency-safe reservations.
          Reserve items across warehouses with guaranteed availability.
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-2 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Failed to load products. Please refresh the page.
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Product Cards */}
      {products && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const totalAvailable = product.inventory.reduce(
              (sum, inv) => sum + inv.available,
              0
            );
            const totalStock = product.inventory.reduce(
              (sum, inv) => sum + inv.total,
              0
            );

            return (
              <Card
                key={product.id}
                className="group hover:glow transition-all duration-300 hover:border-primary/30"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {product.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {product.description}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="font-mono text-xs shrink-0"
                    >
                      {product.sku}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 pt-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-semibold text-emerald-400">
                        {totalAvailable}
                      </span>
                      <span className="text-muted-foreground">
                        /{totalStock} available
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Warehouse</TableHead>
                        <TableHead className="text-xs">Stock</TableHead>
                        <TableHead className="text-xs text-right">
                          Action
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.inventory.map((inv) => (
                        <TableRow
                          key={inv.warehouseId}
                          className="hover:bg-accent/50"
                        >
                          <TableCell className="text-sm font-medium">
                            {inv.warehouseName}
                          </TableCell>
                          <TableCell>
                            <StockBar
                              available={inv.available}
                              total={inv.total}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={inv.available > 0 ? "default" : "outline"}
                              disabled={inv.available === 0}
                              onClick={() => {
                                setSelectedProduct(product);
                                setSelectedWarehouse(inv);
                              }}
                              className="text-xs"
                            >
                              {inv.available > 0 ? "Reserve" : "Out of Stock"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reservation Modal */}
      {selectedProduct && selectedWarehouse && (
        <ReservationModal
          product={selectedProduct}
          warehouse={selectedWarehouse}
          open={true}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedWarehouse(null);
          }}
        />
      )}
    </div>
  );
}
