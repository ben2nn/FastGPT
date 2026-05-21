import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Flex, VStack, useToast } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';

import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { getDefaultTimeRange } from '@/web/common/utils/time';

import FilterDatePanel from '@/components/statistics/FilterDatePanel';
import OverviewCards from '@/components/statistics/OverviewCards';
import TrendChart from '@/components/statistics/TrendChart';
import StatusChart from '@/components/statistics/StatusChart';
import AppRankingChart from '@/components/statistics/AppRankingChart';
import ModelDistChart from '@/components/statistics/ModelDistChart';

import type { StatisticsQuery } from '@/service/core/statistics/statistics';

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

  // 调试：监听 filters 变化
  useEffect(() => {
    console.log('[Dashboard] Filters 状态更新:', filters);
  }, [filters]);

  // 自动刷新状态
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 处理筛选条件变化
   */
  const handleFilterChange = useCallback((newFilters: StatisticsQuery) => {
    console.log('[Dashboard] 筛选条件变化:', {
      new: newFilters
    });
    setFilters(newFilters);
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

  return (
    <ProtectedRoute>
      <Layout title="首页">
        <VStack spacing={6} align="stretch" w="100%">
          {/* 第一行：筛选面板 */}
          <FilterDatePanel
            onFilterChange={handleFilterChange}
            initialFilters={filters}
            onAutoRefreshChange={handleAutoRefreshChange}
          />

          {/* 第二行：总览卡片 */}
          <OverviewCards filters={filters} onError={handleError} />

          {/* 第三行：趋势图表 + 状态图表 */}
          <Flex gap={6} direction={{ base: 'column', lg: 'row' }}>
            <Box flex="2" minW="0">
              <TrendChart filters={filters} onError={handleError} />
            </Box>
            <Box flex="1" minW="0">
              <StatusChart filters={filters} onError={handleError} />
            </Box>
          </Flex>

          {/* 第四行：应用排行图表 + 模型分布图表 */}
          <Flex gap={6} direction={{ base: 'column', lg: 'row' }}>
            <Box flex="1" minW="0">
              <AppRankingChart filters={filters} onError={handleError} />
            </Box>
            <Box flex="1" minW="0">
              <ModelDistChart filters={filters} onError={handleError} />
            </Box>
          </Flex>
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}

export async function getServerSideProps(context: any) {
  try {
    // 检查认证状态
    const token = context.req.cookies?.admin_token;

    if (!token) {
      // 未登录，重定向到登录页
      return {
        redirect: {
          destination: '/login',
          permanent: false
        }
      };
    }

    // 返回页面 props
    return {
      props: {}
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    // 发生错误时重定向到登录页
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }
}
