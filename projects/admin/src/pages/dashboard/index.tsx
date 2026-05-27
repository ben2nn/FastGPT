import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Flex, VStack, useToast } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { getDefaultTimeRange } from '@/web/common/utils/time';

import type { StatisticsQuery } from '@/service/core/statistics/statistics';

// 延迟加载图表组件
const FilterDatePanel = dynamic(() => import('@/components/statistics/FilterDatePanel'), {
  ssr: false,
  loading: () => <Box h="48px" />
});
const OverviewCards = dynamic(() => import('@/components/statistics/OverviewCards'), {
  ssr: false
});
const TrendChart = dynamic(() => import('@/components/statistics/TrendChart'), { ssr: false });
const StatusChart = dynamic(() => import('@/components/statistics/StatusChart'), { ssr: false });
const AppRankingChart = dynamic(() => import('@/components/statistics/AppRankingChart'), {
  ssr: false
});
const ModelDistChart = dynamic(() => import('@/components/statistics/ModelDistChart'), {
  ssr: false
});

/**
 * 统计页面
 * 整合所有统计组件，提供完整的数据统计和可视化功能
 */
export default function Statistics() {
  const toast = useToast();
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
   * 处理错误
   */
  const handleError = useCallback(
    (error: any) => {
      const errorMessage = error?.response?.data?.message || error?.message || '查询失败';

      toast({
        title: '查询失败',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    },
    [toast]
  );

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
      <Layout title="首页">
        <Box bg="myGray.50" minH="100%" mx={-4} mt={-4} p={4}>
          <VStack spacing={4} align="stretch" w="100%">
            {/* 第一行：筛选面板 */}
            <FilterDatePanel
              onFilterChange={handleFilterChange}
              initialFilters={filters}
              onAutoRefreshChange={handleAutoRefreshChange}
            />

            {/* 第二行：总览卡片 */}
            <OverviewCards filters={filters} onError={handleError} />

            {/* 第三行：趋势图表 + 状态图表 */}
            <Flex gap={4} direction={{ base: 'column', lg: 'row' }}>
              <Box flex="2" minW="0">
                <TrendChart filters={filters} onError={handleError} />
              </Box>
              <Box flex="1" minW="0">
                <StatusChart filters={filters} onError={handleError} />
              </Box>
            </Flex>

            {/* 第四行：应用排行图表 + 模型分布图表 */}
            <Flex gap={4} direction={{ base: 'column', lg: 'row' }}>
              <Box flex="1" minW="0">
                <AppRankingChart filters={filters} onError={handleError} />
              </Box>
              <Box flex="1" minW="0">
                <ModelDistChart filters={filters} onError={handleError} />
              </Box>
            </Flex>
          </VStack>
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}
