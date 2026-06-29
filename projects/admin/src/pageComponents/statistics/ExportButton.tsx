/**
 * 导出按钮组件
 * 导出当前列表数据为 CSV 格式
 */

import React, { useState } from 'react';
import { Button, useToast } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { getStatisticsList } from '@/web/core/statistics/api';
import type { StatisticsQuery, StatisticsListItem } from '@/service/core/statistics/statistics';

interface ExportButtonProps {
  filters: StatisticsQuery;
  disabled?: boolean;
}

/**
 * 将列表数据转换为 CSV 格式
 */
const convertToCSV = (data: StatisticsListItem[]): string => {
  // CSV 表头
  const headers = [
    '智能体',
    '模型',
    '使用场景',
    '调用次数',
    '总Tokens',
    '总积分消耗',
    '调用成功率(%)',
    '平均Tokens数'
  ];

  // CSV 行数据
  const rows = data.map((item) => [
    item.appName || item.appId,
    item.modelName,
    item.usageScenario || '-',
    item.callCount.toString(),
    item.totalTokens.toString(),
    item.totalPoints.toFixed(2),
    item.successRate.toFixed(2),
    Math.round(item.avgTokensPerCall).toString()
  ]);

  // 组合表头和数据
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  // 添加 BOM 以支持 Excel 正确显示中文
  return '\uFEFF' + csvContent;
};

/**
 * 下载 CSV 文件
 */
const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/**
 * 导出按钮组件
 */
const ExportButton = ({ filters, disabled = false }: ExportButtonProps) => {
  const toast = useToast();
  const [isExporting, setIsExporting] = useState(false);

  /**
   * 处理导出操作
   */
  const handleExport = async () => {
    // 验证时间范围
    if (!filters.startTime || !filters.endTime) {
      toast({
        title: '导出失败',
        description: '请先选择时间范围',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsExporting(true);

    try {
      // 显示导出开始提示
      toast({
        title: '开始导出',
        description: '正在获取数据...',
        status: 'info',
        duration: 2000,
        isClosable: true
      });

      // 分页获取所有数据
      const pageSize = 100;
      let allData: StatisticsListItem[] = [];
      let currentPage = 1;
      let totalPages = 1;

      // 循环获取所有页的数据
      while (currentPage <= totalPages) {
        const response = await getStatisticsList({
          ...filters,
          pageNum: currentPage,
          pageSize
        });

        if (response.list && response.list.length > 0) {
          allData = allData.concat(response.list);
        }

        // 计算总页数
        totalPages = Math.ceil(response.total / pageSize);
        currentPage++;

        // 如果不是最后一页，显示进度
        if (currentPage <= totalPages) {
          toast({
            title: '正在获取数据',
            description: `已获取 ${allData.length} / ${response.total} 条记录...`,
            status: 'info',
            duration: 1000,
            isClosable: true
          });
        }
      }

      if (allData.length === 0) {
        toast({
          title: '导出失败',
          description: '没有可导出的数据',
          status: 'warning',
          duration: 3000,
          isClosable: true
        });
        return;
      }

      // 转换为 CSV
      const csvContent = convertToCSV(allData);

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `statistics-list-${timestamp}.csv`;

      // 下载文件
      downloadCSV(csvContent, filename);

      // 显示成功提示
      toast({
        title: '导出成功',
        description: `已导出 ${allData.length} 条记录`,
        status: 'success',
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error('导出失败:', error);

      // 显示错误提示
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '导出过程中发生错误，请稍后重试',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      leftIcon={<MyIcon name="common/download" h="16px" />}
      isLoading={isExporting}
      isDisabled={disabled || isExporting}
      colorScheme="blue"
      size="sm"
      onClick={handleExport}
    >
      导出
    </Button>
  );
};

export default ExportButton;
