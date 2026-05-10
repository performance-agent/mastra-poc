import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { api } from "./api";
import { getFirebaseAuth, googleProvider } from "./firebase";
import type { User } from "./types";

type AuthContextValue = {
  firebaseUser: FirebaseUser | null;
  backendUser: User | null;
  isLoading: boolean;
  syncError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authDisplayName(user: FirebaseUser) {
  return user.displayName || user.email?.split("@")[0] || "User";
}

async function createBackendUser(firebaseUser: FirebaseUser, nameOverride?: string) {
  const payload = {
    firebaseUid: firebaseUser.uid,
    name: nameOverride?.trim() || authDisplayName(firebaseUser),
    email: firebaseUser.email ?? "",
    photoUrl: firebaseUser.photoURL ?? undefined,
  };

  if (!payload.email) {
    throw new Error("Firebase user does not have an email.");
  }

  return api.createUser(payload);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [backendUser, setBackendUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setSyncError(null);

      if (!user) {
        setBackendUser(null);
      } else {
        setBackendUser((current) => (current?.firebaseUid === user.uid ? current : null));
      }

      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const trimmedName = name.trim();
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      if (trimmedName) {
        await updateProfile(credential.user, { displayName: trimmedName });
      }
      const created = await createBackendUser(credential.user, trimmedName);
      setBackendUser(created);
    } catch (error) {
      await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
      throw error;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(getFirebaseAuth(), googleProvider);
    const info = getAdditionalUserInfo(credential);
    if (!info?.isNewUser) return;

    try {
      const created = await createBackendUser(credential.user);
      setBackendUser(created);
    } catch (error) {
      await firebaseSignOut(getFirebaseAuth()).catch(() => undefined);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({
      firebaseUser,
      backendUser,
      isLoading,
      syncError,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [backendUser, firebaseUser, isLoading, signIn, signInWithGoogle, signOut, signUp, syncError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}
