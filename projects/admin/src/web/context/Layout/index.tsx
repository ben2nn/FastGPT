import type { ReactNode } from 'react';
import React from 'react';
import {
  Box,
  Flex,
  VStack,
  Button,
  useColorModeValue,
  Container,
  Heading,
  Icon
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useAuth } from '@/web/context/AuthContext';
import { ViewIcon, SettingsIcon, InfoIcon, MoonIcon, TimeIcon, DownloadIcon } from '@chakra-ui/icons';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

interface MenuItem {
  label: string;
  icon: any;
  path: string;
}

const menuItems: MenuItem[] = [
  { label: '首页', icon: ViewIcon, path: '/dashboard' },
  { label: '数据统计', icon: InfoIcon, path: '/statistics' },
  { label: '任务管理', icon: TimeIcon, path: '/tasks' },
  { label: '用户管理', icon: SettingsIcon, path: '/user/list' },
  { label: '团队管理', icon: MoonIcon, path: '/team/list' },
  { label: '导入导出', icon: DownloadIcon, path: '/import-export' }
];

export default function Layout({ children, title }: LayoutProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const activeBg = useColorModeValue('blue.50', 'blue.900');
  const activeColor = useColorModeValue('blue.600', 'blue.200');

  const handleMenuClick = (path: string) => {
    router.push(path);
  };

  const isActive = (path: string) => {
    return router.pathname === path;
  };

  return (
    <Flex h="100vh" overflow="hidden">
      {/* 侧边栏 */}
      <Box
        w="250px"
        bg={bgColor}
        borderRight="1px"
        borderColor={borderColor}
        p={4}
        display="flex"
        flexDirection="column"
      >
        <Heading size="md" mb={8} color="blue.600">
          FastGPT Admin
        </Heading>

        <VStack spacing={2} align="stretch" flex={1}>
          {menuItems.map((item) => (
            <Button
              key={item.path}
              leftIcon={<Icon as={item.icon} />}
              justifyContent="flex-start"
              variant="ghost"
              bg={isActive(item.path) ? activeBg : 'transparent'}
              color={isActive(item.path) ? activeColor : 'inherit'}
              _hover={{
                bg: isActive(item.path) ? activeBg : 'gray.100'
              }}
              onClick={() => handleMenuClick(item.path)}
            >
              {item.label}
            </Button>
          ))}
        </VStack>

        <Button colorScheme="red" variant="outline" onClick={logout} mt={4}>
          退出登录
        </Button>
      </Box>

      {/* 主内容区域 */}
      <Box flex={1} overflow="auto" bg={useColorModeValue('gray.50', 'gray.900')}>
        <Container maxW="container.xl" py={8}>
          {title && (
            <Heading as="h1" mb={6}>
              {title}
            </Heading>
          )}
          {children}
        </Container>
      </Box>
    </Flex>
  );
}
