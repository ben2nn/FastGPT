import React, { useState } from 'react';
import { Box, Flex, Text, Tag, Wrap, Badge, IconButton, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { EnhancePreviewResponse } from './types';

const PreviewTable = ({ data }: { data: EnhancePreviewResponse }) => {
  const [index, setIndex] = useState(0);
  const rows = data.previewRows;
  const row = rows[index];
  const hasChanged = row.originalQ !== row.previewQ;

  if (!row) return null;

  return (
    <Box>
      {/* 导航栏 */}
      <Flex alignItems="center" justifyContent="space-between" mb={4}>
        <HStack spacing={2}>
          <Badge colorScheme={hasChanged ? 'orange' : 'gray'}>
            {hasChanged ? '有变化' : '无变化'}
          </Badge>
          <Text fontSize="sm" color="myGray.500">
            {index + 1} / {rows.length}
          </Text>
        </HStack>
        <HStack spacing={1}>
          <IconButton
            size="xs"
            variant="outline"
            aria-label="上一条"
            icon={<MyIcon name="common/leftArrowLight" w="12px" />}
            isDisabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          />
          <IconButton
            size="xs"
            variant="outline"
            aria-label="下一条"
            icon={<MyIcon name="common/rightArrowLight" w="12px" />}
            isDisabled={index === rows.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          />
        </HStack>
      </Flex>

      {/* 左右对比 */}
      <Flex gap={4}>
        {/* 原始 */}
        <Box flex={1} bg="myGray.25" borderRadius="md" p={4}>
          <FormLabel fontSize="mini" fontWeight="500" mb={2}>
            原始内容
          </FormLabel>
          <Box mb={3}>
            <Text fontSize="xs" color="myGray.400" mb={1}>
              Q
            </Text>
            <Text fontSize="sm" color="myGray.700" whiteSpace="pre-wrap">
              {row.originalQ || '（空）'}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color="myGray.400" mb={1}>
              A
            </Text>
            <Text fontSize="sm" color="myGray.700" whiteSpace="pre-wrap" noOfLines={8}>
              {row.originalA || '（空）'}
            </Text>
          </Box>
        </Box>

        {/* 新 */}
        <Box flex={1} bg="blue.25" borderRadius="md" p={4}>
          <FormLabel fontSize="mini" fontWeight="500" mb={2}>
            增强后
          </FormLabel>
          <Box mb={3}>
            <Text fontSize="xs" color="myGray.400" mb={1}>
              Q
            </Text>
            <Text fontSize="sm" color="blue.700" whiteSpace="pre-wrap">
              {row.previewQ || '（空）'}
            </Text>
          </Box>
          <Box mb={3}>
            <Text fontSize="xs" color="myGray.400" mb={1}>
              A
            </Text>
            <Text fontSize="sm" color="myGray.700" whiteSpace="pre-wrap" noOfLines={8}>
              {row.previewA || '（空）'}
            </Text>
          </Box>
          <Box>
            <Text fontSize="xs" color="myGray.400" mb={1}>
              Indexes
            </Text>
            <Wrap>
              {row.previewIndexes.map((tag, i) => (
                <Tag key={i} size="sm" colorScheme="green">
                  {tag}
                </Tag>
              ))}
            </Wrap>
          </Box>
        </Box>
      </Flex>
    </Box>
  );
};

export default React.memo(PreviewTable);
