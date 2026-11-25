
const DB_NAME = "ledgerdesk";
const DB_VERSION = 2;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;

      // Preserve the existing documents store.
      if (!db.objectStoreNames.contains("documents")) {
        const store = db.createObjectStore("documents", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("type", "type", { unique: false });
      }

      // Preserve the existing payments store.
      if (!db.objectStoreNames.contains("payments")) {
        const store = db.createObjectStore("payments", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("documentId", "documentId", {
          unique: false
        });
      }

      // Add the customers directory.
      let customersStore;

      if (!db.objectStoreNames.contains("customers")) {
        customersStore = db.createObjectStore("customers", {
          keyPath: "id",
          autoIncrement: true
        });

        customersStore.createIndex("code", "code", {
          unique: true
        });

        customersStore.createIndex("name", "name", {
          unique: false
        });
      } else {
        customersStore = transaction.objectStore("customers");
      }

      // Add the suppliers directory.
      let suppliersStore;

      if (!db.objectStoreNames.contains("suppliers")) {
        suppliersStore = db.createObjectStore("suppliers", {
          keyPath: "id",
          autoIncrement: true
        });

        suppliersStore.createIndex("code", "code", {
          unique: true
        });

        suppliersStore.createIndex("name", "name", {
          unique: false
        });
      } else {
        suppliersStore = transaction.objectStore("suppliers");
      }

      // Migrate existing document counterparties.
      const documentsStore = transaction.objectStore("documents");
      const cursorRequest = documentsStore.openCursor();

      const customerIds = new Map();
      const supplierIds = new Map();

      let nextCustomerNumber = 1;
      let nextSupplierNumber = 1;

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;

        if (!cursor) return;

        const document = cursor.value;

        let targetStore;
        let targetMap;
        let targetField;
        let code;

        if (document.type === "invoice") {
          targetStore = customersStore;
          targetMap = customerIds;
          targetField = "customerId";

          const name = String(document.counterparty || "").trim();

          if (!name) {
            cursor.continue();
            return;
          }

          const key = name.toLowerCase();

          if (targetMap.has(key)) {
            document.customerId = targetMap.get(key);
            cursor.update(document);
            cursor.continue();
            return;
          }

          code = `CUST-${String(nextCustomerNumber).padStart(4, "0")}`;
          nextCustomerNumber++;

        } else if (document.type === "bill") {
          targetStore = suppliersStore;
          targetMap = supplierIds;
          targetField = "supplierId";

          const name = String(document.counterparty || "").trim();

          if (!name) {
            cursor.continue();
            return;
          }

          const key = name.toLowerCase();

          if (targetMap.has(key)) {
            document.supplierId = targetMap.get(key);
            cursor.update(document);
            cursor.continue();
            return;
          }

          code = `SUP-${String(nextSupplierNumber).padStart(4, "0")}`;
          nextSupplierNumber++;

        } else {
          cursor.continue();
          return;
        }

        const name = String(document.counterparty).trim();
        const key = name.toLowerCase();

        const addRequest = targetStore.add({
          code,
          name,
          createdAt: document.createdAt || new Date().toISOString(),
          status: "active"
        });

        addRequest.onsuccess = () => {
          const newId = addRequest.result;

          targetMap.set(key, newId);
          document[targetField] = newId;

          cursor.update(document);
          cursor.continue();
        };
      };
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function addRecord(storeName, record) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).add(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function updateRecord(storeName, record) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
