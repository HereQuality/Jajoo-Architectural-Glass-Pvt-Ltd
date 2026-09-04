import React, { useState, useEffect, useContext } from "react";
import { Pencil, Trash2, CalendarOff, CalendarDays, Plus, Repeat, Loader2 } from "lucide-react";
import { toast as toastify } from "react-toastify";
import { useAlert } from "../context/AlertContext";
import { MenuContext } from "../context/MenuContext";
import DeleteModal from "../Components/Common/DeleteModal";
import DatePicker from "../Components/Common/DatePicker";
import { useInvalidateCompanyHolidays } from "../hooks/useCompanyHolidays";
import { useCompanySettings, useInvalidateCompanySettings } from "../hooks/useCompanySettings";
import {
  getCompanyHolidays,
  createCompanyHoliday,
  updateCompanyHoliday,
  deleteCompanyHoliday,
} from "../api/companyHolidays.api";
import { updateWeeklyOffDays } from "../api/companySettings.api";

const NAME_MAX = 100;

// Date#getDay() values: 0=Sun..6=Sat, listed Mon-first to match the page.
const WEEK_DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

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

// ── Weekly Off ────────────────────────────────────────────────────────────
const WeeklyOffCard = ({ canEdit }) => {
  const toast = useAlert() || toastify;
  const { data: settings } = useCompanySettings();
  const invalidateSettings = useInvalidateCompanySettings();
  const [savingDay, setSavingDay] = useState(null);
  const selected = settings?.weeklyOffDays ?? [2];

  const toggleDay = async (day) => {
    if (!canEdit || savingDay != null) return;
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
    setSavingDay(day);
    try {
      await updateWeeklyOffDays(next);
      invalidateSettings();
    } catch (err) {
      toast.error?.(err.response?.data?.message || "Failed to update weekly off");
    } finally {
      setSavingDay(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <CalendarDays className="w-[18px] h-[18px] text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Weekly Off</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Day(s) the company doesn't operate at all, every week — extends the Grinding Data Entry edit window the same way a holiday does.
      </p>
      <div className="flex flex-wrap gap-2">
        {WEEK_DAYS.map((d) => {
          const isActive = selected.includes(d.value);
          const isSaving = savingDay === d.value;
          return (
            <button
              key={d.value}
              type="button"
              disabled={!canEdit || savingDay != null}
              onClick={() => toggleDay(d.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                isActive
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
              } ${savingDay != null && !isSaving ? "opacity-60" : ""}`}
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Add / Edit Holiday (inline card, not a modal) ────────────────────────
const AddHolidayCard = ({ editItem, onCancelEdit, onSaved, canEdit }) => {
  const toast = useAlert() || toastify;
  const isEditing = !!editItem;
  const [v, setV] = useState(editItem || INIT);
  const [errs, setErrs] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setV(editItem || INIT);
    setErrs({});
    setSubmitted(false);
  }, [editItem]);

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
      if (isEditing) {
        await updateCompanyHoliday(editItem._id, payload);
        toast.success?.("Holiday updated!");
      } else {
        await createCompanyHoliday(payload);
        toast.success?.("Holiday added!");
      }
      // Save keeps the form ready for the next one — name, date, tab, Save,
      // repeat — instead of closing a modal you'd have to reopen each time.
      setV(INIT);
      setErrs({});
      setSubmitted(false);
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

  if (!canEdit) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <CalendarOff className="w-[18px] h-[18px] text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-900">{isEditing ? "Edit Holiday" : "Add Holiday"}</h2>
        </div>
        {isEditing && (
          <button type="button" onClick={onCancelEdit} className="text-xs font-medium text-slate-500 hover:text-slate-700">
            Cancel edit
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
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

          <div className="w-full sm:w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <DatePicker value={v.date} onChange={(e) => set("date", e.target.value)} hasError={submitted && !!errs.date} />
            {err("date")}
          </div>

          <div className="flex items-center gap-2 pb-2.5">
            <input
              type="checkbox"
              id="holiday_recurring"
              checked={v.isRecurringYearly}
              onChange={(e) => set("isRecurringYearly", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="holiday_recurring" className="text-sm text-slate-700 select-none cursor-pointer whitespace-nowrap">
              Repeats every year
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-5 py-2.5 shadow-sm disabled:opacity-70 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {saving ? "Saving…" : isEditing ? "Update" : "Save"}
          </button>
        </div>
      </form>

      {!isEditing && (
        <p className="text-xs text-slate-400 mt-3">
          Save keeps this ready for the next one — name, date, tab, Save, repeat.
        </p>
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────
const HolidayMaster = () => {
  const toast = useAlert() || toastify;
  const { currentPagePermissions = { read: true, create: true, edit: true, delete: true } } =
    useContext(MenuContext) || {};
  const invalidateHolidays = useInvalidateCompanyHolidays();

  const [holidays, setHolidays] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

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

  const canEdit = !!currentPagePermissions.create;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
            <CalendarOff className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Company Holidays</h1>
            <p className="text-sm text-slate-500">
              Weekly off + specific dates — the Grinding Data Entry edit window automatically extends around these.
            </p>
          </div>
        </div>
      </div>

      <WeeklyOffCard canEdit={canEdit} />

      <AddHolidayCard
        editItem={editItem}
        canEdit={canEdit}
        onCancelEdit={() => setEditItem(null)}
        onSaved={() => { setEditItem(null); fetchHolidays(); invalidateHolidays(); }}
      />

      {/* List */}
      {holidays.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center text-slate-400 text-sm">
          {isLoading ? "Loading…" : "No holidays configured yet. Add one above."}
        </div>
      ) : (
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
      )}

      <DeleteModal show={!!deleteId} toggle={() => setDeleteId(null)}
        handleDelete={handleDelete} disabled={isDeleteLoading} />
    </div>
  );
};

export default HolidayMaster;
