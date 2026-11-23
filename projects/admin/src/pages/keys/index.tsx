import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  useDisclosure,
  useToast,
  Text,
  HStack,
  IconButton,
  Tooltip,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter
} from '@chakra-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { useLoading } from '@fastgpt/web/hooks/useLoading';

import { getApiKeys, createApiKey, updateApiKey, deleteApiKey } from '@/web/core/externalKeys/api';
import type { ApiKeyRecord } from '@/service/support/apiKey';
import type { ApiKeyCreateResponse } from '@/web/core/externalKeys/api';

/**
 * API 密钥管理页面
 * 创建、启用/禁用、删除对外 API Key；Key 明文仅在创建成功弹窗中展示一次
 */
export default function ApiKeys() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { Loading, setIsLoading } = useLoading();

  const [pageNum, setPageNum] = useState(1);
  const pageSize = 20;

  // 列表数据
  const { data, refetch } = useQuery(['apiKeys', pageNum], () => getApiKeys(pageNum, pageSize), {
    keepPreviousData: true
  });

  // 创建弹窗
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const [newKeyName, setNewKeyName] = useState('');

  // 创建成功弹窗（一次性展示明文）
  const { isOpen: isCreatedOpen, onOpen: onCreatedOpen, onClose: onCreatedClose } = useDisclosure();
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null);

  // 确认操作弹窗（禁用/启用/删除）
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();
  const [confirmAction, setConfirmAction] = useState<{
    type: 'toggle' | 'delete';
    record: ApiKeyRecord;
  } | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
  }, [queryClient]);

  /** 创建 Key */
  const handleCreate = useCallback(async () => {
    const name = newKeyName.trim();
    if (!name) {
      toast({ title: '请输入 Key 名称', status: 'warning' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await createApiKey(name);
      setCreatedKey(result);
      onCreateClose();
      setNewKeyName('');
      onCreatedOpen();
      refresh();
    } catch (error: any) {
      toast({ title: error?.message || '创建失败', status: 'error' });
    }
    setIsLoading(false);
  }, [newKeyName, setIsLoading, toast, onCreateClose, onCreatedOpen, refresh]);

  /** 复制完整 Key */
  const handleCopyKey = useCallback(async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      toast({ title: '已复制到剪贴板', status: 'success' });
    } catch {
      toast({ title: '复制失败，请手动选择复制', status: 'warning' });
    }
  }, [createdKey, toast]);

  /** 执行确认的操作（启停/删除） */
  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return;
    setIsLoading(true);
    try {
      if (confirmAction.type === 'delete') {
        await deleteApiKey(confirmAction.record.id);
        toast({ title: '删除成功', status: 'success' });
      } else {
        await updateApiKey(confirmAction.record.id, { enabled: !confirmAction.record.enabled });
        toast({
          title: confirmAction.record.enabled ? '已禁用' : '已启用',
          status: 'success'
        });
      }
      onConfirmClose();
      refresh();
    } catch (error: any) {
      toast({ title: error?.message || '操作失败', status: 'error' });
    }
    setIsLoading(false);
  }, [confirmAction, setIsLoading, toast, onConfirmClose, refresh]);

  const formatTime = (time: string | Date | null | undefined) => {
    if (!time) return '-';
    const d = new Date(time);
    return d.toLocaleString('zh-CN', { hour12: false });
  };

  const total = data?.total || 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <ProtectedRoute>
      <Layout>
        <Box p={6} flex={1} overflowY="auto">
          {/* 页头 */}
          <Flex justify="space-between" align="center" mb={4}>
            <Box>
              <Text fontSize="xl" fontWeight="bold">
                API 密钥
              </Text>
              <Text fontSize="sm" color="gray.500" mt={1}>
                管理三方系统拉取统计数据使用的 API Key。Key 明文仅在创建时展示一次，请妥善保存。
              </Text>
            </Box>
            <Button leftIcon={<MyIcon name="common/addLight" w="16px" />} onClick={onCreateOpen}>
              创建密钥
            </Button>
          </Flex>

          {/* 列表 */}
          <Box bg="white" borderRadius="md" boxShadow="sm" overflowX="auto">
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>名称</Th>
                  <Th>Key 前缀</Th>
                  <Th>状态</Th>
                  <Th>创建时间</Th>
                  <Th>最近使用</Th>
                  <Th>操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(data?.list || []).map((record) => (
                  <Tr key={record.id}>
                    <Td>{record.name}</Td>
                    <Td>
                      <Text as="code" fontSize="sm">
                        {record.keyPrefix}
                      </Text>
                    </Td>
                    <Td>
                      {record.enabled ? (
                        <Badge colorScheme="green">启用</Badge>
                      ) : (
                        <Badge colorScheme="gray">禁用</Badge>
                      )}
                    </Td>
                    <Td>{formatTime(record.createdAt)}</Td>
                    <Td>{formatTime(record.lastUsedAt)}</Td>
                    <Td>
                      <HStack spacing={1}>
                        <Tooltip label={record.enabled ? '禁用' : '启用'}>
                          <IconButton
                            aria-label={record.enabled ? '禁用' : '启用'}
                            size="sm"
                            variant="ghost"
                            icon={
                              <MyIcon
                                name={record.enabled ? 'common/paused' : 'common/playFill'}
                                w="16px"
                              />
                            }
                            onClick={() => {
                              setConfirmAction({ type: 'toggle', record });
                              onConfirmOpen();
                            }}
                          />
                        </Tooltip>
                        <Tooltip label="删除">
                          <IconButton
                            aria-label="删除"
                            size="sm"
                            variant="ghost"
                            colorScheme="red"
                            icon={<MyIcon name="common/trash" w="16px" />}
                            onClick={() => {
                              setConfirmAction({ type: 'delete', record });
                              onConfirmOpen();
                            }}
                          />
                        </Tooltip>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
                {(data?.list || []).length === 0 && (
                  <Tr>
                    <Td colSpan={6} textAlign="center" py={10} color="gray.400">
                      暂无密钥，点击右上角「创建密钥」开始
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>

          {/* 分页 */}
          <Flex justify="flex-end" mt={4} gap={2}>
            <Button
              size="sm"
              isDisabled={pageNum <= 1}
              onClick={() => setPageNum((p) => Math.max(p - 1, 1))}
            >
              上一页
            </Button>
            <Text alignSelf="center" fontSize="sm" color="gray.500">
              第 {pageNum} / {totalPages} 页（共 {total} 条）
            </Text>
            <Button
              size="sm"
              isDisabled={pageNum >= totalPages}
              onClick={() => setPageNum((p) => p + 1)}
            >
              下一页
            </Button>
          </Flex>
        </Box>

        {/* 创建弹窗 */}
        <Modal isOpen={isCreateOpen} onClose={onCreateClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>创建 API 密钥</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <FormControl isRequired>
                <FormLabel>名称 / 备注</FormLabel>
                <Input
                  placeholder="例如：三方报表系统"
                  value={newKeyName}
                  maxLength={100}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </FormControl>
            </ModalBody>
            <ModalFooter>
              <Button mr={3} onClick={onCreateClose}>
                取消
              </Button>
              <Button colorScheme="blue" onClick={handleCreate}>
                创建
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* 创建成功弹窗（Key 明文仅此一次展示） */}
        <Modal isOpen={isCreatedOpen} onClose={onCreatedClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>密钥创建成功</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text color="red.500" fontWeight="bold" mb={3}>
                ⚠️ 完整 Key 仅显示这一次，请立即复制并妥善保存。关闭后无法再次查看！
              </Text>
              <Box
                p={3}
                bg="gray.50"
                borderRadius="md"
                fontFamily="monospace"
                fontSize="sm"
                wordBreak="break-all"
              >
                {createdKey?.key}
              </Box>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="blue" onClick={handleCopyKey}>
                复制完整 Key
              </Button>
              <Button ml={3} onClick={onCreatedClose}>
                我已保存，关闭
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* 启停/删除确认弹窗 */}
        <AlertDialog
          isOpen={isConfirmOpen}
          leastDestructiveRef={cancelRef}
          onClose={onConfirmClose}
        >
          <AlertDialogOverlay>
            <AlertDialogContent>
              <AlertDialogHeader fontSize="lg" fontWeight="bold">
                {confirmAction?.type === 'delete' ? '确认删除' : '确认操作'}
              </AlertDialogHeader>
              <AlertDialogBody>
                {confirmAction?.type === 'delete' ? (
                  <>
                    确定删除密钥「{confirmAction.record.name}」 （{confirmAction.record.keyPrefix}
                    ）吗？删除后使用该 Key 的请求将立即失败，此操作不可恢复。
                  </>
                ) : (
                  <>
                    确定要{confirmAction?.record.enabled ? '禁用' : '启用'}密钥「
                    {confirmAction?.record.name}」（{confirmAction?.record.keyPrefix}）吗？
                    {confirmAction?.record.enabled
                      ? '禁用后三方使用该 Key 的请求将立即被拒绝。'
                      : ''}
                  </>
                )}
              </AlertDialogBody>
              <AlertDialogFooter>
                <Button ref={cancelRef} onClick={onConfirmClose}>
                  取消
                </Button>
                <Button
                  colorScheme={confirmAction?.type === 'delete' ? 'red' : 'blue'}
                  onClick={handleConfirm}
                  ml={3}
                >
                  确认
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogOverlay>
        </AlertDialog>

        <Loading />
      </Layout>
    </ProtectedRoute>
  );
}
