/**
 * 应用排行图表组件
 * 展示应用调用量排行（Top 10），使用横向柱状图显示
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Skeleton, Text, useColorModeValue } from '@chakra-ui/react';
import * as echarts from 'echarts';

import { useAppStatistics } from '@/web/core/statistics/hooks';
import type { StatisticsQuery } from '@/service/core/statistics/statistics';

interface AppRankingChartProps {
  filters: StatisticsQuery;
  onError?: (error: any) => void;
  onAppClick?: (appId: string) => void;
}

/**
 * 格式化大数字
 * @param num 数字
 * @returns 格式化后的字符串
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toLocaleString();
};

/**
 * 应用排行图表组件
 */
const AppRankingChart = ({ filters, onError, onAppClick }: AppRankingChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const gridColor = useColorModeValue('gray.100', 'gray.700');

  // 使用 react-query Hook 获取数据 - 只获取 Top 10
  const { data, isLoading } = useAppStatistics(
    { ...filters, pageNum: 1, pageSize: 10 },
    { onError }
  );

  // 处理图表数据 - 只显示 Top 10
  const chartData = useMemo(() => {
    if (!data || !data.list || data.list.length === 0) {
      return {
        appNames: [],
        callCounts: [],
        appIds: [],
        totalTokens: [],
        totalPoints: []
      };
    }

    // 取前 10 个应用，并反转顺序（因为横向柱状图从上到下显示）
    const top10 = data.list.slice(0, 10).reverse();

    return {
      appNames: top10.map((item) => item.appName || item.appId),
      callCounts: top10.map((item) => item.callCount),
      appIds: top10.map((item) => item.appId),
      totalTokens: top10.map((item) => item.totalTokens),
      totalPoints: top10.map((item) => item.totalPoints)
    };
  }, [data]);

  // 初始化和更新图表
  useEffect(() => {
    if (!chartRef.current || isLoading) return;

    // 如果数据为空，清空图表
    if (chartData.appNames.length === 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.clear();
      }
      return;
    }

    // 初始化图表实例
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;

    // 配置图表选项
    const option: echarts.EChartsOption = {
      title: {
        show: false // 使用外部标题
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          const param = params[0];
          const dataIndex = param.dataIndex;
          const appName = param.name;
          const callCount = chartData.callCounts[dataIndex];
          const totalTokens = chartData.totalTokens[dataIndex];
          const totalPoints = chartData.totalPoints[dataIndex];

          return `
            <div style="font-weight: bold; margin-bottom: 8px;">${appName}</div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${param.color}; margin-right: 8px;"></span>
              <span style="flex: 1;">调用次数:</span>
              <span style="font-weight: bold; margin-left: 8px;">${callCount.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #91cc75; margin-right: 8px;"></span>
              <span style="flex: 1;">Token 数:</span>
              <span style="font-weight: bold; margin-left: 8px;">${formatNumber(totalTokens)}</span>
            </div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #fac858; margin-right: 8px;"></span>
              <span style="flex: 1;">积分消耗:</span>
              <span style="font-weight: bold; margin-left: 8px;">${totalPoints.toFixed(2)}</span>
            </div>
          `;
        }
      },
      grid: {
        left: '3%',
        right: '12%',
        bottom: '3%',
        top: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '调用次数',
        axisLabel: {
          color: textColor,
          formatter: (value: number) => formatNumber(value)
        },
        axisLine: {
          lineStyle: {
            color: gridColor
          }
        },
        splitLine: {
          lineStyle: {
            color: gridColor
          }
        }
      },
      yAxis: {
        type: 'category',
        data: chartData.appNames,
        axisLabel: {
          color: textColor,
          // 限制应用名称长度，超过 15 个字符显示省略号
          formatter: (value: string) => {
            if (value.length > 15) {
              return value.substring(0, 15) + '...';
            }
            return value;
          }
        },
        axisLine: {
          lineStyle: {
            color: gridColor
          }
        }
      },
      series: [
        {
          name: '调用次数',
          type: 'bar',
          data: chartData.callCounts,
          barWidth: '60%',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#5470c6' },
              { offset: 1, color: '#91cc75' }
            ]),
            borderRadius: [0, 4, 4, 0]
          },
          label: {
            show: true,
            position: 'right',
            color: textColor,
            formatter: (params: any) => formatNumber(params.value),
            distance: 5,
            fontSize: 12
          },
          emphasis: {
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#6b8dd6' },
                { offset: 1, color: '#a1dc85' }
              ])
            }
          }
        }
      ]
    };

    // 设置图表选项
    chart.setOption(option);

    // 添加点击事件
    if (onAppClick) {
      chart.off('click'); // 移除之前的事件监听
      chart.on('click', (params: any) => {
        if (params.componentType === 'series') {
          const appId = chartData.appIds[params.dataIndex];
          if (appId) {
            onAppClick(appId);
          }
        }
      });
    }

    // 清理函数
    return () => {
      // 不在这里销毁图表，因为可能会频繁重新渲染
    };
  }, [chartData, textColor, gridColor, isLoading, onAppClick]);

  // 响应式调整图表大小
  useEffect(() => {
    if (!chartInstanceRef.current) return;

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    // 初始调整大小
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 组件卸载时销毁图表
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return (
      <Box w="100%" h="400px" bg="white" borderRadius="lg" p={4} boxShadow="sm">
        <Skeleton height="100%" />
      </Box>
    );
  }

  return (
    <Box w="100%" h="400px" bg="white" borderRadius="lg" p={4} boxShadow="sm">
      {/* 标题 */}
      <Text fontSize="16px" fontWeight="bold" textAlign="center" mb={3} color={textColor}>
        应用调用量排行 Top 10
      </Text>

      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: 'calc(100% - 35px)'
        }}
      />
    </Box>
  );
};

export default AppRankingChart;
