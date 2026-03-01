import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import api from '../api';

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Ref to skip redundant /auth/me call after login/register
  // (login/register already provide the user, and the redundant
  // /auth/me call can race with dashboard calls — if it fails,
  // its catch handler was destructively clearing the token)
  const skipMeRef = useRef(false);

  useEffect(() => {
    if (token) {
      api.setToken(token);

      // After login/register, we already have the user — skip /auth/me
      if (skipMeRef.current) {
        skipMeRef.current = false;
        setLoading(false);
        return;
      }

      // Page reload: validate the stored token with the server
      api.get<User>('/auth/me')
        .then(setUser)
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      api.setToken(null);
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('token', res.token);
    api.setToken(res.token);
    skipMeRef.current = true; // Don't re-validate — we already have user
    setToken(res.token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/register', {
      email, password, firstName, lastName,
    });
    localStorage.setItem('token', res.token);
    api.setToken(res.token);
    skipMeRef.current = true; // Don't re-validate — we already have user
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    api.setToken(null);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
