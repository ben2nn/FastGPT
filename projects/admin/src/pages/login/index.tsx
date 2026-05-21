import React from 'react';
import { Box, Container, Flex, Heading, VStack, useToast, Text } from '@chakra-ui/react';
import { useAuth } from '@/web/context/AuthContext';
import { getWebReqUrl } from '@/web/common/utils';
import LoginForm, { LoginFormData } from '../../components/LoginForm';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();

  // 处理表单提交
  const handleSubmit = async (data: LoginFormData) => {
    try {
      await login(data.username, data.password);

      toast({
        title: '登录成功',
        status: 'success',
        duration: 2000,
        isClosable: true
      });

      // 登录成功后重定向到首页
      // 使用 router.push，Next.js 会自动处理 basePath
      // 如果需要强制刷新，可以使用 router.replace 或 window.location
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
      // 错误已通过 toast 显示，不需要重新抛出
    }
  };

  return (
    <Flex minH="100vh" align="center" justify="center" bg="gray.50">
      <Container maxW="md">
        <Box bg="white" p={8} borderRadius="lg" boxShadow="lg">
          <VStack spacing={6} align="stretch">
            <Heading as="h1" size="xl" textAlign="center" color="blue.600">
              登录
            </Heading>
            <Text textAlign="center" color="gray.600">
              管理员登录
            </Text>

            <LoginForm onSubmit={handleSubmit} />
          </VStack>
        </Box>
      </Container>
    </Flex>
  );
}

export async function getServerSideProps(context: any) {
  try {
    // 检查认证状态
    const token = context.req.cookies?.admin_token;

    if (token) {
      // 已登录，重定向到 dashboard
      return {
        redirect: {
          destination: '/dashboard',
          permanent: false
        }
      };
    }

    // 未登录，显示登录页
    return {
      props: {}
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    // 发生错误时仍然显示登录页
    return {
      props: {}
    };
  }
}
