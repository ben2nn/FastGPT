// pages/_app.tsx
import { ChakraProvider, ColorModeScript, theme } from '@chakra-ui/react';
import { NextPage } from 'next';
import { ReactElement } from 'react/index';
import { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function App({ Component, pageProps }: AppPropsWithLayout) {
  return (
    <>
      {/* 保证首屏颜色模式一致 */}
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        <Component {...pageProps} />
      </ChakraProvider>
    </>
  );
}

export default appWithTranslation(App);
