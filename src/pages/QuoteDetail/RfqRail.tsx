import { memo, useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { useCatalog } from "@context/CatalogContext";
import { useQuoteState } from "@context/QuoteStateContext";
import { createCustomer, getAllCustomers, getCustomerById } from "../../db/queries";
import type { Customer } from "../../db/schema";
import { exportQuotationPdf } from "@utils/export";
import { buildQuotationData, dataUrlToBytes, loadQuotationSettings } from "@utils/pdfAssembly";
import { downloadBytes } from "@utils/fileSave";
import { fmtINR } from "@utils/format";
import type { Bop, ExtraCost, Part } from "@utils/quoteTypes";
import { calculateConfiguredQuoteRollup } from "../../utils/quoteCosting";
import { ChevronDown, Check, Clock, FileText, Save, ScanLine, Send, Sliders, TriangleAlert, X, Plus } from "lucide-react";

/* ===========================================================
   Field — generic labelled input
   =========================================================== */

function Field({ label, value, unit, type = "text", onChange, grid }: {
  label: string;
  value: string | number;
  unit?: string;
  type?: string;
  onChange?: (v: string | number) => void;
  grid?: string;
}) {
  const inputId = useId();
  return (
    <div className="field" style={grid ? { gridColumn: grid } : undefined}>
      <label htmlFor={inputId}>{label}</label>
      <div className={unit ? "suffix" : undefined}>
        <input
          id={inputId}
          name={inputId}
          type={type}
          value={value}
          onChange={e => onChange?.(type === "number" ? +e.target.value || 0 : e.target.value)}
          className={type === "number" ? "num" : undefined}
          style={unit ? { paddingRight: 38 } : undefined}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

/* ===========================================================
   Customer helpers
   =========================================================== */

function customerOptionLabel(customer: Customer): string {
  const contact = customer.company && customer.company !== customer.name ? customer.name : null;
  return [customer.company || customer.name, contact].filter(Boolean).join(" - ");
}

function customerDisplayName(customer: Customer): string {
  return customer.company || customer.name;
}

/* ===========================================================
   QuoteCustomerModal — inline create-customer modal
   =========================================================== */

function QuoteCustomerModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: initialName,
    company: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const set = (patch: Partial<typeof formData>) =>
    setFormData(prev => ({ ...prev, ...patch }));
  const clearErr = (key: string) =>
    setErrors(prev => ({ ...prev, [key]: "" }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (!formData.company.trim()) e.company = "Company is required";
    if (!formData.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = "Invalid email address";
    if (!formData.phone.trim()) e.phone = "Phone is required";
    else if (!/^\d{10}$/.test(formData.phone)) e.phone = "Must be exactly 10 digits";
    return e;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaveError("");
    setIsSaving(true);
    try {
      onCreated(await createCustomer({
        name: formData.name.trim(),
        company: formData.company.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
      }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to create customer.");
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div className="title">New Customer</div>
          <button className="close" onClick={onClose} disabled={isSaving}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate autoComplete="off" data-lpignore="true" data-1p-ignore="true">
          <div className="modal-body">
            {saveError && (
              <div className="error-banner">
                <TriangleAlert size={14} />
                <span>{saveError}</span>
                <button type="button" onClick={() => setSaveError("")}><X size={12} /></button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group span-2">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={event => { set({ name: event.target.value }); clearErr("name"); }}
                  disabled={isSaving}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-group span-2">
                <label>Company *</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={event => { set({ company: event.target.value }); clearErr("company"); }}
                  disabled={isSaving}
                />
                {errors.company && <span className="field-error">{errors.company}</span>}
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={event => { set({ email: event.target.value }); clearErr("email"); }}
                  disabled={isSaving}
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>
              <div className="form-group">
                <label>Phone *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={event => { set({ phone: event.target.value.replace(/\D/g, "").slice(0, 10) }); clearErr("phone"); }}
                  maxLength={10}
                  disabled={isSaving}
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </div>
              <div className="form-group span-2">
                <label>Address</label>
                <textarea
                  value={formData.address}
                  onChange={event => set({ address: event.target.value })}
                  rows={2}
                  disabled={isSaving}
                />
              </div>
              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={event => set({ notes: event.target.value })}
                  rows={2}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn sm" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn primary sm" disabled={isSaving}>
              {isSaving ? "Saving..." : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/* ===========================================================
   CustomerField — combobox with create-inline
   =========================================================== */

function CustomerField({
  value,
  customerId,
  onChange,
}: {
  value: string;
  customerId: string | null;
  onChange: (customer: { customer: string; customerId: string | null }) => void;
}) {
  const selectId = useId();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState<string | null>(null);

  const selectedCustomer = customerId
    ? customers.find(customer => customer.id === customerId)
    : null;
  const committedLabel = selectedCustomer
    ? customerDisplayName(selectedCustomer)
    : (customerId ? value : "");
  const [draft, setDraft] = useState(committedLabel);
  const [prevCommittedLabel, setPrevCommittedLabel] = useState(committedLabel);
  if (committedLabel !== prevCommittedLabel) {
    setPrevCommittedLabel(committedLabel);
    setDraft(committedLabel);
  }

  const typedName = draft.trim();
  const normalizedValue = typedName.toLocaleLowerCase();

  const filteredCustomers = useMemo(
    () => !normalizedValue
      ? customers
      : customers.filter(customer =>
          customerOptionLabel(customer).toLocaleLowerCase().includes(normalizedValue)
          || customer.name.toLocaleLowerCase().includes(normalizedValue)
          || customer.company?.toLocaleLowerCase().includes(normalizedValue)
          || customer.email?.toLocaleLowerCase().includes(normalizedValue)
          || customer.phone?.toLocaleLowerCase().includes(normalizedValue)),
    [customers, normalizedValue],
  );

  const hasExactMatch = typedName.length > 0 && customers.some(customer =>
    customerOptionLabel(customer).toLocaleLowerCase() === normalizedValue
    || customer.name.toLocaleLowerCase() === normalizedValue
    || customer.company?.toLocaleLowerCase() === normalizedValue);

  const canCreateCustomer = typedName.length > 0 && !hasExactMatch;

  const selectCustomer = useCallback((customer: Customer) => {
    onChange({ customer: customerDisplayName(customer), customerId: customer.id });
    setDraft(customerDisplayName(customer));
    setIsOpen(false);
  }, [onChange]);

  const handleCustomerCreated = useCallback((customer: Customer) => {
    setCustomers(rows =>
      [...rows, customer].sort((a, b) =>
        customerOptionLabel(a).localeCompare(customerOptionLabel(b))));
    onChange({ customer: customerDisplayName(customer), customerId: customer.id });
    setDraft(customerDisplayName(customer));
    setNewCustomerName(null);
    setIsOpen(false);
  }, [onChange]);

  const revertDraft = useCallback(() => setDraft(committedLabel), [committedLabel]);

  useEffect(() => {
    let alive = true;
    getAllCustomers()
      .then(rows => { if (!alive) return; setCustomers(rows); setLoadError(null); })
      .catch(error => { if (!alive) return; setLoadError(error instanceof Error ? error.message : "Unable to load customers."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (customerId || !value.trim() || customers.length === 0) return;
    const normalized = value.trim().toLocaleLowerCase();
    const match = customers.find(customer =>
      customer.name.toLocaleLowerCase() === normalized
      || customer.company?.toLocaleLowerCase() === normalized);
    if (match) onChange({ customer: customerDisplayName(match), customerId: match.id });
    else onChange({ customer: "", customerId: null });
  }, [customerId, customers, onChange, value]);

  if (loadError) {
    return (
      <Field
        label="Customer"
        value={value}
        grid="1/-1"
        onChange={next => onChange({ customer: String(next), customerId: null })}
      />
    );
  }

  return (
    <div className="field" style={{ gridColumn: "1/-1" }}>
      <label htmlFor={selectId}>Customer</label>
      <div className="customer-combobox">
        <input
          id={selectId}
          name={selectId}
          placeholder="Search customers"
          value={draft}
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onChange={event => { setDraft(event.target.value); setIsOpen(true); }}
          onBlur={() => { revertDraft(); window.setTimeout(() => setIsOpen(false), 120); }}
        />
        <button
          type="button"
          aria-label="Show customers"
          onMouseDown={event => event.preventDefault()}
          onClick={() => setIsOpen(open => !open)}
        >
          <ChevronDown size={14} />
        </button>
        {isOpen && (
          <div className="customer-menu" role="listbox" aria-label="Customers">
            {filteredCustomers.map(customer => (
              <button
                key={customer.id}
                type="button"
                className={selectedCustomer?.id === customer.id ? "selected" : undefined}
                role="option"
                aria-selected={selectedCustomer?.id === customer.id}
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectCustomer(customer)}
              >
                <span className="customer-name">{customer.company || customer.name}</span>
                {customer.company && customer.company !== customer.name && (
                  <span className="customer-contact">{customer.name}</span>
                )}
              </button>
            ))}
            {canCreateCustomer && (
              <button
                type="button"
                className="create-customer"
                role="option"
                aria-selected="false"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { setNewCustomerName(typedName); setIsOpen(false); }}
              >
                <Plus size={13} />
                <span className="customer-name">{`Add "${typedName}"`}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {newCustomerName !== null && (
        <QuoteCustomerModal
          initialName={newCustomerName}
          onClose={() => setNewCustomerName(null)}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );
}

/* ===========================================================
   RfqRail — inquiry inputs + total + actions
   =========================================================== */

export const RfqRail = memo(function RfqRail({ parts, asmQty, setAsmQty, commercial, setCommercial, bops, extraCosts, getCadSnapshot }: {
  parts: Part[];
  asmQty: number;
  setAsmQty: (v: number) => void;
  commercial: { marginPct: number; taxPct: number };
  setCommercial: (v: { marginPct: number; taxPct: number }) => void;
  bops: Bop[];
  extraCosts: ExtraCost[];
  getCadSnapshot?: () => string | null;
}) {
  const { id } = useParams<{ id: string }>();
  const {
    rfq, setRfq, quoteId, quoteNumber, quoteStatus,
    persistenceStatus, persistenceError, lastSavedAt,
    saveQuote, sendQuote, clearPersistenceError,
  } = useQuoteState();
  const catalog = useCatalog();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"inputs" | "notes">("inputs");
  const [actionError, setActionError] = useState("");

  const r = calculateConfiguredQuoteRollup(
    parts, asmQty, commercial,
    catalog.materialCosts, catalog.machineCosts,
    { bops, extraCosts },
  );
  const totalQty = parts.filter(p => p.included).reduce((a, p) => a + p.perAssembly * asmQty, 0);
  const unit = asmQty > 0 ? r.total / asmQty : 0;
  const isSaving = persistenceStatus === "saving";
  const savedText = lastSavedAt
    ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Saved";
  const includedCount = parts.filter(p => p.included).length;
  const isSent = quoteStatus !== "draft";
  const canExport = includedCount > 0;
  const canSend = Boolean(quoteId) && includedCount > 0 && !isSent && !isSaving;

  async function handleSave() {
    try {
      const savedId = await saveQuote();
      if (!id || id !== savedId) navigate(`/quotes/${savedId}`, { replace: true });
    } catch { /* swallow — persistence banner shows errors */ }
  }

  async function handleSend() {
    if (!canSend) return;
    setActionError("");
    try {
      await sendQuote();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to send quote.");
    }
  }

  async function handleExportPdf() {
    if (!canExport) {
      setActionError("Add at least one included part before exporting a PDF.");
      return;
    }
    setActionError("");
    try {
      await catalog.refreshCatalog();
      const [quotationSettings, cadSnapshotPng, customerRecord] = await Promise.all([
        loadQuotationSettings(),
        Promise.resolve(dataUrlToBytes(getCadSnapshot?.() ?? null)),
        rfq.customerId ? getCustomerById(rfq.customerId).catch(() => null) : Promise.resolve(null),
      ]);
      const data = buildQuotationData({
        rfq, parts, bops, extraCosts, asmQty, commercial,
        quoteNumber, catalog, customerRecord, quotationSettings,
      });
      const pdf = await exportQuotationPdf({
        ...data,
        logoBytes: quotationSettings.logoBytes,
        logoMime: quotationSettings.logoMime,
        cadSnapshotPng,
      });
      if (!pdf.ok) throw new Error(pdf.reason);
      await downloadBytes(pdf.fileName, pdf.bytes, pdf.mimeType);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to export PDF.");
    }
  }

  return (
    <div className="panel rfq-panel">
      <div className="panel-head">
        <span className="title">{rfq.rfqRef || quoteNumber || rfq.project || "Inquiry"}</span>
        <div className="right">
          <span className={`chip ${persistenceStatus === "error" ? "" : "success"}`}>
            <span className="dot" />
            {isSaving ? "Saving..." : persistenceStatus === "saved" ? savedText : "Draft"}
          </span>
        </div>
      </div>

      <div className="tabstrip">
        <button className={tab === "inputs" ? "on" : ""} onClick={() => setTab("inputs")}>
          <Sliders size={13} /> Inputs
        </button>
        <button className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>
          <ScanLine size={13} /> Notes
        </button>
      </div>

      <div className={`rfq-tab-body ${tab === "inputs" ? "" : "bounded"}`}>
        {tab === "inputs" && (
          <>
            <div className="rfq-fields">
              <CustomerField
                value={rfq.customer}
                customerId={rfq.customerId}
                onChange={customer => setRfq({ ...rfq, ...customer })}
              />
              <Field label="Project" value={rfq.project} onChange={v => setRfq({ ...rfq, project: String(v) })} />
            </div>
            <div className="rfq-fields" style={{ paddingTop: 8 }}>
              <div className="full"><div className="eyebrow">Commercial · whole quote</div></div>
              <Field label="Margin" value={commercial.marginPct} type="number" unit="%" onChange={v => setCommercial({ ...commercial, marginPct: v as number })} />
              <Field label="Tax" value={commercial.taxPct} type="number" unit="%" onChange={v => setCommercial({ ...commercial, taxPct: v as number })} />
            </div>
            <div className="asm-qty-row" style={{ marginTop: 10 }}>
              <span className="lbl">Assembly qty</span>
              <span className="muted" style={{ fontSize: 10.5, fontFamily: "var(--font-mono)" }}>{totalQty} parts total</span>
              <input type="number" min="1" aria-label="Assembly quantity" value={asmQty} onChange={e => setAsmQty(Math.max(1, +e.target.value || 1))} />
            </div>
            <div style={{ height: 10 }} />
          </>
        )}
        {tab === "notes" && (
          <div style={{ padding: 14 }}>
            <textarea
              rows={10}
              aria-label="Quote notes"
              value={rfq.notes}
              onChange={e => setRfq({ ...rfq, notes: e.target.value })}
              style={{
                width: "100%", padding: 10, resize: "none",
                background: "var(--panel-2)", border: "1px solid var(--border)",
                borderRadius: 6, fontFamily: "var(--font-sans)",
                fontSize: 12.5, color: "var(--text-1)", outline: 0,
              }}
            />
          </div>
        )}
      </div>

      {persistenceError && (
        <div className="quote-error-banner">
          <TriangleAlert size={14} />
          <span>{persistenceError}</span>
          <button type="button" onClick={clearPersistenceError} title="Dismiss error"><X size={14} /></button>
        </div>
      )}

      <div className="total-panel big">
        <div className="duo">
          <div className="cell">
            <div className="label">Total</div>
            <div className="value">{fmtINR(r.total)}</div>
            <div className="sub">{asmQty} assemblies</div>
          </div>
          <div className="cell right">
            <div className="label">Per unit</div>
            <div className="value">{fmtINR(unit)}</div>
            <div className="sub">incl. {commercial.marginPct}% margin</div>
          </div>
        </div>
        <div className="total-actions">
          <button
            className="btn block primary"
            onClick={handleExportPdf}
            disabled={!canExport}
            title={canExport ? "Export quotation PDF" : "Add at least one included part to enable PDF export"}
          >
            <FileText size={14} /> Export PDF
          </button>
          <button className="btn block" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Clock size={14} /> : persistenceStatus === "saved" ? <Check size={14} /> : <Save size={14} />}
            {isSaving ? "Saving" : persistenceStatus === "saved" ? "Saved" : "Save"}
          </button>
          <button
            className="btn"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title={
              isSent ? `Quote already ${quoteStatus}`
                : !quoteId ? "Save the quote first"
                : includedCount === 0 ? "Add at least one included part to send"
                : "Mark as sent and assign quote number"
            }
          >
            <Send size={14} />
          </button>
        </div>
      </div>
      {actionError && createPortal(
        <div className="modal-overlay action-error-overlay">
          <div className="action-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quote-action-error-title">
            <div className="action-error-head">
              <div className="confirm-icon"><TriangleAlert size={20} /></div>
              <div>
                <h2 id="quote-action-error-title">Action blocked</h2>
                <p>{actionError}</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setActionError("")} title="Close">
                <X size={16} />
              </button>
            </div>
            <div className="action-error-actions">
              <button type="button" className="btn primary sm" onClick={() => setActionError("")}>OK</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
