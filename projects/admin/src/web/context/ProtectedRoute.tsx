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
 * 纯客户端认证，不依赖 getServerSideProps，实现 SPA 级流畅路由切换
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <Spinner size="xl" color="primary.500" thickness="4px" />
        </Box>
      </Center>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
