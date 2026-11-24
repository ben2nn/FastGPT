/**
 * 手动执行任务对话框
 * 提交后接口立即返回（异步受理），对话框轮询执行详情显示终态；可随时关闭，后台执行不受影响
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
  Spinner,
  HStack,
  VStack
} from '@chakra-ui/react';
import { executeTask, getExecutionDetail } from '@/web/core/task/api';
import type { TaskListItem, TaskExecutionResult, TaskExecution } from '@/web/core/task/api';

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;
/** 轮询上限（毫秒）：超时后停止轮询，提示任务仍在后台执行 */
const MAX_POLL_MS = 10 * 60 * 1000;

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
  const [submitting, setSubmitting] = useState(false);
  // 受理结果（接口返回后）
  const [submission, setSubmission] = useState<TaskExecutionResult | null>(null);
  // 轮询到的执行详情
  const [execution, setExecution] = useState<TaskExecution | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = !!submission && (!execution || execution.status === 'running') && !pollTimedOut;
  const isFinal = !!execution && execution.status !== 'running';

  // 初始化参数（切换任务/打开对话框时重置状态）
  useEffect(() => {
    if (isOpen && task.defaultParams) {
      setParams(JSON.stringify(task.defaultParams, null, 2));
    } else {
      setParams('{}');
    }
    setSubmission(null);
    setExecution(null);
    setPollTimedOut(false);
    setError(null);
  }, [isOpen, task]);

  // 轮询执行详情直至终态
  useEffect(() => {
    if (!isOpen || !submission) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const res = await getExecutionDetail(submission.executionId);
        if (cancelled) {
          return;
        }
        const exec = res.execution;
        setExecution(exec);

        if (exec.status !== 'running') {
          if (exec.status === 'success') {
            onSuccess?.();
          }
          return;
        }

        if (Date.now() - startedAt > MAX_POLL_MS) {
          setPollTimedOut(true);
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) {
          return;
        }
        // 单次查询失败不终止轮询，继续按上限重试
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setPollTimedOut(true);
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOpen, submission, onSuccess]);

  // 提交执行
  const handleExecute = async () => {
    setSubmitting(true);
    setError(null);
    setSubmission(null);
    setExecution(null);
    setPollTimedOut(false);

    try {
      let parsedParams: Record<string, any> = {};
      if (params.trim()) {
        try {
          parsedParams = JSON.parse(params);
        } catch (e) {
          throw new Error('参数格式错误，请输入有效的 JSON 格式');
        }
      }

      const res = await executeTask(task.id, parsedParams);
      setSubmission(res);
    } catch (err: any) {
      setError(err?.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 关闭对话框（仅清理前端状态，不影响后台执行）
  const handleClose = () => {
    setParams('');
    setSubmission(null);
    setExecution(null);
    setPollTimedOut(false);
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

            {/* 参数配置（提交后仍可编辑） */}
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
                isDisabled={submitting}
              />
              <Text fontSize="xs" color="gray.500" mt={1}>
                提示：留空或输入 {'{}'} 使用默认参数
              </Text>
            </Box>

            {/* 提交错误 */}
            {error && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box flex="1">
                  <AlertTitle fontSize="sm">提交失败</AlertTitle>
                  <AlertDescription fontSize="sm">{error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {/* 已提交 / 执行中 / 终态 */}
            {submission && (
              <Alert
                status={isFinal ? (execution!.status === 'success' ? 'success' : 'error') : 'info'}
                borderRadius="md"
                flexDirection="column"
                alignItems="flex-start"
              >
                <Box display="flex" alignItems="center" mb={2}>
                  {isRunning ? <Spinner size="sm" mr={2} /> : <AlertIcon />}
                  <AlertTitle fontSize="sm">
                    {isFinal
                      ? execution!.status === 'success'
                        ? '执行成功'
                        : '执行失败'
                      : pollTimedOut
                        ? '任务仍在后台执行'
                        : '任务已提交执行'}
                  </AlertTitle>
                </Box>
                <AlertDescription fontSize="sm" w="100%">
                  <VStack align="stretch" spacing={2}>
                    <Box>
                      <Text fontWeight="bold">执行 ID：</Text>
                      <Text>{submission.executionId}</Text>
                    </Box>
                    {pollTimedOut && (
                      <Text color="orange.600">
                        轮询已超时，任务可能仍在后台执行，可在「执行历史」中查看最终结果。
                      </Text>
                    )}
                    {execution && (
                      <>
                        {execution.executionTimeMs !== undefined && (
                          <HStack spacing={1}>
                            <Text fontWeight="bold">耗时：</Text>
                            <Text>{Math.round(execution.executionTimeMs / 1000)}s</Text>
                          </HStack>
                        )}
                        {execution.result?.message && (
                          <Box>
                            <Text fontWeight="bold">消息：</Text>
                            <Text>{execution.result.message}</Text>
                          </Box>
                        )}
                        {execution.result?.data && (
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
                              {JSON.stringify(execution.result.data, null, 2)}
                            </Box>
                          </Box>
                        )}
                        {execution.errorMessage && (
                          <Box>
                            <Text fontWeight="bold">错误信息：</Text>
                            <Box
                              as="pre"
                              fontSize="xs"
                              bg="gray.50"
                              p={2}
                              borderRadius="md"
                              overflow="auto"
                              maxH="200px"
                              whiteSpace="pre-wrap"
                            >
                              {execution.errorMessage}
                            </Box>
                          </Box>
                        )}
                      </>
                    )}
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
          <Button
            colorScheme="blue"
            onClick={handleExecute}
            isLoading={submitting}
            loadingText="提交中..."
            isDisabled={isRunning}
          >
            执行任务
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ExecuteTaskDialog;
