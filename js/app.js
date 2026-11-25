
import { getAll, addRecord } from "./db.js";

const $ = (id) => document.getElementById(id);

let documents = [];
let payments = [];
let toastTimer;

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
        d => d.id === Number(r.documentId)
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
        d => d.id === Number(p.documentId)
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


function openDialog(type) {
  $("record-form").reset();
  $("form-error").textContent = "";

  $("record-type").value = type;

  $("document-fields").classList.toggle(
    "hidden",
    type === "payment"
  );

  $("payment-fields").classList.toggle(
    "hidden",
    type !== "payment"
  );

  // Disable hidden fields so they don't block form submission.
  $("document-fields")
    .querySelectorAll("input, select, textarea")
    .forEach(field => {
      field.disabled = type === "payment";
    });

  $("payment-fields")
    .querySelectorAll("input, select, textarea")
    .forEach(field => {
      field.disabled = type !== "payment";
    });

  $("dialog-title").textContent =
    type === "invoice"
      ? "Add customer invoice"
      : type === "bill"
        ? "Add supplier bill"
        : "Record payment";

  $("counterparty-label").firstChild.textContent =
    type === "bill" ? "Supplier name" : "Customer name";

  $("issue-date").value = today();
  $("due-date").value = today();
  $("payment-date").value = today();

  if (type === "payment") {
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

// Open record forms
document.querySelectorAll("[data-add]").forEach(btn => {
  btn.addEventListener("click", () =>
    openDialog(btn.dataset.add)
  );
});

$("quick-add").addEventListener("click", () =>
  openDialog("invoice")
);

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

// Save records
$("record-form").addEventListener("submit", async event => {
  event.preventDefault();

  const type = $("record-type").value;

  try {
    if (type === "payment") {
      const docId = Number($("payment-document").value);

      const doc = documents.find(
        d => d.id === docId
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

      if (
        documents.some(
          d => d.reference.toLowerCase() === reference.toLowerCase()
        )
      ) {
        throw new Error(
          "That reference number is already in use."
        );
      }

      const amount = Number($("amount").value);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(
          "Enter an amount greater than zero."
        );
      }

      if ($("due-date").value < $("issue-date").value) {
        throw new Error(
          "Due date cannot be earlier than issue date."
        );
      }

      await addRecord("documents", {
        type,
        reference,
        counterparty: $("counterparty").value.trim(),
        issueDate: $("issue-date").value,
        dueDate: $("due-date").value,
        amount,
        createdAt: new Date().toISOString()
      });
    }

    $("record-dialog").close();

    await refresh();

    showToast("Record saved successfully.");

  } catch (error) {
    $("form-error").textContent =
      error.message || "Could not save record.";
  }
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
