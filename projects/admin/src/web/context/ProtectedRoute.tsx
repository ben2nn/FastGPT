import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Spinner, Center } from '@chakra-ui/react';
import { useAuth } from './AuthContext';

// ProtectedRoute 组件 Props
interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * 路由保护组件
 * 用于包装需要认证的页面，确保只有已登录用户才能访问
 *
 * 注意：此组件主要用于客户端验证，服务端认证应在 getServerSideProps 中处理
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading, checkAuth } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [hasVerified, setHasVerified] = useState(false);

  useEffect(() => {
    const verifyAuth = async () => {
      // 如果 AuthContext 还在加载中，等待
      if (authLoading) {
        return;
      }

      // 如果未认证，直接重定向到登录页
      if (!isAuthenticated) {
        // 使用 replace 避免在历史记录中留下记录
        router.replace('/login');
        return;
      }

      // 只验证一次 Token
      if (!hasVerified) {
        try {
          const isValid = await checkAuth();

          if (!isValid) {
            // Token 无效或过期，重定向到登录页
            router.replace('/login');
          } else {
            // Token 有效，允许访问
            setIsChecking(false);
            setHasVerified(true);
          }
        } catch (error) {
          console.error('Auth verification error:', error);
          // 验证失败，重定向到登录页
          router.replace('/login');
        }
      }
    };

    verifyAuth();
  }, [isAuthenticated, authLoading, checkAuth, router, hasVerified]);

  // 显示加载状态
  if (authLoading || isChecking) {
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <Spinner size="xl" color="blue.500" thickness="4px" />
        </Box>
      </Center>
    );
  }

  // 如果未认证，不渲染子组件（等待重定向）
  if (!isAuthenticated) {
    return null;
  }

  // 渲染受保护的内容
  return <>{children}</>;
};
