import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, type User } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, accountType: 'parent' | 'student') => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'openclass_learner_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    isLoading: true,
    isAuthenticated: false,
  });

  const setAuth = (user: User | null, token: string | null) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    setState({
      user,
      token,
      isLoading: false,
      isAuthenticated: !!user,
    });
  };

  // On mount: check existing token
  useEffect(() => {
    const init = async () => {
      const existingToken = localStorage.getItem(TOKEN_KEY);
      if (!existingToken) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const { user } = await api.getMe();
        setAuth(user, existingToken);
      } catch {
        // Token invalid/expired
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
      }
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    setAuth(user, token);
  }, []);

  const register = useCallback(
    async (email: string, password: string, accountType: 'parent' | 'student') => {
      const { token, user } = await api.register(email, password, accountType);
      setAuth(user, token);
    },
    [],
  );

  const logout = useCallback(() => {
    setAuth(null, null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.getMe();
      setState((prev) => ({ ...prev, user, isAuthenticated: true }));
    } catch {
      setAuth(null, null);
    }
  }, []);

  const updateUser = useCallback((user: User) => {
    setState((prev) => ({ ...prev, user }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook that redirects unauthenticated users to login.
 * Returns the auth state.
 */
export function useRequireAuth(): AuthContextType {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  return auth;
}
