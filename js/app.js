
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

const today = () => new Date().toISOString().slice(0, 10);

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function paidFor(documentId) {
  return payments
    .filter(p => Number(p.documentId) === Number(documentId))
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

function balance(doc) {
  return Math.max(0, Number(doc.amount) - paidFor(doc.id));
}

function status(doc) {
  const open = balance(doc);

  if (open <= 0.005) return ["Paid", "paid"];
  if (doc.dueDate < today()) return ["Overdue", "overdue"];

  return ["Open", "open"];
}

function badge(doc) {
  const [label, cls] = status(doc);

  return `<span class="status ${cls}">${label}</span>`;
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2400);
}

async function refresh() {
  [documents, payments] = await Promise.all([
    getAll("documents"),
    getAll("payments")
  ]);

  render();
}

function render() {
  const ar = documents.filter(d => d.type === "invoice");
  const ap = documents.filter(d => d.type === "bill");

  const openAR = ar.reduce((s, d) => s + balance(d), 0);
  const openAP = ap.reduce((s, d) => s + balance(d), 0);

  const overdue = ar
    .filter(d => status(d)[0] === "Overdue")
    .reduce((s, d) => s + balance(d), 0);

  $("metric-ar").textContent = money(openAR);
  $("metric-ap").textContent = money(openAP);
  $("metric-overdue").textContent = money(overdue);

  $("metric-count").textContent =
    documents.length + payments.length;

  $("today-label").textContent =
    new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });

  const recent = [
    ...documents.map(d => ({ ...d, rowType: d.type })),
    ...payments.map(p => ({ ...p, rowType: "payment" }))
  ]
    .sort((a, b) =>
      (b.createdAt || b.date).localeCompare(a.createdAt || a.date)
    )
    .slice(0, 8);

  $("recent-rows").innerHTML = recent.map(r => {
    if (r.rowType === "payment") {
      const doc = documents.find(
        d => Number(d.id) === Number(r.documentId)
      );

      return `
        <tr>
          <td>Payment</td>
          <td>${escapeHTML(doc?.reference || "—")}</td>
          <td>${escapeHTML(doc?.counterparty || "—")}</td>
          <td>${escapeHTML(r.date)}</td>
          <td class="amount-cell">${money(r.amount)}</td>
          <td><span class="status paid">Recorded</span></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${r.type === "invoice" ? "Invoice" : "Supplier bill"}</td>
        <td>${escapeHTML(r.reference)}</td>
        <td>${escapeHTML(r.counterparty)}</td>
        <td>${escapeHTML(r.issueDate)}</td>
        <td class="amount-cell">${money(r.amount)}</td>
        <td>${badge(r)}</td>
      </tr>
    `;
  }).join("");

  $("recent-empty").classList.toggle(
    "hidden",
    recent.length > 0
  );

  renderDocuments("invoice", "ar-rows", "ar-empty");
  renderDocuments("bill", "ap-rows", "ap-empty");

  $("payment-rows").innerHTML = payments
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(p => {
      const doc = documents.find(
        d => Number(d.id) === Number(p.documentId)
      );

      return `
        <tr>
          <td>${escapeHTML(p.date)}</td>
          <td>${p.direction === "in" ? "Receipt" : "Disbursement"}</td>
          <td>${escapeHTML(doc?.reference || "—")}</td>
          <td>${escapeHTML(doc?.counterparty || "—")}</td>
          <td class="amount-cell">${money(p.amount)}</td>
          <td>${escapeHTML(p.note || "—")}</td>
        </tr>
      `;
    }).join("");

  $("payment-empty").classList.toggle(
    "hidden",
    payments.length > 0
  );
}

function renderDocuments(type, target, empty) {
  const list = documents
    .filter(d => d.type === type)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  $(target).innerHTML = list.map(d => `
    <tr>
      <td>${escapeHTML(d.reference)}</td>
      <td>${escapeHTML(d.counterparty)}</td>
      <td>${escapeHTML(d.issueDate)}</td>
      <td>${escapeHTML(d.dueDate)}</td>
      <td class="amount-cell">${money(d.amount)}</td>
      <td class="amount-cell">${money(balance(d))}</td>
      <td>${badge(d)}</td>
      <td>
        <button
          type="button"
          class="edit-button"
          data-edit-document="${d.id}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");

  $(empty).classList.toggle("hidden", list.length > 0);
}

function navigate(view) {
  document.querySelectorAll(".view").forEach(el =>
    el.classList.add("hidden")
  );

  $(`${view}-view`).classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(el =>
    el.classList.toggle(
      "active",
      el.dataset.view === view
    )
  );

  $("page-title").textContent = ({
    dashboard: "Dashboard",
    receivables: "Accounts receivable",
    payables: "Accounts payable",
    payments: "Payments",
    reports: "Reports & data"
  })[view];
}

// Open the appropriate form.
// Pass an existing document to edit it.
function openDialog(type, existingDocument = null) {
  $("record-form").reset();
  $("form-error").textContent = "";

  editingDocumentId = existingDocument
    ? existingDocument.id
    : null;

  const isPayment = type === "payment";
  const isEditing = Boolean(existingDocument);

  $("record-type").value = type;

  $("document-fields").classList.toggle(
    "hidden",
    isPayment
  );

  $("payment-fields").classList.toggle(
    "hidden",
    !isPayment
  );

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
      ? "Add customer invoice"
      : type === "bill"
        ? "Add supplier bill"
        : "Record payment";

  $("counterparty-label").firstChild.textContent =
    type === "bill" ? "Supplier name" : "Customer name";

  $("issue-date").value = today();
  $("due-date").value = today();
  $("payment-date").value = today();

  if (existingDocument) {
    $("reference").value = existingDocument.reference;
    $("counterparty").value = existingDocument.counterparty;
    $("issue-date").value = existingDocument.issueDate;
    $("due-date").value = existingDocument.dueDate;
    $("amount").value = existingDocument.amount;
  }

  if (isPayment) {
    populatePaymentDocuments();
  }

  $("record-dialog").showModal();
}

function populatePaymentDocuments() {
  const direction = $("payment-direction").value;

  const type = direction === "in" ? "invoice" : "bill";

  const eligible = documents.filter(
    d => d.type === type && balance(d) > 0.005
  );

  $("payment-document").innerHTML = eligible
    .map(d => `
      <option value="${d.id}">
        ${escapeHTML(d.reference)} —
        ${escapeHTML(d.counterparty)}
        (${money(balance(d))} open)
      </option>
    `)
    .join("");

  if (!eligible.length) {
    $("payment-document").innerHTML =
      '<option value="">No open documents available</option>';
  }
}

function csvDownload(filename, rows) {
  const csv = rows
    .map(row =>
      row.map(v =>
        `"${String(v ?? "").replace(/"/g, '""')}"`
      ).join(",")
    )
    .join("\r\n");

  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8"
    })
  );

  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function exportDocs(type) {
  const list = documents.filter(d => d.type === type);

  csvDownload(
    type === "invoice"
      ? "ledgerdesk-ar-register.csv"
      : "ledgerdesk-ap-register.csv",
    [
      [
        "Reference",
        "Counterparty",
        "Issue date",
        "Due date",
        "Original amount",
        "Payments applied",
        "Open balance",
        "Status"
      ],
      ...list.map(d => [
        d.reference,
        d.counterparty,
        d.issueDate,
        d.dueDate,
        d.amount,
        paidFor(d.id),
        balance(d),
        status(d)[0]
      ])
    ]
  );
}

// Navigation
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () =>
    navigate(btn.dataset.view)
  );
});

document.querySelectorAll("[data-go]").forEach(btn => {
  btn.addEventListener("click", () =>
    navigate(btn.dataset.go)
  );
});

// Open new record forms
document.querySelectorAll("[data-add]").forEach(btn => {
  btn.addEventListener("click", () =>
    openDialog(btn.dataset.add)
  );
});

$("quick-add").addEventListener("click", () =>
  openDialog("invoice")
);

// Edit existing invoices and bills.
// Event delegation keeps the buttons working after table re-rendering.
document.addEventListener("click", event => {
  const button = event.target.closest("[data-edit-document]");

  if (!button) return;

  const documentId = Number(button.dataset.editDocument);

  const existingDocument = documents.find(
    d => Number(d.id) === documentId
  );

  if (!existingDocument) {
    showToast("Document could not be found.");
    return;
  }

  openDialog(existingDocument.type, existingDocument);
});

$("close-dialog").addEventListener("click", () =>
  $("record-dialog").close()
);

$("cancel-dialog").addEventListener("click", () =>
  $("record-dialog").close()
);

$("payment-direction").addEventListener(
  "change",
  populatePaymentDocuments
);

// Save new records or update existing documents.
$("record-form").addEventListener("submit", async event => {
  event.preventDefault();

  const type = $("record-type").value;

  try {
    if (type === "payment") {
      const docId = Number($("payment-document").value);

      const doc = documents.find(
        d => Number(d.id) === docId
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

      await addRecord("payments", {
        documentId: docId,
        direction: $("payment-direction").value,
        date: $("payment-date").value,
        amount,
        note: $("payment-note").value.trim(),
        createdAt: new Date().toISOString()
      });

    } else {
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

      // Exclude the document currently being edited.
      const duplicate = documents.some(d =>
        String(d.reference).toLowerCase() === reference.toLowerCase() &&
        Number(d.id) !== Number(editingDocumentId)
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
          d => Number(d.id) === Number(editingDocumentId)
        );

        if (!existingDocument) {
          throw new Error(
            "The document being edited could not be found."
          );
        }

        const paymentsAlreadyApplied = paidFor(editingDocumentId);

        if (amount + 0.005 < paymentsAlreadyApplied) {
          throw new Error(
            `The document total cannot be less than payments already applied (${money(paymentsAlreadyApplied)}).`
          );
        }

        // Preserve ID, document type, creation date,
        // and all existing payment records.
        const updatedDocument = {
          ...existingDocument,
          reference,
          counterparty,
          issueDate,
          dueDate,
          amount,
          updatedAt: new Date().toISOString()
        };

        await updateRecord("documents", updatedDocument);

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

    $("record-dialog").close();

    editingDocumentId = null;

    await refresh();

    showToast(
      type === "payment"
        ? "Payment recorded successfully."
        : "Document saved successfully."
    );

  } catch (error) {
    $("form-error").textContent =
      error.message || "Could not save record.";
  }
});

// Clear editing state when the dialog closes.
$("record-dialog").addEventListener("close", () => {
  editingDocumentId = null;
});

// CSV exports
$("export-ar").addEventListener("click", () =>
  exportDocs("invoice")
);

$("export-ap").addEventListener("click", () =>
  exportDocs("bill")
);

$("export-payments").addEventListener("click", () => {
  csvDownload(
    "ledgerdesk-payment-register.csv",
    [
      ["Date", "Direction", "Document ID", "Amount", "Note"],
      ...payments.map(p => [
        p.date,
        p.direction,
        p.documentId,
        p.amount,
        p.note
      ])
    ]
  );
});

// JSON backup
$("export-backup").addEventListener("click", () => {
  const blob = new Blob(
    [
      JSON.stringify({
        application: "LedgerDesk",
        version: 1,
        exportedAt: new Date().toISOString(),
        documents,
        payments
      }, null, 2)
    ],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "ledgerdesk-backup.json";
  a.click();

  URL.revokeObjectURL(url);
});

// Initialize application
refresh().catch(error => {
  console.error(error);
  showToast(
    "Database could not be opened. Try a current browser."
  );
});


/* =================================
   DOCUMENT EDIT ACTIONS
================================= */

.edit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  padding: 7px 13px;

  border: 1px solid #d8e2f5;
  border-radius: 6px;

  background: #f0f4ff;
  color: #315fce;

  font: 600 11px 'DM Sans', sans-serif;

  cursor: pointer;
  transition: all 0.2s ease;
}

.edit-button:hover {
  background: #315fce;
  border-color: #315fce;
  color: #ffffff;

  box-shadow: 0 3px 8px #315fce25;
}

.edit-button:active {
  transform: translateY(1px);
}

.edit-button:focus-visible {
  outline: 2px solid #7895e5;
  outline-offset: 3px;
}

/* Keep action buttons properly aligned */

td:last-child {
  text-align: left;
}
