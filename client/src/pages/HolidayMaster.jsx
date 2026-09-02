import React, { useState, useEffect, useContext } from "react";
import { Pencil, Trash2, CalendarOff, Plus, X, Repeat } from "lucide-react";
import { toast as toastify } from "react-toastify";
import { useAlert } from "../context/AlertContext";
import { MenuContext } from "../context/MenuContext";
import DeleteModal from "../Components/Common/DeleteModal";
import DatePicker from "../Components/Common/DatePicker";
import { useInvalidateCompanyHolidays } from "../hooks/useCompanyHolidays";
import {
  getCompanyHolidays,
  createCompanyHoliday,
  updateCompanyHoliday,
  deleteCompanyHoliday,
} from "../api/companyHolidays.api";

const NAME_MAX = 100;

const toDateStr = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// Recurring-yearly holidays only ever display month/day — the year on the
// stored `date` is just whatever year it was first entered in, so showing
// it back would misleadingly read as "only applies in that year".
const formatHolidayDate = (v, isRecurringYearly) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", isRecurringYearly
    ? { day: "2-digit", month: "long", timeZone: "UTC" }
    : { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};

const INIT = { name: "", date: "", isRecurringYearly: false };

const validate = (v) => {
  const e = {};
  if (!v.name || !v.name.trim()) e.name = "Name is required";
  else if (v.name.trim().length > NAME_MAX) e.name = `Name must be ${NAME_MAX} characters or fewer`;
  if (!v.date) e.date = "Date is required";
  return e;
};

// ── Add / Edit Modal ──────────────────────────────────────────────────────
const HolidayModal = ({ mode, initialValues, onClose, onSaved }) => {
  const toast = useAlert() || toastify;
  const [v, setV] = useState(initialValues);
  const [errs, setErrs] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (name, value) => setV((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate(v);
    setErrs(errors);
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), date: v.date, isRecurringYearly: v.isRecurringYearly };
      if (mode === "add") {
        await createCompanyHoliday(payload);
        toast.success?.("Holiday added!");
      } else {
        await updateCompanyHoliday(initialValues._id, payload);
        toast.success?.("Holiday updated!");
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save";
      const apiErrs = err.response?.data?.errors;
      if (apiErrs) setErrs((prev) => ({ ...prev, ...apiErrs }));
      toast.error?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const err = (name) => submitted && errs[name] ? <p className="text-xs text-red-500 mt-1">{errs[name]}</p> : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === "add" ? "Add Holiday" : "Edit Holiday"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={NAME_MAX}
              placeholder="e.g. Independence Day"
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-shadow ${
                submitted && errs.name
                  ? "border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/15"
                  : "border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              }`}
            />
            {err("name")}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <DatePicker value={v.date} onChange={(e) => set("date", e.target.value)} hasError={submitted && !!errs.date} />
            {err("date")}
          </div>

          {/* Repeats every year */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="holiday_recurring"
              checked={v.isRecurringYearly}
              onChange={(e) => set("isRecurringYearly", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="holiday_recurring" className="text-sm text-slate-700 select-none cursor-pointer">
              Repeats every year
            </label>
          </div>
          <p className="text-xs text-slate-400 -mt-3">
            {v.isRecurringYearly
              ? "Falls on the same date every year (e.g. a national holiday)."
              : "Untick for a one-off day (e.g. a specific plant shutdown)."}
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-2.5 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2.5 shadow-sm disabled:opacity-70">
              {saving ? "Saving…" : mode === "add" ? "Add" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────
const HolidayMaster = () => {
  const toast = useAlert() || toastify;
  const { currentPagePermissions = { read: true, write: true, edit: true, delete: true } } =
    useContext(MenuContext) || {};
  const invalidateHolidays = useInvalidateCompanyHolidays();

  const [holidays, setHolidays] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const fetchHolidays = () => {
    setIsLoading(true);
    getCompanyHolidays()
      .then((res) => setHolidays(res.data?.data || []))
      .catch(() => toast.error?.("Failed to load holidays"))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchHolidays(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openEdit = (h) => {
    setEditItem({ _id: h._id, name: h.name, date: toDateStr(h.date), isRecurringYearly: !!h.isRecurringYearly });
  };

  const handleDelete = (e) => {
    e.preventDefault();
    setIsDeleteLoading(true);
    deleteCompanyHoliday(deleteId)
      .then(() => { setDeleteId(null); toast.success?.("Removed!"); fetchHolidays(); invalidateHolidays(); })
      .catch(() => { setDeleteId(null); toast.error?.("Failed to delete"); })
      .finally(() => setIsDeleteLoading(false));
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarOff className="w-5 h-5 text-brand-600" />
          <h1 className="text-lg font-semibold text-slate-900">Holiday Master</h1>
        </div>
        {currentPagePermissions.create && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500 mb-5">
        Days added here extend the Grinding Data Entry edit window by one more day, the same way the weekly Tuesday off-day already does — an entry never locks out just because a holiday fell inside its 2-working-day window.
      </p>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-left">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Name</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Date</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Type</th>
              <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {isLoading ? "Loading…" : "No holidays configured yet. Click 'Add Holiday' to create one."}
                </td>
              </tr>
            )}
            {holidays.map((h) => (
              <tr key={h._id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">{h.name}</td>
                <td className="px-4 py-3 text-slate-600">{formatHolidayDate(h.date, h.isRecurringYearly)}</td>
                <td className="px-4 py-3">
                  {h.isRecurringYearly ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700">
                      <Repeat className="w-3 h-3" /> Every year
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                      One-off
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {currentPagePermissions.edit && (
                      <button onClick={() => openEdit(h)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {currentPagePermissions.delete && (
                      <button onClick={() => setDeleteId(h._id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <HolidayModal mode="add" initialValues={INIT}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchHolidays(); invalidateHolidays(); }} />
      )}
      {editItem && (
        <HolidayModal mode="edit" initialValues={editItem}
          onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); fetchHolidays(); invalidateHolidays(); }} />
      )}
      <DeleteModal show={!!deleteId} toggle={() => setDeleteId(null)}
        handleDelete={handleDelete} disabled={isDeleteLoading} />
    </div>
  );
};

export default HolidayMaster;
