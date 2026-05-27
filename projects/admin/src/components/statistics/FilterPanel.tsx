import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  Select,
  FormControl,
  FormLabel,
  HStack,
  VStack
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

import ExportButton from './ExportButton';
import type { StatisticsQuery } from '@/service/core/statistics/statistics';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

/**
 * 调用状态选项
 */
const CALL_STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '超时', value: 'timeout' }
] as const;

interface FilterPanelProps {
  onFilterChange: (filters: StatisticsQuery) => void;
  initialFilters?: Partial<StatisticsQuery>;
  onAutoRefreshChange?: (enabled: boolean, interval: number) => void;
}

/**
 * 筛选面板组件
 * 提供时间范围、应用、模型、状态等筛选条件
 */
const FilterPanel: React.FC<FilterPanelProps> = ({
  onFilterChange,
  initialFilters = {},
  onAutoRefreshChange
}) => {
  // 筛选条件状态
  // 将 ISO UTC 时间转换为本地时间格式用于显示
  const [startTime, setStartTime] = useState<string>(() => {
    if (initialFilters.startTime) {
      return dayjs(initialFilters.startTime).format('YYYY-MM-DDTHH:mm');
    }
    return dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm');
  });
  const [endTime, setEndTime] = useState<string>(() => {
    if (initialFilters.endTime) {
      return dayjs(initialFilters.endTime).format('YYYY-MM-DDTHH:mm');
    }
    return dayjs().format('YYYY-MM-DDTHH:mm');
  });
  const [appName, setAppName] = useState<string>(initialFilters.appName || '');
  const [modelName, setModelName] = useState<string>(initialFilters.modelName || '');
  const [callStatus, setCallStatus] = useState<string>(initialFilters.callStatus || '');

  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30);

  /**
   * 处理快捷时间选项变化
   */
  const handleQuickTimeChange = useCallback(
    (value: string) => {
      const now = dayjs();
      let start: dayjs.Dayjs;
      let end: dayjs.Dayjs = now;

      switch (value) {
        case 'today':
          start = now.startOf('day');
          break;
        case 'last7days':
          start = now.subtract(7, 'day');
          break;
        case 'last30days':
          start = now.subtract(30, 'day');
          break;
        case 'custom':
          // 自定义时间，不修改当前值
          return;
        default:
          start = now.subtract(7, 'day');
      }

      const startTimeStr = start.format('YYYY-MM-DDTHH:mm');
      const endTimeStr = end.format('YYYY-MM-DDTHH:mm');

      setStartTime(startTimeStr);
      setEndTime(endTimeStr);

      // 立即应用筛选
      // 将本地时间解析为上海时区的时间
      const filters: StatisticsQuery = {
        startTime: start.tz(DEFAULT_TIMEZONE).format(),
        endTime: end.tz(DEFAULT_TIMEZONE).format()
      };

      // 保留其他筛选条件
      if (appName.trim()) {
        filters.appName = appName.trim();
      }
      if (modelName.trim()) {
        filters.modelName = modelName.trim();
      }
      if (callStatus) {
        filters.callStatus = callStatus;
      }

      onFilterChange(filters);
    },
    [appName, modelName, callStatus, onFilterChange]
  );

  /**
   * 应用筛选条件
   */
  const handleApplyFilter = useCallback(() => {
    // 将用户输入的本地时间字符串解析为上海时区的时间
    // 例如：用户输入 "2026-01-04T16:41" 表示上海时间的 16:41
    const startUTC = dayjs.tz(startTime, DEFAULT_TIMEZONE).format();
    const endUTC = dayjs.tz(endTime, DEFAULT_TIMEZONE).format();

    const filters: StatisticsQuery = {
      startTime: startUTC,
      endTime: endUTC
    };

    // 添加可选筛选条件
    if (appName.trim()) {
      filters.appName = appName.trim();
    }
    if (modelName.trim()) {
      filters.modelName = modelName.trim();
    }
    if (callStatus) {
      filters.callStatus = callStatus;
    }

    onFilterChange(filters);
  }, [startTime, endTime, appName, modelName, callStatus, onFilterChange]);

  /**
   * 重置筛选条件
   */
  const handleReset = useCallback(() => {
    const now = dayjs();
    const start = now.subtract(7, 'day');

    setStartTime(start.format('YYYY-MM-DDTHH:mm'));
    setEndTime(now.format('YYYY-MM-DDTHH:mm'));
    setAppName('');
    setModelName('');
    setCallStatus('');

    // 触发筛选
    // 将本地时间解析为上海时区的时间
    onFilterChange({
      startTime: start.tz(DEFAULT_TIMEZONE).format(),
      endTime: now.tz(DEFAULT_TIMEZONE).format()
    });
  }, [onFilterChange]);

  /**
   * 处理自动刷新开关变化
   */
  const handleAutoRefreshChange = useCallback(
    (checked: boolean) => {
      setAutoRefresh(checked);
      onAutoRefreshChange?.(checked, refreshInterval);
    },
    [refreshInterval, onAutoRefreshChange]
  );

  /**
   * 处理刷新间隔变化
   */
  const handleRefreshIntervalChange = useCallback(
    (value: number) => {
      setRefreshInterval(value);
      if (autoRefresh) {
        onAutoRefreshChange?.(true, value);
      }
    },
    [autoRefresh, onAutoRefreshChange]
  );

  /**
   * 验证时间范围
   */
  const isTimeRangeValid = useMemo(() => {
    if (!startTime || !endTime) return false;
    const start = dayjs(startTime);
    const end = dayjs(endTime);
    return start.isValid() && end.isValid() && start.isBefore(end);
  }, [startTime, endTime]);

  /**
   * 获取当前筛选条件（用于导出）
   */
  const currentFilters = useMemo((): StatisticsQuery => {
    // 只有在时间有效时才构建筛选条件
    if (!isTimeRangeValid) {
      // 返回一个默认的有效时间范围
      const now = dayjs();
      const start = now.subtract(7, 'day');
      return {
        startTime: start.tz(DEFAULT_TIMEZONE).format(),
        endTime: now.tz(DEFAULT_TIMEZONE).format()
      };
    }

    // 将用户输入的本地时间字符串解析为上海时区的时间
    const filters: StatisticsQuery = {
      startTime: dayjs.tz(startTime, DEFAULT_TIMEZONE).format(),
      endTime: dayjs.tz(endTime, DEFAULT_TIMEZONE).format()
    };

    if (appName.trim()) {
      filters.appName = appName.trim();
    }
    if (modelName.trim()) {
      filters.modelName = modelName.trim();
    }
    if (callStatus) {
      filters.callStatus = callStatus;
    }

    return filters;
  }, [startTime, endTime, appName, modelName, callStatus, isTimeRangeValid]);

  return (
    <Box p={0}>
      <VStack spacing={4} align="stretch">
        {/* 第三行：应用和模型筛选 */}
        <Flex gap={6}>
          <FormControl flex={1}>
            <FormLabel fontSize="sm">应用名称（可选）</FormLabel>
            <Input
              size="sm"
              placeholder="输入应用名称 进行筛选"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
          </FormControl>

          <FormControl flex={1}>
            <FormLabel fontSize="sm">模型名称（可选）</FormLabel>
            <Input
              size="sm"
              placeholder="输入模型名称进行筛选"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
          </FormControl>
        </Flex>

        {/* 第二行：自定义时间范围 */}
        <Flex gap={6}>
          <FormControl flex={1}>
            <FormLabel fontSize="sm">开始时间</FormLabel>
            <Input
              type="datetime-local"
              size="sm"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
              }}
            />
          </FormControl>

          <FormControl flex={1}>
            <FormLabel fontSize="sm">结束时间</FormLabel>
            <Input
              type="datetime-local"
              size="sm"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
              }}
            />
          </FormControl>
        </Flex>

        {/* 第五行：操作按钮 */}
        <Flex align="center" justify="space-between">
          {/* 左侧：重置和查询按钮 */}
          <HStack spacing={2}>
            <Button size="sm" variant="outline" onClick={handleReset}>
              重置
            </Button>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={handleApplyFilter}
              isDisabled={!isTimeRangeValid}
            >
              查询
            </Button>
          </HStack>

          {/* 右侧：导出按钮 */}
          <ExportButton filters={currentFilters} disabled={!isTimeRangeValid} />
        </Flex>

        {/* 时间范围验证提示 */}
        {!isTimeRangeValid && (startTime || endTime) && (
          <Box fontSize="xs" color="red.500">
            请确保开始时间早于结束时间
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default FilterPanel;
