"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { FormError } from "@/components/auth/AuthCard";
import { recordStockMovementAction, type StockMovementFormState } from "./actions";

const initialState: StockMovementFormState = {};

const fieldClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type StockTrackedProduct = {
  id: string;
  variantId: string;
  name: string;
  batchTracked: boolean;
  serialTracked: boolean;
  batches: Array<{ id: string; label: string }>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Record movement
    </Button>
  );
}

export function StockMovementForm({ warehouses }: { warehouses: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(recordStockMovementAction, initialState);
  // React resets a <form>'s native DOM controls after every action call (success or failure) —
  // this desyncs controlled elements (select/input) from React's own tracked value whenever the
  // underlying state prop doesn't itself change, silently reverting the user's selection right
  // before/around the submission React thinks already happened. Remounting the field subtree on
  // every action result (rather than trying to out-fight the reset) sidesteps it: React discards
  // the reset-corrupted DOM and rebuilds it fresh from the current (still-correct) component state.
  const [renderKey, setRenderKey] = useState(0);
  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current !== state) {
      lastState.current = state;
      setRenderKey((k) => k + 1);
    }
  }, [state]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockTrackedProduct[]>([]);
  const [selected, setSelected] = useState<StockTrackedProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [warehouseId, setWarehouseId] = useState("");
  const [direction, setDirection] = useState("in");
  const [batchId, setBatchId] = useState("");

  async function search(q: string) {
    setQuery(q);
    setSelected(null);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    const products = (data.products ?? []).filter(
      (p: { type: string; stockTracking: { enabled: boolean } }) =>
        p.type === "product" && p.stockTracking.enabled,
    );
    setResults(products);
    setOpen(true);
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <Card key={renderKey}>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="productSearch">Product</FieldLabel>
              <div className="relative">
                <input
                  id="productSearch"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  placeholder="Search a stock-tracked product…"
                  className={fieldClass}
                />
                {open && results.length > 0 ? (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
                    {results.map((p) => (
                      <li key={`${p.id}__${p.variantId}`}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setSelected(p);
                            setQuery(p.name);
                            setBatchId("");
                            setResults([]);
                            setOpen(false);
                          }}
                          className="flex w-full items-center px-3 py-2 text-left hover:bg-muted"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {!selected && query.trim() && results.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No stock-tracked products match — only products with stock tracking enabled can move
                  stock.
                </p>
              ) : null}
              {state.fieldErrors?.productId ? <FieldError>{state.fieldErrors.productId}</FieldError> : null}
            </Field>
            <input type="hidden" name="productId" value={selected?.id ?? ""} />
            <input type="hidden" name="variantId" value={selected?.variantId ?? ""} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.warehouseId ? true : undefined}>
                <FieldLabel htmlFor="warehouseId">Warehouse</FieldLabel>
                <select
                  id="warehouseId"
                  name="warehouseId"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select warehouse…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <FieldError>{state.fieldErrors?.warehouseId}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="direction">Direction</FieldLabel>
                <select
                  id="direction"
                  name="direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className={fieldClass}
                >
                  <option value="in">Stock In</option>
                  <option value="out">Stock Out</option>
                </select>
              </Field>
            </div>

            <Field data-invalid={state.fieldErrors?.quantity ? true : undefined}>
              <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="0"
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={fieldClass}
              />
              <FieldError>{state.fieldErrors?.quantity}</FieldError>
            </Field>

            {selected?.batchTracked ? (
              <div className="space-y-2">
                <Field>
                  <FieldLabel htmlFor="batchId">Batch</FieldLabel>
                  <select
                    id="batchId"
                    name="batchId"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">— Add a new batch instead —</option>
                    {selected.batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {!batchId ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field data-invalid={state.fieldErrors?.newBatchNumber ? true : undefined}>
                      <FieldLabel htmlFor="newBatchNumber">New batch number</FieldLabel>
                      <input id="newBatchNumber" name="newBatchNumber" className={fieldClass} />
                      <FieldError>{state.fieldErrors?.newBatchNumber}</FieldError>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="newBatchExpiryDate">Expiry date (optional)</FieldLabel>
                      <input
                        id="newBatchExpiryDate"
                        name="newBatchExpiryDate"
                        type="date"
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected?.serialTracked ? (
              <Field>
                <FieldLabel htmlFor="serialNumbersText">
                  Serial numbers (one per line, {quantity || 0} needed)
                </FieldLabel>
                <Textarea id="serialNumbersText" name="serialNumbersText" rows={4} />
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="note">Note</FieldLabel>
              <Textarea id="note" name="note" rows={2} />
              <FieldError>{state.fieldErrors?.note}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <SubmitButton />
    </form>
  );
}
