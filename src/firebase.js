import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCTBITDL26I4tK6I_yfhyy-dJTH5irK_Ak",
  authDomain: "os-product-manager.firebaseapp.com",
  projectId: "os-product-manager",
  storageBucket: "os-product-manager.firebasestorage.app",
  messagingSenderId: "923681209247",
  appId: "1:923681209247:web:6e11563309da40da4fdbaa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
