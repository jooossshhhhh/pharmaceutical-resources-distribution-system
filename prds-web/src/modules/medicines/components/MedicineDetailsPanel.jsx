import { formatCurrency } from "../medicineUtils";
import { EyeIcon, PencilIcon, XIcon } from "./MedicineIcons";

export default function MedicineDetailsPanel({ medicine, onBack, onEdit, onView }) {
  return (
    <aside className="min-w-0 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm prds-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Selected Medicine
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-black">
            {medicine.generic_name || "Unnamed medicine"}
          </h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            {medicine.brand_name || "Generic medicine"}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          title="Back to list"
          aria-label="Back to list"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition hover:bg-neutral-50 hover:text-black"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
          {medicine.unit_of_measure || "No unit"}
        </span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
          {medicine.dosage || "No dosage"}
        </span>
      </div>

      <div className="mt-6 grid gap-3">
        <DetailRow label="Medicine" value={medicine.generic_name} />
        <DetailRow label="Brand" value={medicine.brand_name || "Generic"} />
        <DetailRow label="Dosage" value={medicine.dosage} />
        <DetailRow label="Unit" value={medicine.unit_of_measure} />
        <DetailRow label="Unit Cost" value={formatCurrency(medicine.unit_cost)} />
      </div>

      <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-50 p-4">
        <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
          Catalog Use
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-neutral-600">
          This record defines the medicine used by inventory, requests, transfers, and
          dispensing records.
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onView}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 text-sm font-black text-neutral-700 transition hover:bg-neutral-50"
        >
          <EyeIcon />
          View
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-black text-white transition hover:bg-emerald-700"
        >
          <PencilIcon />
          Edit
        </button>
      </div>
    </aside>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-4 py-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-black text-black">{value || "Not set"}</p>
    </div>
  );
}
