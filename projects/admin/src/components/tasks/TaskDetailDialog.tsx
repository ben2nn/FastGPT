/**
 * 任务详情弹框组件
 * 在弹框中显示任务的详细配置信息
 */

import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Box,
  Flex,
  Text,
  Badge,
  Stack,
  StackDivider,
  Code,
  Button,
  Input,
  Textarea,
  FormControl,
  FormLabel,
  FormHelperText,
  FormErrorMessage,
  useToast,
  Alert,
  AlertIcon,
  AlertDescription,
  List,
  ListItem,
  ListIcon
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';
import dayjs from 'dayjs';

import type { TaskListItem } from '@/web/core/task/api';
import {
  updateCronExpression,
  validateCronExpression,
  reinitializeTask
} from '@/web/core/task/api';

interface TaskDetailDialogProps {
  task: TaskListItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

/**
 * 任务详情弹框组件
 */
const TaskDetailDialog: React.FC<TaskDetailDialogProps> = ({ task, isOpen, onClose, onUpdate }) => {
  const toast = useToast();

  // 统一编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState('');
  const [cronExpression, setCronExpression] = useState('');
  const [cronError, setCronError] = useState('');
  const [nextExecutions, setNextExecutions] = useState<string[]>([]);
  const [params, setParams] = useState('');
  const [paramsError, setParamsError] = useState('');
  const [recommendedParams, setRecommendedParams] = useState<Record<string, any> | null>(null);

  // 加载状态
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isReinitializing, setIsReinitializing] = useState(false);

  if (!task) return null;

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '-';
    return dayjs(timeStr).format('YYYY-MM-DD HH:mm:ss');
  };

  // 开始编辑（同时编辑描述、Cron 和参数）
  const handleStartEdit = () => {
    setDescription(task.description || '');
    setCronExpression(task.cronExpression);
    setParams(JSON.stringify(task.defaultParams || {}, null, 2));
    setCronError('');
    setParamsError('');
    setNextExecutions([]);
    setRecommendedParams(null);
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    setDescription('');
    setCronExpression('');
    setParams('');
    setCronError('');
    setParamsError('');
    setNextExecutions([]);
    setRecommendedParams(null);
  };

  // 验证 Cron 表达式
  const handleValidate = async () => {
    if (!cronExpression.trim()) {
      setCronError('Cron 表达式不能为空');
      return;
    }

    setIsValidating(true);
    setCronError('');
    setNextExecutions([]);
    setRecommendedParams(null);

    try {
      const res = await validateCronExpression(task.id, cronExpression, task.timezone);

      if (res.valid) {
        setNextExecutions(res.nextExecutions || []);

        // 设置推荐的参数
        if (res.recommendedParams) {
          setRecommendedParams(res.recommendedParams);
        }

        toast({
          title: 'Cron 表达式有效',
          description: '已显示接下来的执行时间和推荐参数',
          status: 'success',
          duration: 2000
        });
      } else {
        setCronError(res.message);
        toast({
          title: '验证失败',
          description: res.message,
          status: 'error',
          duration: 3000
        });
      }
    } catch (err: any) {
      setCronError(err?.message || '验证失败');
      toast({
        title: '验证失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    } finally {
      setIsValidating(false);
    }
  };

  // 保存（同时保存描述、Cron 和参数）
  const handleSave = async () => {
    // 验证 Cron 表达式
    if (!cronExpression.trim()) {
      setCronError('Cron 表达式不能为空');
      return;
    }

    // 验证参数
    if (!params.trim()) {
      setParamsError('参数不能为空');
      return;
    }

    // 验证 JSON 格式
    let parsedParams: Record<string, any>;
    try {
      parsedParams = JSON.parse(params);
    } catch (e) {
      setParamsError('参数格式错误，请输入有效的 JSON 格式');
      return;
    }

    setIsUpdating(true);

    try {
      // 统一更新描述、Cron 表达式和参数
      await updateCronExpression(task.id, {
        description,
        cronExpression,
        params: parsedParams
      });

      toast({
        title: '更新成功',
        description: '已更新任务配置',
        status: 'success',
        duration: 2000
      });

      setIsEditing(false);
      setDescription('');
      setCronExpression('');
      setParams('');
      setCronError('');
      setParamsError('');
      setNextExecutions([]);
      setRecommendedParams(null);

      // 通知父组件刷新（会刷新列表和详情页面）
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      toast({
        title: '更新失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 应用推荐参数
  const handleApplyRecommendedParams = () => {
    if (recommendedParams) {
      setParams(JSON.stringify(recommendedParams, null, 2));
      setParamsError('');
      toast({
        title: '已应用推荐参数',
        description: '请检查参数并保存',
        status: 'info',
        duration: 2000
      });
    }
  };

  // 重新初始化任务
  const handleReinitialize = async () => {
    setIsReinitializing(true);

    try {
      const res = await reinitializeTask(task.id);

      toast({
        title: '初始化成功',
        description: res.message,
        status: 'success',
        duration: 2000
      });

      // 通知父组件刷新（会刷新列表和详情页面）
      if (onUpdate) {
        onUpdate();
      }
    } catch (err: any) {
      toast({
        title: '初始化失败',
        description: err?.message || '请稍后重试',
        status: 'error',
        duration: 3000
      });
    } finally {
      setIsReinitializing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <Text fontSize="xl" fontWeight="bold">
            {task.name}
          </Text>
          <Text fontSize="sm" color="gray.600" fontWeight="normal" mt={1}>
            {task.description || '暂无描述'}
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          <Stack spacing={4} divider={<StackDivider />}>
            {/* 基本信息和任务参数（统一编辑） */}
            <Box>
              <Flex justify="space-between" align="center" mb={3}>
                <Text fontSize="md" fontWeight="bold">
                  基本信息
                </Text>
                {!isEditing && (
                  <Button size="sm" colorScheme="blue" onClick={handleStartEdit}>
                    编辑配置
                  </Button>
                )}
              </Flex>

              <Stack spacing={3}>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    任务 ID
                  </Text>
                  <Text fontFamily="monospace" fontSize="sm">
                    {task.id}
                  </Text>
                </Flex>

                {/* 任务描述显示/编辑 */}
                <Box>
                  <Text fontWeight="medium" color="gray.600" mb={2}>
                    任务描述
                  </Text>

                  {isEditing ? (
                    <FormControl>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="请输入任务描述"
                        rows={2}
                        fontSize="sm"
                      />
                      <FormHelperText fontSize="xs">简要描述任务的功能和用途</FormHelperText>
                    </FormControl>
                  ) : (
                    <Text fontSize="sm" color="gray.700">
                      {task.description || '暂无描述'}
                    </Text>
                  )}
                </Box>

                {/* Cron 表达式显示/编辑 */}
                <Box>
                  <Text fontWeight="medium" color="gray.600" mb={2}>
                    Cron 表达式
                  </Text>

                  {isEditing ? (
                    <FormControl isInvalid={!!cronError}>
                      <Input
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        placeholder="例如: 0 2 * * * (每天凌晨2点)"
                        fontFamily="monospace"
                        size="sm"
                      />
                      {cronError && <FormErrorMessage>{cronError}</FormErrorMessage>}
                      {nextExecutions.length > 0 && (
                        <Box mt={2}>
                          <Text fontSize="xs" color="gray.600" mb={1}>
                            接下来的执行时间：
                          </Text>
                          <List spacing={1}>
                            {nextExecutions.map((time, index) => (
                              <ListItem key={index} fontSize="xs" color="green.600">
                                <ListIcon as={CheckCircleIcon} color="green.500" />
                                {formatTime(time)}
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                      <FormHelperText fontSize="xs">
                        格式: 秒 分 时 日 月 周 (例如: 0 2 * * * 表示每天凌晨2点)
                      </FormHelperText>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={handleValidate}
                        isLoading={isValidating}
                        loadingText="验证中"
                        mt={2}
                      >
                        验证 Cron 表达式
                      </Button>
                    </FormControl>
                  ) : (
                    <Text fontFamily="monospace" fontSize="sm">
                      {task.cronExpression}
                    </Text>
                  )}
                </Box>

                {/* 任务参数显示/编辑 */}
                <Box>
                  <Text fontWeight="medium" color="gray.600" mb={2}>
                    任务参数
                  </Text>

                  {isEditing ? (
                    <FormControl isInvalid={!!paramsError}>
                      <Textarea
                        value={params}
                        onChange={(e) => setParams(e.target.value)}
                        placeholder='{"key": "value"}'
                        rows={10}
                        fontFamily="monospace"
                        fontSize="sm"
                        bg="gray.50"
                      />
                      {paramsError && <FormErrorMessage>{paramsError}</FormErrorMessage>}

                      {/* 推荐参数提示 */}
                      {recommendedParams && (
                        <Alert status="info" mt={2} borderRadius="md">
                          <AlertIcon />
                          <Box flex="1">
                            <Text fontSize="sm" fontWeight="bold">
                              根据 Cron 表达式推荐的参数
                            </Text>
                            <Code
                              display="block"
                              whiteSpace="pre-wrap"
                              p={2}
                              mt={2}
                              borderRadius="md"
                              fontSize="xs"
                              bg="white"
                            >
                              {JSON.stringify(recommendedParams, null, 2)}
                            </Code>
                          </Box>
                          <Button
                            size="sm"
                            colorScheme="blue"
                            onClick={handleApplyRecommendedParams}
                            ml={2}
                          >
                            应用
                          </Button>
                        </Alert>
                      )}

                      <FormHelperText fontSize="xs">
                        支持动态参数模板，如 {'{'}
                        {'{'} yesterday.start {'}'}
                        {'}'}、{'{'}
                        {'{'} yesterday.end {'}'}
                        {'}'} 等
                      </FormHelperText>
                    </FormControl>
                  ) : (
                    <Code
                      display="block"
                      whiteSpace="pre-wrap"
                      p={3}
                      borderRadius="md"
                      fontSize="xs"
                      bg="gray.50"
                    >
                      {JSON.stringify(task.defaultParams || {}, null, 2)}
                    </Code>
                  )}
                </Box>

                {/* 统一的保存和取消按钮 */}
                {isEditing && (
                  <Flex gap={2} pt={2}>
                    <Button
                      size="sm"
                      colorScheme="green"
                      onClick={handleSave}
                      isLoading={isUpdating}
                      loadingText="保存中"
                      isDisabled={
                        !!cronError || !!paramsError || !cronExpression.trim() || !params.trim()
                      }
                    >
                      保存全部
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                      取消
                    </Button>
                  </Flex>
                )}

                {!isEditing && (
                  <>
                    <Flex justify="space-between">
                      <Text fontWeight="medium" color="gray.600">
                        启用状态
                      </Text>
                      <Badge colorScheme={task.enabled ? 'green' : 'gray'}>
                        {task.enabled ? '已启用' : '已禁用'}
                      </Badge>
                    </Flex>

                    <Flex justify="space-between">
                      <Text fontWeight="medium" color="gray.600">
                        运行状态
                      </Text>
                      <Badge colorScheme={task.isRunning ? 'blue' : 'gray'}>
                        {task.isRunning ? '运行中' : '空闲'}
                      </Badge>
                    </Flex>
                  </>
                )}
              </Stack>
            </Box>

            {/* 执行信息 */}
            <Box>
              <Text fontSize="md" fontWeight="bold" mb={3}>
                执行信息
              </Text>
              <Stack spacing={3}>
                <Flex justify="space-between">
                  <Text fontWeight="medium" color="gray.600">
                    下次执行时间
                  </Text>
                  <Text fontSize="sm">
                    {task.enabled ? formatTime(task.nextExecutionTime) : '已禁用'}
                  </Text>
                </Flex>

                {task.lastExecution && (
                  <>
                    <Flex justify="space-between">
                      <Text fontWeight="medium" color="gray.600">
                        最近执行时间
                      </Text>
                      <Text fontSize="sm">{formatTime(task.lastExecution.startTime)}</Text>
                    </Flex>

                    <Flex justify="space-between">
                      <Text fontWeight="medium" color="gray.600">
                        最近执行状态
                      </Text>
                      <Badge
                        colorScheme={
                          task.lastExecution.status === 'success'
                            ? 'green'
                            : task.lastExecution.status === 'failed'
                              ? 'red'
                              : 'blue'
                        }
                      >
                        {task.lastExecution.status === 'success'
                          ? '成功'
                          : task.lastExecution.status === 'failed'
                            ? '失败'
                            : '运行中'}
                      </Badge>
                    </Flex>

                    {task.lastExecution.executionTimeMs && (
                      <Flex justify="space-between">
                        <Text fontWeight="medium" color="gray.600">
                          执行耗时
                        </Text>
                        <Text fontSize="sm">{task.lastExecution.executionTimeMs}ms</Text>
                      </Flex>
                    )}

                    {task.lastExecution.errorMessage && (
                      <Box>
                        <Text fontWeight="medium" color="red.600" mb={2}>
                          错误信息
                        </Text>
                        <Code
                          display="block"
                          whiteSpace="pre-wrap"
                          p={3}
                          borderRadius="md"
                          fontSize="xs"
                          colorScheme="red"
                        >
                          {task.lastExecution.errorMessage}
                        </Code>
                      </Box>
                    )}
                  </>
                )}
              </Stack>
            </Box>

            {/* 配置信息 */}
            <Box>
              <Text fontSize="md" fontWeight="bold" mb={3}>
                配置信息
              </Text>
              <Stack spacing={3}>
                {task.maxExecutionTime && (
                  <Flex justify="space-between">
                    <Text fontWeight="medium" color="gray.600">
                      最大执行时间
                    </Text>
                    <Text fontSize="sm">{task.maxExecutionTime}ms</Text>
                  </Flex>
                )}

                {task.retryCount !== undefined && (
                  <Flex justify="space-between">
                    <Text fontWeight="medium" color="gray.600">
                      重试次数
                    </Text>
                    <Text fontSize="sm">{task.retryCount}</Text>
                  </Flex>
                )}

                {task.retryInterval && (
                  <Flex justify="space-between">
                    <Text fontWeight="medium" color="gray.600">
                      重试间隔
                    </Text>
                    <Text fontSize="sm">{task.retryInterval}ms</Text>
                  </Flex>
                )}

                {task.timezone && (
                  <Flex justify="space-between">
                    <Text fontWeight="medium" color="gray.600">
                      时区
                    </Text>
                    <Text fontSize="sm">{task.timezone}</Text>
                  </Flex>
                )}
              </Stack>
            </Box>
          </Stack>
        </ModalBody>

        <ModalFooter>
          <Flex gap={1} width="100%" justify="space-between">
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
          </Flex>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TaskDetailDialog;
