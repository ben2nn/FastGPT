/**
 * 模型分布图表组件
 * 展示各模型的调用量分布，使用饼图显示占比
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Skeleton, Text, useColorModeValue } from '@chakra-ui/react';
import * as echarts from 'echarts';

import { useModelStatistics } from '@/web/core/statistics/hooks';
import type { StatisticsQuery } from '@/service/core/statistics/statistics';

interface ModelDistChartProps {
  filters: StatisticsQuery;
  onError?: (error: any) => void;
  onModelClick?: (modelId: string) => void;
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
 * 生成图表颜色
 * @param index 索引
 * @returns 颜色值
 */
const getColor = (index: number): string => {
  const colors = [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc',
    '#5470c6'
  ];
  return colors[index % colors.length];
};

/**
 * 模型分布图表组件
 */
const ModelDistChart = ({ filters, onError, onModelClick }: ModelDistChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');

  // 使用 react-query Hook 获取数据
  const { data, isLoading } = useModelStatistics(
    { ...filters, pageNum: 1, pageSize: 20 },
    { onError }
  );

  // 处理图表数据
  const chartData = useMemo(() => {
    if (!data || !data.list || data.list.length === 0) {
      return {
        pieData: [],
        modelIds: []
      };
    }

    // 计算总调用次数
    const totalCalls = data.list.reduce((sum, item) => sum + item.callCount, 0);

    // 转换为饼图数据格式
    const pieData = data.list.map((item, index) => ({
      name: item.modelName || item.modelId,
      value: item.callCount,
      percentage: totalCalls > 0 ? ((item.callCount / totalCalls) * 100).toFixed(2) : '0.00',
      totalTokens: item.totalTokens,
      avgTokensPerCall: item.avgTokensPerCall,
      itemStyle: {
        color: getColor(index)
      }
    }));

    const modelIds = data.list.map((item) => item.modelId);

    return {
      pieData,
      modelIds
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
        show: false // 使用外部标题
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
              <span style="font-weight: bold; margin-left: 8px;">${data.percentage}%</span>
            </div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #91cc75; margin-right: 8px;"></span>
              <span style="flex: 1;">Token 数:</span>
              <span style="font-weight: bold; margin-left: 8px;">${formatNumber(data.totalTokens)}</span>
            </div>
            <div style="display: flex; align-items: center; margin: 4px 0;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #fac858; margin-right: 8px;"></span>
              <span style="flex: 1;">平均 Token:</span>
              <span style="font-weight: bold; margin-left: 8px;">${data.avgTokensPerCall.toFixed(2)}</span>
            </div>
          `;
        }
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 40,
        bottom: 20,
        textStyle: {
          color: textColor,
          fontSize: 11
        },
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 8,
        // 不限制图例文本长度，让其完整显示
        formatter: (name: string) => {
          return name;
        }
      },
      series: [
        {
          name: '模型调用量',
          type: 'pie',
          radius: ['35%', '60%'],
          center: ['30%', '50%'],
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
              return `${params.data.percentage}%`;
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
            length: 10,
            length2: 5,
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

    // 添加点击事件
    if (onModelClick) {
      chart.off('click'); // 移除之前的事件监听
      chart.on('click', (params: any) => {
        if (params.componentType === 'series') {
          const modelId = chartData.modelIds[params.dataIndex];
          if (modelId) {
            onModelClick(modelId);
          }
        }
      });
    }

    // 清理函数
    return () => {
      // 不在这里销毁图表，因为可能会频繁重新渲染
    };
  }, [chartData, textColor, bgColor, isLoading, onModelClick]);

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
      <Box
        w="100%"
        h="400px"
        bg={bgColor}
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="lg"
        p={4}
      >
        <Skeleton height="100%" />
      </Box>
    );
  }

  return (
    <Box
      w="100%"
      h="400px"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      p={4}
      boxShadow="sm"
      _hover={{ boxShadow: 'md' }}
      transition="all 0.2s"
    >
      {/* 标题 */}
      <Text fontSize="16px" fontWeight="bold" textAlign="center" mb={3} color={textColor}>
        模型调用量分布
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

export default ModelDistChart;
