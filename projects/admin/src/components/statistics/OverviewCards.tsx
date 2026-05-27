/**
 * 总览卡片组件
 * 展示模型调用统计的总览数据，包括总调用次数、总 Token 数、总积分消耗、成功率和平均 Token 数
 */

import React, { useMemo } from 'react';
import {
  Box,
  Grid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Skeleton,
  useColorModeValue,
  Flex
} from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

import type { StatisticsQuery } from '@/service/core/statistics/statistics';
import { useOverviewStatistics } from '@/web/core/statistics/hooks';

interface OverviewCardsProps {
  filters: StatisticsQuery;
  onError?: (error: any) => void;
}

/**
 * 格式化大数字，使用 K/M 单位
 * @param num 数字
 * @returns 格式化后的字符串
 */
const formatLargeNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toLocaleString();
};

/**
 * 格式化小数
 * @param num 数字
 * @param decimals 小数位数
 * @returns 格式化后的字符串
 */
const formatDecimal = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals);
};

/**
 * 根据成功率获取颜色
 * @param rate 成功率（0-100）
 * @returns 颜色值
 */
const getSuccessRateColor = (rate: number): string => {
  if (rate >= 95) return 'green.500';
  if (rate >= 90) return 'yellow.500';
  if (rate >= 80) return 'orange.500';
  return 'red.500';
};

/**
 * 单个统计卡片组件
 */
interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  helpText?: string;
  color?: string;
  isLoading?: boolean;
}

const StatCard = ({ label, value, icon, helpText, color, isLoading }: StatCardProps) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const iconBgColor = useColorModeValue('blue.50', 'blue.900');
  const iconColor = useColorModeValue('blue.500', 'blue.300');

  return (
    <Box p={5} bg="white" borderRadius="lg" boxShadow="sm">
      <Flex align="center" justify="space-between" mb={3}>
        <Box p={2} bg={iconBgColor} borderRadius="md">
          {/* 图标占位 */}
        </Box>
      </Flex>

      <Stat>
        <StatLabel fontSize="sm" color="gray.600" mb={1}>
          {label}
        </StatLabel>
        {isLoading ? (
          <Skeleton height="32px" width="120px" />
        ) : (
          <StatNumber fontSize="2xl" fontWeight="bold" color={color}>
            {value}
          </StatNumber>
        )}
        {helpText && !isLoading && (
          <StatHelpText fontSize="xs" color="gray.500" mt={1}>
            {helpText}
          </StatHelpText>
        )}
      </Stat>
    </Box>
  );
};

/**
 * 总览卡片组件
 */
const OverviewCards = ({ filters, onError }: OverviewCardsProps) => {
  // 使用 react-query Hook 获取数据
  const { data, isLoading, error } = useOverviewStatistics(filters, {
    onError
  });

  // 调试：打印数据
  React.useEffect(() => {
    console.log('[OverviewCards] 数据状态:', { data, isLoading, error, filters });
  }, [data, isLoading, error, filters]);

  // 计算格式化后的数据
  const formattedData = useMemo(() => {
    if (!data) {
      return {
        totalCalls: '0',
        totalTokens: '0',
        totalPoints: '0',
        successRate: '0%',
        avgTokensPerCall: '0',
        successRateColor: 'gray.500'
      };
    }

    return {
      totalCalls: formatLargeNumber(data.totalCalls),
      totalTokens: formatLargeNumber(data.totalTokens),
      totalPoints: formatDecimal(data.totalPoints, 2),
      successRate: `${formatDecimal(data.successRate, 2)}%`,
      avgTokensPerCall: formatDecimal(data.avgTokensPerCall, 2),
      successRateColor: getSuccessRateColor(data.successRate)
    };
  }, [data]);

  return (
    <Grid
      templateColumns={{
        base: '1fr',
        md: 'repeat(2, 1fr)',
        lg: 'repeat(3, 1fr)',
        xl: 'repeat(5, 1fr)'
      }}
      gap={4}
      w="100%"
    >
      {/* 卡片 1: 总调用次数 */}
      <StatCard
        label="总调用次数"
        value={formattedData.totalCalls}
        icon="core/chat/chatLight"
        helpText={data ? `${data.totalCalls.toLocaleString()} 次` : undefined}
        isLoading={isLoading}
      />

      {/* 卡片 2: 总 Token 数 */}
      <StatCard
        label="总 Token 数"
        value={formattedData.totalTokens}
        icon="common/data"
        helpText={data ? `${data.totalTokens.toLocaleString()} tokens` : undefined}
        isLoading={isLoading}
      />

      {/* 卡片 3: 总积分消耗 */}
      <StatCard
        label="总积分消耗"
        value={formattedData.totalPoints}
        icon="support/bill/wallet"
        helpText={data ? `¥${data.totalPoints.toFixed(2)}` : undefined}
        isLoading={isLoading}
      />

      {/* 卡片 4: 调用成功率 */}
      <StatCard
        label="调用成功率"
        value={formattedData.successRate}
        icon="common/check"
        color={formattedData.successRateColor}
        isLoading={isLoading}
      />

      {/* 卡片 5: 平均每次调用 Token 数 */}
      <StatCard
        label="平均 Token 数"
        value={formattedData.avgTokensPerCall}
        icon="core/app/simpleMode/ai"
        helpText="每次调用平均消耗"
        isLoading={isLoading}
      />
    </Grid>
  );
};

export default OverviewCards;
