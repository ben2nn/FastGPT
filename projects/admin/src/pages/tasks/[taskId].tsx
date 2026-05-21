/**
 * 任务详情页面
 * 显示任务的详细配置信息和执行历史
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Stack,
  StackDivider,
  Select,
  HStack,
  useToast,
  IconButton,
  Collapse,
  Code
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ChevronLeftIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { getTaskDetail, getExecutionHistory, toggleTask } from '@/web/core/task/api';
import type { TaskDetail, TaskExecution, ExecutionHistoryQuery } from '@/web/core/task/api';
import ExecuteTaskDialog from '@/components/tasks/ExecuteTaskDialog';
import ExecutionCharts from '@/components/tasks/ExecutionCharts';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';

// 配置 dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/**
 * 任务详情页面组件
 */
const TaskDetailPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { taskId } = router.query as { taskId: string };

  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [expandedExecutionId, setExpandedExecutionId] = useState<number | null>(null);

  // 查询参数
  const [query, setQuery] = useState<ExecutionHistoryQuery>({
    page: 1,
    pageSize: 20,
    status: '',
    startTime: '',
    endTime: ''
  });
  const [total, setTotal] = useState(0);

  // 加载任务详情
  const loadTaskDetail = async () => {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await getTaskDetail(taskId);
      setTaskDetail(res);
    } catch (err: any) {
      setError(err?.message || '加载任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载执行历史
  const loadExecutions = async () => {
    if (!taskId) return;

    setExecutionsLoading(true);

    try {
      const res = await getExecutionHistory(taskId, query);
      setExecutions(res.executions);
      setTotal(res.total);
    } catch (err: any) {
      toast({
        title: '加载执行历史失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    } finally {
      setExecutionsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadTaskDetail();
  }, [taskId]);

  // 加载执行历史
  useEffect(() => {
    if (taskDetail) {
      loadExecutions();
    }
  }, [taskDetail, query]);

  // 启用/禁用任务
  const handleToggleTask = async (enabled: boolean) => {
    if (!taskId) return;

    try {
      await toggleTask(taskId, enabled);
      toast({
        title: enabled ? '任务已启用' : '任务已禁用',
        status: 'success',
        duration: 2000
      });
      await loadTaskDetail();
    } catch (err: any) {
      toast({
        title: '操作失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    }
  };

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
        return <Badge colorScheme="gray">未知</Badge>;
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    return dayjs(timeStr).format('YYYY-MM-DD HH:mm:ss');
  };

  // 切换展开/收起
  const toggleExpand = (executionId: number) => {
    setExpandedExecutionId(expandedExecutionId === executionId ? null : executionId);
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="任务详情">
          <Flex justify="center" align="center" h="400px">
            <Spinner size="xl" color="blue.500" />
          </Flex>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (error || !taskDetail) {
    return (
      <ProtectedRoute>
        <Layout title="任务详情">
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>加载失败</AlertTitle>
              <AlertDescription>{error || '任务不存在'}</AlertDescription>
            </Box>
            <Button size="sm" onClick={() => router.push('/tasks')}>
              返回列表
            </Button>
          </Alert>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title={taskDetail.config.name}>
        <Box>
          {/* 页面标题 */}
          <Flex justify="space-between" align="center" mb={6}>
            <Flex align="center">
              <IconButton
                aria-label="返回"
                icon={<ChevronLeftIcon />}
                variant="ghost"
                mr={2}
                onClick={() => router.push('/tasks')}
              />
              <Box>
                <Text fontSize="2xl" fontWeight="bold">
                  {taskDetail.config.name}
                </Text>
                <Text fontSize="sm" color="gray.600" mt={1}>
                  {taskDetail.config.description || '暂无描述'}
                </Text>
              </Box>
            </Flex>
            <HStack spacing={3}>
              <Button
                colorScheme={taskDetail.config.enabled ? 'red' : 'green'}
                variant="outline"
                onClick={() => handleToggleTask(!taskDetail.config.enabled)}
              >
                {taskDetail.config.enabled ? '禁用任务' : '启用任务'}
              </Button>
              <Button
                colorScheme="blue"
                onClick={() => setShowExecuteDialog(true)}
                isDisabled={taskDetail.config.isRunning}
              >
                {taskDetail.config.isRunning ? '运行中' : '立即执行'}
              </Button>
            </HStack>
          </Flex>

          {/* 任务配置信息 */}
          <Card mb={6}>
            <CardHeader>
              <Heading size="md">任务配置</Heading>
            </CardHeader>
            <CardBody>
              <Stack divider={<StackDivider />} spacing={4}>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    任务 ID
                  </Text>
                  <Text fontFamily="monospace">{taskDetail.config.id}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    Cron 表达式
                  </Text>
                  <Text fontFamily="monospace">{taskDetail.config.cronExpression}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    时区
                  </Text>
                  <Text>{taskDetail.config.timezone || 'Asia/Shanghai'}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    执行器
                  </Text>
                  <Text>{taskDetail.config.executorName}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    最大执行时间
                  </Text>
                  <Text>{taskDetail.config.maxExecutionTime || 3600000}ms</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    重试次数
                  </Text>
                  <Text>{taskDetail.config.retryCount || 0}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    重试间隔
                  </Text>
                  <Text>{taskDetail.config.retryInterval || 60000}ms</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    启用状态
                  </Text>
                  <Badge colorScheme={taskDetail.config.enabled ? 'green' : 'gray'}>
                    {taskDetail.config.enabled ? '已启用' : '已禁用'}
                  </Badge>
                </Flex>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    下次执行时间
                  </Text>
                  <Text>
                    {taskDetail.nextExecutionTime
                      ? formatTime(taskDetail.nextExecutionTime)
                      : '已禁用'}
                  </Text>
                </Flex>
                {taskDetail.config.defaultParams && (
                  <Box>
                    <Text fontWeight="medium" color="gray.600" mb={2}>
                      默认参数
                    </Text>
                    <Code
                      display="block"
                      whiteSpace="pre"
                      p={3}
                      borderRadius="md"
                      fontSize="sm"
                      overflow="auto"
                    >
                      {JSON.stringify(taskDetail.config.defaultParams, null, 2)}
                    </Code>
                  </Box>
                )}
              </Stack>
            </CardBody>
          </Card>

          {/* 执行统计图表 */}
          <Box mb={6}>
            <ExecutionCharts executions={executions} loading={executionsLoading} />
          </Box>

          {/* 执行历史 */}
          <Card>
            <CardHeader>
              <Flex justify="space-between" align="center">
                <Heading size="md">执行历史</Heading>
                <HStack spacing={3}>
                  <Select
                    size="sm"
                    w="150px"
                    value={query.status}
                    onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}
                  >
                    <option value="">全部状态</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                    <option value="running">运行中</option>
                  </Select>
                  <Button size="sm" onClick={loadExecutions} isLoading={executionsLoading}>
                    刷新
                  </Button>
                </HStack>
              </Flex>
            </CardHeader>
            <CardBody>
              {executionsLoading && executions.length === 0 ? (
                <Flex justify="center" py={8}>
                  <Spinner color="blue.500" />
                </Flex>
              ) : executions.length === 0 ? (
                <Text textAlign="center" color="gray.500" py={8}>
                  暂无执行记录
                </Text>
              ) : (
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>执行 ID</Th>
                      <Th>开始时间</Th>
                      <Th>结束时间</Th>
                      <Th>状态</Th>
                      <Th>耗时</Th>
                      <Th>操作</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {executions.map((execution) => (
                      <React.Fragment key={execution.id}>
                        <Tr _hover={{ bg: 'gray.50' }}>
                          <Td fontFamily="monospace">{execution.id}</Td>
                          <Td>{formatTime(execution.startTime)}</Td>
                          <Td>{execution.endTime ? formatTime(execution.endTime) : '-'}</Td>
                          <Td>{getStatusBadge(execution.status)}</Td>
                          <Td>
                            {execution.executionTimeMs ? `${execution.executionTimeMs}ms` : '-'}
                          </Td>
                          <Td>
                            <IconButton
                              aria-label="展开详情"
                              icon={
                                expandedExecutionId === execution.id ? (
                                  <ChevronUpIcon />
                                ) : (
                                  <ChevronDownIcon />
                                )
                              }
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleExpand(execution.id)}
                            />
                          </Td>
                        </Tr>
                        <Tr>
                          <Td colSpan={6} p={0}>
                            <Collapse in={expandedExecutionId === execution.id}>
                              <Box bg="gray.50" p={4}>
                                <Stack spacing={3}>
                                  {execution.params && (
                                    <Box>
                                      <Text fontWeight="medium" mb={2}>
                                        执行参数
                                      </Text>
                                      <Code
                                        display="block"
                                        whiteSpace="pre"
                                        p={3}
                                        borderRadius="md"
                                        fontSize="xs"
                                        overflow="auto"
                                        maxH="200px"
                                      >
                                        {JSON.stringify(execution.params, null, 2)}
                                      </Code>
                                    </Box>
                                  )}
                                  {execution.result && (
                                    <Box>
                                      <Text fontWeight="medium" mb={2}>
                                        执行结果
                                      </Text>
                                      <Code
                                        display="block"
                                        whiteSpace="pre"
                                        p={3}
                                        borderRadius="md"
                                        fontSize="xs"
                                        overflow="auto"
                                        maxH="200px"
                                      >
                                        {JSON.stringify(execution.result, null, 2)}
                                      </Code>
                                    </Box>
                                  )}
                                  {execution.errorMessage && (
                                    <Box>
                                      <Text fontWeight="medium" mb={2} color="red.600">
                                        错误信息
                                      </Text>
                                      <Alert status="error" borderRadius="md">
                                        <AlertIcon />
                                        <Text fontSize="sm">{execution.errorMessage}</Text>
                                      </Alert>
                                    </Box>
                                  )}
                                </Stack>
                              </Box>
                            </Collapse>
                          </Td>
                        </Tr>
                      </React.Fragment>
                    ))}
                  </Tbody>
                </Table>
              )}

              {/* 分页 */}
              {total > query.pageSize! && (
                <Flex justify="space-between" align="center" mt={4}>
                  <Text fontSize="sm" color="gray.600">
                    共 {total} 条记录
                  </Text>
                  <HStack>
                    <Button
                      size="sm"
                      onClick={() => setQuery({ ...query, page: query.page! - 1 })}
                      isDisabled={query.page === 1}
                    >
                      上一页
                    </Button>
                    <Text fontSize="sm">
                      第 {query.page} / {Math.ceil(total / query.pageSize!)} 页
                    </Text>
                    <Button
                      size="sm"
                      onClick={() => setQuery({ ...query, page: query.page! + 1 })}
                      isDisabled={query.page! >= Math.ceil(total / query.pageSize!)}
                    >
                      下一页
                    </Button>
                  </HStack>
                </Flex>
              )}
            </CardBody>
          </Card>

          {/* 执行任务对话框 */}
          {showExecuteDialog && (
            <ExecuteTaskDialog
              task={taskDetail.config}
              isOpen={showExecuteDialog}
              onClose={() => setShowExecuteDialog(false)}
              onSuccess={() => {
                setShowExecuteDialog(false);
                loadTaskDetail();
                loadExecutions();
              }}
            />
          )}
        </Box>
      </Layout>
    </ProtectedRoute>
  );
};

export default TaskDetailPage;
