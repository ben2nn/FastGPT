import React, { useState, useCallback, useMemo } from 'react';
import { Box, Button, FormControl, FormLabel, HStack, VStack } from '@chakra-ui/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

import type { StatisticsQuery } from '@/service/core/statistics/statistics';

/**
 * 快捷时间选项
 */
const QUICK_TIME_OPTIONS = [
  { label: '今天', value: 'today' },
  { label: '最近 7 天', value: 'last7days' },
  { label: '最近 30 天', value: 'last30days' }
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
const FilterDatePanel: React.FC<FilterPanelProps> = ({
  onFilterChange,
  initialFilters = {},
  onAutoRefreshChange
}) => {
  // 快捷时间选项
  const [quickTimeOption, setQuickTimeOption] = useState<string>('last7days');

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

  /**
   * 处理快捷时间选项变化
   */
  const handleQuickTimeChange = useCallback(
    (value: string) => {
      console.log('[FilterDatePanel] 快捷时间选项点击:', value);

      setQuickTimeOption(value);

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
        default:
          start = now.subtract(7, 'day');
      }

      const newStartTime = start.tz('Asia/Shanghai').format();
      const newEndTime = end.tz('Asia/Shanghai').format();

      console.log('[FilterDatePanel] 计算的时间范围:', {
        value,
        startTime: newStartTime,
        endTime: newEndTime,
        startFormatted: start.format('YYYY-MM-DD HH:mm:ss'),
        endFormatted: end.format('YYYY-MM-DD HH:mm:ss')
      });

      setStartTime(start.format('YYYY-MM-DDTHH:mm'));
      setEndTime(end.format('YYYY-MM-DDTHH:mm'));

      // 触发筛选条件变化回调
      console.log('[FilterDatePanel] 调用 onFilterChange');
      onFilterChange({
        startTime: newStartTime,
        endTime: newEndTime
      });
    },
    [onFilterChange]
  );

  return (
    <Box p={4} borderWidth={1} borderRadius="md" borderColor="gray.200" bg="white" shadow="sm">
      <VStack spacing={4} align="stretch">
        {/* 第一行：快捷时间选项 */}
        <FormControl>
          <HStack spacing={2}>
            {QUICK_TIME_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={quickTimeOption === option.value ? 'solid' : 'outline'}
                colorScheme={quickTimeOption === option.value ? 'blue' : 'gray'}
                onClick={() => handleQuickTimeChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </HStack>
        </FormControl>
      </VStack>
    </Box>
  );
};

export default FilterDatePanel;
