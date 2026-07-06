import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  HStack,
  Tag,
  TagLabel,
  Divider
} from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  postEnhanceIndexes,
  postEnhancePreview,
  postEnhanceQuickTest,
  postEnhanceCancel
} from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';

import RuleConfig from './RuleConfig';
import CollectionTree from './CollectionTree';
import TrainingProgress from './TrainingProgress';
import PreviewTable from './PreviewTable';
import { defaultEnhanceRuleConfig } from './types';
import type { EnhanceRuleConfig, EnhancePreviewResponse, EnhanceQuickTestResponse } from './types';

const IndexEnhance = ({ datasetId }: { datasetId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );

  // 规则配置
  const [ruleConfig, setRuleConfig] = useState<EnhanceRuleConfig>({
    ...defaultEnhanceRuleConfig,
    aiIndexConfig: {
      ...defaultEnhanceRuleConfig.aiIndexConfig,
      textModel: datasetDetail.agentModel?.model || '',
      imageModel: datasetDetail.vlmModel?.model || '',
      vectorModel: datasetDetail.vectorModel?.model || ''
    }
  });

  // 执行状态
  const [isRunning, setIsRunning] = useState(false);
  const [billId, setBillId] = useState<string | null>(null);

  // 预览弹窗
  const [previewData, setPreviewData] = useState<EnhancePreviewResponse | null>(null);

  // 快速测试弹窗
  const [quickTestData, setQuickTestData] = useState<EnhanceQuickTestResponse | null>(null);

  // 集合选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const selectedCount = selectedIds.size;
  const hasSelection = selectAll || selectedCount > 0;

  const getCollectionIds = useCallback(() => {
    return selectAll ? undefined : Array.from(selectedIds);
  }, [selectAll, selectedIds]);

  // 预览
  const { runAsync: handlePreview, loading: previewLoading } = useRequest(
    async () => {
      if (!hasSelection) {
        toast({ status: 'warning', title: '请先选择要预览的范围' });
        return;
      }
      const res = await postEnhancePreview({
        datasetId,
        collectionIds: getCollectionIds()
      });
      setPreviewData(res);
    },
    { errorToast: '预览失败' }
  );

  // 快速测试
  const { runAsync: handleQuickTest, loading: quickTestLoading } = useRequest(
    async () => {
      if (!hasSelection) {
        toast({ status: 'warning', title: '请先选择要测试的范围' });
        return;
      }
      const res = await postEnhanceQuickTest({
        datasetId,
        collectionIds: getCollectionIds(),
        config: ruleConfig
      });
      setQuickTestData(res);
      refetchDatasetTraining();
      setTimeout(() => refetchDatasetTraining(), 2000);
    },
    { errorToast: '快速测试失败' }
  );

  // 开始增强
  const { runAsync: handleEnhance, loading: enhanceLoading } = useRequest(
    async () => {
      if (!hasSelection) {
        toast({ status: 'warning', title: '请先选择要增强的范围' });
        return;
      }
      const res = await postEnhanceIndexes({
        datasetId,
        collectionIds: getCollectionIds(),
        config: ruleConfig
      });
      setBillId(res.billId);
      setIsRunning(true);
      toast({ status: 'success', title: `已启动索引增强，共 ${res.insertLen} 条数据` });
      refetchDatasetTraining();
      setTimeout(() => refetchDatasetTraining(), 2000);
    },
    { errorToast: '启动索引增强失败' }
  );

  // 取消
  const { runAsync: handleCancel, loading: cancelLoading } = useRequest(
    async () => {
      if (!billId) return;
      const res = await postEnhanceCancel({ billId, datasetId });
      toast({ status: 'info', title: `已取消，清理了 ${res.deletedCount} 条待处理任务` });
      setBillId(null);
      setIsRunning(false);
      refetchDatasetTraining();
      setTimeout(() => refetchDatasetTraining(), 2000);
    },
    { errorToast: '取消失败' }
  );

  return (
    <>
      <Flex h="100%" flexDirection="column">
        {/* ===== 主体：左右分栏 ===== */}
        <Flex flex={1} overflow="hidden">
          {/* ---- 左侧：集合选择 + 训练进度 ---- */}
          <Flex
            direction="column"
            w="280px"
            minW="280px"
            bg="white"
            borderRight="1px solid"
            borderColor="myGray.150"
          >
            <CollectionTree
              datasetId={datasetId}
              selectedIds={selectedIds}
              selectAll={selectAll}
              onToggleSelect={setSelectedIds}
              onToggleSelectAll={setSelectAll}
            />
            <TrainingProgress />
          </Flex>

          {/* ---- 右侧：配置 + 操作 ---- */}
          <Flex flex={1} direction="column">
            {/* 配置区域 */}
            <Box flex={1} overflow="auto" p={6}>
              <RuleConfig
                value={ruleConfig}
                datasetDetail={datasetDetail}
                onChange={setRuleConfig}
              />
            </Box>

            {/* 底部操作栏 */}
            <Flex
              px={6}
              py={3}
              alignItems="center"
              justifyContent="flex-end"
              gap={2}
              bg="white"
              borderTop="1px solid"
              borderColor="myGray.150"
            >
              <Button
                size="sm"
                variant="outline"
                leftIcon={<MyIcon name="common/searchLight" w="14px" />}
                onClick={handlePreview}
                isDisabled={isRunning || !hasSelection}
                isLoading={previewLoading}
              >
                预览
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorScheme="blue"
                leftIcon={<MyIcon name="common/running" w="14px" />}
                onClick={handleQuickTest}
                isDisabled={isRunning || !hasSelection}
                isLoading={quickTestLoading}
              >
                快速测试
              </Button>
              <Button
                size="sm"
                colorScheme="blue"
                leftIcon={<MyIcon name="common/running" w="14px" />}
                onClick={handleEnhance}
                isDisabled={isRunning || !hasSelection}
                isLoading={enhanceLoading}
              >
                {selectedCount > 0 ? `增强选中 ${selectedCount} 个` : '开始增强'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorScheme="red"
                leftIcon={<MyIcon name="common/closeLight" w="14px" />}
                onClick={handleCancel}
                isDisabled={!isRunning}
                isLoading={cancelLoading}
              >
                取消
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Flex>

      {/* ===== 预览弹窗 ===== */}
      <Modal
        isOpen={!!previewData}
        onClose={() => setPreviewData(null)}
        size="6xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent maxH="80vh">
          <ModalHeader fontSize="sm">
            预览结果（共 {previewData?.totalChunks || 0} 条）
            <Text fontSize="xs" fontWeight="normal" color="myGray.400" mt={0.5}>
              预览只供参考，请以增强索引结果为准
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>{previewData && <PreviewTable data={previewData} />}</ModalBody>
        </ModalContent>
      </Modal>

      {/* ===== 快速测试弹窗 ===== */}
      <Modal
        isOpen={!!quickTestData}
        onClose={() => setQuickTestData(null)}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent maxH="80vh">
          <ModalHeader fontSize="sm">
            快速测试结果
            <Text fontSize="xs" fontWeight="normal" color="myGray.400" mt={0.5}>
              已对前 {quickTestData ? quickTestData.success + quickTestData.skipped : 0}{' '}
              条数据执行增强测试
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {quickTestData && (
              <Box>
                {/* 汇总信息 */}
                <HStack spacing={4} mb={4}>
                  <Badge colorScheme="green" fontSize="sm" px={2} py={0.5}>
                    成功 {quickTestData.success} 条
                  </Badge>
                  {quickTestData.skipped > 0 && (
                    <Badge colorScheme="orange" fontSize="sm" px={2} py={0.5}>
                      跳过 {quickTestData.skipped} 条
                    </Badge>
                  )}
                </HStack>

                {quickTestData.items.length > 0 && (
                  <>
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th>序号</Th>
                          <Th>所属集合</Th>
                          <Th>条目标题</Th>
                          <Th>增强后摘要 (Q)</Th>
                          <Th>推荐搜索词</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {quickTestData.items.map((item, idx) => (
                          <Tr key={idx}>
                            <Td>{idx + 1}</Td>
                            <Td maxW="120px" isTruncated>
                              {item.collectionName || '-'}
                            </Td>
                            <Td maxW="150px" isTruncated>
                              {item.articleTitle}
                            </Td>
                            <Td maxW="300px">
                              <Text noOfLines={3} fontSize="xs">
                                {item.previewQ}
                              </Text>
                            </Td>
                            <Td>
                              <Flex flexWrap="wrap" gap={1}>
                                {item.suggestedKeywords.map((kw, ki) => (
                                  <Tag key={ki} size="sm" colorScheme="blue" variant="subtle">
                                    <TagLabel>{kw}</TagLabel>
                                  </Tag>
                                ))}
                              </Flex>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>

                    <Divider my={4} />

                    <Flex justifyContent="flex-end">
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={() => {
                          setQuickTestData(null);
                          router.push({ query: { ...router.query, currentTab: 'test' } });
                        }}
                      >
                        前往搜索测试验证
                      </Button>
                    </Flex>
                  </>
                )}

                {quickTestData.items.length === 0 && (
                  <Text color="myGray.500" textAlign="center" py={4}>
                    没有成功处理的条目
                  </Text>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default React.memo(IndexEnhance);
