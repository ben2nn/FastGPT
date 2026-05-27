import React from 'react';
import { Box, Skeleton, Stack, HStack, Flex } from '@chakra-ui/react';

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <Box
      bg="white"
      borderRadius="lg"
      border="1px solid"
      borderColor="borderColor.low"
      overflow="hidden"
    >
      {/* 表头 */}
      <HStack px={5} py={3} borderBottom="1px solid" borderColor="borderColor.low" spacing={4}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} h="14px" borderRadius="sm" flex={i === 0 ? 2 : 1} />
        ))}
      </HStack>
      {/* 行 */}
      {Array.from({ length: rows }).map((_, row) => (
        <HStack
          key={row}
          px={5}
          py={3}
          spacing={4}
          borderBottom={row < rows - 1 ? '1px solid' : 'none'}
          borderColor="borderColor.low"
        >
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={col}
              h="14px"
              borderRadius="sm"
              flex={col === 0 ? 2 : 1}
              opacity={1 - row * 0.08}
            />
          ))}
        </HStack>
      ))}
    </Box>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <HStack spacing={4}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          flex={1}
          bg="white"
          borderRadius="lg"
          border="1px solid"
          borderColor="borderColor.low"
          p={4}
        >
          <Skeleton h="12px" w="60%" mb={3} borderRadius="sm" />
          <Skeleton h="24px" w="40%" borderRadius="sm" />
        </Box>
      ))}
    </HStack>
  );
}

export function ChartSkeleton() {
  return (
    <Box bg="white" borderRadius="lg" border="1px solid" borderColor="borderColor.low" p={4}>
      <Skeleton h="14px" w="30%" mb={4} borderRadius="sm" />
      <Skeleton h="200px" borderRadius="md" />
    </Box>
  );
}
