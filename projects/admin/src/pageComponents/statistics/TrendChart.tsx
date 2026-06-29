/**
 * 趋势图表组件
 * 展示模型调用量的时间趋势，包括调用次数和 Token 数的变化
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Skeleton, Text, useColorModeValue } from '@chakra-ui/react';
import * as echarts from 'echarts';
import dayjs from 'dayjs';

import { useTrendStatistics } from '@/web/core/statistics/hooks';
import type { StatisticsQuery, TimeGranularity } from '@/service/core/statistics/statistics';

interface TrendChartProps {
  filters: StatisticsQuery;
  onError?: (error: any) => void;
}

/**
 * 根据粒度格式化时间戳
 * @param timestamp ISO 8601 时间戳
 * @param granularity 时间粒度
 * @returns 格式化后的时间字符串
 */
const formatTimestamp = (timestamp: string, granularity: TimeGranularity): string => {
  const date = dayjs(timestamp);

  switch (granularity) {
    case 'day':
      return date.format('MM-DD');
    case 'week':
      return date.format('MM-DD');
    case 'month':
      return date.format('YYYY-MM');
    default:
      return date.format('MM-DD');
  }
};

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
 * 趋势图表组件
 */
const TrendChart = ({ filters, onError }: TrendChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const gridColor = useColorModeValue('gray.100', 'gray.700');

  // 使用 react-query Hook 获取数据
  const { data, isLoading, error } = useTrendStatistics(filters, 'day', {
    onError
  });

  // 调试：打印数据
  useEffect(() => {
    console.log('[TrendChart] 数据状态:', {
      data,
      isLoading,
      error,
      filters,
      hasData: !!data,
      dataLength: data?.items?.length || 0
    });
  }, [data, isLoading, error, filters]);

  // 处理图表数据
  const chartData = useMemo(() => {
    console.log('[TrendChart] 处理图表数据:', {
      data,
      hasData: !!data,
      hasItemsArray: !!data?.items,
      dataLength: data?.items?.length || 0,
      granularity: data?.granularity
    });

    if (!data || !data.items || data.items.length === 0) {
      console.log('[TrendChart] 数据为空，返回空数组', {
        data,
        reason: !data ? '无data对象' : !data.items ? '无items数组' : '数组长度为0'
      });
      return {
        timestamps: [],
        callCounts: [],
        totalTokens: [],
        totalPoints: []
      };
    }

    const result = {
      timestamps: data.items.map((item) => formatTimestamp(item.timestamp, data.granularity)),
      callCounts: data.items.map((item) => item.callCount),
      totalTokens: data.items.map((item) => item.totalTokens),
      totalPoints: data.items.map((item) => item.totalPoints)
    };

    console.log('[TrendChart] 处理后的图表数据:', result);
    return result;
  }, [data]);

  // 初始化和更新图表
  useEffect(() => {
    console.log('[TrendChart] useEffect 触发:', {
      hasChartRef: !!chartRef.current,
      isLoading,
      chartDataLength: chartData.timestamps.length,
      chartData
    });

    if (!chartRef.current) {
      console.log('[TrendChart] chartRef.current 为空');
      return;
    }

    if (isLoading) {
      console.log('[TrendChart] 数据加载中，跳过渲染');
      return;
    }

    // 如果数据为空，跳过渲染
    if (chartData.timestamps.length === 0) {
      console.log('[TrendChart] 数据为空，跳过渲染');
      return;
    }

    // 初始化图表实例
    if (!chartInstanceRef.current) {
      console.log('[TrendChart] 初始化图表实例');
      try {
        chartInstanceRef.current = echarts.init(chartRef.current);
        console.log('[TrendChart] 图表实例初始化成功');
      } catch (error) {
        console.error('[TrendChart] 图表实例初始化失败:', error);
        return;
      }
    }

    const chart = chartInstanceRef.current;
    console.log('[TrendChart] 准备设置图表选项', {
      timestamps: chartData.timestamps,
      callCounts: chartData.callCounts,
      totalTokens: chartData.totalTokens
    });

    // 配置图表选项
    const option: echarts.EChartsOption = {
      title: {
        show: false // 使用外部标题
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: '#999'
          }
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';

          const timestamp = params[0].axisValue;
          let result = `<div style="font-weight: bold; margin-bottom: 8px;">${timestamp}</div>`;

          params.forEach((param: any) => {
            const value =
              param.seriesName === '调用次数'
                ? param.value.toLocaleString()
                : formatNumber(param.value);
            result += `
              <div style="display: flex; align-items: center; margin: 4px 0;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${param.color}; margin-right: 8px;"></span>
                <span style="flex: 1;">${param.seriesName}:</span>
                <span style="font-weight: bold; margin-left: 8px;">${value}</span>
              </div>
            `;
          });

          return result;
        }
      },
      legend: {
        data: ['调用次数', 'Token 数'],
        top: 10,
        textStyle: {
          color: textColor
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: chartData.timestamps,
        axisLabel: {
          color: textColor,
          rotate: chartData.timestamps.length > 20 ? 45 : 0
        },
        axisLine: {
          lineStyle: {
            color: gridColor
          }
        }
      },
      yAxis: [
        {
          type: 'value',
          name: '调用次数',
          position: 'left',
          axisLabel: {
            color: textColor,
            formatter: (value: number) => formatNumber(value)
          },
          axisLine: {
            show: true,
            lineStyle: {
              color: '#5470c6'
            }
          },
          splitLine: {
            lineStyle: {
              color: gridColor
            }
          }
        },
        {
          type: 'value',
          name: 'Token 数',
          position: 'right',
          axisLabel: {
            color: textColor,
            formatter: (value: number) => formatNumber(value)
          },
          axisLine: {
            show: true,
            lineStyle: {
              color: '#91cc75'
            }
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        {
          name: '调用次数',
          type: 'line',
          yAxisIndex: 0,
          data: chartData.callCounts,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 2,
            color: '#5470c6'
          },
          itemStyle: {
            color: '#5470c6'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(84, 112, 198, 0.3)' },
              { offset: 1, color: 'rgba(84, 112, 198, 0.05)' }
            ])
          },
          emphasis: {
            focus: 'series'
          }
        },
        {
          name: 'Token 数',
          type: 'line',
          yAxisIndex: 1,
          data: chartData.totalTokens,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: {
            width: 2,
            color: '#91cc75'
          },
          itemStyle: {
            color: '#91cc75'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(145, 204, 117, 0.3)' },
              { offset: 1, color: 'rgba(145, 204, 117, 0.05)' }
            ])
          },
          emphasis: {
            focus: 'series'
          }
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 20,
          bottom: 10,
          textStyle: {
            color: textColor
          },
          borderColor: gridColor,
          fillerColor: 'rgba(84, 112, 198, 0.2)',
          handleStyle: {
            color: '#5470c6'
          }
        }
      ]
    };

    // 设置图表选项
    try {
      chart.setOption(option);
      console.log('[TrendChart] 图表选项设置成功');

      // 强制刷新图表
      setTimeout(() => {
        chart.resize();
        console.log('[TrendChart] 图表大小调整完成');
      }, 100);
    } catch (error) {
      console.error('[TrendChart] 图表选项设置失败:', error);
    }

    // 清理函数
    return () => {
      // 不在这里销毁图表，因为可能会频繁重新渲染
    };
  }, [chartData, textColor, gridColor, isLoading]);

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

  // 临时调试：显示原始数据
  const showDebugInfo = false; // 设置为 true 查看调试信息

  if (showDebugInfo) {
    return (
      <Box w="100%" h="400px" bg="white" borderRadius="lg" p={4} boxShadow="sm">
        <div>
          <h3>调试信息</h3>
          <p>数据长度: {chartData.timestamps.length}</p>
          <p>isLoading: {isLoading.toString()}</p>
          <p>hasData: {(!!data).toString()}</p>
          <p>时间戳: {chartData.timestamps.slice(0, 3).join(', ')}...</p>
          <p>调用次数: {chartData.callCounts.slice(0, 3).join(', ')}...</p>
        </div>
      </Box>
    );
  }

  return (
    <Box w="100%" h="400px" bg="white" borderRadius="lg" p={4} boxShadow="sm">
      {/* 标题 */}
      <Text fontSize="16px" fontWeight="bold" textAlign="center" mb={3} color={textColor}>
        调用量时间趋势
      </Text>

      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: 'calc(100% - 35px)',
          minHeight: '320px'
        }}
      />
    </Box>
  );
};

export default TrendChart;
