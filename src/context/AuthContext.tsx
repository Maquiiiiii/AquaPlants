import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, firebaseInitError, isFirebaseConfigured } from '../firebase/config';
import { logAuditEvent } from '../security/auditService';
import { sanitizeInput } from '../security/cryptoService';
import { USER_ROLES, type UserProfile, type UserRole } from '../types/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_PROFILE_KEY = 'aquaplants_auth_profile';

function readCachedProfile(): UserProfile | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(SESSION_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }
    const rol: UserRole = isValidRole(parsed.rol) ? parsed.rol : 'Encargado de cultivo';
    return {
      uid: parsed.uid,
      nombre: sanitizeInput(String(parsed.nombre ?? 'Usuario')),
      email: sanitizeInput(parsed.email),
      rol,
      fecha_creacion: String(parsed.fecha_creacion ?? ''),
    };
  } catch {
    return null;
  }
}

function writeCachedProfile(nextProfile: UserProfile | null): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (nextProfile) {
      window.sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(nextProfile));
    } else {
      window.sessionStorage.removeItem(SESSION_PROFILE_KEY);
    }
  } catch {
    // Ignorar errores de almacenamiento en modo privado
  }
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  authError: string | null;
  isConfigured: boolean;
  configError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    nombre: string,
    email: string,
    password: string,
    rol: UserRole,
  ) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

function validateEmailAndPassword(rawEmail: string, password: string): string {
  const cleanEmail = sanitizeInput(rawEmail).toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Ingresa un correo electrónico con formato válido.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return cleanEmail;
}

function mapFirebaseError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Credenciales inválidas. Verifica tu correo y contraseña.';
      case 'auth/email-already-in-use':
        return 'El correo electrónico ya está registrado.';
      case 'auth/weak-password':
        return 'La contraseña no cumple con la complejidad mínima requerida.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Espera unos minutos antes de reintentar.';
      case 'auth/network-request-failed':
        return 'Error de red al conectar con Firebase Authentication.';
      default:
        return `Error de autenticación (${code}).`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Ocurrió un error inesperado en autenticación.';
}

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) {
    return null;
  }
  const ref = doc(db, 'usuarios', uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'permission-denied') {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      snap = await getDoc(ref);
    } else {
      throw err;
    }
  }
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  const rol: UserRole = isValidRole(data.rol) ? data.rol : 'Encargado de cultivo';
  return {
    uid: String(data.uid ?? uid),
    nombre: sanitizeInput(String(data.nombre ?? 'Usuario')),
    email: sanitizeInput(String(data.email ?? '')),
    rol,
    fecha_creacion: String(data.fecha_creacion ?? ''),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile());
  const [loading, setLoading] = useState<boolean>(() => Boolean(auth));
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Evita condiciones de carrera cuando `register` crea el documento en Firestore justo después de createUser
  const isRegisteringRef = useRef<boolean>(false);
  const previousUidRef = useRef<string | null>(null);
  const authRequestRef = useRef<number>(0);

  useEffect(() => {
    if (!auth) {
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setProfileLoading(false);
      setLoading(false);
    }, 2500);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      window.clearTimeout(fallbackTimer);
      const currentRequest = ++authRequestRef.current;

      if (!firebaseUser) {
        previousUidRef.current = null;
        setUser(null);
        setProfile(null);
        writeCachedProfile(null);
        setProfileLoading(false);
        setLoading(false);
        return;
      }

      if (isRegisteringRef.current) {
        previousUidRef.current = firebaseUser.uid;
        setUser(firebaseUser);
        setLoading(false);
        return;
      }

      if (firebaseUser.uid !== previousUidRef.current) {
        previousUidRef.current = firebaseUser.uid;
        setLoading(true);
        setProfileLoading(true);
        setProfile(null);
        writeCachedProfile(null);
      } else {
        setProfileLoading(true);
      }

      setUser(firebaseUser);
      try {
        const fetchedProfile = await fetchUserProfile(firebaseUser.uid);
        if (currentRequest !== authRequestRef.current) return;
        setProfile(fetchedProfile);
        writeCachedProfile(fetchedProfile);
      } catch (error) {
        if (currentRequest !== authRequestRef.current) return;
        setAuthError(mapFirebaseError(error));
      } finally {
        if (currentRequest === authRequestRef.current) {
          setProfileLoading(false);
          setLoading(false);
        }
      }
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const login = useCallback(async (rawEmail: string, password: string) => {
    setAuthError(null);
    if (!auth || !db) {
      const msg = firebaseInitError ?? 'Firebase no está configurado.';
      setAuthError(msg);
      throw new Error(msg);
    }

    let cleanEmail: string;
    try {
      cleanEmail = validateEmailAndPassword(rawEmail, password);
    } catch (validationError) {
      const msg = mapFirebaseError(validationError);
      setAuthError(msg);
      throw validationError;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const userProfile = await fetchUserProfile(credential.user.uid);
      setProfile(userProfile);

      await logAuditEvent({
        uid: credential.user.uid,
        email: cleanEmail,
        rol: userProfile?.rol ?? 'Encargado de cultivo',
        accion: 'LOGIN_EXITOSO',
        detalle: `Inicio de sesión exitoso para ${cleanEmail}`,
      });
    } catch (error) {
      const msg = mapFirebaseError(error);
      setAuthError(msg);

      await logAuditEvent({
        uid: 'NO_AUTENTICADO',
        email: cleanEmail,
        rol: 'No autenticado',
        accion: 'LOGIN_FALLIDO',
        detalle: `Intento fallido de inicio de sesión: ${msg}`,
      });

      throw new Error(msg);
    }
  }, []);

  const register = useCallback(
    async (rawNombre: string, rawEmail: string, password: string, rol: UserRole) => {
      setAuthError(null);
      if (!auth || !db) {
        const msg = firebaseInitError ?? 'Firebase no está configurado.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const cleanNombre = sanitizeInput(rawNombre);
      if (cleanNombre.length < 2) {
        const msg = 'El nombre sanitizado debe tener al menos 2 caracteres válidos.';
        setAuthError(msg);
        throw new Error(msg);
      }

      if (!isValidRole(rol)) {
        const msg = 'Rol de usuario inválido.';
        setAuthError(msg);
        throw new Error(msg);
      }

      let cleanEmail: string;
      try {
        cleanEmail = validateEmailAndPassword(rawEmail, password);
      } catch (validationError) {
        const msg = mapFirebaseError(validationError);
        setAuthError(msg);
        throw validationError;
      }

      isRegisteringRef.current = true;
      try {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const uid = credential.user.uid;

        const newProfile: UserProfile = {
          uid,
          nombre: cleanNombre,
          email: cleanEmail,
          rol,
          fecha_creacion: new Date().toISOString(),
        };

        await setDoc(doc(db, 'usuarios', uid), newProfile);
        setProfile(newProfile);

        await logAuditEvent({
          uid,
          email: cleanEmail,
          rol,
          accion: 'REGISTRO_USUARIO',
          detalle: `Usuario registrado con rol ${rol}`,
        });
      } catch (error) {
        const msg = mapFirebaseError(error);
        setAuthError(msg);
        throw new Error(msg);
      } finally {
        isRegisteringRef.current = false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setAuthError(null);
    if (!auth) {
      return;
    }

    const currentUid = auth.currentUser?.uid;
    const currentEmail = profile?.email ?? auth.currentUser?.email ?? 'desconocido';
    const currentRol = profile?.rol ?? 'Encargado de cultivo';

    if (currentUid) {
      try {
        await logAuditEvent({
          uid: currentUid,
          email: currentEmail,
          rol: currentRol,
          accion: 'LOGOUT',
          detalle: `Cierre de sesión de ${currentEmail}`,
        });
      } catch {
        // No bloquear el cierre de sesión si falla el registro de auditoría
      }
    }

    previousUidRef.current = null;
    setUser(null);
    setProfile(null);
    writeCachedProfile(null);
    await signOut(auth);
  }, [profile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      profileLoading,
      authError,
      isConfigured: isFirebaseConfigured,
      configError: firebaseInitError,
      login,
      register,
      logout,
      clearAuthError,
    }),
    [user, profile, loading, profileLoading, authError, login, register, logout, clearAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider.');
  }
  return ctx;
}
