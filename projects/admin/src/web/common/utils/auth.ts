/**
 * 服务端认证工具函数
 * 用于在 getServerSideProps 中检查用户认证状态
 */

import type { GetServerSidePropsContext } from 'next';

/**
 * 检查用户是否已认证
 * 通过检查 cookie 中的 admin_token 来判断
 */
export function isAuthenticated(context: GetServerSidePropsContext): boolean {
  const token = context.req.cookies?.admin_token;
  return !!token;
}

/**
 * 要求用户已认证，否则重定向到登录页
 * 用于需要认证的页面
 */
export function requireAuth(context: GetServerSidePropsContext) {
  if (!isAuthenticated(context)) {
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }
  return null;
}

/**
 * 要求用户未认证，否则重定向到首页
 * 用于登录页等不需要认证的页面
 */
export function requireGuest(context: GetServerSidePropsContext) {
  if (isAuthenticated(context)) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false
      }
    };
  }
  return null;
}
