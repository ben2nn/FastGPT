import React, { useMemo, Component, type ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import DatasetImportContextProvider, { DatasetImportContext } from './Context';

// 错误边界：捕获子组件渲染错误并显示
class ImportErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || String(error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box p={4} color="red.500">
          <Text fontWeight="bold">Import 组件渲染错误:</Text>
          <Text fontSize="sm">{this.state.error}</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}

const loadingPlaceholder = (
  <Flex h="200px" align="center" justify="center">
    <Text color="myGray.500">加载导入组件中...</Text>
  </Flex>
);

const FileLocal = dynamic(() => import('./diffSource/FileLocal'), {
  loading: () => loadingPlaceholder
});
const FileLink = dynamic(() => import('./diffSource/FileLink'), {
  loading: () => loadingPlaceholder
});
const FileCustomText = dynamic(() => import('./diffSource/FileCustomText'), {
  loading: () => loadingPlaceholder
});
const ExternalFileCollection = dynamic(() => import('./diffSource/ExternalFile'), {
  loading: () => loadingPlaceholder
});
const APIDatasetCollection = dynamic(() => import('./diffSource/APIDataset'), {
  loading: () => loadingPlaceholder
});
const ReTraining = dynamic(() => import('./diffSource/ReTraining'), {
  loading: () => loadingPlaceholder
});
const ImageDataset = dynamic(() => import('./diffSource/ImageDataset'), {
  loading: () => loadingPlaceholder
});

const ImportDataset = () => {
  const importSource = useContextSelector(DatasetImportContext, (v) => v.importSource);

  const ImportComponent = useMemo(() => {
    if (importSource === ImportDataSourceEnum.reTraining) return ReTraining;
    if (importSource === ImportDataSourceEnum.fileLocal) return FileLocal;
    if (importSource === ImportDataSourceEnum.fileLink) return FileLink;
    if (importSource === ImportDataSourceEnum.fileCustom) return FileCustomText;
    if (importSource === ImportDataSourceEnum.externalFile) return ExternalFileCollection;
    if (importSource === ImportDataSourceEnum.apiDataset) return APIDatasetCollection;
    if (importSource === ImportDataSourceEnum.imageDataset) return ImageDataset;
    return null;
  }, [importSource]);

  if (!ImportComponent) {
    return (
      <Box p={4} color="orange.500">
        <Text>未匹配到导入组件，importSource: {String(importSource)}</Text>
      </Box>
    );
  }

  return (
    <Box flex={'1 0 0'} overflow={'auto'}>
      <ImportComponent />
    </Box>
  );
};

const Render = () => {
  return (
    <ImportErrorBoundary>
      <Flex
        flexDirection={'column'}
        bg={'white'}
        h={'100%'}
        px={[2, 9]}
        py={[2, 5]}
        borderRadius={'md'}
      >
        <DatasetImportContextProvider>
          <ImportDataset />
        </DatasetImportContextProvider>
      </Flex>
    </ImportErrorBoundary>
  );
};

export default React.memo(Render);
