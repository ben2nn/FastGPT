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
  Badge,
  Text,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

import { getTaskList, toggleTask } from '@/web/core/task/api';
import type { TaskListItem } from '@/web/core/task/api';
import ExecuteTaskDialog from '@/components/tasks/ExecuteTaskDialog';
import TaskDetailDialog from '@/components/tasks/TaskDetailDialog';
import TaskHistoryDialog from '@/components/tasks/TaskHistoryDialog';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';

// 配置 dayjs
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/**
 * 任务列表页面组件
 */
const TaskListPage = ({ ssrAuthenticated }: { ssrAuthenticated?: boolean }) => {
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

  // 获取状态徽章
  const getStatusBadge = (task: TaskListItem) => {
    if (task.isRunning) {
      return <Badge colorScheme="blue">运行中</Badge>;
    }

    if (!task.lastExecution) {
      return <Badge colorScheme="gray">未执行</Badge>;
    }

    switch (task.lastExecution.status) {
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
    <ProtectedRoute ssrAuthenticated={ssrAuthenticated}>
      <Layout title="任务管理">
        <Box>
          {/* 页面标题 */}
          <Flex justify="space-between" align="center" mb={6}>
            <Box>
              <Text fontSize="sm" color="gray.600" mt={1}>
                管理和监控系统定时任务
              </Text>
            </Box>
            <Button
              colorScheme="blue"
              onClick={loadTasks}
              isLoading={loading}
              loadingText="刷新中..."
            >
              刷新
            </Button>
          </Flex>

          {/* 错误提示 */}
          {error && (
            <Alert status="error" mb={4} borderRadius="md">
              <AlertIcon />
              <Box flex="1">
                <AlertTitle>加载失败</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Box>
              <Button size="sm" onClick={loadTasks}>
                重试
              </Button>
            </Alert>
          )}

          {/* 加载中 */}
          {loading && !error && (
            <Flex justify="center" align="center" h="400px">
              <Spinner size="xl" color="blue.500" />
            </Flex>
          )}

          {/* 任务列表 */}
          {!loading && !error && (
            <Box bg="white" borderRadius="lg" shadow="sm" overflow="hidden">
              <Table variant="simple">
                <Thead bg="gray.50">
                  <Tr>
                    <Th>任务名称</Th>
                    <Th>描述</Th>
                    <Th>Cron 表达式</Th>
                    <Th>状态</Th>
                    <Th>最近执行</Th>
                    <Th>下次执行</Th>
                    <Th>启用</Th>
                    <Th>操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {tasks.length === 0 ? (
                    <Tr>
                      <Td colSpan={8} textAlign="center" py={8}>
                        <Text color="gray.500">暂无任务</Text>
                      </Td>
                    </Tr>
                  ) : (
                    tasks.map((task) => (
                      <Tr key={task.id} _hover={{ bg: 'gray.50' }}>
                        <Td>
                          <Text fontWeight="medium">{task.name}</Text>
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.600" noOfLines={2} maxW="200px">
                            {task.description || '-'}
                          </Text>
                        </Td>
                        <Td>
                          <Text fontSize="sm" fontFamily="monospace">
                            {task.cronExpression}
                          </Text>
                        </Td>
                        <Td>{getStatusBadge(task)}</Td>
                        <Td>
                          {task.lastExecution ? (
                            <Box>
                              <Text fontSize="sm">
                                {formatRelativeTime(task.lastExecution.startTime)}
                              </Text>
                              {task.lastExecution.executionTimeMs && (
                                <Text fontSize="xs" color="gray.500">
                                  耗时 {task.lastExecution.executionTimeMs}ms
                                </Text>
                              )}
                            </Box>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              未执行
                            </Text>
                          )}
                        </Td>
                        <Td>
                          <Text fontSize="sm">
                            {task.enabled ? formatRelativeTime(task.nextExecutionTime) : '已禁用'}
                          </Text>
                        </Td>
                        <Td>
                          <Switch
                            isChecked={task.enabled}
                            onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                            isDisabled={togglingTaskId === task.id}
                            colorScheme="blue"
                          />
                        </Td>
                        <Td>
                          <Flex gap={2} flexWrap="wrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="blue"
                              onClick={() => handleViewDetail(task)}
                            >
                              详情
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="purple"
                              onClick={() => handleViewHistory(task)}
                            >
                              历史
                            </Button>
                            <Button
                              size="sm"
                              colorScheme="green"
                              onClick={() => handleExecuteTask(task)}
                              isDisabled={task.isRunning}
                            >
                              {task.isRunning ? '运行中' : '立即执行'}
                            </Button>
                          </Flex>
                        </Td>
                      </Tr>
                    ))
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

export async function getServerSideProps(context: any) {
  try {
    const token = context.req.cookies?.admin_token;

    if (!token) {
      return {
        redirect: {
          destination: '/login',
          permanent: false
        }
      };
    }

    return {
      props: { ssrAuthenticated: true }
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }
}
