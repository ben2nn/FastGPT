import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getWebReqUrl } from '@/web/common/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';

interface User {
  _id: string;
  username: string;
  status: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEY = 'admin_user';

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // 登录方法 — 服务端通过 Set-Cookie 设置 fastgpt_token
  const login = async (username: string, password: string): Promise<void> => {
    const hashedPassword = await hashStr(password);

    const response = await fetch(getWebReqUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // 接收 Set-Cookie
      body: JSON.stringify({ username, password: hashedPassword })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '登录失败');
    }

    // 保存用户信息到 localStorage（cookie 由服务端管理）
    setUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

    // 登录成功后加载模型列表
    useSystemStore.getState().initStaticData();
  };

  // 登出方法
  const logout = () => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
    // 调用后端清除 session + cookie
    fetch(getWebReqUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    router.push('/login');
  };

  // 验证认证状态 — 通过 cookie 自动携带 session
  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(getWebReqUrl('/api/auth/verify'), {
        method: 'GET',
        credentials: 'include' // 自动携带 fastgpt_token cookie
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setUser(null);
        localStorage.removeItem(USER_KEY);
        return false;
      }

      setUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return true;
    } catch (error) {
      console.error('Auth verification error:', error);
      setUser(null);
      localStorage.removeItem(USER_KEY);
      return false;
    }
  }, []);

  const isAuthenticated = !!user;

  // 组件挂载时验证认证状态
  useEffect(() => {
    // 先从 localStorage 恢复用户信息（快速显示 UI）
    try {
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch {}

    // 然后通过 cookie 验证真实状态
    checkAuth().finally(() => setIsLoading(false));
  }, []);

  // 认证成功后加载系统数据
  useEffect(() => {
    if (isAuthenticated) {
      useSystemStore.getState().initStaticData();
    }
  }, [isAuthenticated]);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    checkAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
