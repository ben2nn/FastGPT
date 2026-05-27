// pages/_app.tsx
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import type { NextPage } from 'next';
import type { ReactElement } from 'react';
import { useState, useEffect } from 'react';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { theme } from '@fastgpt/web/styles/theme';
import { AuthProvider } from '../web/context/AuthContext';

// 全局样式
import '../web/styles/global.scss';

// 所有需要预加载的路由
const PREFETCH_ROUTES = [
  '/dashboard',
  '/statistics',
  '/tasks',
  '/user/list',
  '/team/list',
  '/import-export'
];

// 初始化在 API 请求时通过中间件自动触发
// 不在 _app.tsx 中执行，避免构建时触发

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function App({ Component, pageProps }: AppPropsWithLayout) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 1 分钟
            cacheTime: 5 * 60_000, // 5 分钟
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  // 注意：定时任务会在服务器启动时自动初始化
  // /api/system/init 用于手动触发数据提取任务，不需要在这里调用

  // 预加载所有页面路由，避免首次切换时编译延迟
  useEffect(() => {
    PREFETCH_ROUTES.forEach((route) => {
      router.prefetch(route);
    });
  }, [router]);

  return (
    <>
      {/* 保证首屏颜色模式一致 */}
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <QueryClientProvider client={queryClient}>
        <ChakraProvider theme={theme}>
          <AuthProvider>
            <Component {...pageProps} />
          </AuthProvider>
        </ChakraProvider>
      </QueryClientProvider>
    </>
  );
}

export default App;
