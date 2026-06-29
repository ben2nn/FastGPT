import React, { useMemo } from 'react';
import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useAuth } from '@/web/context/AuthContext';

const MotionFlex = motion(Flex);

interface MenuItem {
  label: string;
  icon: string;
  activeIcon: string;
  path: string;
  activeLinks: string[];
}

const menuItems: MenuItem[] = [
  {
    label: '首页',
    icon: 'navbar/dashboardLight',
    activeIcon: 'navbar/dashboardFill',
    path: '/dashboard',
    activeLinks: ['/dashboard']
  },
  {
    label: '数据统计',
    icon: 'common/data',
    activeIcon: 'common/data',
    path: '/statistics',
    activeLinks: ['/statistics']
  },
  {
    label: '任务管理',
    icon: 'common/detail',
    activeIcon: 'common/detail',
    path: '/tasks',
    activeLinks: ['/tasks']
  },
  {
    label: '用户管理',
    icon: 'navbar/userLight',
    activeIcon: 'navbar/userFill',
    path: '/user/list',
    activeLinks: ['/user']
  },
  {
    label: '团队管理',
    icon: 'support/team/memberLight',
    activeIcon: 'support/team/memberLight',
    path: '/team/list',
    activeLinks: ['/team']
  },
  {
    label: '知识库',
    icon: 'navbar/datasetLight',
    activeIcon: 'navbar/datasetFill',
    path: '/dataset/list',
    activeLinks: ['/dataset']
  },
  {
    label: '备份还原',
    icon: 'common/download',
    activeIcon: 'common/download',
    path: '/import-export',
    activeLinks: ['/import-export']
  }
];

function MenuItem({ item, isActive }: { item: MenuItem; isActive: boolean }) {
  const router = useRouter();

  return (
    <MotionFlex
      align="center"
      p={3}
      borderRadius="md"
      cursor="pointer"
      bg={isActive ? 'primary.600' : 'transparent'}
      color={isActive ? 'white' : 'whiteAlpha.700'}
      _hover={{ bg: isActive ? 'primary.600' : 'whiteAlpha.100' }}
      transition="all 0.2s"
      position="relative"
      onClick={() => router.push(item.path)}
      onMouseEnter={() => router.prefetch(item.path)}
      whileHover={{ x: 2 }}
    >
      {isActive && (
        <Box
          position="absolute"
          left={0}
          top="50%"
          transform="translateY(-50%)"
          w="3px"
          h="60%"
          bg="white"
          borderRadius="0 2px 2px 0"
        />
      )}
      <MyIcon
        name={isActive ? (item.activeIcon as any) : (item.icon as any)}
        mr={3}
        w="18px"
        h="18px"
      />
      <Text fontSize="sm" fontWeight={isActive ? '600' : '400'}>
        {item.label}
      </Text>
    </MotionFlex>
  );
}

export default function AdminSidebar() {
  const router = useRouter();
  const { logout } = useAuth();

  const isActive = (item: MenuItem) => {
    return item.activeLinks.some((link) => router.pathname.startsWith(link));
  };

  return (
    <Flex direction="column" w="240px" h="100vh" bg="myGray.900" flexShrink={0}>
      {/* 品牌区 */}
      <Flex align="center" p={6}>
        <Text color="white" fontWeight="bold" fontSize="lg">
          FastGPT Admin
        </Text>
      </Flex>

      {/* 菜单列表 */}
      <VStack flex={1} p={3} spacing={1} align="stretch">
        {menuItems.map((item) => (
          <MenuItem key={item.path} item={item} isActive={isActive(item)} />
        ))}
      </VStack>

      {/* 底部退出 */}
      <Box p={4}>
        <MotionFlex
          align="center"
          p={3}
          borderRadius="md"
          cursor="pointer"
          color="whiteAlpha.600"
          _hover={{ color: 'whiteAlpha.900', bg: 'whiteAlpha.100' }}
          transition="all 0.2s"
          onClick={logout}
          whileHover={{ x: 2 }}
        >
          <MyIcon name="support/account/loginoutLight" mr={3} w="18px" h="18px" />
          <Text fontSize="sm">退出登录</Text>
        </MotionFlex>
      </Box>
    </Flex>
  );
}
