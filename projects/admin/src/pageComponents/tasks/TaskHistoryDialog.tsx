/**
 * 任务执行历史对话框
 * 显示单个任务的执行历史记录
 */

import React, { useState, useEffect } from 'react';
import {
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
  Text,
  Spinner,
  Alert,
  AlertIcon,
  Box,
  Flex,
  Button,
  HStack,
  Select,
  Tooltip
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { getExecutionHistory } from '@/web/core/task/api';
import type { TaskExecution, TaskListItem } from '@/web/core/task/api';

// 配置 dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

interface TaskHistoryDialogProps {
  task: TaskListItem | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 任务执行历史对话框组件
 */
const TaskHistoryDialog: React.FC<TaskHistoryDialogProps> = ({ task, isOpen, onClose }) => {
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // 加载执行历史
  const loadHistory = async () => {
    if (!task) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getExecutionHistory(task.id, {
        page,
        pageSize,
        status: statusFilter || undefined
      });
      setExecutions(res.executions);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || '加载执行历史失败');
    } finally {
      setLoading(false);
    }
  };

  // 当对话框打开或筛选条件改变时加载数据
  useEffect(() => {
    if (isOpen && task) {
      loadHistory();
    }
  }, [isOpen, task, page, statusFilter]);

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setPage(1);
      setStatusFilter('');
      setExecutions([]);
      setError(null);
    }
  }, [isOpen]);

  // 获取状态徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge colorScheme="green">成功</Badge>;
      case 'failed':
        return <Badge colorScheme="red">失败</Badge>;
      case 'running':
        return <Badge colorScheme="blue">运行中</Badge>;
      default:
        return <Badge colorScheme="gray">{status}</Badge>;
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    return dayjs(timeStr).format('YYYY-MM-DD HH:mm:ss');
  };

  // 格式化相对时间
  const formatRelativeTime = (timeStr: string) => {
    return dayjs(timeStr).fromNow();
  };

  if (!task) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <Box>
            <Text fontSize="xl" fontWeight="bold">
              执行历史 - {task.name}
            </Text>
            <Text fontSize="sm" color="gray.600" fontWeight="normal" mt={1}>
              查看任务的所有执行记录
            </Text>
          </Box>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          {/* 筛选条件 */}
          <Flex mb={4} gap={3} align="flex-end">
            <Box flex={1}>
              <Text fontSize="sm" mb={2} fontWeight="medium">
                执行状态
              </Text>
              <Select
                placeholder="全部状态"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="success">成功</option>
                <option value="failed">失败</option>
                <option value="running">运行中</option>
              </Select>
            </Box>
            <Button colorScheme="blue" onClick={loadHistory} isLoading={loading}>
              刷新
            </Button>
          </Flex>

          {/* 错误提示 */}
          {error && (
            <Alert status="error" mb={4} borderRadius="md">
              <AlertIcon />
              <Box flex="1">
                <Text fontWeight="medium">加载失败</Text>
                <Text fontSize="sm">{error}</Text>
              </Box>
              <Button size="sm" onClick={loadHistory}>
                重试
              </Button>
            </Alert>
          )}

          {/* 加载中 */}
          {loading && (
            <Flex justify="center" align="center" h="300px">
              <Spinner size="xl" color="blue.500" />
            </Flex>
          )}

          {/* 执行历史列表 */}
          {!loading && !error && (
            <>
              <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
                <Table variant="simple" size="sm">
                  <Thead bg="gray.50">
                    <Tr>
                      <Th>执行 ID</Th>
                      <Th>开始时间</Th>
                      <Th>结束时间</Th>
                      <Th>状态</Th>
                      <Th>耗时</Th>
                      <Th>错误信息</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {executions.length === 0 ? (
                      <Tr>
                        <Td colSpan={6} textAlign="center" py={8}>
                          <Text color="gray.500">暂无执行记录</Text>
                        </Td>
                      </Tr>
                    ) : (
                      executions.map((execution) => (
                        <Tr key={execution.id} _hover={{ bg: 'gray.50' }}>
                          <Td>
                            <Text fontFamily="monospace" fontSize="sm">
                              #{execution.id}
                            </Text>
                          </Td>
                          <Td>
                            <Box>
                              <Text fontSize="sm">{formatTime(execution.startTime)}</Text>
                              <Text fontSize="xs" color="gray.500">
                                {formatRelativeTime(execution.startTime)}
                              </Text>
                            </Box>
                          </Td>
                          <Td>
                            {execution.endTime ? (
                              <Box>
                                <Text fontSize="sm">{formatTime(execution.endTime)}</Text>
                                <Text fontSize="xs" color="gray.500">
                                  {formatRelativeTime(execution.endTime)}
                                </Text>
                              </Box>
                            ) : (
                              <Text fontSize="sm" color="gray.500">
                                -
                              </Text>
                            )}
                          </Td>
                          <Td>{getStatusBadge(execution.status)}</Td>
                          <Td>
                            {execution.executionTimeMs ? (
                              <Text fontSize="sm">{execution.executionTimeMs}ms</Text>
                            ) : (
                              <Text fontSize="sm" color="gray.500">
                                -
                              </Text>
                            )}
                          </Td>
                          <Td>
                            {execution.errorMessage ? (
                              <Tooltip label={execution.errorMessage} placement="top">
                                <Text
                                  fontSize="sm"
                                  color="red.600"
                                  noOfLines={2}
                                  maxW="300px"
                                  cursor="help"
                                >
                                  {execution.errorMessage}
                                </Text>
                              </Tooltip>
                            ) : (
                              <Text fontSize="sm" color="gray.500">
                                -
                              </Text>
                            )}
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </Box>

              {/* 分页 */}
              {total > pageSize && (
                <Flex justify="space-between" align="center" mt={4}>
                  <Text fontSize="sm" color="gray.600">
                    共 {total} 条记录，第 {page} / {Math.ceil(total / pageSize)} 页
                  </Text>
                  <HStack spacing={2}>
                    <Button size="sm" onClick={() => setPage(page - 1)} isDisabled={page === 1}>
                      上一页
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      isDisabled={page >= Math.ceil(total / pageSize)}
                    >
                      下一页
                    </Button>
                  </HStack>
                </Flex>
              )}
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default TaskHistoryDialog;
