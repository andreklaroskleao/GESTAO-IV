import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyB2p1EEoIqQv1PObCxaXohup4veusFRBwM",
  authDomain: "gestao-iv.firebaseapp.com",
  projectId: "gestao-iv",
  storageBucket: "gestao-iv.firebasestorage.app",
  messagingSenderId: "964409983695",
  appId: "1:964409983695:web:51e6ad585198194fda2dba"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
