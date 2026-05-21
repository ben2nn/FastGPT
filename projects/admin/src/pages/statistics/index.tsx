import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';

import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { getDefaultTimeRange } from '@/web/common/utils/time';

import FilterPanel from '@/components/statistics/FilterPanel';
import StatisticsList from '@/components/statistics/StatisticsList';

import type { StatisticsQuery } from '@/service/core/statistics/statistics';

/**
 * 统计页面
 * 整合所有统计组件，提供完整的数据统计和可视化功能
 */
export default function Statistics({ ssrAuthenticated }: { ssrAuthenticated?: boolean }) {
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
    // 使所有统计查询失效，触发重新获取
    queryClient.invalidateQueries({ queryKey: ['statistics'] });
  }, [queryClient]);

  /**
   * 自动刷新逻辑
   * 使用定时器实现，最小间隔 30 秒
   */
  useEffect(() => {
    // 清除之前的定时器
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // 如果启用自动刷新，设置新的定时器
    if (autoRefresh) {
      // 确保刷新间隔至少为 30 秒
      const intervalMs = Math.max(refreshInterval, 30) * 1000;

      refreshTimerRef.current = setInterval(() => {
        refreshAllData();
      }, intervalMs);
    }

    // 清理函数
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
        // 页面不可见时清除定时器
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      } else if (!document.hidden && autoRefresh) {
        // 页面可见且启用自动刷新时重新设置定时器
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
    <ProtectedRoute ssrAuthenticated={ssrAuthenticated}>
      <Layout title="数据统计">
        <VStack spacing={6} align="stretch" w="100%">
          {/* 筛选面板 */}
          <FilterPanel
            onFilterChange={handleFilterChange}
            initialFilters={filters}
            onAutoRefreshChange={handleAutoRefreshChange}
          />

          {/* 统计列表 */}
          <Box w="100%">
            <StatisticsList filters={filters} />
          </Box>
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}

export async function getServerSideProps(context: any) {
  try {
    const { requireAuth } = await import('@/web/common/utils/auth');
    const authRedirect = requireAuth(context);
    if (authRedirect) {
      return authRedirect;
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
