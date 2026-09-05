# Plan: Wizard rebuild of New Dispensing view (PRDS)

Approved direction: **B — Wizard steps**, desktop-first, **palette unchanged**.
Target files live in `prds-web/src/modules/dispensing/`.

> Execution note: this plan was approved in plan mode; apply every section below verbatim,
> then run lint + tests + build.

---

## 1. `dispensingUtils.js` — add step-blocker helper

Append after `formatDispensingDayParts`:

```js
export const getDispensingStepBlocker = ({ claimed, hasLineErrors, hasPatient, lineCount, step }) => {
  if (step === 2) {
    return hasPatient ? "" : "Select a patient first.";
  }

  if (step === 3) {
    if (!hasPatient) {
      return "Select a patient first.";
    }

    if (claimed) {
      return "This patient already claimed free medicine this month.";
    }

    if (!lineCount) {
      return "Add at least one medicine to the claim.";
    }

    if (hasLineErrors) {
      return "Fix invalid quantities before reviewing the claim.";
    }
  }

  return "";
};
```

## 2. `dispensingUtils.test.mjs` — tests

Add `getDispensingStepBlocker` to the import list and append:

```js
test("getDispensingStepBlocker gates each wizard step", () => {
  const base = { claimed: false, hasLineErrors: false, hasPatient: true, lineCount: 2 };

  assert.equal(getDispensingStepBlocker({ ...base, step: 1 }), "");
  assert.equal(getDispensingStepBlocker({ ...base, step: 2 }), "");
  assert.match(getDispensingStepBlocker({ ...base, hasPatient: false, step: 2 }), /patient/i);
  assert.match(getDispensingStepBlocker({ ...base, claimed: true, lineCount: 1, step: 3 }), /month/i);
  assert.match(getDispensingStepBlocker({ ...base, lineCount: 0, step: 3 }), /medicine/i);
  assert.match(
    getDispensingStepBlocker({ ...base, hasLineErrors: true, lineCount: 1, step: 3 }),
    /quantit/i
  );
  assert.equal(getDispensingStepBlocker({ ...base, lineCount: 1, step: 3 }), "");
});
```

## 3. `DispensingUi.jsx` — arrow icon

Insert after `ChevronDownIcon`, matching existing stroke style:

```jsx
export const ArrowRightIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
```

## 4. `DispensingWorkbench.jsx` — rework

### 4a. Imports
- Add `ArrowRightIcon` after `ActiveBadge` in the `./DispensingUi` import.
- Add `getDispensingStepBlocker` after `getCartSummary` in the `./dispensingUtils` import.

### 4b. Replace `TypeChips` component → DELETE entirely.
A mint "Walk-In" chip moves next to the `<h1>` instead (see 4f).

### 4c. Replace `ConfirmDispensingModal` component → `StepperBar`:

```jsx
function StepperBar({ blockerFor, onStepClick, step }) {
  const steps = [
    { id: 1, label: "Patient" },
    { id: 2, label: "Medicines" },
    { id: 3, label: "Review & Complete" },
  ];

  return (
    <nav aria-label="Dispensing progress" className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm">
      <ol className="flex items-center">
        {steps.map((entry, index) => {
          const done = entry.id < step;
          const active = entry.id === step;
          const blocker = blockerFor(entry.id);
          const unlocked = entry.id <= step || !blocker;

          return (
            <li key={entry.id} className={`flex min-w-0 items-center ${index < steps.length - 1 ? "flex-1" : ""}`}>
              <button
                type="button"
                onClick={() => onStepClick(entry.id)}
                disabled={!unlocked}
                aria-current={active ? "step" : undefined}
                title={unlocked ? undefined : blocker}
                className="flex min-w-0 items-center gap-2 rounded-lg disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                    active
                      ? "bg-[#00a36c] text-white shadow-sm"
                      : done
                        ? "border border-[#6be9c2] bg-[#ecfff8] text-[#008f68]"
                        : "border border-[#d8dadc] bg-white text-[#9aa1ad]"
                  }`}
                >
                  {done ? <CheckIcon /> : entry.id}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-sm font-bold sm:block ${
                    active ? "text-[#0d1117]" : done ? "text-[#008f68]" : "text-[#9aa1ad]"
                  }`}
                >
                  {entry.label}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-0.5 min-w-6 flex-1 rounded-full ${done ? "bg-[#6be9c2]" : "bg-[#e5e7eb]"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

### 4d. State + derived values
- ADD near `viewMode`: `const [wizardStep, setWizardStep] = useState(1);`
- REMOVE: `const [showConfirmModal, setShowConfirmModal] = useState(false);`
- REPLACE old `canComplete` memo block with:

```js
const canReview = Boolean(
  selectedPatient &&
    cart.length > 0 &&
    cartLines.every((line) => !line.error && line.preview.shortfall === 0 && Number(line.quantity) > 0)
);

const canComplete = canReview && !selectedClaimed;

const stepBlockers = (target) =>
  getDispensingStepBlocker({
    claimed: selectedClaimed,
    hasLineErrors: cartLines.some((line) => Boolean(line.error) || line.preview.shortfall > 0),
    hasPatient: Boolean(selectedPatient),
    lineCount: cart.length,
    step: target,
  });
```

### 4e. Handlers + effects
- `clearSelectedPatient` gains `setWizardStep(1);`
- DELETE `openConfirm`.
- ADD focus-on-step-change effect (place near other effects):

```js
useEffect(() => {
  const timerId = window.setTimeout(() => {
    const heading = document.querySelector("[data-step-heading]");

    if (heading instanceof HTMLElement) {
      heading.focus();
    }
  }, 0);

  return () => window.clearTimeout(timerId);
}, [wizardStep]);
```

- ADD quantity stepper:

```js
const bumpQuantity = (medicineId, delta) => {
  setCart((current) =>
    current.map((line) => {
      if (line.medicine_id !== medicineId) {
        return line;
      }

      const option = optionsById.get(medicineId);
      const ceiling = option ? option.total_quantity : null;
      const next = Number(line.quantity || 1) + delta;
      const bounded =
        ceiling !== null ? Math.min(Math.max(1, next), ceiling) : Math.max(1, next);

      return { ...line, quantity: bounded };
    })
  );
};
```

- REWRITE `handleComplete` (drop all `setShowConfirmModal` calls; on success also `setWizardStep(1)`).
- DELETE `{showConfirmModal && ... <ConfirmDispensingModal .../>}` render block.

### 4f. Page header — add chip when `viewMode === "new"`:

```jsx
<div className="flex flex-wrap items-center gap-3">
  <h1 className="text-2xl font-bold text-[#0d1117]">Dispensing</h1>
  {viewMode === "new" && (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6be9c2] px-3 py-1 text-xs font-bold text-[#0d1117]">
      <PillIcon /> Walk-In
    </span>
  )}
</div>
```

### 4g. Replace ENTIRE new-view branch (`{viewMode === "new" ? (<>…</>)`) — grid split, both panels, sticky bottom bar — with wizard below. Keep palette tokens exactly.

**Step 1** (`wizardStep === 1`): card section; header h2 `data-step-heading tabIndex={-1}` "Find the Patient".
- No patient: CHO facility select + search input + results grid `grid gap-2 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 max-h-[520px]` (reuse existing skeleton/result/empty markup inside `col-span-full` where needed) + Register button full width.
- Patient selected: existing mint confirmation card (+ Change-patient link), recent claims list (`sm:grid-cols-2` grid of chips/rows), claimed warning box; footer row:
  - left: helper text — claimed ? "They are eligible again next month." : "Next: pick their medicines."
  - right: `Continue to Medicines <ArrowRightIcon/>` black primary `h-10 rounded-lg bg-black px-5 … hover:bg-[#0d1117]`, `disabled={selectedClaimed}`, `title={stepBlockers(2) || undefined}`, onClick `setWizardStep(2)`.

**Step 2** (`wizardStep === 2`): header "Build the Claim".
- Medicine search input (unchanged).
- Catalog grid unchanged cards, container `max-h-[420px] … sm:grid-cols-2 xl:grid-cols-3`.
- Cart: empty → dashed panel `border-dashed border-[#d8dadc] bg-[#f8f9ff]` with PillIcon circle + "No medicines added yet…" guidance. Non-empty → `<ul className="space-y-3">` line cards:

```jsx
<li key={line.medicine_id} className="rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm font-bold text-[#0d1117]">{label}</p>
      <p className="mt-0.5 text-xs text-[#5f6673]">{fullLabel}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {line.preview.allocations.map((allocation) => (
          <span key={allocation.inventory_id} className="rounded-full border border-white bg-white px-2 py-0.5 text-[11px] font-bold text-[#42474e] shadow-sm">
            {allocation.batch_number} ×{allocation.quantity.toLocaleString()}
          </span>
        ))}
        {expiringSoon && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Expiring soon</span>
        )}
      </div>
      {!line.error && line.option && (
        <p className="mt-2 text-xs text-[#5f6673]">{line.option.total_quantity.toLocaleString()} units available</p>
      )}
      {line.error && <p className="mt-2 text-xs font-bold text-red-600">{line.error}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" aria-label="Decrease quantity" disabled={Number(line.quantity) <= 1}
        onClick={() => bumpQuantity(line.medicine_id, -1)}
        className="h-9 w-9 rounded-lg border border-[#d8dadc] bg-white text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff] disabled:opacity-40">−</button>
      <Input value={line.quantity} inputMode="numeric" onChange={(event) => updateCartQuantity(line.medicine_id, event.target.value)} className="w-14 text-center" />
      <button type="button" aria-label="Increase quantity" onClick={() => bumpQuantity(line.medicine_id, 1)}
        className="h-9 w-9 rounded-lg border border-[#d8dadc] bg-white text-sm font-bold text-[#0d1117] transition hover:bg-[#eff4ff]">+</button>
      <button type="button" aria-label="Remove medicine" onClick={() => removeCartLine(line.medicine_id)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition hover:bg-red-50 hover:text-red-600"><XIcon /></button>
    </div>
  </div>
</li>
```

(`expiringSoon` computed per line via `getExpiryStatus({ expiration_date })`, days ≤ 30 — same rule as before.)
- Totals strip when cart non-empty: `rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 flex justify-between text-sm` → "{cartSummary.lineCount} medicine line(s)" / bold "{units} total units".
- Footer: Back ghost ("Back to Patient", ghost style `bg-[#f7f6f3] hover:bg-[#eff4ff]`) | right: "Review Claim" black primary, `disabled={!canReview}`, title `stepBlockers(3) || undefined`.

**Step 3** (`wizardStep === 3`): header "Review & Complete" / subtitle "Verify every detail before deducting stock." Body (adapted from deleted ConfirmDispensingModal):
- claimed orange warning (if `selectedClaimed`)
- Patient summary card (eyebrow "Patient", name/code/age/gender/facility)
- Tiles grid `sm:grid-cols-2`: "Dispensed By" = profile name + role; "Total Units" = cartSummary totals + "{cartLines.length} medicine line(s)"
- FEFO table identical to modal's (medicine / batches / qty)
- Footer: Back ghost | "Complete Dispensing" mint primary `bg-[#00a36c] hover:bg-[#008f68]` with CheckIcon, `disabled={!canComplete || isSaving}`.

### 4h. Cleanup checks
No remaining references to: `TypeChips`, `ConfirmDispensingModal`, `showConfirmModal`, `openConfirm`, sticky bottom bar. `PillIcon`, `CheckIcon`, `XIcon`, `Input`, `Field`, `Textarea`, badges all still used elsewhere — imports stay.

## 5. Verification
1. `npm run lint`
2. `npm test` (expect 122 pass: 121 + 1 new)
3. `npm run build`
