import React from 'react';
import { Box, Text, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const steps = [
  {
    icon: 'core/dataset/datasetFill',
    color: 'blue',
    title: '读取已有数据',
    desc: '从知识库中读取选中范围的已向量化数据'
  },
  {
    icon: 'core/app/aiLight',
    color: 'purple',
    title: 'AI 生成索引',
    desc: '使用文本理解模型生成 Q（检索问句）+ Index（标签）'
  },
  {
    icon: 'core/dataset/commonDatasetOutline',
    color: 'green',
    title: '向量化新索引',
    desc: '将新生成的索引文本向量化存储'
  },
  {
    icon: 'common/check',
    color: 'primary',
    title: '完成增强',
    desc: '新索引替换旧索引，提升检索精度'
  }
];

const HowItWorks = () => {
  return (
    <Box p={3} minW="260px">
      <Text fontSize="sm" fontWeight="500" mb={3}>
        工作原理
      </Text>
      {steps.map((step, index) => (
        <Flex key={index} alignItems="flex-start" mb={index < steps.length - 1 ? 3 : 0}>
          <Box
            w="24px"
            h="24px"
            borderRadius="50%"
            bg={`${step.color}.50`}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            mr={2}
          >
            <MyIcon name={step.icon as any} w="14px" color={`${step.color}.600`} />
          </Box>
          <Box>
            <Text fontSize="xs" fontWeight="500" color="myGray.800">
              {step.title}
            </Text>
            <Text fontSize="xs" color="myGray.500">
              {step.desc}
            </Text>
          </Box>
        </Flex>
      ))}
    </Box>
  );
};

export default React.memo(HowItWorks);
