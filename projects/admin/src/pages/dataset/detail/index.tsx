'use client';
import React from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import NavBar from '@/pageComponents/dataset/detail/NavBar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import CollectionPageContextProvider from '@/pageComponents/dataset/detail/CollectionCard/Context';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { serviceSideProps } from '@/web/i18n/utils';
import { useTranslation } from 'next-i18next';

const CollectionCard = dynamic(
  () => import('@/pageComponents/dataset/detail/CollectionCard/index')
);
const DataCard = dynamic(() => import('@/pageComponents/dataset/detail/DataCard'));
const Test = dynamic(() => import('@/pageComponents/dataset/detail/Test'));
const Info = dynamic(() => import('@/pageComponents/dataset/detail/Info/index'));
const Import = dynamic(() => import('@/pageComponents/dataset/detail/Import'));
const IndexEnhance = dynamic(() => import('@/pageComponents/dataset/detail/IndexEnhance'));

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  indexEnhance = 'indexEnhance',
  test = 'test',
  info = 'info',
  import = 'import'
}
type Props = { datasetId: string; currentTab: TabEnum };

const sliderStyles: FlexProps = {
  bg: 'white',
  borderRadius: 'md',
  overflowY: 'auto',
  boxShadow: 2
};

const Detail = ({ datasetId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystem();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);

  useRequest(() => loadDatasetDetail(datasetId), {
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: getErrText(err, '加载失败'),
        status: 'error'
      });
    },
    manual: false
  });

  return (
    <ProtectedRoute>
      <Layout title={datasetDetail?.name || t('common:core.dataset.Read Dataset')}>
        {isPc ? (
          <Flex h={'100%'} py={3} pl={1} pr={3} gap={2} mx={-4} mt={-4}>
            <Flex
              flex={1}
              w={0}
              bg={'white'}
              flexDir={'column'}
              boxShadow={'2'}
              borderRadius={'md'}
            >
              {currentTab !== TabEnum.import && <NavBar currentTab={currentTab} />}
              <Box flex={'1'} overflowY={'auto'}>
                {currentTab === TabEnum.collectionCard && (
                  <CollectionPageContextProvider>
                    <CollectionCard />
                  </CollectionPageContextProvider>
                )}
                {currentTab === TabEnum.indexEnhance && <IndexEnhance datasetId={datasetId} />}
                {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.import && <Import />}
              </Box>
            </Flex>

            {/* Slider */}
            <>
              {currentTab === TabEnum.dataCard && (
                <Flex {...sliderStyles} flex={'0 0 20rem'}>
                  <Info datasetId={datasetId} />
                </Flex>
              )}
              {[TabEnum.collectionCard, TabEnum.test, TabEnum.indexEnhance].includes(
                currentTab
              ) && (
                <Flex {...sliderStyles} flex={'0 0 17rem'}>
                  <Info datasetId={datasetId} />
                </Flex>
              )}
            </>
          </Flex>
        ) : (
          <MyBox display={'flex'} flexDirection={'column'} h={'100%'} pt={1} mx={-4} mt={-4}>
            <NavBar currentTab={currentTab} />

            {!!datasetDetail._id && (
              <Box flex={'1 0 0'} pb={0} overflow={'auto'}>
                {currentTab === TabEnum.collectionCard && (
                  <CollectionPageContextProvider>
                    <CollectionCard />
                  </CollectionPageContextProvider>
                )}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.indexEnhance && <IndexEnhance datasetId={datasetId} />}
                {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                {currentTab === TabEnum.info && <Info datasetId={datasetId} />}
                {currentTab === TabEnum.import && <Import />}
              </Box>
            )}
          </MyBox>
        )}
      </Layout>
    </ProtectedRoute>
  );
};

const Render = (data: Props) => (
  <DatasetPageContextProvider datasetId={data.datasetId}>
    <Detail {...data} />
  </DatasetPageContextProvider>
);
export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId || '';

  return {
    props: {
      currentTab,
      datasetId,
      ...(await serviceSideProps(context, ['dataset', 'file', 'user']))
    }
  };
}
