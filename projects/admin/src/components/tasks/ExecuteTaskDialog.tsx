/**
 * 手动执行任务对话框
 * 显示任务参数配置表单，支持编辑参数并执行任务
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Textarea,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  VStack
} from '@chakra-ui/react';
import { executeTask } from '@/web/core/task/api';
import type { TaskListItem, TaskExecutionResult } from '@/web/core/task/api';

interface ExecuteTaskDialogProps {
  task: TaskListItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 手动执行任务对话框组件
 */
const ExecuteTaskDialog = ({ task, isOpen, onClose, onSuccess }: ExecuteTaskDialogProps) => {
  const [params, setParams] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<TaskExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初始化参数
  useEffect(() => {
    if (isOpen && task.defaultParams) {
      setParams(JSON.stringify(task.defaultParams, null, 2));
    } else {
      setParams('{}');
    }
    setResult(null);
    setError(null);
  }, [isOpen, task]);

  // 执行任务
  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      // 解析参数
      let parsedParams: Record<string, any> = {};
      if (params.trim()) {
        try {
          parsedParams = JSON.parse(params);
        } catch (e) {
          throw new Error('参数格式错误，请输入有效的 JSON 格式');
        }
      }

      // 调用 API 执行任务
      const res = await executeTask(task.id, parsedParams);
      setResult(res);

      // 如果执行成功，调用成功回调
      if (res.result.success && onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || '执行失败，请稍后重试');
    } finally {
      setExecuting(false);
    }
  };

  // 关闭对话框
  const handleClose = () => {
    setParams('');
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>执行任务：{task.name}</ModalHeader>
        <ModalCloseButton />
        <ModalBody py={6} px={6}>
          <VStack spacing={4} align="stretch">
            {/* 任务描述 */}
            {task.description && (
              <Box>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  任务描述
                </Text>
                <Text fontSize="sm">{task.description}</Text>
              </Box>
            )}

            {/* 参数配置 */}
            <Box>
              <Text fontSize="sm" color="gray.600" mb={2}>
                执行参数（JSON 格式）
              </Text>
              <Textarea
                value={params}
                onChange={(e) => setParams(e.target.value)}
                placeholder='{"key": "value"}'
                rows={8}
                fontFamily="monospace"
                fontSize="sm"
                bg="gray.50"
                isDisabled={executing || !!result}
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                提示：留空或输入 {'{}'} 使用默认参数
              </Text>
            </Box>

            {/* 错误信息 */}
            {error && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box flex="1">
                  <AlertTitle fontSize="sm">执行失败</AlertTitle>
                  <AlertDescription fontSize="sm">{error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {/* 执行结果 */}
            {result && (
              <Alert
                status={result.result.success ? 'success' : 'error'}
                borderRadius="md"
                flexDirection="column"
                alignItems="flex-start"
              >
                <Box display="flex" alignItems="center" mb={2}>
                  <AlertIcon />
                  <AlertTitle fontSize="sm">
                    {result.result.success ? '执行成功' : '执行失败'}
                  </AlertTitle>
                </Box>
                <AlertDescription fontSize="sm" w="100%">
                  <VStack align="stretch" spacing={2}>
                    {result.result.message && (
                      <Box>
                        <Text fontWeight="bold">消息：</Text>
                        <Text>{result.result.message}</Text>
                      </Box>
                    )}
                    {result.result.data && (
                      <Box>
                        <Text fontWeight="bold">数据：</Text>
                        <Box
                          as="pre"
                          fontSize="xs"
                          bg="gray.50"
                          p={2}
                          borderRadius="md"
                          overflow="auto"
                          maxH="200px"
                        >
                          {JSON.stringify(result.result.data, null, 2)}
                        </Box>
                      </Box>
                    )}
                    <Box>
                      <Text fontWeight="bold">执行 ID：</Text>
                      <Text>{result.executionId}</Text>
                    </Box>
                  </VStack>
                </AlertDescription>
              </Alert>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter px={6}>
          <Button variant="ghost" mr={3} onClick={handleClose}>
            关闭
          </Button>
          {!result && (
            <Button
              colorScheme="blue"
              onClick={handleExecute}
              isLoading={executing}
              loadingText="执行中..."
            >
              执行任务
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ExecuteTaskDialog;
