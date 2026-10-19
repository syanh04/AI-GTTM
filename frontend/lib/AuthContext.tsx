'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface User {
  username: string;
  role: 'admin' | 'operator' | 'viewer' | 'user';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_CHECK_INTERVAL_MS = 10_000;
const AUTH_REQUEST_TIMEOUT_MS = 8_000;

class SessionValidationError extends Error {
  status: number;
  isAuthenticationFailure: boolean;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'SessionValidationError';
    this.status = status;
    this.isAuthenticationFailure = status === 401 || status === 403;
  }
}

function persistUser(user: User) {
  localStorage.setItem('auth_user', JSON.stringify(user));
}

function readPersistedUser(): User | null {
  try {
    const value = JSON.parse(localStorage.getItem('auth_user') || 'null');
    if (!value?.username || !['admin', 'operator', 'viewer', 'user'].includes(value.role)) return null;
    return value as User;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function clearPersistedSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

async function fetchCurrentUser(): Promise<User> {
  let res: Response;
  try {
    res = await fetchWithTimeout('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new SessionValidationError('Tạm thời không thể kiểm tra phiên đăng nhập.');
  }

  if (!res.ok) {
    throw new SessionValidationError(
      res.status === 401 || res.status === 403
        ? 'Phiên đăng nhập không còn hợp lệ.'
        : 'Dịch vụ xác thực đang tạm thời gián đoạn.',
      res.status,
    );
  }

  const data = await res.json();
  if (!data.is_active) {
    throw new SessionValidationError('Tài khoản đã bị khóa.', 403);
  }

  return {
    username: data.username,
    role: data.role,
  };
}

function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof SessionValidationError && error.isAuthenticationFailure;
}

async function fetchCurrentUserWithRetry(): Promise<User> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchCurrentUser();
    } catch (error) {
      if (isAuthenticationFailure(error)) throw error;
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
    setToken(null);
    setUser(null);
    clearPersistedSession();
  }, []);

  const restoreSession = useCallback(async () => {
    const verifiedUser = await fetchCurrentUserWithRetry();
    setToken('cookie-session');
    setUser(verifiedUser);
    persistUser(verifiedUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const cachedUser = readPersistedUser();
      if (cachedUser) {
        setToken('cookie-session');
        setUser(cachedUser);
        setIsLoading(false);
      }
      try {
        const verifiedUser = await fetchCurrentUserWithRetry();
        if (cancelled) return;
        setToken('cookie-session');
        setUser(verifiedUser);
        persistUser(verifiedUser);
      } catch (error) {
        if (!cancelled && (isAuthenticationFailure(error) || !cachedUser)) {
          setToken(null);
          setUser(null);
          clearPersistedSession();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    let validating = false;
    let disposed = false;

    const validateSession = async () => {
      if (validating || disposed) return;
      validating = true;
      try {
        await restoreSession();
      } catch (error) {
        if (isAuthenticationFailure(error)) {
          logout();
        }
      } finally {
        validating = false;
      }
    };

    const intervalId = window.setInterval(validateSession, SESSION_CHECK_INTERVAL_MS);
    window.addEventListener('focus', validateSession);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', validateSession);
    };
  }, [logout, restoreSession, token]);

  const login = async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    let res: Response;
    try {
      res = await fetchWithTimeout('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        credentials: 'include',
      });
    } catch {
      throw new Error('Không thể kết nối tới dịch vụ đăng nhập.');
    }

    if (!res.ok) {
      let message = 'Đăng nhập thất bại';
      try {
        const err = await res.json();
        message = err.detail || message;
      } catch {
        try {
          message = await res.text();
        } catch {
          message = 'Đăng nhập thất bại';
        }
      }
      throw new Error(message);
    }

    const data = await res.json();
    const newUser: User = {
      username: data.username,
      role: data.role,
    };

    setToken('cookie-session');
    setUser(newUser);
    persistUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
