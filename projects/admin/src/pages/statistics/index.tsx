import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';

import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { getDefaultTimeRange } from '@/web/common/utils/time';

import FilterPanel from '@/pageComponents/statistics/FilterPanel';
import StatisticsList from '@/pageComponents/statistics/StatisticsList';

import type { StatisticsQuery } from '@/service/core/statistics/statistics';

/**
 * 统计页面
 * 整合所有统计组件，提供完整的数据统计和可视化功能
 */
export default function Statistics() {
  const queryClient = useQueryClient();

  // 筛选条件状态 - 使用默认时间范围（最近7天，从00:00:00到23:59:59）
  const [filters, setFilters] = useState<StatisticsQuery>(() => {
    const { startTime, endTime } = getDefaultTimeRange(7);
    return { startTime, endTime };
  });

  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 处理筛选条件变化（带 300ms 防抖）
   */
  const handleFilterChange = useCallback((newFilters: StatisticsQuery) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setFilters(newFilters);
    }, 300);
  }, []);

  /**
   * 处理自动刷新设置变化
   */
  const handleAutoRefreshChange = useCallback((enabled: boolean, interval: number) => {
    setAutoRefresh(enabled);
    setRefreshInterval(interval);
  }, []);

  /**
   * 刷新所有统计数据
   */
  const refreshAllData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['statistics'] });
  }, [queryClient]);

  /**
   * 自动刷新逻辑
   */
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (autoRefresh) {
      const intervalMs = Math.max(refreshInterval, 30) * 1000;

      refreshTimerRef.current = setInterval(() => {
        refreshAllData();
      }, intervalMs);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, refreshAllData]);

  /**
   * 页面不可见时暂停刷新
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      } else if (!document.hidden && autoRefresh) {
        const intervalMs = Math.max(refreshInterval, 30) * 1000;
        refreshTimerRef.current = setInterval(() => {
          refreshAllData();
        }, intervalMs);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoRefresh, refreshInterval, refreshAllData]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <ProtectedRoute>
      <Layout title="数据统计">
        <Box bg="myGray.50" minH="100%" mx={-4} mt={-4} p={4}>
          <VStack spacing={4} align="stretch" w="100%">
            {/* 筛选面板 */}
            <Box bg="white" borderRadius="lg" boxShadow="sm" px={5} py={4}>
              <FilterPanel
                onFilterChange={handleFilterChange}
                initialFilters={filters}
                onAutoRefreshChange={handleAutoRefreshChange}
              />
            </Box>

            {/* 统计列表 */}
            <Box w="100%" bg="white" borderRadius="lg" boxShadow="sm" px={5} py={4}>
              <StatisticsList filters={filters} />
            </Box>
          </VStack>
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}
