import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  serverTimestamp,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { db } from './firebase-config.js';

export const refs = {
  users: collection(db, "users"),
  products: collection(db, "products"),
  sales: collection(db, "sales"),
  deliveries: collection(db, "deliveries"),
  settings: collection(db, "settings"),
  inventoryMovements: collection(db, "inventory_movements"),
  auditLogs: collection(db, "audit_logs"),
  clients: collection(db, "clients"),
  cashSessions: collection(db, "cash_sessions"),
  accountsReceivable: collection(db, "accounts_receivable"),
  suppliers: collection(db, "suppliers"),
  accountsPayable: collection(db, "accounts_payable"),
  purchaseOrders: collection(db, "purchase_orders"),
  purchases: collection(db, "purchases")
};

export async function createDoc(collectionRef, payload) {
  const data = { ...payload };

  if (!("createdAt" in data)) {
    data.createdAt = serverTimestamp();
  }

  if (!("updatedAt" in data)) {
    data.updatedAt = serverTimestamp();
  }

  const ref = await addDoc(collectionRef, data);
  return ref.id;
}

export async function updateByPath(collectionName, id, payload) {
  const ref = doc(db, collectionName, id);
  await updateDoc(ref, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function listCollection(collectionName) {
  const snap = await getDocs(query(collection(db, collectionName)));
  return snap.docs.map((row) => ({
    id: row.id,
    ...row.data()
  }));
}

export function subscribeCollection(collectionName, queryConstraints = [], callback) {
  const q = query(collection(db, collectionName), ...queryConstraints);

  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((row) => ({
        id: row.id,
        ...row.data()
      }))
    );
  });
}