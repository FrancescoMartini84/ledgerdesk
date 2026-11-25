
# LedgerDesk

**Browser-based accounting operations and financial data management application.**

LedgerDesk is an educational portfolio project designed to demonstrate practical financial operations workflows and progressive software-development skills.

## Current prototype

- Customer invoice register (accounts receivable)
- Supplier bill register (accounts payable)
- Payment receipts and disbursements applied to documents
- Calculated open balances and basic overdue status
- Dashboard summary
- CSV exports for AR, AP and payments
- JSON data backup
- IndexedDB persistence in the current browser

## Run locally

Because the application uses JavaScript ES modules and IndexedDB, serve the folder over HTTP rather than opening `index.html` directly.

With Python installed, run this command from the project directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deploy with GitHub Pages

1. Push the project files to the root of the `main` branch.
2. Open repository **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch `main` and folder `/ (root)`.
5. Save and wait for the deployment workflow to finish.
6. Visit `https://YOUR-GITHUB-USERNAME.github.io/ledgerdesk/`.

## Important limitations

- This is a browser-local prototype. Records are stored in IndexedDB on the device/browser profile where they are entered.
- It does not synchronize data between users or devices.
- It is not double-entry accounting software and does not produce certified financial statements.
- No authentication, server-side database, audit log, tax functionality, or bank-feed integration is included.
- Do not enter real customer, supplier, banking, or confidential financial information.

## Planned development

1. Improve document and payment workflows.
2. Add contacts, validation rules, and reconciliation tools.
3. Add aging reports and stronger reporting.
4. Add automated tests and data-integrity safeguards.
5. Introduce a Python/Flask API and PostgreSQL backend as a separate development stage.

## Technology

HTML · CSS · JavaScript ES modules · IndexedDB · GitHub Pages
