/**
 * 状态分布图表组件
 * 展示调用状态的分布情况，使用环形图显示各状态占比
 * 失败率超过 5% 时显示警告提示
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Flex, Skeleton, Text, useColorModeValue, Icon } from '@chakra-ui/react';
import * as echarts from 'echarts';

import { useStatusStatistics } from '@/web/core/statistics/hooks';
import type { StatisticsQuery } from '@/service/core/statistics/statistics';

interface StatusChartProps {
  filters: StatisticsQuery;
  onError?: (error: any) => void;
}

/**
 * 根据状态获取颜色
 * @param status 状态名称
 * @returns 颜色值
 */
const getStatusColor = (status: string): string => {
  const statusLower = status.toLowerCase();

  if (statusLower.includes('success') || statusLower === 'success') {
    return '#52c41a'; // 绿色 - 成功
  }
  if (statusLower.includes('fail') || statusLower.includes('error')) {
    return '#ff4d4f'; // 红色 - 失败
  }
  if (statusLower.includes('timeout')) {
    return '#faad14'; // 橙色 - 超时
  }

  return '#8c8c8c'; // 灰色 - 其他
};

/**
 * 状态分布图表组件
 */
const StatusChart = ({ filters, onError }: StatusChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const warningBgColor = useColorModeValue('red.50', 'red.900');
  const warningTextColor = useColorModeValue('red.600', 'red.200');

  // 使用 react-query Hook 获取数据
  const { data, isLoading } = useStatusStatistics(filters, {
    onError
  });

  // 处理图表数据
  const chartData = useMemo(() => {
    if (!data || !data.distribution || data.distribution.length === 0) {
      return {
        pieData: [],
        hasWarning: false,
        successRate: 0,
        total: 0
      };
    }

    // 转换为饼图数据格式
    const pieData = data.distribution.map((item) => ({
      name: item.status,
      value: item.count,
      percentage: item.percentage,
      itemStyle: {
        color: getStatusColor(item.status)
      }
    }));

    return {
      pieData,
      hasWarning: data.hasWarning,
      successRate: data.successRate,
      total: data.total
    };
  }, [data]);

  // 初始化和更新图表
  useEffect(() => {
    if (!chartRef.current || isLoading) return;

    // 如果数据为空，清空图表
    if (chartData.pieData.length === 0) {
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
        show: false // 不使用 ECharts 的标题，改用外部标题
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `
            <div style="font-weight: bold; margin-bottom: 8px;">${params.name}</div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${params.color}; margin-right: 8px;"></span>
              <span style="flex: 1;">调用次数:</span>
              <span style="font-weight: bold; margin-left: 8px;">${data.value.toLocaleString()}</span>
            </div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${params.color}; margin-right: 8px;"></span>
              <span style="flex: 1;">占比:</span>
              <span style="font-weight: bold; margin-left: 8px;">${data.percentage.toFixed(2)}%</span>
            </div>
          `;
        }
      },
      legend: {
        orient: 'horizontal',
        bottom: 5,
        left: 'center',
        textStyle: {
          color: textColor,
          fontSize: 12
        }
      },
      series: [
        {
          name: '调用状态',
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 8,
            borderColor: bgColor,
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'outside',
            color: textColor,
            formatter: (params: any) => {
              return `${params.name}\n${params.data.percentage.toFixed(2)}%`;
            }
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          labelLine: {
            show: true,
            lineStyle: {
              color: textColor
            }
          },
          data: chartData.pieData
        }
      ]
    };

    // 设置图表选项
    chart.setOption(option);

    // 清理函数
    return () => {
      // 不在这里销毁图表，因为可能会频繁重新渲染
    };
  }, [chartData, textColor, bgColor, isLoading]);

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
      <Text fontSize="16px" fontWeight="bold" textAlign="center" mb={2} color={textColor}>
        调用状态分布
      </Text>

      {/* 副标题 - 成功率 */}
      <Text
        fontSize="12px"
        textAlign="center"
        mb={2}
        color={chartData.successRate >= 95 ? 'green.500' : 'orange.500'}
      >
        总成功率: {chartData.successRate.toFixed(2)}%
      </Text>

      {/* 警告提示 */}
      {chartData.hasWarning && (
        <Flex
          align="center"
          gap={2}
          mb={2}
          p={2}
          bg={warningBgColor}
          borderRadius="md"
          borderWidth="1px"
          borderColor={warningTextColor}
        >
          <Icon viewBox="0 0 24 24" boxSize={5} color={warningTextColor}>
            <path
              fill="currentColor"
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </Icon>
          <Text fontSize="sm" color={warningTextColor} fontWeight="medium">
            警告：失败率超过 5%，请检查系统状态
          </Text>
        </Flex>
      )}

      {/* 图表容器 */}
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: chartData.hasWarning ? 'calc(100% - 120px)' : 'calc(100% - 70px)',
          minHeight: '250px'
        }}
      />
    </Box>
  );
};

export default StatusChart;
