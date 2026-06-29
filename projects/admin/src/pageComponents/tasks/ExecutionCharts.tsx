/**
 * 任务执行统计图表组件
 * 显示任务执行成功率和执行时间趋势
 */

import React, { useEffect, useRef } from 'react';
import { Box, Flex, Text, Spinner } from '@chakra-ui/react';
import * as echarts from 'echarts';
import type { TaskExecution } from '@/web/core/task/api';

interface ExecutionChartsProps {
  executions: TaskExecution[];
  loading?: boolean;
}

/**
 * 执行统计图表组件
 */
const ExecutionCharts = ({ executions, loading = false }: ExecutionChartsProps) => {
  const successRateChartRef = useRef<HTMLDivElement>(null);
  const executionTimeChartRef = useRef<HTMLDivElement>(null);
  const successRateChartInstance = useRef<echarts.ECharts | null>(null);
  const executionTimeChartInstance = useRef<echarts.ECharts | null>(null);

  // 计算成功率数据
  const calculateSuccessRate = () => {
    if (executions.length === 0) {
      return { success: 0, failed: 0, running: 0 };
    }

    const stats = executions.reduce(
      (acc, execution) => {
        if (execution.status === 'success') {
          acc.success++;
        } else if (execution.status === 'failed') {
          acc.failed++;
        } else if (execution.status === 'running') {
          acc.running++;
        }
        return acc;
      },
      { success: 0, failed: 0, running: 0 }
    );

    return stats;
  };

  // 计算执行时间趋势数据
  const calculateExecutionTimeTrend = () => {
    if (executions.length === 0) {
      return { times: [], durations: [] };
    }

    // 只取最近 20 条记录
    const recentExecutions = executions.slice(0, 20).reverse();

    const times = recentExecutions.map((execution) => {
      const date = new Date(execution.startTime);
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(
        date.getMinutes()
      ).padStart(2, '0')}`;
    });

    const durations = recentExecutions.map((execution) => {
      return execution.executionTimeMs ? execution.executionTimeMs / 1000 : 0;
    });

    return { times, durations };
  };

  // 初始化成功率饼图
  useEffect(() => {
    if (!successRateChartRef.current || loading) return;

    // 创建图表实例
    if (!successRateChartInstance.current) {
      successRateChartInstance.current = echarts.init(successRateChartRef.current);
    }

    const stats = calculateSuccessRate();
    const total = stats.success + stats.failed + stats.running;

    const option: echarts.EChartsOption = {
      title: {
        text: '执行成功率',
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'middle',
        data: ['成功', '失败', '运行中']
      },
      series: [
        {
          name: '执行状态',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '55%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: [
            {
              value: stats.success,
              name: '成功',
              itemStyle: { color: '#48BB78' }
            },
            {
              value: stats.failed,
              name: '失败',
              itemStyle: { color: '#F56565' }
            },
            {
              value: stats.running,
              name: '运行中',
              itemStyle: { color: '#4299E1' }
            }
          ]
        }
      ]
    };

    successRateChartInstance.current.setOption(option);

    // 响应式调整
    const handleResize = () => {
      successRateChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [executions, loading]);

  // 初始化执行时间趋势折线图
  useEffect(() => {
    if (!executionTimeChartRef.current || loading) return;

    // 创建图表实例
    if (!executionTimeChartInstance.current) {
      executionTimeChartInstance.current = echarts.init(executionTimeChartRef.current);
    }

    const { times, durations } = calculateExecutionTimeTrend();

    const option: echarts.EChartsOption = {
      title: {
        text: '执行时间趋势',
        left: 'center',
        top: 10,
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const param = params[0];
          return `${param.name}<br/>执行时间: ${param.value.toFixed(2)}s`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '60px',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times,
        axisLabel: {
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        name: '时间 (秒)',
        axisLabel: {
          formatter: '{value}s'
        }
      },
      series: [
        {
          name: '执行时间',
          type: 'line',
          smooth: true,
          data: durations,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              {
                offset: 0,
                color: 'rgba(66, 153, 225, 0.3)'
              },
              {
                offset: 1,
                color: 'rgba(66, 153, 225, 0.05)'
              }
            ])
          },
          lineStyle: {
            color: '#4299E1',
            width: 2
          },
          itemStyle: {
            color: '#4299E1'
          }
        }
      ]
    };

    executionTimeChartInstance.current.setOption(option);

    // 响应式调整
    const handleResize = () => {
      executionTimeChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [executions, loading]);

  // 清理图表实例
  useEffect(() => {
    return () => {
      successRateChartInstance.current?.dispose();
      executionTimeChartInstance.current?.dispose();
    };
  }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" h="400px">
        <Spinner size="xl" color="blue.500" />
      </Flex>
    );
  }

  if (executions.length === 0) {
    return (
      <Flex justify="center" align="center" h="400px">
        <Text color="gray.500">暂无执行数据</Text>
      </Flex>
    );
  }

  return (
    <Flex gap={6} flexWrap="wrap">
      {/* 成功率饼图 */}
      <Box flex="1" minW="300px" h="400px" bg="white" borderRadius="lg" shadow="sm" p={4}>
        <div ref={successRateChartRef} style={{ width: '100%', height: '100%' }} />
      </Box>

      {/* 执行时间趋势折线图 */}
      <Box flex="1" minW="300px" h="400px" bg="white" borderRadius="lg" shadow="sm" p={4}>
        <div ref={executionTimeChartRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Flex>
  );
};

export default ExecutionCharts;
