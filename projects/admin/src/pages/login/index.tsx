import React from 'react';
import { Box, Flex, Heading, Text, useToast } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { useAuth } from '@/web/context/AuthContext';
import type { LoginFormData } from '../../components/LoginForm';
import LoginForm from '../../components/LoginForm';

const MotionBox = motion(Box);

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();

  const handleSubmit = async (data: LoginFormData) => {
    try {
      await login(data.username, data.password);

      toast({
        title: '登录成功',
        status: 'success',
        duration: 2000,
        isClosable: true
      });

      const basePath = process.env.NEXT_PUBLIC_BASE_URL || '';
      window.location.href = `${basePath}/dashboard`;
    } catch (error) {
      toast({
        title: '登录失败',
        description: error instanceof Error ? error.message : '登录失败，请检查用户名和密码',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  return (
    <Flex minH="100vh">
      {/* 左侧品牌面板 */}
      <Box
        flex={1}
        bg="linear-gradient(135deg, #2152d9 0%, #3370ff 40%, #4e83fd 100%)"
        display={{ base: 'none', md: 'flex' }}
        alignItems="center"
        justifyContent="center"
        position="relative"
        overflow="hidden"
      >
        {/* 装饰性背景元素 */}
        <Box
          position="absolute"
          top="-20%"
          right="-10%"
          w="400px"
          h="400px"
          borderRadius="full"
          bg="whiteAlpha.100"
        />
        <Box
          position="absolute"
          bottom="-30%"
          left="-15%"
          w="500px"
          h="500px"
          borderRadius="full"
          bg="whiteAlpha.050"
        />

        <MotionBox
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          textAlign="center"
          zIndex={1}
        >
          <Heading color="white" size="2xl" mb={4}>
            FastGPT Admin
          </Heading>
          <Text color="whiteAlpha.800" fontSize="lg">
            AI Agent 管理平台
          </Text>
        </MotionBox>
      </Box>

      {/* 右侧表单面板 */}
      <Flex flex={1} align="center" justify="center" bg="white" p={8}>
        <MotionBox
          w="full"
          maxW="400px"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Heading as="h1" size="xl" mb={2} color="myGray.900">
            欢迎回来
          </Heading>
          <Text color="myGray.500" mb={8}>
            请登录管理员账号
          </Text>

          <LoginForm onSubmit={handleSubmit} />
        </MotionBox>
      </Flex>
    </Flex>
  );
}

export async function getServerSideProps(context: any) {
  try {
    const token = context.req.cookies?.admin_token;

    if (token) {
      return {
        redirect: {
          destination: '/dashboard',
          permanent: false
        }
      };
    }

    return {
      props: {}
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    return {
      props: {}
    };
  }
}
