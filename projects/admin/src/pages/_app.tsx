// pages/_app.tsx
import { ChakraProvider, ColorModeScript, theme } from '@chakra-ui/react';
import { NextPage } from 'next';
import { ReactElement, useState } from 'react';
import { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '../web/context/AuthContext';

// 初始化在 API 请求时通过中间件自动触发
// 不在 _app.tsx 中执行，避免构建时触发

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function App({ Component, pageProps }: AppPropsWithLayout) {
  // 为每个请求创建新的 QueryClient 实例
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 分钟
            cacheTime: 10 * 60 * 1000, // 10 分钟
            retry: 2,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  // 注意：定时任务会在服务器启动时自动初始化
  // /api/system/init 用于手动触发数据提取任务，不需要在这里调用

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
