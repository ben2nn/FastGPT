import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode
} from 'react';
import { useRouter } from 'next/router';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getWebReqUrl } from '@/web/common/utils';

// 用户信息类型定义
interface User {
  _id: string;
  username: string;
  status: string;
}

// 认证上下文值类型定义
interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

// 创建认证上下文
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// localStorage 键名常量
const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

// AuthProvider 组件 Props
interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider 组件
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // 从 localStorage 和 Cookie 读取 Token 和用户信息
  const loadFromStorage = () => {
    if (typeof window === 'undefined') return;

    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));

        // 确保 Cookie 也存在（如果不存在则设置）
        const cookies = document.cookie.split(';').map((c) => c.trim());
        const tokenCookie = cookies.find((c) => c.startsWith(`${TOKEN_KEY}=`));
        if (!tokenCookie) {
          // Cookie 不存在，重新设置
          const expires = new Date();
          expires.setDate(expires.getDate() + 7);
          document.cookie = `${TOKEN_KEY}=${storedToken}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
        }
      }
    } catch (error) {
      console.error('Failed to load auth data from storage:', error);
      // 清除可能损坏的数据
      clearStorage();
    }
  };

  // 保存 Token 和用户信息到 localStorage 和 Cookie
  const saveToStorage = (token: string, user: User) => {
    if (typeof window === 'undefined') return;

    try {
      // 保存到 localStorage
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // 同时保存到 Cookie（用于服务端验证）
      // 设置 7 天过期
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      document.cookie = `${TOKEN_KEY}=${token}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
    } catch (error) {
      console.error('Failed to save auth data to storage:', error);
    }
  };

  // 清除 localStorage 和 Cookie 中的认证数据
  const clearStorage = () => {
    if (typeof window === 'undefined') return;

    try {
      // 清除 localStorage
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);

      // 清除 Cookie
      document.cookie = `${TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
    } catch (error) {
      console.error('Failed to clear auth data from storage:', error);
    }
  };

  // 登录方法
  const login = async (username: string, password: string): Promise<void> => {
    try {
      // 使用 SHA-256 加密密码
      const hashedPassword = await hashStr(password);

      const response = await fetch(getWebReqUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password: hashedPassword })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '登录失败');
      }

      // 保存 Token 和用户信息
      const { token: newToken, user: newUser } = data;
      setToken(newToken);
      setUser(newUser);
      saveToStorage(newToken, newUser);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // 登出方法
  const logout = () => {
    setToken(null);
    setUser(null);
    clearStorage();
    router.push('/login');
  };

  // 验证 Token 有效性
  const checkAuth = useCallback(async (): Promise<boolean> => {
    if (!token) {
      return false;
    }

    try {
      const response = await fetch(getWebReqUrl('/api/auth/verify'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Token 无效或过期，清除认证数据
        setToken(null);
        setUser(null);
        clearStorage();
        return false;
      }

      // 更新用户信息
      setUser(data.user);
      return true;
    } catch (error) {
      console.error('Token verification error:', error);
      // 验证失败，清除认证数据
      setToken(null);
      setUser(null);
      clearStorage();
      return false;
    }
  }, [token]);

  // 组件挂载时从 localStorage 加载认证数据
  useEffect(() => {
    loadFromStorage();
    setIsLoading(false);
  }, []);

  // 计算是否已认证
  const isAuthenticated = !!token && !!user;

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// useAuth Hook - 用于在组件中访问认证上下文
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
