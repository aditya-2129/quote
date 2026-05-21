import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  Bug,
  Building2,
  Check,
  ClipboardCopy,
  FileText,
  FolderOpen,
  History,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAllSettings, setSetting } from "../db/queries";
import type { AppSettingKey } from "../db/schema";
import { isTauriRuntime } from "../utils/tauriRuntime";
import { getLatestCrashReportText, openCrashReportsFolder, writeTestRustCrashReport, openLogsFolder } from "../utils/crashReports";

type SettingsForm = {
  unitSystem: "metric" | "imperial";
  currency: string;
  defaultMarginPct: string;
  defaultTaxPct: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstn: string;
  companyState: string;
  companyStateCode: string;
  companyTagline: string;
  companyContactPerson: string;
  companyContactPhone: string;
  companyContactEmail: string;
  companyLogoPath: string;
  quoteNotesDefault: string;
  quoteTerms: string;
  recentFilesLimit: string;
};

type SettingsSection = "general" | "company" | "quotation" | "history" | "diagnostics";

const DEFAULT_FORM: SettingsForm = {
  unitSystem: "metric",
  currency: "INR",
  defaultMarginPct: "20",
  defaultTaxPct: "18",
  companyName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyGstn: "",
  companyState: "",
  companyStateCode: "",
  companyTagline: "",
  companyContactPerson: "",
  companyContactPhone: "",
  companyContactEmail: "",
  companyLogoPath: "",
  quoteNotesDefault: "",
  quoteTerms: "",
  recentFilesLimit: "10",
};

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

const SETTINGS_NAV = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "company", label: "Company", icon: Building2 },
  { id: "quotation", label: "Quotation", icon: FileText },
  { id: "history", label: "Recent files", icon: History },
  { id: "diagnostics", label: "Diagnostics", icon: Bug },
] satisfies Array<{ id: SettingsSection; label: string; icon: LucideIcon }>;

function stringSetting(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberSetting(value: unknown, fallback: string) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function unitSystemSetting(value: unknown): SettingsForm["unitSystem"] {
  return value === "imperial" ? "imperial" : "metric";
}

function formFromSettings(settings: Partial<Record<AppSettingKey, unknown>>): SettingsForm {
  return {
    unitSystem: unitSystemSetting(settings.unit_system),
    currency: stringSetting(settings.currency, DEFAULT_FORM.currency),
    defaultMarginPct: numberSetting(settings.default_margin_pct, DEFAULT_FORM.defaultMarginPct),
    defaultTaxPct: numberSetting(settings.default_tax_pct, DEFAULT_FORM.defaultTaxPct),
    companyName: stringSetting(settings.company_name),
    companyAddress: stringSetting(settings.company_address),
    companyPhone: stringSetting(settings.company_phone),
    companyEmail: stringSetting(settings.company_email),
    companyGstn: stringSetting(settings.company_gstn),
    companyState: stringSetting(settings.company_state),
    companyStateCode: stringSetting(settings.company_state_code),
    companyTagline: stringSetting(settings.company_tagline),
    companyContactPerson: stringSetting(settings.company_contact_person),
    companyContactPhone: stringSetting(settings.company_contact_phone),
    companyContactEmail: stringSetting(settings.company_contact_email),
    companyLogoPath: stringSetting(settings.company_logo_path),
    quoteNotesDefault: stringSetting(settings.quote_notes_default),
    quoteTerms: stringSetting(settings.quote_terms),
    recentFilesLimit: numberSetting(settings.recent_files_limit, DEFAULT_FORM.recentFilesLimit),
  };
}

function validatePercent(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return `${label} must be between 0 and 100.`;
  return "";
}

function validatePositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return `${label} must be a whole number above 0.`;
  return "";
}

function validateEmail(value: string, label: string) {
  if (!value.trim()) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return `${label} must be a valid email address (e.g. name@company.com).`;
  }
  return "";
}

function validatePhone(value: string, label: string) {
  if (!value.trim()) return "";
  const cleaned = value.replace(/[\s\-()+]/g, "");
  if (!/^\d{10}$/.test(cleaned)) {
    return `${label} must be exactly 10 digits.`;
  }
  return "";
}

function validateGstn(value: string) {
  if (!value.trim()) return "";
  const gstnRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/i;
  if (!gstnRegex.test(value.trim())) {
    return "GSTN must be a valid 15-digit GSTIN (e.g. 27AAAAA1111A1Z1).";
  }
  return "";
}

function validateStateCode(value: string) {
  if (!value.trim()) return "";
  if (!/^\d{2}$/.test(value.trim())) {
    return "State code must be a 2-digit number.";
  }
  return "";
}

async function validateLogoPath(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";

  if (isTauriRuntime()) {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      await readFile(cleaned);
      return "";
    } catch {
      return "Logo file does not exist or is not readable. Please choose a new file.";
    }
  }

  return "";
}

function validateGstnAndStateCode(gstn: string, stateCode: string) {
  if (!gstn.trim() || !stateCode.trim()) return "";
  const gstnPrefix = gstn.trim().substring(0, 2);
  if (gstnPrefix !== stateCode.trim()) {
    return `State code (${stateCode.trim()}) must match the first 2 digits of GSTN (${gstnPrefix}).`;
  }
  return "";
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [savedForm, setSavedForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsForm, string>>>({});
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const visibleNav = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SETTINGS_NAV;
    return SETTINGS_NAV.filter((item) => item.label.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    let active = true;

    getAllSettings()
      .then((settings) => {
        if (!active) return;
        const next = formFromSettings(settings);
        setForm(next);
        setSavedForm(next);
        setError("");
        setErrors({});
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const set = (patch: Partial<SettingsForm>) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, ...patch }));
    
    // Auto-clear errors on fields that are being edited
    setErrors((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(patch) as Array<keyof SettingsForm>) {
        if (next[key]) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/quotes");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();

    const errs: Partial<Record<keyof SettingsForm, string>> = {};

    // General Settings
    const marginErr = validatePercent(form.defaultMarginPct, "Default margin");
    if (marginErr) errs.defaultMarginPct = marginErr;

    const taxErr = validatePercent(form.defaultTaxPct, "Default tax");
    if (taxErr) errs.defaultTaxPct = taxErr;

    // Recent Files
    const limitErr = validatePositiveInteger(form.recentFilesLimit, "Recent files limit");
    if (limitErr) errs.recentFilesLimit = limitErr;

    // Company Emails
    const emailErr = validateEmail(form.companyEmail, "Company email");
    if (emailErr) errs.companyEmail = emailErr;

    const contactEmailErr = validateEmail(form.companyContactEmail, "Contact email");
    if (contactEmailErr) errs.companyContactEmail = contactEmailErr;

    // Phones
    const phoneErr = validatePhone(form.companyPhone, "Company phone");
    if (phoneErr) errs.companyPhone = phoneErr;

    const contactPhoneErr = validatePhone(form.companyContactPhone, "Contact phone");
    if (contactPhoneErr) errs.companyContactPhone = contactPhoneErr;

    // GSTN
    const gstnErr = validateGstn(form.companyGstn);
    if (gstnErr) errs.companyGstn = gstnErr;

    // State Code
    const stateCodeErr = validateStateCode(form.companyStateCode);
    if (stateCodeErr) errs.companyStateCode = stateCodeErr;

    // Joint check between GSTN and State Code
    if (!gstnErr && !stateCodeErr) {
      const mismatchErr = validateGstnAndStateCode(form.companyGstn, form.companyStateCode);
      if (mismatchErr) {
        errs.companyStateCode = mismatchErr;
      }
    }

    // Logo Path
    const logoErr = await validateLogoPath(form.companyLogoPath);
    if (logoErr) errs.companyLogoPath = logoErr;

    if (Object.keys(errs).length > 0) {
      setErrors(errs);

      // Switch to the first section that contains a validation error
      const firstErrorKey = Object.keys(errs)[0] as keyof SettingsForm;
      let targetSection: SettingsSection = "general";
      if (
        [
          "companyName",
          "companyAddress",
          "companyPhone",
          "companyEmail",
          "companyGstn",
          "companyState",
          "companyStateCode",
          "companyTagline",
          "companyContactPerson",
          "companyContactPhone",
          "companyContactEmail",
          "companyLogoPath",
        ].includes(firstErrorKey)
      ) {
        targetSection = "company";
      } else if (["recentFilesLimit"].includes(firstErrorKey)) {
        targetSection = "history";
      } else if (["defaultMarginPct", "defaultTaxPct"].includes(firstErrorKey)) {
        targetSection = "general";
      }

      setActiveSection(targetSection);
      setError(errs[firstErrorKey] || "Please fix validation errors.");
      setTimeout(() => {
        const element = document.getElementById(firstErrorKey);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.focus();
        }
      }, 100);
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const next: SettingsForm = {
        ...form,
        currency: form.currency.trim().toUpperCase(),
        companyName: form.companyName.trim(),
        companyAddress: form.companyAddress.trim(),
        companyPhone: form.companyPhone.trim(),
        companyEmail: form.companyEmail.trim(),
        companyGstn: form.companyGstn.trim().toUpperCase(),
        companyState: form.companyState.trim(),
        companyStateCode: form.companyStateCode.trim(),
        companyTagline: form.companyTagline.trim(),
        companyContactPerson: form.companyContactPerson.trim(),
        companyContactPhone: form.companyContactPhone.trim(),
        companyContactEmail: form.companyContactEmail.trim(),
        companyLogoPath: form.companyLogoPath.trim(),
        quoteNotesDefault: form.quoteNotesDefault.trim(),
        quoteTerms: form.quoteTerms.trim(),
      };

      await Promise.all([
        setSetting("unit_system", next.unitSystem),
        setSetting("currency", next.currency),
        setSetting("default_margin_pct", Number(next.defaultMarginPct)),
        setSetting("default_tax_pct", Number(next.defaultTaxPct)),
        setSetting("company_name", next.companyName),
        setSetting("company_address", next.companyAddress),
        setSetting("company_phone", next.companyPhone),
        setSetting("company_email", next.companyEmail),
        setSetting("company_gstn", next.companyGstn),
        setSetting("company_state", next.companyState),
        setSetting("company_state_code", next.companyStateCode),
        setSetting("company_tagline", next.companyTagline),
        setSetting("company_contact_person", next.companyContactPerson),
        setSetting("company_contact_phone", next.companyContactPhone),
        setSetting("company_contact_email", next.companyContactEmail),
        setSetting("company_logo_path", next.companyLogoPath),
        setSetting("quote_notes_default", next.quoteNotesDefault),
        setSetting("quote_terms", next.quoteTerms),
        setSetting("recent_files_limit", Number(next.recentFilesLimit)),
      ]);
      setForm(next);
      setSavedForm(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-page" onSubmit={save}>
      <div className="settings-top">
        <div className="settings-title-row">
          <h1>Settings</h1>
          <span className={`settings-state ${dirty ? "dirty" : saved ? "saved" : ""}`}>
            {saving ? "Saving..." : dirty ? "Unsaved changes" : saved ? "Saved" : "Application defaults"}
          </span>
        </div>
        <button className="settings-close" type="button" onClick={close} title="Close settings" aria-label="Close settings">
          <X size={18} />
        </button>
      </div>

      <div className="settings-body">
        <aside className="settings-nav">
          <label className="settings-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings" />
          </label>
          <nav>
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item ${active ? "active" : ""}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="settings-content">
          {error && (
            <div className="quote-page-error">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="empty">Loading settings...</div>
          ) : (
            <>
              {activeSection === "general" && <GeneralSettings form={form} set={set} errors={errors} />}
              {activeSection === "company" && <CompanySettings form={form} set={set} errors={errors} />}
              {activeSection === "quotation" && <QuotationSettings form={form} set={set} />}
              {activeSection === "history" && <HistorySettings form={form} set={set} errors={errors} />}
              {activeSection === "diagnostics" && <DiagnosticsSettings />}
            </>
          )}
        </main>
      </div>

      <div className="settings-footer">
        <button className="btn sm" type="button" onClick={close}>Close</button>
        <button className="btn primary sm" type="submit" disabled={loading || saving || !dirty}>
          {saved && !dirty ? <Check size={14} /> : <Save size={14} />}
          Apply
        </button>
      </div>
    </form>
  );
}

function GeneralSettings({
  form,
  set,
  errors,
}: {
  form: SettingsForm;
  set: (patch: Partial<SettingsForm>) => void;
  errors: Partial<Record<keyof SettingsForm, string>>;
}) {
  return (
    <section className="settings-pane">
      <h2>General</h2>
      <div className="settings-group">
        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Unit system for new quotes</div>
            <div className="settings-control-help">Controls stock dimensions, geometry units, and default quote inputs.</div>
          </div>
          <div className="settings-radio-group">
            <label><input type="radio" checked={form.unitSystem === "metric"} onChange={() => set({ unitSystem: "metric" })} />Metric</label>
            <label><input type="radio" checked={form.unitSystem === "imperial"} onChange={() => set({ unitSystem: "imperial" })} />Imperial</label>
          </div>
        </div>

        <label className="settings-control-row">
          <div>
            <div className="settings-control-title">Currency</div>
            <div className="settings-control-help">Default currency for quotations and catalog costs.</div>
          </div>
          <select value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </label>

        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Default margin</div>
            <div className="settings-control-help">Applied to new quote costing unless changed on the quote.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div className="settings-number">
              <input
                id="defaultMarginPct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.defaultMarginPct}
                onChange={(e) => set({ defaultMarginPct: e.target.value })}
                style={errors.defaultMarginPct ? { borderColor: "var(--danger)" } : undefined}
              />
              <span>%</span>
            </div>
            {errors.defaultMarginPct && <span className="field-error">{errors.defaultMarginPct}</span>}
          </div>
        </div>

        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Default tax</div>
            <div className="settings-control-help">Applied after subtotal and margin for new quotes.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div className="settings-number">
              <input
                id="defaultTaxPct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.defaultTaxPct}
                onChange={(e) => set({ defaultTaxPct: e.target.value })}
                style={errors.defaultTaxPct ? { borderColor: "var(--danger)" } : undefined}
              />
              <span>%</span>
            </div>
            {errors.defaultTaxPct && <span className="field-error">{errors.defaultTaxPct}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function CompanySettings({
  form,
  set,
  errors,
}: {
  form: SettingsForm;
  set: (patch: Partial<SettingsForm>) => void;
  errors: Partial<Record<keyof SettingsForm, string>>;
}) {
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const importLogoFile = async (sourcePath: string) => {
    const { readFile, writeFile, mkdir, remove, readDir } = await import("@tauri-apps/plugin-fs");
    const { appDataDir, join } = await import("@tauri-apps/api/path");

    const ext = sourcePath.toLowerCase().endsWith(".png") ? "png" : "jpg";
    const bytes = await readFile(sourcePath);

    const brandingDir = await join(await appDataDir(), "branding");
    try {
      await mkdir(brandingDir, { recursive: true });
    } catch {
      /* already exists */
    }

    try {
      const entries = await readDir(brandingDir);
      for (const entry of entries) {
        if (entry.name && /^logo\.(png|jpe?g)$/i.test(entry.name)) {
          await remove(await join(brandingDir, entry.name));
        }
      }
    } catch {
      /* nothing to clean */
    }

    const target = await join(brandingDir, `logo.${ext}`);
    await writeFile(target, bytes);
    return target;
  };

  const removeManagedLogo = async (path: string) => {
    if (!path) return;
    try {
      const { remove } = await import("@tauri-apps/plugin-fs");
      const { appDataDir, join } = await import("@tauri-apps/api/path");
      const brandingDir = await join(await appDataDir(), "branding");
      const normalized = path.replace(/\\/g, "/");
      if (!normalized.toLowerCase().startsWith(brandingDir.replace(/\\/g, "/").toLowerCase())) return;
      await remove(path);
    } catch {
      /* file already gone */
    }
  };

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      const path = form.companyLogoPath.trim();
      if (!path) {
        if (active) setLogoPreview(null);
        return;
      }

      if (path.startsWith("data:") || /^https?:\/\//i.test(path)) {
        if (active) setLogoPreview(path);
        return;
      }

      // Local file in Tauri
      if (isTauriRuntime()) {
        try {
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const bytes = await readFile(path);
          const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          const blob = new Blob([bytes], { type: mime });
          objectUrl = URL.createObjectURL(blob);
          if (active) setLogoPreview(objectUrl);
        } catch {
          if (active) setLogoPreview(null);
        }
      } else {
        if (active) setLogoPreview(null);
      }
    };

    loadPreview();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [form.companyLogoPath]);

  return (
    <section className="settings-pane">
      <h2>Company</h2>
      <div className="settings-group">
        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Company name</div>
            <div className="settings-control-help">Shown on exported quotation documents.</div>
          </div>
          <input
            id="companyName"
            value={form.companyName}
            onChange={(e) => set({ companyName: e.target.value })}
            style={errors.companyName ? { borderColor: "var(--danger)" } : undefined}
          />
          {errors.companyName && <span className="field-error">{errors.companyName}</span>}
        </label>

        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Company address</div>
            <div className="settings-control-help">Used in the quotation header and footer.</div>
          </div>
          <textarea
            id="companyAddress"
            value={form.companyAddress}
            onChange={(e) => set({ companyAddress: e.target.value })}
            rows={4}
            style={errors.companyAddress ? { borderColor: "var(--danger)" } : undefined}
          />
          {errors.companyAddress && <span className="field-error">{errors.companyAddress}</span>}
        </label>

        <div className="settings-inline-grid">
          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">Phone</div>
              <div className="settings-control-help">Main company phone.</div>
            </div>
            <input
              id="companyPhone"
              value={form.companyPhone}
              onChange={(e) => set({ companyPhone: e.target.value })}
              style={errors.companyPhone ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyPhone && <span className="field-error">{errors.companyPhone}</span>}
          </label>

          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">Email</div>
              <div className="settings-control-help">Main company email.</div>
            </div>
            <input
              id="companyEmail"
              value={form.companyEmail}
              onChange={(e) => set({ companyEmail: e.target.value })}
              style={errors.companyEmail ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyEmail && <span className="field-error">{errors.companyEmail}</span>}
          </label>
        </div>

        <div className="settings-inline-grid">
          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">GSTN</div>
              <div className="settings-control-help">Tax registration shown on PDF.</div>
            </div>
            <input
              id="companyGstn"
              value={form.companyGstn}
              onChange={(e) => set({ companyGstn: e.target.value })}
              style={errors.companyGstn ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyGstn && <span className="field-error">{errors.companyGstn}</span>}
          </label>

          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">State</div>
              <div className="settings-control-help">Company state or region.</div>
            </div>
            <input
              id="companyState"
              value={form.companyState}
              onChange={(e) => set({ companyState: e.target.value })}
              style={errors.companyState ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyState && <span className="field-error">{errors.companyState}</span>}
          </label>
        </div>

        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">State code</div>
            <div className="settings-control-help">Tax state code printed beside GSTN.</div>
          </div>
          <input
            id="companyStateCode"
            value={form.companyStateCode}
            onChange={(e) => set({ companyStateCode: e.target.value })}
            style={errors.companyStateCode ? { borderColor: "var(--danger)" } : undefined}
          />
          {errors.companyStateCode && <span className="field-error">{errors.companyStateCode}</span>}
        </label>

        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Tagline</div>
            <div className="settings-control-help">Short company description printed on quotation documents.</div>
          </div>
          <input
            id="companyTagline"
            value={form.companyTagline}
            onChange={(e) => set({ companyTagline: e.target.value })}
            style={errors.companyTagline ? { borderColor: "var(--danger)" } : undefined}
          />
          {errors.companyTagline && <span className="field-error">{errors.companyTagline}</span>}
        </label>

        <div className="settings-inline-grid">
          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">Contact person</div>
              <div className="settings-control-help">Commercial contact shown in footer.</div>
            </div>
            <input
              id="companyContactPerson"
              value={form.companyContactPerson}
              onChange={(e) => set({ companyContactPerson: e.target.value })}
              style={errors.companyContactPerson ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyContactPerson && <span className="field-error">{errors.companyContactPerson}</span>}
          </label>

          <label className="settings-control-row stacked">
            <div>
              <div className="settings-control-title">Contact phone</div>
              <div className="settings-control-help">Contact phone shown in footer.</div>
            </div>
            <input
              id="companyContactPhone"
              value={form.companyContactPhone}
              onChange={(e) => set({ companyContactPhone: e.target.value })}
              style={errors.companyContactPhone ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.companyContactPhone && <span className="field-error">{errors.companyContactPhone}</span>}
          </label>
        </div>

        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Contact email</div>
            <div className="settings-control-help">Contact email shown in footer.</div>
          </div>
          <input
            id="companyContactEmail"
            value={form.companyContactEmail}
            onChange={(e) => set({ companyContactEmail: e.target.value })}
            style={errors.companyContactEmail ? { borderColor: "var(--danger)" } : undefined}
          />
          {errors.companyContactEmail && <span className="field-error">{errors.companyContactEmail}</span>}
        </label>

        <div className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Logo</div>
            <div className="settings-control-help">Local JPG or PNG used in exports.</div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                if (!isTauriRuntime()) return;
                try {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({
                    multiple: false,
                    directory: false,
                    filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png"] }],
                  });
                  if (typeof selected !== "string") return;
                  const managed = await importLogoFile(selected);
                  set({ companyLogoPath: managed });
                } catch (err) {
                  console.error("Failed to import logo", err);
                }
              }}
              disabled={!isTauriRuntime()}
            >
              <FolderOpen size={14} /> Choose file…
            </button>
            <span
              style={{
                fontSize: "12px",
                color: form.companyLogoPath ? "var(--text)" : "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
              title={form.companyLogoPath}
            >
              {form.companyLogoPath || "No file selected"}
            </span>
            {form.companyLogoPath && (
              <button
                type="button"
                className="btn sm"
                onClick={async () => {
                  await removeManagedLogo(form.companyLogoPath);
                  set({ companyLogoPath: "" });
                }}
                aria-label="Clear logo"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {errors.companyLogoPath && <span className="field-error">{errors.companyLogoPath}</span>}
          {logoPreview && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Logo Preview:</div>
              <div style={{ 
                padding: "8px", 
                border: "1px solid var(--border-color)", 
                borderRadius: "4px", 
                backgroundColor: "var(--bg-accent)", 
                width: "fit-content",
                maxWidth: "200px",
                maxHeight: "100px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden"
              }}>
                <img 
                  src={logoPreview} 
                  alt="Logo Preview" 
                  style={{ maxWidth: "100%", maxHeight: "80px", objectFit: "contain" }} 
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QuotationSettings({ form, set }: { form: SettingsForm; set: (patch: Partial<SettingsForm>) => void }) {
  return (
    <section className="settings-pane">
      <h2>Quotation</h2>
      <div className="settings-group">
        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">Default notes</div>
            <div className="settings-control-help">Inserted into new quotations as editable starting text.</div>
          </div>
          <textarea value={form.quoteNotesDefault} onChange={(e) => set({ quoteNotesDefault: e.target.value })} rows={8} />
        </label>

        <label className="settings-control-row stacked">
          <div>
            <div className="settings-control-title">PDF terms</div>
            <div className="settings-control-help">One term per line. These are printed in the quotation terms section.</div>
          </div>
          <textarea value={form.quoteTerms} onChange={(e) => set({ quoteTerms: e.target.value })} rows={8} />
        </label>
      </div>
    </section>
  );
}

function HistorySettings({
  form,
  set,
  errors,
}: {
  form: SettingsForm;
  set: (patch: Partial<SettingsForm>) => void;
  errors: Partial<Record<keyof SettingsForm, string>>;
}) {
  return (
    <section className="settings-pane">
      <h2>Recent files</h2>
      <div className="settings-group">
        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Recent files limit</div>
            <div className="settings-control-help">Maximum files shown in recent CAD and quote history.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <input
              id="recentFilesLimit"
              className="settings-small-input"
              type="number"
              min="1"
              step="1"
              value={form.recentFilesLimit}
              onChange={(e) => set({ recentFilesLimit: e.target.value })}
              style={errors.recentFilesLimit ? { borderColor: "var(--danger)" } : undefined}
            />
            {errors.recentFilesLimit && <span className="field-error">{errors.recentFilesLimit}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagnosticsSettings() {
  const [status, setStatus] = useState("");

  const copyLatestReport = async () => {
    try {
      const report = await getLatestCrashReportText();
      if (!report) {
        setStatus("No crash reports found.");
        return;
      }
      await navigator.clipboard.writeText(report);
      setStatus("Latest crash report copied.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to copy crash report.");
    }
  };

  const openReportsFolder = async () => {
    try {
      await openCrashReportsFolder();
      setStatus("Crash reports folder opened.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to open crash reports folder.");
    }
  };

  const openLogsFolderAction = async () => {
    try {
      await openLogsFolder();
      setStatus("Application logs folder opened.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to open logs folder.");
    }
  };

  const writeTestReport = async () => {
    try {
      const path = await writeTestRustCrashReport();
      setStatus(`Test Rust crash report written: ${path}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to write test crash report.");
    }
  };

  return (
    <section className="settings-pane">
      <h2>Diagnostics</h2>
      <div className="settings-group">
        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Crash reports</div>
            <div className="settings-control-help">Reports are stored locally under the app-data folder. Nothing is uploaded automatically.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn sm" type="button" onClick={openReportsFolder} disabled={!isTauriRuntime()}>
              <FolderOpen size={14} /> Open folder
            </button>
            <button className="btn sm" type="button" onClick={copyLatestReport}>
              <ClipboardCopy size={14} /> Copy latest
            </button>
            {import.meta.env.DEV && (
              <button className="btn sm" type="button" onClick={writeTestReport} disabled={!isTauriRuntime()}>
                <Bug size={14} /> Write test report
              </button>
            )}
          </div>
        </div>

        <div className="settings-control-row">
          <div>
            <div className="settings-control-title">Application logs</div>
            <div className="settings-control-help">Logs are stored locally and rotated automatically to save disk space.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn sm" type="button" onClick={openLogsFolderAction} disabled={!isTauriRuntime()}>
              <FolderOpen size={14} /> Open logs folder
            </button>
          </div>
        </div>

        {status && (
          <div className="quote-page-error" style={{ margin: 0 }}>
            <AlertTriangle size={15} />
            <span>{status}</span>
          </div>
        )}
      </div>
    </section>
  );
}
