
const DB_NAME = "ledgerdesk";
const DB_VERSION = 1;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("documents")) {
        const store = db.createObjectStore("documents", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("type", "type", { unique: false });
      }

      if (!db.objectStoreNames.contains("payments")) {
        const store = db.createObjectStore("payments", {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("documentId", "documentId", {
          unique: false
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addRecord(storeName, record) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .add(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
