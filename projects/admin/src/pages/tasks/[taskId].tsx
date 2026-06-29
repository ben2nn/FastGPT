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
  Select,
  HStack,
  useToast,
  Collapse
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { getTaskDetail, getExecutionHistory, toggleTask } from '@/web/core/task/api';
import type { TaskDetail, TaskExecution, ExecutionHistoryQuery } from '@/web/core/task/api';
import ExecuteTaskDialog from '@/pageComponents/tasks/ExecuteTaskDialog';
import ExecutionCharts from '@/pageComponents/tasks/ExecutionCharts';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

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

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'success':
        return { color: 'green.600', bg: 'green.50', label: '成功' };
      case 'failed':
        return { color: 'red.600', bg: 'red.50', label: '失败' };
      case 'running':
        return { color: 'primary.600', bg: 'primary.50', label: '运行中' };
      default:
        return { color: 'myGray.500', bg: 'myGray.50', label: '未知' };
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
            <Spinner size="xl" color="primary.600" />
          </Flex>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (error || !taskDetail) {
    return (
      <ProtectedRoute>
        <Layout title="任务详情">
          <Alert status="error" borderRadius="lg" bg="red.50" border="1px" borderColor="red.200">
            <AlertIcon color="red.600" />
            <Box flex="1">
              <AlertTitle color="red.800">加载失败</AlertTitle>
              <AlertDescription color="red.700">{error || '任务不存在'}</AlertDescription>
            </Box>
            <Button size="sm" variant="ghost" color="red.600" onClick={() => router.push('/tasks')}>
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
        <Box bg="myGray.50" minH="100%" mx={-4} mt={-4} p={4}>
          {/* 页面标题 */}
          <Flex justify="space-between" align="center" mb={4}>
            <Flex align="center">
              <MyIcon
                name="common/arrowLeft"
                w="24px"
                h="24px"
                color="myGray.400"
                cursor="pointer"
                _hover={{ color: 'primary.600' }}
                mr={3}
                onClick={() => router.push('/tasks')}
              />
              <Box>
                <Text fontSize="2xl" fontWeight="bold" color="myGray.900">
                  {taskDetail.config.name}
                </Text>
                <Text fontSize="sm" color="myGray.500" mt={1}>
                  {taskDetail.config.description || '暂无描述'}
                </Text>
              </Box>
            </Flex>
            <HStack spacing={3}>
              <Button
                variant={taskDetail.config.enabled ? 'dangerFill' : 'primary'}
                onClick={() => handleToggleTask(!taskDetail.config.enabled)}
              >
                {taskDetail.config.enabled ? '禁用任务' : '启用任务'}
              </Button>
              <Button
                variant="primary"
                leftIcon={<MyIcon name="common/playFill" w="16px" h="16px" />}
                onClick={() => setShowExecuteDialog(true)}
                isDisabled={taskDetail.config.isRunning}
              >
                {taskDetail.config.isRunning ? '运行中' : '立即执行'}
              </Button>
            </HStack>
          </Flex>

          {/* 任务配置信息 */}
          <Box bg="white" borderRadius="lg" boxShadow="sm" px={5} py={4} mb={4}>
            <Text fontSize="lg" fontWeight="600" color="myGray.900" mb={4}>
              任务配置
            </Text>
            <Box>
              {[
                { label: '任务 ID', value: taskDetail.config.id, mono: true },
                { label: 'Cron 表达式', value: taskDetail.config.cronExpression, mono: true },
                { label: '时区', value: taskDetail.config.timezone || DEFAULT_TIMEZONE },
                { label: '执行器', value: taskDetail.config.executorName },
                {
                  label: '最大执行时间',
                  value: `${taskDetail.config.maxExecutionTime || 3600000}ms`
                },
                { label: '重试次数', value: String(taskDetail.config.retryCount || 0) },
                { label: '重试间隔', value: `${taskDetail.config.retryInterval || 60000}ms` },
                {
                  label: '启用状态',
                  value: taskDetail.config.enabled ? '已启用' : '已禁用',
                  isStatus: true,
                  statusColor: taskDetail.config.enabled ? 'green.600' : 'myGray.500'
                },
                {
                  label: '下次执行时间',
                  value: taskDetail.nextExecutionTime
                    ? formatTime(taskDetail.nextExecutionTime)
                    : '已禁用'
                }
              ].map((item, index) => (
                <Flex
                  key={index}
                  justify="space-between"
                  py={3}
                  borderBottom={index < 8 ? '1px' : 'none'}
                  borderColor="borderColor.low"
                >
                  <Text fontWeight="medium" color="myGray.500" fontSize="sm">
                    {item.label}
                  </Text>
                  {item.isStatus ? (
                    <HStack spacing={1}>
                      <Box w="6px" h="6px" borderRadius="full" bg={item.statusColor} />
                      <Text fontSize="sm" color={item.statusColor}>
                        {item.value}
                      </Text>
                    </HStack>
                  ) : (
                    <Text
                      fontSize="sm"
                      color="myGray.900"
                      fontFamily={item.mono ? 'mono' : 'inherit'}
                    >
                      {item.value}
                    </Text>
                  )}
                </Flex>
              ))}
              {taskDetail.config.defaultParams && (
                <Box mt={4}>
                  <Text fontWeight="medium" color="myGray.500" fontSize="sm" mb={2}>
                    默认参数
                  </Text>
                  <Box
                    bg="myGray.50"
                    p={3}
                    borderRadius="md"
                    fontSize="sm"
                    fontFamily="mono"
                    overflow="auto"
                    maxH="200px"
                    border="1px"
                    borderColor="borderColor.low"
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(taskDetail.config.defaultParams, null, 2)}
                    </pre>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          {/* 执行统计图表 */}
          <Box mb={4} bg="white" borderRadius="lg" boxShadow="sm" px={5} py={4}>
            <ExecutionCharts executions={executions} loading={executionsLoading} />
          </Box>

          {/* 执行历史 */}
          <Box bg="white" borderRadius="lg" boxShadow="sm" px={5} py={4}>
            <Flex justify="space-between" align="center" mb={4}>
              <Text fontSize="lg" fontWeight="600" color="myGray.900">
                执行历史
              </Text>
              <HStack spacing={3}>
                <Box
                  as="select"
                  w="150px"
                  value={query.status}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setQuery({ ...query, status: e.target.value, page: 1 })
                  }
                  p={2}
                  borderRadius="md"
                  border="1px"
                  borderColor="borderColor.low"
                  bg="myGray.50"
                  fontSize="sm"
                >
                  <option value="">全部状态</option>
                  <option value="success">成功</option>
                  <option value="failed">失败</option>
                  <option value="running">运行中</option>
                </Box>
                <Button
                  size="sm"
                  variant="ghost"
                  color="primary.600"
                  leftIcon={<MyIcon name="common/refresh" w="14px" h="14px" />}
                  onClick={loadExecutions}
                  isLoading={executionsLoading}
                >
                  刷新
                </Button>
              </HStack>
            </Flex>

            {executionsLoading && executions.length === 0 ? (
              <Flex justify="center" py={8}>
                <Spinner color="primary.600" />
              </Flex>
            ) : executions.length === 0 ? (
              <Text textAlign="center" color="myGray.400" py={8}>
                暂无执行记录
              </Text>
            ) : (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      执行 ID
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      开始时间
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      结束时间
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      状态
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      耗时
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      操作
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {executions.map((execution) => {
                    const statusStyle = getStatusStyle(execution.status);
                    return (
                      <React.Fragment key={execution.id}>
                        <Tr _hover={{ bg: 'myGray.50' }}>
                          <Td fontFamily="mono" fontSize="sm" color="myGray.700">
                            {execution.id}
                          </Td>
                          <Td fontSize="sm" color="myGray.700">
                            {formatTime(execution.startTime)}
                          </Td>
                          <Td fontSize="sm" color="myGray.700">
                            {execution.endTime ? formatTime(execution.endTime) : '-'}
                          </Td>
                          <Td>
                            <HStack spacing={1}>
                              <Box w="6px" h="6px" borderRadius="full" bg={statusStyle.color} />
                              <Text fontSize="sm" color={statusStyle.color}>
                                {statusStyle.label}
                              </Text>
                            </HStack>
                          </Td>
                          <Td fontSize="sm" color="myGray.700">
                            {execution.executionTimeMs ? `${execution.executionTimeMs}ms` : '-'}
                          </Td>
                          <Td>
                            <MyIcon
                              name={
                                expandedExecutionId === execution.id
                                  ? 'common/downArrowFill'
                                  : 'common/arrowRight'
                              }
                              w="16px"
                              h="16px"
                              color="myGray.400"
                              cursor="pointer"
                              _hover={{ color: 'primary.600' }}
                              onClick={() => toggleExpand(execution.id)}
                            />
                          </Td>
                        </Tr>
                        <Tr>
                          <Td colSpan={6} p={0}>
                            <Collapse in={expandedExecutionId === execution.id}>
                              <Box bg="myGray.50" p={4}>
                                <Box>
                                  {execution.params && (
                                    <Box mb={3}>
                                      <Text
                                        fontWeight="medium"
                                        mb={2}
                                        color="myGray.700"
                                        fontSize="sm"
                                      >
                                        执行参数
                                      </Text>
                                      <Box
                                        bg="white"
                                        p={3}
                                        borderRadius="md"
                                        fontSize="xs"
                                        fontFamily="mono"
                                        overflow="auto"
                                        maxH="200px"
                                        border="1px"
                                        borderColor="borderColor.low"
                                      >
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                          {JSON.stringify(execution.params, null, 2)}
                                        </pre>
                                      </Box>
                                    </Box>
                                  )}
                                  {execution.result && (
                                    <Box mb={3}>
                                      <Text
                                        fontWeight="medium"
                                        mb={2}
                                        color="myGray.700"
                                        fontSize="sm"
                                      >
                                        执行结果
                                      </Text>
                                      <Box
                                        bg="white"
                                        p={3}
                                        borderRadius="md"
                                        fontSize="xs"
                                        fontFamily="mono"
                                        overflow="auto"
                                        maxH="200px"
                                        border="1px"
                                        borderColor="borderColor.low"
                                      >
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                          {JSON.stringify(execution.result, null, 2)}
                                        </pre>
                                      </Box>
                                    </Box>
                                  )}
                                  {execution.errorMessage && (
                                    <Box>
                                      <Text
                                        fontWeight="medium"
                                        mb={2}
                                        color="red.600"
                                        fontSize="sm"
                                      >
                                        错误信息
                                      </Text>
                                      <Alert
                                        status="error"
                                        borderRadius="md"
                                        bg="red.50"
                                        border="1px"
                                        borderColor="red.200"
                                      >
                                        <AlertIcon color="red.600" />
                                        <Text fontSize="sm" color="red.700">
                                          {execution.errorMessage}
                                        </Text>
                                      </Alert>
                                    </Box>
                                  )}
                                </Box>
                              </Box>
                            </Collapse>
                          </Td>
                        </Tr>
                      </React.Fragment>
                    );
                  })}
                </Tbody>
              </Table>
            )}

            {/* 分页 */}
            {total > query.pageSize! && (
              <Flex justify="space-between" align="center" mt={4}>
                <Text fontSize="sm" color="myGray.500">
                  共 {total} 条记录
                </Text>
                <HStack>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="primary.600"
                    onClick={() => setQuery({ ...query, page: query.page! - 1 })}
                    isDisabled={query.page === 1}
                  >
                    上一页
                  </Button>
                  <Text fontSize="sm" color="myGray.700">
                    第 {query.page} / {Math.ceil(total / query.pageSize!)} 页
                  </Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="primary.600"
                    onClick={() => setQuery({ ...query, page: query.page! + 1 })}
                    isDisabled={query.page! >= Math.ceil(total / query.pageSize!)}
                  >
                    下一页
                  </Button>
                </HStack>
              </Flex>
            )}
          </Box>

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
