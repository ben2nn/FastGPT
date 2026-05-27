import type { ReactNode } from 'react';
import React, { useEffect } from 'react';
import { Box, Flex, Text, Avatar } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import NProgress from 'nprogress';
import AdminSidebar from './AdminSidebar';

NProgress.configure({ showSpinner: false, minimum: 0.2, speed: 300 });

const MotionBox = motion(Box);

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const router = useRouter();

  useEffect(() => {
    const handleStart = () => NProgress.start();
    const handleComplete = () => NProgress.done();

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router]);

  return (
    <Flex h="100vh" overflow="hidden">
      <AdminSidebar />
      <Flex flex={1} direction="column" overflow="hidden">
        {/* TopBar */}
        <Flex
          h="56px"
          bg="white"
          borderBottom="1px"
          borderColor="borderColor.low"
          px={6}
          align="center"
          justify="space-between"
          flexShrink={0}
        >
          <Text fontWeight="600" fontSize="lg" color="myGray.900">
            {title}
          </Text>
          <Avatar size="sm" bg="primary.600" />
        </Flex>
        {/* Content */}
        <Box flex={1} overflow="auto" bg="myGray.50" p={6}>
          <MotionBox
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </MotionBox>
        </Box>
      </Flex>
    </Flex>
  );
}
