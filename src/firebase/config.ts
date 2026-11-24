import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_ENV_KEYS = [
  ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['VITE_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
  ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
] as const;

export const missingFirebaseEnvVars: string[] = REQUIRED_ENV_KEYS
  .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseEnvVars.length === 0;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let firebaseInitError: string | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    firebaseInitError =
      error instanceof Error ? error.message : 'Error desconocido al inicializar Firebase.';
  }
} else {
  firebaseInitError = `Faltan variables de entorno de Firebase: ${missingFirebaseEnvVars.join(', ')}.`;
}

export { app, auth, db, firebaseInitError };
