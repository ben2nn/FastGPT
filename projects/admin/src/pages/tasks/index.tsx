/**
 * 任务列表页面
 * 显示所有任务的配置和状态
 */

import React, { useState, useEffect } from 'react';
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
  Switch,
  Text,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  HStack
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { getTaskList, toggleTask } from '@/web/core/task/api';
import type { TaskListItem } from '@/web/core/task/api';
import ExecuteTaskDialog from '@/pageComponents/tasks/ExecuteTaskDialog';
import TaskDetailDialog from '@/pageComponents/tasks/TaskDetailDialog';
import TaskHistoryDialog from '@/pageComponents/tasks/TaskHistoryDialog';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';

// 配置 dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/**
 * 任务列表页面组件
 */
const TaskListPage = () => {
  const toast = useToast();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskForExecute, setSelectedTaskForExecute] = useState<TaskListItem | null>(null);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<TaskListItem | null>(null);
  const [selectedTaskForHistory, setSelectedTaskForHistory] = useState<TaskListItem | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getTaskList();
      setTasks(res.tasks);

      // 如果详情对话框打开，更新详情中的任务数据
      if (selectedTaskForDetail) {
        const updatedTask = res.tasks.find((t) => t.id === selectedTaskForDetail.id);
        if (updatedTask) {
          setSelectedTaskForDetail(updatedTask);
        }
      }

      return res.tasks;
    } catch (err: any) {
      setError(err?.message || '加载任务列表失败');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadTasks();
  }, []);

  // 启用/禁用任务
  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    setTogglingTaskId(taskId);

    try {
      await toggleTask(taskId, enabled);
      toast({
        title: enabled ? '任务已启用' : '任务已禁用',
        status: 'success',
        duration: 2000
      });
      // 重新加载任务列表
      await loadTasks();
    } catch (err: any) {
      toast({
        title: '操作失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    } finally {
      setTogglingTaskId(null);
    }
  };

  // 打开执行对话框
  const handleExecuteTask = (task: TaskListItem) => {
    setSelectedTaskForExecute(task);
  };

  // 查看任务详情
  const handleViewDetail = (task: TaskListItem) => {
    setSelectedTaskForDetail(task);
  };

  // 查看任务历史
  const handleViewHistory = (task: TaskListItem) => {
    setSelectedTaskForHistory(task);
  };

  // 获取状态样式
  const getStatusStyle = (task: TaskListItem) => {
    if (task.isRunning) {
      return { color: 'primary.600', bg: 'primary.50', label: '运行中' };
    }

    if (!task.lastExecution) {
      return { color: 'myGray.500', bg: 'myGray.50', label: '未执行' };
    }

    switch (task.lastExecution.status) {
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
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    return dayjs(timeStr).format('YYYY-MM-DD HH:mm:ss');
  };

  // 格式化相对时间
  const formatRelativeTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    return dayjs(timeStr).fromNow();
  };

  return (
    <ProtectedRoute>
      <Layout title="任务管理">
        <Box bg="myGray.50" minH="100%" mx={-4} mt={-4} p={4}>
          {/* 页面标题 */}
          <Flex justify="space-between" align="center" mb={4}>
            <Box>
              <Text fontSize="sm" color="myGray.500" mt={1}>
                管理和监控系统定时任务
              </Text>
            </Box>
            <Button
              variant="primary"
              leftIcon={<MyIcon name="common/refresh" w="16px" h="16px" />}
              onClick={loadTasks}
              isLoading={loading}
              loadingText="刷新中..."
            >
              刷新
            </Button>
          </Flex>

          {/* 错误提示 */}
          {error && (
            <Alert
              status="error"
              mb={4}
              borderRadius="lg"
              bg="red.50"
              border="1px"
              borderColor="red.200"
            >
              <AlertIcon color="red.600" />
              <Box flex="1">
                <AlertTitle color="red.800">加载失败</AlertTitle>
                <AlertDescription color="red.700">{error}</AlertDescription>
              </Box>
              <Button size="sm" variant="ghost" color="red.600" onClick={loadTasks}>
                重试
              </Button>
            </Alert>
          )}

          {/* 加载中 */}
          {loading && !error && (
            <Flex justify="center" align="center" h="400px">
              <Spinner size="xl" color="primary.600" />
            </Flex>
          )}

          {/* 任务列表 */}
          {!loading && !error && (
            <Box bg="white" borderRadius="lg" overflow="hidden" boxShadow="sm" px={5} py={4}>
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      任务名称
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      描述
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      Cron 表达式
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      状态
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      最近执行
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      下次执行
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      启用
                    </Th>
                    <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                      操作
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {tasks.length === 0 ? (
                    <Tr>
                      <Td colSpan={8} textAlign="center" py={8}>
                        <Text color="myGray.400">暂无任务</Text>
                      </Td>
                    </Tr>
                  ) : (
                    tasks.map((task) => {
                      const statusStyle = getStatusStyle(task);
                      return (
                        <Tr key={task.id} _hover={{ bg: 'myGray.50' }}>
                          <Td>
                            <Text fontWeight="medium" color="myGray.900">
                              {task.name}
                            </Text>
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="myGray.500" noOfLines={2} maxW="200px">
                              {task.description || '-'}
                            </Text>
                          </Td>
                          <Td>
                            <Text fontSize="sm" fontFamily="mono" color="myGray.700">
                              {task.cronExpression}
                            </Text>
                          </Td>
                          <Td>
                            <HStack spacing={1}>
                              <Box w="6px" h="6px" borderRadius="full" bg={statusStyle.color} />
                              <Text fontSize="sm" color={statusStyle.color}>
                                {statusStyle.label}
                              </Text>
                            </HStack>
                          </Td>
                          <Td>
                            {task.lastExecution ? (
                              <Box>
                                <Text fontSize="sm" color="myGray.700">
                                  {formatRelativeTime(task.lastExecution.startTime)}
                                </Text>
                                {task.lastExecution.executionTimeMs && (
                                  <Text fontSize="xs" color="myGray.400">
                                    耗时 {task.lastExecution.executionTimeMs}ms
                                  </Text>
                                )}
                              </Box>
                            ) : (
                              <Text fontSize="sm" color="myGray.400">
                                未执行
                              </Text>
                            )}
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="myGray.700">
                              {task.enabled ? formatRelativeTime(task.nextExecutionTime) : '已禁用'}
                            </Text>
                          </Td>
                          <Td>
                            <Switch
                              isChecked={task.enabled}
                              onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                              isDisabled={togglingTaskId === task.id}
                              colorScheme="blue"
                              size="sm"
                            />
                          </Td>
                          <Td>
                            <HStack spacing={2}>
                              <Button
                                size="sm"
                                variant="ghost"
                                color="primary.600"
                                leftIcon={<MyIcon name="common/detail" w="14px" h="14px" />}
                                onClick={() => handleViewDetail(task)}
                              >
                                详情
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                color="adora.600"
                                leftIcon={<MyIcon name="common/logLight" w="14px" h="14px" />}
                                onClick={() => handleViewHistory(task)}
                              >
                                历史
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                leftIcon={<MyIcon name="common/playFill" w="14px" h="14px" />}
                                onClick={() => handleExecuteTask(task)}
                                isDisabled={task.isRunning}
                              >
                                {task.isRunning ? '运行中' : '执行'}
                              </Button>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </Tbody>
              </Table>
            </Box>
          )}

          {/* 执行任务对话框 */}
          {selectedTaskForExecute && (
            <ExecuteTaskDialog
              task={selectedTaskForExecute}
              isOpen={!!selectedTaskForExecute}
              onClose={() => setSelectedTaskForExecute(null)}
              onSuccess={() => {
                setSelectedTaskForExecute(null);
                loadTasks();
              }}
            />
          )}

          {/* 任务详情对话框 */}
          <TaskDetailDialog
            task={selectedTaskForDetail}
            isOpen={!!selectedTaskForDetail}
            onClose={() => setSelectedTaskForDetail(null)}
            onUpdate={loadTasks}
          />

          {/* 任务历史对话框 */}
          <TaskHistoryDialog
            task={selectedTaskForHistory}
            isOpen={!!selectedTaskForHistory}
            onClose={() => setSelectedTaskForHistory(null)}
          />
        </Box>
      </Layout>
    </ProtectedRoute>
  );
};

export default TaskListPage;
