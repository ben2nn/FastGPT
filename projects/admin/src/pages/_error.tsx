// pages/_error.tsx
import { Container, Heading, Text, Button } from '@chakra-ui/react';
import { NextPageContext } from 'next';
import Link from 'next/link';

interface ErrorPageProps {
  statusCode?: number;
}

function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <Container centerContent py={8}>
      <Heading as="h1" size="2xl" mb={4}>
        出错啦！
      </Heading>
      <Text fontSize="lg" mb={6}>
        {statusCode ? `服务器返回错误代码：${statusCode}` : '发生了一个客户端错误，请稍后再试。'}
      </Text>
      <Link href="/" passHref>
        <Button colorScheme="blue">返回首页</Button>
      </Link>
    </Container>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
