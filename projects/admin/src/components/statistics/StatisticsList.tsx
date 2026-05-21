import React, { useState } from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Flex,
  Button,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

import { getStatisticsList } from '@/web/core/statistics/api';
import type { StatisticsQuery, StatisticsListItem } from '@/service/core/statistics/statistics';

interface StatisticsListProps {
  filters: StatisticsQuery;
}

/**
 * 统计列表组件
 * 显示智能体、模型、使用场景、调用次数、总tokens、总积分消耗、调用成功率、平均tokens数
 */
const StatisticsList: React.FC<StatisticsListProps> = ({ filters }) => {
  const [pageNum, setPageNum] = useState(1);
  const pageSize = 20;

  // 查询统计列表数据
  const { data, isLoading, error, refetch } = useQuery<any, Error>({
    queryKey: ['statistics', 'list', filters, pageNum],
    queryFn: () =>
      getStatisticsList({
        ...filters,
        pageNum,
        pageSize
      }),
    keepPreviousData: true
  });

  // 格式化数字
  const formatNumber = (num: number): string => {
    return num.toLocaleString('zh-CN');
  };

  // 格式化百分比
  const formatPercentage = (num: number): string => {
    return `${num.toFixed(2)}%`;
  };

  // 格式化积分
  const formatPoints = (num: number): string => {
    return num.toFixed(2);
  };

  // 处理上一页
  const handlePrevPage = () => {
    if (pageNum > 1) {
      setPageNum(pageNum - 1);
    }
  };

  // 处理下一页
  const handleNextPage = () => {
    if (data && pageNum < Math.ceil(data.total / pageSize)) {
      setPageNum(pageNum + 1);
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <Box>
      {/* 标题栏 - 始终显示 */}
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="2xl" fontWeight="extrabold" color="gray.800">
          统计列表
        </Text>
        {data && (
          <Text fontSize="sm" color="gray.600">
            共 {formatNumber(data.total)} 条记录
          </Text>
        )}
      </Flex>

      {/* 加载状态 */}
      {isLoading && (
        <Box textAlign="center" py={10}>
          <Spinner size="xl" color="primary.500" />
          <Text mt={4} color="gray.600">
            加载中...
          </Text>
        </Box>
      )}

      {/* 错误状态 */}
      {!isLoading && error && (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Box flex="1">
            <AlertTitle>查询失败</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : '未知错误'}
            </AlertDescription>
          </Box>
          <Button onClick={() => refetch()} size="sm" ml={4}>
            重试
          </Button>
        </Alert>
      )}

      {/* 空数据状态 */}
      {!isLoading && !error && (!data || data.list.length === 0) && (
        <Box textAlign="center" py={10} borderWidth={1} borderRadius="md" borderColor="gray.200">
          <Text color="gray.500" fontSize="lg">
            暂无数据
          </Text>
        </Box>
      )}

      {/* 有数据时显示表格 */}
      {!isLoading && !error && data && data.list.length > 0 && (
        <>
          <Box overflowX="auto" borderWidth={1} borderRadius="md" borderColor="gray.200">
            <Table variant="simple">
              <Thead bg="blue.50">
                <Tr>
                  <Th fontSize="md" fontWeight="bold" color="blue.700">
                    智能体
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700">
                    模型
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700">
                    使用场景
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700" isNumeric>
                    调用次数
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700" isNumeric>
                    总Tokens
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700" isNumeric>
                    总积分消耗
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700" isNumeric>
                    调用成功率
                  </Th>
                  <Th fontSize="md" fontWeight="bold" color="blue.700" isNumeric>
                    平均Tokens数
                  </Th>
                </Tr>
              </Thead>
              <Tbody bg="white">
                {data.list.map((item: StatisticsListItem, index: number) => (
                  <Tr
                    key={`${item.appId}-${item.modelName}-${item.usageScenario}-${index}`}
                    bg="white"
                    _hover={{ bg: 'gray.50' }}
                  >
                    <Td>
                      <Text fontWeight="medium">{item.appName || item.appId}</Text>
                    </Td>
                    <Td>
                      <Text>{item.modelName}</Text>
                    </Td>
                    <Td>
                      <Text>{item.usageScenario || '-'}</Text>
                    </Td>
                    <Td isNumeric>
                      <Text>{formatNumber(item.callCount)}</Text>
                    </Td>
                    <Td isNumeric>
                      <Text>{formatNumber(item.totalTokens)}</Text>
                    </Td>
                    <Td isNumeric>
                      <Text>{formatPoints(item.totalPoints)}</Text>
                    </Td>
                    <Td isNumeric>
                      <Text
                        color={
                          item.successRate >= 95
                            ? 'green.600'
                            : item.successRate >= 80
                              ? 'orange.600'
                              : 'red.600'
                        }
                        fontWeight="medium"
                      >
                        {formatPercentage(item.successRate)}
                      </Text>
                    </Td>
                    <Td isNumeric>
                      <Text>{formatNumber(Math.round(item.avgTokensPerCall))}</Text>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>

          {/* 分页控件 */}
          <Flex justify="space-between" align="center" mt={4}>
            <Text fontSize="sm" color="gray.600">
              第 {pageNum} / {totalPages} 页
            </Text>
            <Flex gap={2}>
              <Button
                size="sm"
                onClick={handlePrevPage}
                isDisabled={pageNum === 1}
                colorScheme="blue"
                variant="outline"
              >
                上一页
              </Button>
              <Button
                size="sm"
                onClick={handleNextPage}
                isDisabled={pageNum >= totalPages}
                colorScheme="blue"
                variant="outline"
              >
                下一页
              </Button>
            </Flex>
          </Flex>
        </>
      )}
    </Box>
  );
};

export default StatisticsList;
