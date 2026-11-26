
import {
    getAll,
    addRecord,
    updateRecord
} from "./db.js";

const $ = id => document.getElementById(id);

let documents = [];
let payments = [];
let customers = [];
let suppliers = [];
let toastTimer;
let editingDocumentId = null;
let currentProfile = null;

const money = value => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
}).format(Number(value || 0));

const today = () => {
    const date = new Date();
    return new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);
};

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function paidFor(documentId) {
    return payments
        .filter(p => Number(p.documentId) === Number(documentId))
        .reduce((sum, p) => sum + Number(p.amount), 0);
}

function balance(doc) {
    return Math.max(0, Number(doc.amount) - paidFor(doc.id));
}

function status(doc) {
    if (balance(doc) <= 0.005) return ["Paid", "paid"];
    if (doc.dueDate < today()) return ["Overdue", "overdue"];
    if (paidFor(doc.id) > 0) return ["Partial", "partial"];
    return ["Open", "open"];
}

function badge(doc) {
    const [label, css] = status(doc);
    return `<span class="status-badge ${css}">${label}</span>`;
}

/* DATABASE */

async function refresh() {
    [
        documents,
        payments,
        customers,
        suppliers
    ] = await Promise.all([
        getAll("documents"),
        getAll("payments"),
        getAll("customers"),
        getAll("suppliers")
    ]);

    render();
    renderContacts();
}

/* DASHBOARD */

function render() {
    const invoices = documents.filter(d => d.type === "invoice");
    const bills = documents.filter(d => d.type === "bill");

    const receivables = invoices.reduce((s, d) => s + balance(d), 0);
    const payables = bills.reduce((s, d) => s + balance(d), 0);

    $("metric-receivables").textContent = money(receivables);
    $("metric-payables").textContent = money(payables);
    $("metric-overdue").textContent =
        invoices.filter(d => status(d)[0] === "Overdue").length;
    $("metric-documents").textContent = documents.length;

    $("current-date").textContent = new Date().toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" }
    );

    $("ar-total").textContent = money(receivables);
    $("ar-count").textContent =
        invoices.filter(d => balance(d) > 0.005).length;

    $("ap-total").textContent = money(payables);
    $("ap-count").textContent =
        bills.filter(d => balance(d) > 0.005).length;

    renderRecentActivity();
    renderDocuments("invoice", "receivables-table");
    renderDocuments("bill", "payables-table");
    renderPayments();
}

function renderRecentActivity() {
    const recent = [
        ...documents.map(d => ({
            ...d,
            activityType: d.type,
            activityDate: d.issueDate
        })),
        ...payments.map(p => ({
            ...p,
            activityType: "payment",
            activityDate: p.date
        }))
    ].sort((a, b) =>
        (b.createdAt || b.activityDate)
            .localeCompare(a.createdAt || a.activityDate)
    ).slice(0, 10);

    $("recent-activity").innerHTML = recent.length
        ? recent.map(item => {
            if (item.activityType === "payment") {
                const doc = documents.find(
                    d => Number(d.id) === Number(item.documentId)
                );
                return `
                    <tr>
                        <td>${escapeHTML(item.date)}</td>
                        <td>${escapeHTML(doc?.reference || "—")}</td>
                        <td>Payment</td>
                        <td>${escapeHTML(doc?.counterparty || "—")}</td>
                        <td>${money(item.amount)}</td>
                        <td><span class="status-badge paid">Recorded</span></td>
                    </tr>`;
            }

            return `
                <tr>
                    <td>${escapeHTML(item.issueDate)}</td>
                    <td>${escapeHTML(item.reference)}</td>
                    <td>${item.type === "invoice" ? "Invoice" : "Supplier bill"}</td>
                    <td>${escapeHTML(item.counterparty)}</td>
                    <td>${money(item.amount)}</td>
                    <td>${badge(item)}</td>
                </tr>`;
        }).join("")
        : `<tr><td colspan="6" class="empty-state">No activity yet.</td></tr>`;
}

function renderDocuments(type, target) {
    const list = documents
        .filter(d => d.type === type)
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate));

    $(target).innerHTML = list.length
        ? list.map(doc => `
            <tr>
                <td>${escapeHTML(doc.reference)}</td>
                <td>${escapeHTML(doc.counterparty)}</td>
                <td>${escapeHTML(doc.issueDate)}</td>
                <td>${escapeHTML(doc.dueDate)}</td>
                <td>${money(doc.amount)}</td>
                <td>${money(balance(doc))}</td>
                <td>${badge(doc)}</td>
                <td><button type="button" class="edit-button"
                    data-edit-document="${doc.id}">Edit</button></td>
            </tr>`).join("")
        : `<tr><td colspan="8" class="empty-state">
            No ${type === "invoice" ? "invoices" : "supplier bills"} recorded yet.
        </td></tr>`;
}

function renderPayments() {
    const list = payments.slice().sort((a, b) => b.date.localeCompare(a.date));

    $("payments-table").innerHTML = list.length
        ? list.map(p => {
            const doc = documents.find(
                d => Number(d.id) === Number(p.documentId)
            );
            const direction =
                p.direction === "in" || p.direction === "received"
                    ? "Receipt" : "Disbursement";

            return `
                <tr>
                    <td>${escapeHTML(p.date)}</td>
                    <td>${direction}</td>
                    <td>${escapeHTML(doc?.reference || "—")}</td>
                    <td>${escapeHTML(doc?.counterparty || "—")}</td>
                    <td>${escapeHTML(p.note || "—")}</td>
                    <td>${money(p.amount)}</td>
                </tr>`;
        }).join("")
        : `<tr><td colspan="6" class="empty-state">No payments recorded yet.</td></tr>`;
}

/* NAVIGATION */

const pageTitles = {
    dashboard: "Dashboard",
    receivables: "Accounts receivable",
    payables: "Accounts payable",
    contacts: "Contacts",
    payments: "Payments",
    reports: "Reports & data",
    more: "More",
    "contact-profile": "Contact profile"
};

function createMoreView() {
    if ($("more-view")) return;

    const section = document.createElement("section");
    section.className = "view";
    section.id = "more-view";
    section.hidden = true;
    section.innerHTML = `
        <div class="section-intro">
            <div><h2>More</h2><p>Additional financial workspace tools.</p></div>
        </div>
        <div class="report-grid">
            <article class="panel report-card">
                <h3>Payments</h3>
                <p>Review receipts and supplier disbursements.</p>
                <button class="secondary-button" data-open-view="payments">Open payments</button>
            </article>
            <article class="panel report-card">
                <h3>Reports & data</h3>
                <p>Review reports and download your records.</p>
                <button class="secondary-button" data-open-view="reports">Open reports</button>
            </article>
        </div>`;
    document.querySelector(".main").appendChild(section);
}

function navigate(view) {
    const target = $(`${view}-view`);
    if (!target) {
        showToast("That section is not available.");
        return;
    }

    document.querySelectorAll(".view").forEach(section => {
        section.hidden = section !== target;
        section.classList.toggle("active", section === target);
    });

    $("page-title").textContent = pageTitles[view] || "LedgerDesk";

    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

createMoreView();

document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.view));
});

document.addEventListener("click", event => {
    const viewButton = event.target.closest("[data-open-view]");
    if (viewButton) navigate(viewButton.dataset.openView);

    const reportButton = event.target.closest("[data-report]");
    if (reportButton) navigate(reportButton.dataset.report);
});

/* CONTACT DIRECTORIES */

document.querySelectorAll("[data-contact-tab]").forEach(button => {
    button.addEventListener("click", () => {
        const selected = button.dataset.contactTab;

        document.querySelectorAll("[data-contact-tab]").forEach(tab => {
            const active = tab.dataset.contactTab === selected;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });

        $("customers-section").hidden = selected !== "customers";
        $("suppliers-section").hidden = selected !== "suppliers";
    });
});

function renderContacts() {
    renderContactTable(customers, "customers-table", "customer");
    renderContactTable(suppliers, "suppliers-table", "supplier");
}

function renderContactTable(records, target, type) {
    $(target).innerHTML = records.length
        ? records.slice().sort((a, b) =>
            a.name.localeCompare(b.name)
        ).map(contact => `
            <tr>
                <td>${escapeHTML(contact.code || "—")}</td>
                <td>${escapeHTML(contact.name)}</td>
                <td>${escapeHTML(contact.contactPerson || "—")}</td>
                <td>${escapeHTML(contact.email || "—")}</td>
                <td>${escapeHTML(contact.phone || "—")}</td>
                <td><span class="status-badge ${contact.status === "inactive" ? "overdue" : "paid"}">${escapeHTML(contact.status || "active")}</span></td>
                <td>
                    <button type="button" class="edit-button"
                        data-view-contact="${type}:${contact.id}">View</button>
                    <button type="button" class="edit-button"
                        data-edit-contact="${type}:${contact.id}">Edit</button>
                </td>
            </tr>`).join("")
        : `<tr><td colspan="7" class="empty-state">
            No ${type}s registered yet.
        </td></tr>`;
}

$("add-customer").addEventListener("click", () => openContactDialog("customer"));
$("add-supplier").addEventListener("click", () => openContactDialog("supplier"));

function nextCode(records, prefix) {
    const max = records.reduce((highest, record) => {
        const match = String(record.code || "").match(/(\d+)$/);
        return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function openContactDialog(type, contact = null) {
    $("contact-form").reset();
    $("contact-type").value = type;
    $("contact-id").value = contact?.id || "";

    $("contact-dialog-title").textContent =
        contact ? `Edit ${type}` : `Add ${type}`;

    $("save-contact").textContent = contact ? "Save changes" : "Save contact";

    $("contact-name").value = contact?.name || "";
    $("contact-person").value = contact?.contactPerson || "";
    $("contact-email").value = contact?.email || "";
    $("contact-phone").value = contact?.phone || "";
    $("contact-tax-id").value = contact?.taxId || "";
    $("contact-address").value = contact?.address || "";
    $("contact-terms").value = contact?.paymentTerms || "";
    $("contact-status").value = contact?.status || "active";
    $("contact-notes").value = contact?.notes || "";

    $("contact-dialog").showModal();
}

$("close-contact-dialog").addEventListener("click", () => $("contact-dialog").close());
$("cancel-contact-dialog").addEventListener("click", () => $("contact-dialog").close());

$("contact-form").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const type = $("contact-type").value;
        const isCustomer = type === "customer";
        const store = isCustomer ? "customers" : "suppliers";
        const records = isCustomer ? customers : suppliers;
        const id = $("contact-id").value;

        const name = $("contact-name").value.trim();
        if (!name) throw new Error("Enter a contact name.");

        const existing = id
            ? records.find(record => Number(record.id) === Number(id))
            : null;

        const record = {
            ...(existing || {}),
            code: existing?.code || nextCode(records, isCustomer ? "CUST" : "SUP"),
            name,
            contactPerson: $("contact-person").value.trim(),
            email: $("contact-email").value.trim(),
            phone: $("contact-phone").value.trim(),
            taxId: $("contact-tax-id").value.trim(),
            address: $("contact-address").value.trim(),
            paymentTerms: $("contact-terms").value.trim(),
            status: $("contact-status").value,
            notes: $("contact-notes").value.trim(),
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existing) {
            await updateRecord(store, record);
        } else {
            await addRecord(store, record);
        }

        $("contact-dialog").close();
        await refresh();
        showToast(`${type[0].toUpperCase() + type.slice(1)} saved successfully.`);
    } catch (error) {
        showToast(error.message || "Could not save contact.");
    }
});

/* CONTACT PROFILE */

document.addEventListener("click", event => {
    const viewButton = event.target.closest("[data-view-contact]");
    const editButton = event.target.closest("[data-edit-contact]");

    if (viewButton) {
        const [type, id] = viewButton.dataset.viewContact.split(":");
        const records = type === "customer" ? customers : suppliers;
        const contact = records.find(c => Number(c.id) === Number(id));
        if (contact) showContactProfile(type, contact);
    }

    if (editButton) {
        const [type, id] = editButton.dataset.editContact.split(":");
        const records = type === "customer" ? customers : suppliers;
        const contact = records.find(c => Number(c.id) === Number(id));
        if (contact) openContactDialog(type, contact);
    }
});

function showContactProfile(type, contact) {
    currentProfile = { type, contact };

    $("profile-name").textContent = contact.name;
    $("profile-subtitle").textContent =
        `${type === "customer" ? "Customer" : "Supplier"} · ${contact.code || ""}`;

    const details = [
        ["Code", contact.code],
        ["Contact person", contact.contactPerson],
        ["Email", contact.email],
        ["Phone", contact.phone],
        ["Tax ID", contact.taxId],
        ["Address", contact.address],
        ["Payment terms", contact.paymentTerms],
        ["Status", contact.status],
        ["Notes", contact.notes]
    ];

    $("profile-details").innerHTML = `
        <dl class="profile-detail-list">
            ${details.map(([label, value]) => `
                <div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value || "—")}</dd></div>
            `).join("")}
        </dl>`;

    const linkedDocuments = documents.filter(doc =>
        type === "customer"
            ? Number(doc.customerId) === Number(contact.id) ||
              (!doc.customerId && doc.type === "invoice" &&
               doc.counterparty === contact.name)
            : Number(doc.supplierId) === Number(contact.id) ||
              (!doc.supplierId && doc.type === "bill" &&
               doc.counterparty === contact.name)
    );

    $("profile-transactions").innerHTML = linkedDocuments.length
        ? linkedDocuments.map(doc => `
            <tr>
                <td>${escapeHTML(doc.reference)}</td>
                <td>${escapeHTML(doc.issueDate)}</td>
                <td>${escapeHTML(doc.dueDate)}</td>
                <td>${money(doc.amount)}</td>
                <td>${money(paidFor(doc.id))}</td>
                <td>${money(balance(doc))}</td>
                <td>${badge(doc)}</td>
            </tr>`).join("")
        : `<tr><td colspan="7" class="empty-state">No transactions linked to this contact yet.</td></tr>`;

    navigate("contact-profile");
}

$("back-to-contacts").addEventListener("click", () => navigate("contacts"));

$("edit-profile").addEventListener("click", () => {
    if (currentProfile) {
        openContactDialog(currentProfile.type, currentProfile.contact);
    }
});

/* DOCUMENT AND PAYMENT DIALOG */

function populateCounterparties(type, selectedId = "") {
    const records = type === "invoice" ? customers : suppliers;
    const selector = $("counterparty");

    selector.innerHTML = `<option value="">Select a ${type === "invoice" ? "customer" : "supplier"}</option>`;

    records.filter(c => c.status !== "inactive").forEach(contact => {
        const option = document.createElement("option");
        option.value = contact.id;
        option.textContent = `${contact.code || ""} — ${contact.name}`;
        selector.appendChild(option);
    });

    selector.value = selectedId ? String(selectedId) : "";
    selector.disabled = records.filter(c => c.status !== "inactive").length === 0;
}

function openDialog(type, existingDocument = null) {
    $("record-form").reset();

    editingDocumentId = existingDocument ? existingDocument.id : null;

    const isPayment = type === "payment";
    const isEditing = Boolean(existingDocument);

    $("record-type").value = type;
    $("editing-id").value = existingDocument?.id || "";

    $("document-fields").hidden = isPayment;
    $("payment-fields").hidden = !isPayment;

    $("document-fields").querySelectorAll("input, select, textarea").forEach(field => {
        field.disabled = isPayment;
    });

    $("payment-fields").querySelectorAll("input, select, textarea").forEach(field => {
        field.disabled = !isPayment;
    });

    $("dialog-title").textContent = isEditing
        ? type === "invoice" ? "Edit customer invoice" : "Edit supplier bill"
        : type === "invoice" ? "New customer invoice"
        : type === "bill" ? "New supplier bill" : "Record payment";

    $("save-record").textContent = isEditing ? "Save changes" : "Save record";

    $("issue-date").value = today();
    $("due-date").value = today();
    $("payment-date").value = today();

    if (!isPayment) {
        const selectedId = type === "invoice"
            ? existingDocument?.customerId
            : existingDocument?.supplierId;

        populateCounterparties(type, selectedId);
    }

    if (existingDocument) {
        $("reference").value = existingDocument.reference;
        $("issue-date").value = existingDocument.issueDate;
        $("due-date").value = existingDocument.dueDate;
        $("amount").value = existingDocument.amount;
    }

    if (isPayment) {
        $("payment-direction").value = "received";
        populatePaymentDocuments();
    }

    $("record-dialog").showModal();
}

function populatePaymentDocuments() {
    const type = $("payment-direction").value === "received" ? "invoice" : "bill";
    const eligible = documents.filter(d => d.type === type && balance(d) > 0.005);

    $("payment-document").innerHTML = eligible.length
        ? eligible.map(d => `<option value="${d.id}">
            ${escapeHTML(d.reference)} — ${escapeHTML(d.counterparty)}
            (${money(balance(d))} open)</option>`).join("")
        : `<option value="">No open documents available</option>`;

    $("payment-document").disabled = !eligible.length;
    $("payment-amount").disabled = !eligible.length;
}

$("add-invoice").addEventListener("click", () => {
    if (!customers.some(c => c.status !== "inactive")) {
        showToast("Add an active customer before creating an invoice.");
        navigate("contacts");
        return;
    }
    openDialog("invoice");
});

$("add-bill").addEventListener("click", () => {
    if (!suppliers.some(c => c.status !== "inactive")) {
        showToast("Add an active supplier before creating a bill.");
        navigate("contacts");
        document.querySelector('[data-contact-tab="suppliers"]').click();
        return;
    }
    openDialog("bill");
});

$("add-payment").addEventListener("click", () => openDialog("payment"));

$("close-dialog").addEventListener("click", () => $("record-dialog").close());
$("cancel-dialog").addEventListener("click", () => $("record-dialog").close());

$("payment-direction").addEventListener("change", populatePaymentDocuments);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-edit-document]");
    if (!button) return;

    const doc = documents.find(d => Number(d.id) === Number(button.dataset.editDocument));
    if (doc) openDialog(doc.type, doc);
});

$("record-form").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const type = $("record-type").value;

        if (type === "payment") await savePayment();
        else await saveDocument(type);

        $("record-dialog").close();
        editingDocumentId = null;
        await refresh();

        showToast(type === "payment" ? "Payment recorded successfully." : "Document saved successfully.");
    } catch (error) {
        showToast(error.message || "Could not save record.");
    }
});

async function savePayment() {
    const docId = Number($("payment-document").value);
    const doc = documents.find(d => Number(d.id) === docId);
    const amount = Number($("payment-amount").value);

    if (!doc) throw new Error("Select an open invoice or bill first.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount.");
    if (amount > balance(doc) + 0.005) {
        throw new Error(`Payment exceeds the open balance of ${money(balance(doc))}.`);
    }

    await addRecord("payments", {
        documentId: docId,
        direction: $("payment-direction").value === "received" ? "in" : "out",
        date: $("payment-date").value,
        amount,
        note: $("payment-note").value.trim(),
        createdAt: new Date().toISOString()
    });
}

async function saveDocument(type) {
    const reference = $("reference").value.trim();
    const contactId = Number($("counterparty").value);
    const amount = Number($("amount").value);
    const issueDate = $("issue-date").value;
    const dueDate = $("due-date").value;

    const records = type === "invoice" ? customers : suppliers;
    const contact = records.find(c =>
        Number(c.id) === contactId && c.status !== "inactive"
    );

    if (!reference) throw new Error("Enter a document reference.");
    if (!contact) throw new Error("Select an active customer or supplier.");

    if (documents.some(d =>
        d.reference.toLowerCase() === reference.toLowerCase() &&
        Number(d.id) !== Number(editingDocumentId)
    )) {
        throw new Error("That reference number is already in use.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter an amount greater than zero.");
    }

    if (!issueDate || !dueDate || dueDate < issueDate) {
        throw new Error("Due date cannot be earlier than issue date.");
    }

    const linkFields = type === "invoice"
        ? { customerId: contact.id, supplierId: undefined }
        : { supplierId: contact.id, customerId: undefined };

    if (editingDocumentId !== null) {
        const existing = documents.find(d =>
            Number(d.id) === Number(editingDocumentId)
        );

        if (!existing) throw new Error("Document could not be found.");

        const paymentsApplied = paidFor(editingDocumentId);
        if (amount + 0.005 < paymentsApplied) {
            throw new Error(`Total cannot be less than payments already applied (${money(paymentsApplied)}).`);
        }

        await updateRecord("documents", {
            ...existing,
            ...linkFields,
            reference,
            counterparty: contact.name,
            issueDate,
            dueDate,
            amount,
            updatedAt: new Date().toISOString()
        });
    } else {
        await addRecord("documents", {
            type,
            ...linkFields,
            reference,
            counterparty: contact.name,
            issueDate,
            dueDate,
            amount,
            createdAt: new Date().toISOString()
        });
    }
}

$("record-dialog").addEventListener("close", () => {
    editingDocumentId = null;
});

/* CSV EXPORT */

function csvDownload(filename, rows) {
    const csv = rows.map(row =>
        row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");

    const blob = new Blob(["\ufeff" + csv], {
        type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

$("export-csv").addEventListener("click", () => {
    csvDownload("ledgerdesk-document-register.csv", [
        ["Type", "Reference", "Customer or Supplier", "Issue Date", "Due Date", "Original Amount", "Payments Applied", "Open Balance", "Status"],
        ...documents.map(d => [
            d.type, d.reference, d.counterparty, d.issueDate, d.dueDate,
            d.amount, paidFor(d.id), balance(d), status(d)[0]
        ])
    ]);
    showToast("CSV export prepared.");
});

/* COMPLETE JSON BACKUP */

$("export-json").addEventListener("click", () => {
    const backup = {
        application: "LedgerDesk",
        version: 2,
        databaseVersion: 2,
        exportedAt: new Date().toISOString(),
        documents,
        payments,
        customers,
        suppliers
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ledgerdesk-backup.json";
    link.click();
    URL.revokeObjectURL(url);

    showToast("Complete JSON backup prepared.");
});

/* STARTUP */

refresh().catch(error => {
    console.error("LedgerDesk initialization error:", error);
    showToast("Database could not be opened. Check your browser.");
});
