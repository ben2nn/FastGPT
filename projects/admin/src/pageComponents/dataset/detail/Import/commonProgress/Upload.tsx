import React, { useCallback, useMemo, useRef, useState } from 'react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Box,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Flex,
  Button,
  IconButton,
  Tooltip,
  Progress,
  Text,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure
} from '@chakra-ui/react';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import {
  postCreateDatasetApiDatasetCollection,
  postCreateDatasetExternalFileCollection,
  postCreateDatasetFileCollection,
  postCreateDatasetLinkCollection,
  postCreateDatasetTextCollection,
  postReTrainingDatasetFileCollection
} from '@/web/core/dataset/api';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { DatasetImportContext, type ImportFormType } from '../Context';
import { type ApiCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';

// ==================== 增强索引相关工具函数 ====================

function getApiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function trackEnhanceProgress(
  taskId: string,
  onProgress: (data: { current: number; total: number; phase: string; message?: string }) => void
): EventSource {
  const es = new EventSource(
    getApiUrl(`/api/core/dataset/training/enhanceProgress?taskId=${encodeURIComponent(taskId)}`)
  );
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
      if (data.phase === 'done' || data.phase === 'error') es.close();
    } catch {}
  };
  es.onerror = () => es.close();
  return es;
}

async function fetchCreateFileIdEnhance(
  params: Record<string, unknown>
): Promise<{ collectionId: string }> {
  const res = await fetch(getApiUrl('/api/core/dataset/collection/create/fileIdEnhance'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || `请求失败 (${res.status})`);
  }
  return res.json();
}

// ==================== 主组件 ====================

const Upload = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { collectionId = '' } = router.query as { collectionId: string };
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const retrainNewCollectionId = useRef('');
  const eventSourceRefs = useRef<Map<string, EventSource>>(new Map());
  const forceQueueRef = useRef(false); // true=强制队列模式（跳过增强检查）

  // 对话框状态
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingUploadRef = useRef<(() => Promise<void>) | null>(null);

  const { importSource, parentId, sources, setSources, processParamsForm } = useContextSelector(
    DatasetImportContext,
    (v) => v
  );

  // 检查是否开启了索引增强
  const hasEnhancement = useMemo(() => {
    const values = processParamsForm.getValues();
    return !!(values as any).autoIndexes || !!(values as any).imageIndex;
  }, [processParamsForm]);

  const { totalFilesCount, waitingFilesCount, allFinished, hasCreatingFiles } = useMemo(() => {
    const totalFilesCount = sources.length;
    const { waitingFilesCount, allFinished, hasCreatingFiles } = sources.reduce(
      (acc, file) => {
        if (file.createStatus === 'waiting') acc.waitingFilesCount++;
        if (file.createStatus === 'creating') acc.hasCreatingFiles = true;
        if (file.createStatus !== 'finish') acc.allFinished = false;
        return acc;
      },
      { waitingFilesCount: 0, allFinished: true, hasCreatingFiles: false }
    );
    return { totalFilesCount, waitingFilesCount, allFinished, hasCreatingFiles };
  }, [sources]);

  const buttonText = useMemo(() => {
    if (waitingFilesCount === totalFilesCount) {
      return t('common:core.dataset.import.Start upload');
    } else if (allFinished) {
      return t('common:core.dataset.import.Upload complete');
    } else {
      return t('common:core.dataset.import.Continue upload');
    }
  }, [waitingFilesCount, totalFilesCount, allFinished, t]);

  // 更新增强进度
  const updateEnhanceProgress = useCallback(
    (fileId: string, data: { current: number; total: number; phase: string; message?: string }) => {
      setSources((state) =>
        state.map((source) =>
          source.id === fileId ? { ...source, enhanceProgress: data } : source
        )
      );
    },
    [setSources]
  );

  // ---- 立即执行模式 ----
  const uploadWithEnhance = useCallback(
    async ({ customPdfParse, webSelector, ...data }: ImportFormType) => {
      const filterWaitingSources = sources.filter((item) => item.createStatus === 'waiting');

      for await (const item of filterWaitingSources) {
        setSources((state) =>
          state.map((source) =>
            source.id === item.id
              ? { ...source, createStatus: 'creating', enhanceProgress: undefined }
              : source
          )
        );

        try {
          if (importSource === ImportDataSourceEnum.fileLocal && item.dbFileId) {
            const taskId = `enhance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const es = trackEnhanceProgress(taskId, (progressData) => {
              updateEnhanceProgress(item.id, progressData);
            });
            eventSourceRefs.current.set(item.id, es);

            await fetchCreateFileIdEnhance({
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse,
              fileId: item.dbFileId,
              taskId
            });

            es.close();
            eventSourceRefs.current.delete(item.id);
          } else {
            // 非 fileLocal 类型走原始 API
            const commonParams = {
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse
            };

            if (importSource === ImportDataSourceEnum.fileLink && item.link) {
              await postCreateDatasetLinkCollection({
                ...commonParams,
                link: item.link,
                metadata: { webPageSelector: webSelector }
              });
            } else if (importSource === ImportDataSourceEnum.fileCustom && item.rawText) {
              await postCreateDatasetTextCollection({ ...commonParams, text: item.rawText });
            }
          }
        } catch (error: any) {
          const es = eventSourceRefs.current.get(item.id);
          if (es) {
            es.close();
            eventSourceRefs.current.delete(item.id);
          }
          throw error;
        }

        setSources((state) =>
          state.map((source) =>
            source.id === item.id ? { ...source, createStatus: 'finish' } : source
          )
        );
      }
    },
    [sources, importSource, parentId, datasetDetail._id, setSources, updateEnhanceProgress]
  );

  // ---- 队列模式（不等进度，直接返回）----
  const uploadWithQueue = useCallback(
    async ({ customPdfParse, webSelector, ...data }: ImportFormType) => {
      const filterWaitingSources = sources.filter((item) => item.createStatus === 'waiting');

      for await (const item of filterWaitingSources) {
        setSources((state) =>
          state.map((source) =>
            source.id === item.id ? { ...source, createStatus: 'creating' } : source
          )
        );

        try {
          if (importSource === ImportDataSourceEnum.fileLocal && item.dbFileId) {
            // 使用增强 API 但不等待进度（后台处理）
            await fetchCreateFileIdEnhance({
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse,
              fileId: item.dbFileId
            });
          } else if (importSource === ImportDataSourceEnum.fileLink && item.link) {
            await postCreateDatasetLinkCollection({
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse,
              link: item.link,
              metadata: { webPageSelector: webSelector }
            });
          } else if (importSource === ImportDataSourceEnum.fileCustom && item.rawText) {
            await postCreateDatasetTextCollection({
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse,
              text: item.rawText
            });
          } else if (importSource === ImportDataSourceEnum.externalFile && item.externalFileUrl) {
            await postCreateDatasetExternalFileCollection({
              ...data,
              parentId,
              datasetId: datasetDetail._id,
              name: item.sourceName,
              customPdfParse,
              externalFileUrl: item.externalFileUrl,
              externalFileId: item.externalFileId,
              filename: item.sourceName
            });
          }
        } catch (error: any) {
          throw error;
        }

        setSources((state) =>
          state.map((source) =>
            source.id === item.id ? { ...source, createStatus: 'finish' } : source
          )
        );
      }
    },
    [sources, importSource, parentId, datasetDetail._id, setSources]
  );

  // ---- 统一入口 ----
  const { runAsync: startUpload, loading: isLoading } = useRequest(
    async (formData: ImportFormType) => {
      if (sources.length === 0) return;

      if (importSource === ImportDataSourceEnum.apiDataset) {
        // API 数据集走原始逻辑
        setSources((state) => state.map((source) => ({ ...source, createStatus: 'creating' })));
        const apiFiles = sources
          .filter((item) => item.createStatus === 'waiting' && item.apiFile)
          .map((item) => item.apiFile!);
        await postCreateDatasetApiDatasetCollection({
          ...formData,
          parentId,
          datasetId: datasetDetail._id,
          customPdfParse: formData.customPdfParse,
          apiFiles
        });
        setSources((state) => state.map((source) => ({ ...source, createStatus: 'finish' })));
      } else if (
        hasEnhancement &&
        !forceQueueRef.current &&
        importSource === ImportDataSourceEnum.fileLocal
      ) {
        // 有增强且用户选择立即执行 → 内联增强模式
        await uploadWithEnhance(formData);
      } else {
        // 队列模式（无增强 / 用户选择推入队列）
        await uploadWithQueue(formData);
      }
    },
    {
      onSuccess() {
        if (!sources.some((file) => file.errorMsg !== undefined)) {
          toast({
            title:
              importSource === ImportDataSourceEnum.reTraining
                ? t('dataset:retrain_task_submitted')
                : t('common:core.dataset.import.import_success'),
            status: 'success'
          });
        }
        router.replace({
          query: { datasetId: datasetDetail._id, parentId }
        });
      },
      onError(error) {
        setSources((state) =>
          state.map((source) =>
            source.createStatus === 'creating'
              ? {
                  ...source,
                  createStatus: 'waiting',
                  errorMsg: error.message || t('file:upload_failed')
                }
              : source
          )
        );
      },
      errorToast: t('file:upload_failed')
    }
  );

  // 点击上传按钮
  const handleUpload = () => {
    forceQueueRef.current = false; // 重置
    processParamsForm.handleSubmit((data) => {
      if (hasEnhancement) {
        pendingUploadRef.current = () => startUpload(data);
        onOpen();
      } else {
        startUpload(data);
      }
    })();
  };

  // 对话框：立即执行
  const handleEnhanceNow = () => {
    onClose();
    forceQueueRef.current = false;
    pendingUploadRef.current?.();
  };

  // 对话框：推入队列
  const handleEnhanceQueue = () => {
    onClose();
    forceQueueRef.current = true;
    pendingUploadRef.current?.();
  };

  return (
    <Box h={'100%'} overflow={'auto'}>
      <TableContainer>
        <Table variant={'simple'} fontSize={'sm'} draggable={false}>
          <Thead draggable={false}>
            <Tr bg={'myGray.100'} mb={2}>
              <Th borderLeftRadius={'md'} overflow={'hidden'} borderBottom={'none'} py={4}>
                {t('common:core.dataset.import.Source name')}
              </Th>
              <Th borderBottom={'none'} py={4}>
                {t('common:core.dataset.import.Upload status')}
              </Th>
              <Th borderRightRadius={'md'} borderBottom={'none'} py={4}>
                {t('common:Action')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {sources.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <Flex alignItems={'center'}>
                    <MyIcon name={item.icon as any} w={'16px'} mr={1} />
                    <Box whiteSpace={'wrap'} maxW={'30vw'}>
                      {item.sourceName}
                    </Box>
                  </Flex>
                </Td>
                <Td>
                  <Box display={'inline-block'} minW={'200px'}>
                    {item.errorMsg ? (
                      <Tooltip label={item.errorMsg} fontSize="md">
                        <Flex alignItems="center">
                          <MyTag colorSchema={'red'}>{t('common:Error')}</MyTag>
                          <QuestionOutlineIcon ml={2} color="red.500" w="14px" />
                        </Flex>
                      </Tooltip>
                    ) : item.createStatus === 'creating' &&
                      item.enhanceProgress?.phase === 'enhancing' &&
                      item.enhanceProgress.total > 0 ? (
                      <Box>
                        <Flex alignItems="center" mb={1}>
                          <MyTag colorSchema={'blue'}>索引增强</MyTag>
                          <Text ml={2} fontSize="xs" color="myGray.500">
                            {item.enhanceProgress.current}/{item.enhanceProgress.total}
                          </Text>
                        </Flex>
                        <Progress
                          value={(item.enhanceProgress.current / item.enhanceProgress.total) * 100}
                          h={'6px'}
                          w={'100%'}
                          maxW={'210px'}
                          size="sm"
                          borderRadius={'20px'}
                          colorScheme="blue"
                          bg="myGray.200"
                          hasStripe
                          isAnimated
                        />
                      </Box>
                    ) : (
                      <>
                        {item.createStatus === 'waiting' && (
                          <MyTag colorSchema={'gray'}>{t('common:Waiting')}</MyTag>
                        )}
                        {item.createStatus === 'creating' && (
                          <MyTag colorSchema={'blue'}>{t('common:Creating')}</MyTag>
                        )}
                        {item.createStatus === 'finish' && (
                          <MyTag colorSchema={'green'}>{t('common:Finish')}</MyTag>
                        )}
                      </>
                    )}
                  </Box>
                </Td>
                <Td>
                  {!hasCreatingFiles && item.createStatus !== 'finish' && (
                    <IconButton
                      variant={'grayDanger'}
                      size={'sm'}
                      icon={<MyIcon name={'delete'} w={'14px'} />}
                      aria-label={'Delete file'}
                      onClick={() => {
                        setSources((prevFiles) => prevFiles.filter((file) => file.id !== item.id));
                      }}
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <Flex justifyContent={'flex-end'} mt={4}>
        <Button isLoading={isLoading} onClick={handleUpload}>
          {totalFilesCount > 0 && `${t('dataset:total_num_files', { total: totalFilesCount })} | `}
          {buttonText}
        </Button>
      </Flex>

      {/* 增强索引确认对话框 */}
      <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
        <AlertDialogOverlay />
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            索引增强
          </AlertDialogHeader>
          <AlertDialogBody>
            检测到已开启索引增强功能。请选择执行方式：
            <Box mt={3} fontSize="sm" color="myGray.600">
              <Text>
                • <b>立即执行</b>：在当前页面等待完成，可查看实时进度
              </Text>
              <Text mt={1}>
                • <b>推入队列</b>：后台异步处理，可关闭页面
              </Text>
            </Box>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} variant="outline" onClick={handleEnhanceNow}>
              立即执行
            </Button>
            <Button colorScheme="blue" onClick={handleEnhanceQueue} ml={3}>
              推入队列
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
};

export default Upload;
