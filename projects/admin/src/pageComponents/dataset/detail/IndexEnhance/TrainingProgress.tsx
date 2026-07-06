import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const TrainingProgress = () => {
  const enhanceCount = useContextSelector(DatasetPageContext, (v) => v.enhanceCount);
  const trainingCount = useContextSelector(DatasetPageContext, (v) => v.trainingCount);
  const rebuildingCount = useContextSelector(DatasetPageContext, (v) => v.rebuildingCount);
  const refetchDatasetTraining = useContextSelector(
    DatasetPageContext,
    (v) => v.refetchDatasetTraining
  );

  return (
    <Box px={3} py={3} borderTop="1px solid" borderColor="myGray.200">
      <Flex alignItems="center" mb={2}>
        <MyIcon name="common/resultLight" w="16px" mr={1.5} />
        <Text fontSize="sm" fontWeight="500" color="myGray.900">
          训练进度
        </Text>
        <Box flex={1} />
        <MyTooltip label="刷新">
          <Box
            cursor="pointer"
            p={1}
            borderRadius="sm"
            _hover={{ bg: 'myGray.100' }}
            onClick={() => refetchDatasetTraining()}
          >
            <MyIcon name="common/refreshLight" w="14px" color="myGray.500" />
          </Box>
        </MyTooltip>
      </Flex>
      <Box bg="myGray.50" borderRadius="md" p={3}>
        <Flex alignItems="center" mb={1}>
          <Box
            w="8px"
            h="8px"
            borderRadius="50%"
            bg={enhanceCount > 0 ? 'green.400' : 'myGray.300'}
            mr={2}
          />
          <Text fontSize="sm" color="myGray.700">
            {enhanceCount > 0 ? '索引增强处理中' : '空闲'}
          </Text>
        </Flex>
        {enhanceCount > 0 && (
          <Flex justifyContent="space-between" mb={1}>
            <Text fontSize="xs" color="myGray.500">
              增强队列
            </Text>
            <Text fontSize="xs" fontWeight="500" color="primary.600">
              {enhanceCount} 条
            </Text>
          </Flex>
        )}
        {trainingCount > 0 && (
          <Flex gap={4}>
            <Flex alignItems="center">
              <Text fontSize="xs" color="myGray.500" mr={1}>
                总训练队列
              </Text>
              <Text fontSize="xs" fontWeight="500" color="myGray.700">
                {trainingCount}
              </Text>
            </Flex>
            {rebuildingCount > 0 && (
              <Flex alignItems="center">
                <Text fontSize="xs" color="myGray.500" mr={1}>
                  重建队列
                </Text>
                <Text fontSize="xs" fontWeight="500" color="myGray.700">
                  {rebuildingCount}
                </Text>
              </Flex>
            )}
          </Flex>
        )}
        {enhanceCount === 0 && trainingCount === 0 && (
          <Text fontSize="xs" color="myGray.400">
            当前无正在处理的任务
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(TrainingProgress);
