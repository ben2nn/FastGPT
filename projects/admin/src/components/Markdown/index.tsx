import React from 'react';
import { Box } from '@chakra-ui/react';

/**
 * 简化版 Markdown 渲染组件
 * Admin 项目仅需基础文本展示
 */
const Markdown = ({ source }: { source?: string }) => {
  if (!source) return null;

  return (
    <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'} lineHeight={1.6}>
      {source}
    </Box>
  );
};

export default React.memo(Markdown);
