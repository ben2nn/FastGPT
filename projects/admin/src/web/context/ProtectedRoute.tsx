import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Spinner, Center } from '@chakra-ui/react';
import { useAuth } from './AuthContext';

// ProtectedRoute 组件 Props
interface ProtectedRouteProps {
  children: React.ReactNode;
  /** SSR 已验证认证，跳过客户端验证 */
  ssrAuthenticated?: boolean;
}

/**
 * 路由保护组件
 * 用于包装需要认证的页面，确保只有已登录用户才能访问
 *
 * 当 ssrAuthenticated=true 时，跳过客户端验证直接放行
 * 否则通过 AuthContext 进行客户端验证
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, ssrAuthenticated }) => {
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(!ssrAuthenticated);
  const [hasVerified, setHasVerified] = useState(!!ssrAuthenticated);

  useEffect(() => {
    // SSR 已验证，跳过客户端验证
    if (ssrAuthenticated) {
      setIsChecking(false);
      setHasVerified(true);
      return;
    }

    const verifyAuth = async () => {
      if (authLoading) return;

      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }

      if (!hasVerified) {
        try {
          const isValid = await checkAuth();
          if (!isValid) {
            router.replace('/login');
          } else {
            setIsChecking(false);
            setHasVerified(true);
          }
        } catch (error) {
          console.error('Auth verification error:', error);
          router.replace('/login');
        }
      }
    };

    verifyAuth();
  }, [isAuthenticated, authLoading, checkAuth, router, hasVerified, ssrAuthenticated]);

  if (authLoading || isChecking) {
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <Spinner size="xl" color="blue.500" thickness="4px" />
        </Box>
      </Center>
    );
  }

  if (!isAuthenticated && !ssrAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
