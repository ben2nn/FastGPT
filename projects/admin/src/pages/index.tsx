import React from 'react';
import Loading from '@/components/common/Loading';

const Index = () => {
  // 服务端会处理重定向，这里只显示加载状态
  return <Loading />;
};

export async function getServerSideProps(context: any) {
  try {
    // 检查认证状态
    const token = context.req.cookies?.admin_token;

    if (!token) {
      // 未登录，重定向到登录页
      return {
        redirect: {
          destination: '/login',
          permanent: false
        }
      };
    }

    // 已登录，重定向到 dashboard
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false
      }
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    // 发生错误时重定向到登录页
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }
}

export default Index;
