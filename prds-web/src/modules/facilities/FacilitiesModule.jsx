import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const facilityTypes = [
  { value: "CHO", label: "Central Health Office" },
  { value: "HEALTH_CENTER", label: "Health Center" },
];

const facilityStatuses = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const emptyForm = {
  facility_name: "",
  facility_code: "",
  facility_type: "HEALTH_CENTER",
  address: "",
  status: "ACTIVE",
};

const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatFacilityType = (type) => {
  return facilityTypes.find((item) => item.value === type)?.label || type;
};

const getStatusClass = (status) => {
  return status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-slate-100 text-slate-600 ring-slate-200";
};

export default function FacilitiesModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [facilityError, setFacilityError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const filteredFacilities = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return facilities.filter((facility) => {
      const matchesSearch =
        !normalizedSearch ||
        facility.facility_name.toLowerCase().includes(normalizedSearch) ||
        facility.facility_code.toLowerCase().includes(normalizedSearch) ||
        facility.address.toLowerCase().includes(normalizedSearch);
      const matchesType =
        typeFilter === "ALL" || facility.facility_type === typeFilter;
      const matchesStatus =
        statusFilter === "ALL" || facility.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [facilities, searchTerm, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    return facilities.reduce(
      (counts, facility) => {
        counts.total += 1;
        counts.active += facility.status === "ACTIVE" ? 1 : 0;
        counts.inactive += facility.status === "INACTIVE" ? 1 : 0;
        counts.healthCenters += facility.facility_type === "HEALTH_CENTER" ? 1 : 0;
        counts.cho += facility.facility_type === "CHO" ? 1 : 0;
        return counts;
      },
      { total: 0, active: 0, inactive: 0, healthCenters: 0, cho: 0 }
    );
  }, [facilities]);

  const loadFacilities = async () => {
    setIsLoading(true);
    setFacilityError("");

    const { data, error } = await supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type, address, status")
      .order("facility_name", { ascending: true });

    if (error) {
      setFacilityError(error.message);
      setIsLoading(false);
      return;
    }

    setFacilities(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadFacilities();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const openCreateModal = () => {
    setEditingFacility(null);
    setFormValues(emptyForm);
    setFacilityError("");
    setIsModalOpen(true);
  };

  const openEditModal = (facility) => {
    setEditingFacility(facility);
    setFormValues({
      facility_name: facility.facility_name,
      facility_code: facility.facility_code,
      facility_type: facility.facility_type,
      address: facility.address,
      status: facility.status,
    });
    setFacilityError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingFacility(null);
    setFormValues(emptyForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: name === "facility_code" ? value.toUpperCase() : value,
    }));
  };

  const validateForm = () => {
    if (!formValues.facility_name.trim()) {
      return "Facility name is required.";
    }

    if (!formValues.facility_code.trim()) {
      return "Facility code is required.";
    }

    if (!formValues.address.trim()) {
      return "Address is required.";
    }

    return "";
  };

  const handleSaveFacility = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setFacilityError(validationError);
      return;
    }

    setIsSaving(true);
    setFacilityError("");

    const payload = {
      facility_name: formValues.facility_name.trim(),
      facility_code: formValues.facility_code.trim(),
      facility_type: formValues.facility_type,
      address: formValues.address.trim(),
      status: formValues.status,
    };

    const request = editingFacility
      ? supabase.from("facilities").update(payload).eq("id", editingFacility.id)
      : supabase.from("facilities").insert(payload);

    const { error } = await request;

    if (error) {
      setFacilityError(error.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    await loadFacilities();
  };

  const handleStatusToggle = async (facility) => {
    const nextStatus = facility.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setFacilityError("");

    const { error } = await supabase
      .from("facilities")
      .update({ status: nextStatus })
      .eq("id", facility.id);

    if (error) {
      setFacilityError(error.message);
      return;
    }

    await loadFacilities();
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Core Module
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Facilities
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Maintain health offices, health centers, and facility access records.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
        >
          Add Facility
        </button>
      </div>

      {facilityError && !isModalOpen && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {facilityError}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Total Facilities" value={summary.total} tone="emerald" />
        <SummaryCard label="Active Facilities" value={summary.active} tone="blue" />
        <SummaryCard label="Health Centers" value={summary.healthCenters} tone="amber" />
        <SummaryCard label="Inactive" value={summary.inactive} tone="slate" />
      </div>

      <section className="mt-4 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Facility Directory</h3>
            <p className="text-xs font-semibold text-slate-500">
              {filteredFacilities.length} shown from {facilities.length} records
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, code, address"
              className="h-10 w-64 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">All types</option>
              {facilityTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="ALL">All statuses</option>
              {facilityStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="6">
                    Loading facilities...
                  </td>
                </tr>
              ) : filteredFacilities.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center font-bold text-slate-500" colSpan="6">
                    No facilities match the current filters.
                  </td>
                </tr>
              ) : (
                filteredFacilities.map((facility) => (
                  <tr key={facility.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-xs font-black text-emerald-700">
                          {facility.facility_name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-black text-slate-950">
                            {facility.facility_name}
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            Facility ID: {facility.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-700">
                      {facility.facility_code}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-600">
                      {formatFacilityType(facility.facility_type)}
                    </td>
                    <td className="max-w-xs px-4 py-4 font-medium text-slate-600">
                      {facility.address}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${getStatusClass(facility.status)}`}>
                        {facility.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(facility)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(facility)}
                          className="rounded-md border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          {facility.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form
            onSubmit={handleSaveFacility}
            className="w-full max-w-2xl rounded-md bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 px-6 py-5">
              <h3 className="text-xl font-black text-slate-950">
                {editingFacility ? "Edit Facility" : "Add Facility"}
              </h3>
              <p className="text-sm font-semibold text-slate-500">
                Use the fields defined by the facilities database schema.
              </p>
            </div>

            <div className="grid gap-4 px-6 py-5">
              {facilityError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {facilityError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Facility Name
                  <input
                    name="facility_name"
                    value={formValues.facility_name}
                    onChange={handleFieldChange}
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Facility Code
                  <input
                    name="facility_code"
                    value={formValues.facility_code}
                    onChange={handleFieldChange}
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Facility Type
                  <select
                    name="facility_type"
                    value={formValues.facility_type}
                    onChange={handleFieldChange}
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    {facilityTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Status
                  <select
                    name="status"
                    value={formValues.status}
                    onChange={handleFieldChange}
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  >
                    {facilityStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Address
                <textarea
                  name="address"
                  value={formValues.address}
                  onChange={handleFieldChange}
                  rows="3"
                  className="resize-none rounded-md border border-slate-200 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isSaving ? "Saving..." : "Save Facility"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}

function SummaryCard({ label, value, tone }) {
  const toneClasses = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-white text-slate-700",
  };

  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
