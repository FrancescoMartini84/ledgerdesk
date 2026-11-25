
import {
    getAll,
    addRecord,
    updateRecord
} from "./db.js";

const $ = (id) => document.getElementById(id);

let documents = [];
let payments = [];
let toastTimer;
let editingDocumentId = null;

const money = (value) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(Number(value || 0));

const today = () => {
    const date = new Date();
    const localDate = new Date(
        date.getTime() - date.getTimezoneOffset() * 60000
    );
    return localDate.toISOString().slice(0, 10);
};

const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));

function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function paidFor(documentId) {
    return payments
        .filter(payment =>
            Number(payment.documentId) === Number(documentId)
        )
        .reduce((sum, payment) =>
            sum + Number(payment.amount), 0
        );
}

function balance(doc) {
    return Math.max(
        0,
        Number(doc.amount) - paidFor(doc.id)
    );
}

function status(doc) {
    const openBalance = balance(doc);

    if (openBalance <= 0.005) {
        return ["Paid", "paid"];
    }

    if (doc.dueDate < today()) {
        return ["Overdue", "overdue"];
    }

    if (paidFor(doc.id) > 0) {
        return ["Partial", "partial"];
    }

    return ["Open", "open"];
}

function badge(doc) {
    const [label, className] = status(doc);

    return `
        <span class="status-badge ${className}">
            ${label}
        </span>
    `;
}

/* --------------------------------------------------
   DATABASE AND INITIALIZATION
-------------------------------------------------- */

async function refresh() {
    [documents, payments] = await Promise.all([
        getAll("documents"),
        getAll("payments")
    ]);

    render();
}

/* --------------------------------------------------
   DASHBOARD AND REGISTERS
-------------------------------------------------- */

function render() {
    const invoices = documents.filter(
        doc => doc.type === "invoice"
    );

    const bills = documents.filter(
        doc => doc.type === "bill"
    );

    const receivables = invoices.reduce(
        (sum, doc) => sum + balance(doc),
        0
    );

    const payables = bills.reduce(
        (sum, doc) => sum + balance(doc),
        0
    );

    const overdueCount = invoices.filter(
        doc => status(doc)[0] === "Overdue"
    ).length;

    // Dashboard metrics
    $("metric-receivables").textContent =
        money(receivables);

    $("metric-payables").textContent =
        money(payables);

    $("metric-overdue").textContent =
        overdueCount;

    $("metric-documents").textContent =
        documents.length;

    $("current-date").textContent =
        new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        });

    // Accounts receivable metrics
    $("ar-total").textContent =
        money(receivables);

    $("ar-count").textContent =
        invoices.filter(doc => balance(doc) > 0.005).length;

    // Accounts payable metrics
    $("ap-total").textContent =
        money(payables);

    $("ap-count").textContent =
        bills.filter(doc => balance(doc) > 0.005).length;

    renderRecentActivity();
    renderDocuments("invoice", "receivables-table");
    renderDocuments("bill", "payables-table");
    renderPayments();
}

function renderRecentActivity() {
    const recent = [
        ...documents.map(doc => ({
            ...doc,
            activityType: doc.type,
            activityDate: doc.issueDate
        })),

        ...payments.map(payment => ({
            ...payment,
            activityType: "payment",
            activityDate: payment.date
        }))
    ]
        .sort((a, b) => {
            const dateA = a.createdAt || a.activityDate;
            const dateB = b.createdAt || b.activityDate;

            return dateB.localeCompare(dateA);
        })
        .slice(0, 10);

    $("recent-activity").innerHTML = recent.length
        ? recent.map(item => {
            if (item.activityType === "payment") {
                const doc = documents.find(
                    record =>
                        Number(record.id) === Number(item.documentId)
                );

                return `
                    <tr>
                        <td>${escapeHTML(item.date)}</td>
                        <td>${escapeHTML(doc?.reference || "—")}</td>
                        <td>Payment</td>
                        <td>${escapeHTML(doc?.counterparty || "—")}</td>
                        <td>${money(item.amount)}</td>
                        <td>
                            <span class="status-badge paid">
                                Recorded
                            </span>
                        </td>
                    </tr>
                `;
            }

            return `
                <tr>
                    <td>${escapeHTML(item.issueDate)}</td>
                    <td>${escapeHTML(item.reference)}</td>
                    <td>
                        ${item.type === "invoice" ? "Invoice" : "Supplier bill"}
                    </td>
                    <td>${escapeHTML(item.counterparty)}</td>
                    <td>${money(item.amount)}</td>
                    <td>${badge(item)}</td>
                </tr>
            `;
        }).join("")
        : `
            <tr>
                <td colspan="6" class="empty-state">
                    No activity yet.
                </td>
            </tr>
        `;
}

function renderDocuments(type, target) {
    const list = documents
        .filter(doc => doc.type === type)
        .sort((a, b) =>
            b.issueDate.localeCompare(a.issueDate)
        );

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
                <td>
                    <button
                        type="button"
                        class="edit-button"
                        data-edit-document="${doc.id}"
                    >
                        Edit
                    </button>
                </td>
            </tr>
        `).join("")
        : `
            <tr>
                <td colspan="8" class="empty-state">
                    No ${type === "invoice" ? "invoices" : "supplier bills"} recorded yet.
                </td>
            </tr>
        `;
}

function renderPayments() {
    const sortedPayments = payments
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

    $("payments-table").innerHTML = sortedPayments.length
        ? sortedPayments.map(payment => {
            const doc = documents.find(
                record =>
                    Number(record.id) === Number(payment.documentId)
            );

            const direction =
                payment.direction === "in" ||
                payment.direction === "received"
                    ? "Receipt"
                    : "Disbursement";

            return `
                <tr>
                    <td>${escapeHTML(payment.date)}</td>
                    <td>${direction}</td>
                    <td>${escapeHTML(doc?.reference || "—")}</td>
                    <td>${escapeHTML(doc?.counterparty || "—")}</td>
                    <td>${escapeHTML(payment.note || "—")}</td>
                    <td>${money(payment.amount)}</td>
                </tr>
            `;
        }).join("")
        : `
            <tr>
                <td colspan="6" class="empty-state">
                    No payments recorded yet.
                </td>
            </tr>
        `;
}

/* --------------------------------------------------
   NAVIGATION
-------------------------------------------------- */

// Create a More screen for the mobile navigation.
// Payments and Reports remain accessible on small screens.
function createMoreView() {
    if ($("more-view")) return;

    const main = document.querySelector(".main");

    const section = document.createElement("section");
    section.className = "view";
    section.id = "more-view";
    section.hidden = true;

    section.innerHTML = `
        <div class="section-intro">
            <div>
                <h2>More</h2>
                <p>Additional financial workspace tools.</p>
            </div>
        </div>

        <div class="report-grid">
            <article class="panel report-card">
                <div class="report-icon">⇄</div>
                <h3>Payments</h3>
                <p>Review receipts and supplier disbursements.</p>
                <button
                    type="button"
                    class="secondary-button"
                    data-open-view="payments"
                >
                    Open payments
                </button>
            </article>

            <article class="panel report-card">
                <div class="report-icon">▤</div>
                <h3>Reports & data</h3>
                <p>Review reports and download your records.</p>
                <button
                    type="button"
                    class="secondary-button"
                    data-open-view="reports"
                >
                    Open reports
                </button>
            </article>
        </div>
    `;

    main.appendChild(section);
}

const pageTitles = {
    dashboard: "Dashboard",
    receivables: "Accounts receivable",
    payables: "Accounts payable",
    contacts: "Contacts",
    payments: "Payments",
    reports: "Reports & data",
    more: "More"
};

function navigate(view) {
    const target = $(`${view}-view`);

    if (!target) {
        showToast("That section is not available.");
        return;
    }

    document.querySelectorAll(".view").forEach(section => {
        section.hidden = section.id !== `${view}-view`;
        section.classList.toggle(
            "active",
            section.id === `${view}-view`
        );
    });

    $("page-title").textContent =
        pageTitles[view] || "LedgerDesk";

    document.querySelectorAll(
        ".nav-item, .mobile-nav-item"
    ).forEach(button => {
        const active = button.dataset.view === view;

        button.classList.toggle("active", active);

        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

createMoreView();

// Desktop navigation
document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        navigate(button.dataset.view);
    });
});

// Mobile navigation
document.querySelectorAll(".mobile-nav-item").forEach(button => {
    button.addEventListener("click", () => {
        navigate(button.dataset.view);
    });
});

// More screen links
document.addEventListener("click", event => {
    const button = event.target.closest("[data-open-view]");

    if (!button) return;

    navigate(button.dataset.openView);
});

// Reports shortcuts
document.querySelectorAll("[data-report]").forEach(button => {
    button.addEventListener("click", () => {
        navigate(button.dataset.report);
    });
});

/* --------------------------------------------------
   CONTACT TABS
-------------------------------------------------- */

document.querySelectorAll("[data-contact-tab]").forEach(button => {
    button.addEventListener("click", () => {
        const selected = button.dataset.contactTab;

        document.querySelectorAll("[data-contact-tab]").forEach(tab => {
            const active = tab.dataset.contactTab === selected;

            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
        });

        $("customers-section").hidden =
            selected !== "customers";

        $("suppliers-section").hidden =
            selected !== "suppliers";
    });
});

// Contact database functionality is not connected yet.
// These buttons deliberately do not create fake records.
$("add-customer").addEventListener("click", () => {
    showToast(
        "Customer records will be enabled after the database upgrade."
    );
});

$("add-supplier").addEventListener("click", () => {
    showToast(
        "Supplier records will be enabled after the database upgrade."
    );
});

/* --------------------------------------------------
   DOCUMENT AND PAYMENT DIALOG
-------------------------------------------------- */

function openDialog(type, existingDocument = null) {
    const form = $("record-form");

    form.reset();

    editingDocumentId = existingDocument
        ? existingDocument.id
        : null;

    const isPayment = type === "payment";
    const isEditing = Boolean(existingDocument);

    $("record-type").value = type;
    $("editing-id").value = existingDocument?.id || "";

    $("document-fields").hidden = isPayment;
    $("payment-fields").hidden = !isPayment;

    $("document-fields")
        .querySelectorAll("input, select, textarea")
        .forEach(field => {
            field.disabled = isPayment;
        });

    $("payment-fields")
        .querySelectorAll("input, select, textarea")
        .forEach(field => {
            field.disabled = !isPayment;
        });

    $("dialog-title").textContent = isEditing
        ? type === "invoice"
            ? "Edit customer invoice"
            : "Edit supplier bill"
        : type === "invoice"
            ? "New customer invoice"
            : type === "bill"
                ? "New supplier bill"
                : "Record payment";

    $("save-record").textContent = isEditing
        ? "Save changes"
        : "Save record";

    $("issue-date").value = today();
    $("due-date").value = today();
    $("payment-date").value = today();

    $("counterparty").placeholder =
        type === "bill"
            ? "Supplier name"
            : "Customer name";

    if (existingDocument) {
        $("reference").value = existingDocument.reference;
        $("counterparty").value = existingDocument.counterparty;
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
    const direction = $("payment-direction").value;

    const type = direction === "received"
        ? "invoice"
        : "bill";

    const eligible = documents.filter(doc =>
        doc.type === type && balance(doc) > 0.005
    );

    $("payment-document").innerHTML = eligible.length
        ? eligible.map(doc => `
            <option value="${doc.id}">
                ${escapeHTML(doc.reference)} —
                ${escapeHTML(doc.counterparty)}
                (${money(balance(doc))} open)
            </option>
        `).join("")
        : `
            <option value="">
                No open documents available
            </option>
        `;

    $("payment-document").disabled = eligible.length === 0;
    $("payment-amount").disabled = eligible.length === 0;
}

$("add-invoice").addEventListener("click", () => {
    openDialog("invoice");
});

$("add-bill").addEventListener("click", () => {
    openDialog("bill");
});

$("add-payment").addEventListener("click", () => {
    openDialog("payment");
});

$("close-dialog").addEventListener("click", () => {
    $("record-dialog").close();
});

$("cancel-dialog").addEventListener("click", () => {
    $("record-dialog").close();
});

$("payment-direction").addEventListener(
    "change",
    populatePaymentDocuments
);

// Edit existing invoices and bills.
document.addEventListener("click", event => {
    const button = event.target.closest("[data-edit-document]");

    if (!button) return;

    const documentId = Number(button.dataset.editDocument);

    const existingDocument = documents.find(
        doc => Number(doc.id) === documentId
    );

    if (!existingDocument) {
        showToast("Document could not be found.");
        return;
    }

    openDialog(existingDocument.type, existingDocument);
});

/* --------------------------------------------------
   SAVE DOCUMENTS AND PAYMENTS
-------------------------------------------------- */

$("record-form").addEventListener("submit", async event => {
    event.preventDefault();

    const type = $("record-type").value;

    try {
        if (type === "payment") {
            await savePayment();
        } else {
            await saveDocument(type);
        }

        $("record-dialog").close();

        editingDocumentId = null;

        await refresh();

        showToast(
            type === "payment"
                ? "Payment recorded successfully."
                : "Document saved successfully."
        );

    } catch (error) {
        showToast(error.message || "Could not save record.");
    }
});

async function savePayment() {
    const docId = Number($("payment-document").value);

    const doc = documents.find(
        record => Number(record.id) === docId
    );

    const amount = Number($("payment-amount").value);

    if (!doc) {
        throw new Error(
            "Select an open invoice or bill first."
        );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid payment amount.");
    }

    if (amount > balance(doc) + 0.005) {
        throw new Error(
            `Payment exceeds the open balance of ${money(balance(doc))}.`
        );
    }

    const selectedDirection = $("payment-direction").value;

    // Keep the existing database convention:
    // "in" = money received; "out" = money paid.
    const direction = selectedDirection === "received"
        ? "in"
        : "out";

    await addRecord("payments", {
        documentId: docId,
        direction,
        date: $("payment-date").value,
        amount,
        note: $("payment-note").value.trim(),
        createdAt: new Date().toISOString()
    });
}

async function saveDocument(type) {
    const reference = $("reference").value.trim();
    const counterparty = $("counterparty").value.trim();
    const issueDate = $("issue-date").value;
    const dueDate = $("due-date").value;
    const amount = Number($("amount").value);

    if (!reference) {
        throw new Error("Enter a document reference.");
    }

    if (!counterparty) {
        throw new Error("Enter a customer or supplier name.");
    }

    const duplicate = documents.some(doc =>
        String(doc.reference).toLowerCase() === reference.toLowerCase() &&
        Number(doc.id) !== Number(editingDocumentId)
    );

    if (duplicate) {
        throw new Error(
            "That reference number is already in use."
        );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
            "Enter an amount greater than zero."
        );
    }

    if (dueDate < issueDate) {
        throw new Error(
            "Due date cannot be earlier than issue date."
        );
    }

    if (editingDocumentId !== null) {
        const existingDocument = documents.find(
            doc => Number(doc.id) === Number(editingDocumentId)
        );

        if (!existingDocument) {
            throw new Error(
                "The document being edited could not be found."
            );
        }

        const paymentsAlreadyApplied =
            paidFor(editingDocumentId);

        if (amount + 0.005 < paymentsAlreadyApplied) {
            throw new Error(
                `The document total cannot be less than payments already applied (${money(paymentsAlreadyApplied)}).`
            );
        }

        // Preserve ID, document type, creation date,
        // and existing payment records.
        const updatedDocument = {
            ...existingDocument,
            reference,
            counterparty,
            issueDate,
            dueDate,
            amount,
            updatedAt: new Date().toISOString()
        };

        await updateRecord(
            "documents",
            updatedDocument
        );

    } else {
        await addRecord("documents", {
            type,
            reference,
            counterparty,
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

/* --------------------------------------------------
   CSV EXPORT
-------------------------------------------------- */

function csvDownload(filename, rows) {
    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
    ).join("\r\n");

    const blob = new Blob(
        ["\ufeff" + csv],
        { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

function exportAllDocuments() {
    csvDownload(
        "ledgerdesk-document-register.csv",
        [
            [
                "Type",
                "Reference",
                "Customer or Supplier",
                "Issue Date",
                "Due Date",
                "Original Amount",
                "Payments Applied",
                "Open Balance",
                "Status"
            ],

            ...documents.map(doc => [
                doc.type,
                doc.reference,
                doc.counterparty,
                doc.issueDate,
                doc.dueDate,
                doc.amount,
                paidFor(doc.id),
                balance(doc),
                status(doc)[0]
            ])
        ]
    );

    showToast("CSV export prepared.");
}

$("export-csv").addEventListener(
    "click",
    exportAllDocuments
);

/* --------------------------------------------------
   JSON BACKUP
-------------------------------------------------- */

$("export-json").addEventListener("click", () => {
    const backup = {
        application: "LedgerDesk",
        version: 1,
        exportedAt: new Date().toISOString(),
        documents,
        payments
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "ledgerdesk-backup.json";
    link.click();

    URL.revokeObjectURL(url);

    showToast("JSON backup prepared.");
});

/* --------------------------------------------------
   START APPLICATION
-------------------------------------------------- */

refresh().catch(error => {
    console.error("LedgerDesk initialization error:", error);

    showToast(
        "Database could not be opened. Check your browser."
    );
});
