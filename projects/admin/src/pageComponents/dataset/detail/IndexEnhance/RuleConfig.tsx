import React from 'react';
import { Box, Text, Flex } from '@chakra-ui/react';
import MyDivider from '@fastgpt/web/components/common/MyDivider/index';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { EnhanceRuleConfig } from './types';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';

const RuleConfig = ({
  value,
  datasetDetail,
  onChange
}: {
  value: EnhanceRuleConfig;
  datasetDetail: DatasetItemType;
  onChange: (config: EnhanceRuleConfig) => void;
}) => {
  const { datasetModelList, embeddingModelList } = useSystemStore();

  const updateAI = (patch: Partial<EnhanceRuleConfig['aiIndexConfig']>) =>
    onChange({ aiIndexConfig: { ...value.aiIndexConfig, ...patch } });

  return (
    <Box>
      {/* ===== AI 模型配置 ===== */}
      <Text fontSize="sm" fontWeight="500" color="myGray.800" mb={3}>
        AI 配置模型
      </Text>

      <Flex alignItems="center" mb={3}>
        <Text fontSize="sm" color="myGray.600" w="88px" flexShrink={0}>
          索引模型
        </Text>
        <AIModelSelector
          w="260px"
          size="sm"
          value={value.aiIndexConfig.vectorModel}
          list={embeddingModelList.map((m) => ({ label: m.name, value: m.model }))}
          onChange={(e) => updateAI({ vectorModel: e })}
        />
        <Text fontSize="xs" color="myGray.400" ml={3}>
          分块上限 {value.aiIndexConfig.chunkLimit.toLocaleString()}
        </Text>
      </Flex>

      <Flex alignItems="center" mb={3}>
        <Text fontSize="sm" color="myGray.600" w="88px" flexShrink={0}>
          文本理解
        </Text>
        <AIModelSelector
          w="260px"
          size="sm"
          value={value.aiIndexConfig.textModel}
          list={datasetModelList.map((m) => ({ label: m.name, value: m.model }))}
          onChange={(e) => updateAI({ textModel: e })}
        />
      </Flex>

      {datasetDetail.vlmModel && (
        <Flex alignItems="center" mb={3}>
          <Text fontSize="sm" color="myGray.600" w="88px" flexShrink={0}>
            图片理解
          </Text>
          <AIModelSelector
            w="260px"
            size="sm"
            value={value.aiIndexConfig.imageModel}
            list={datasetModelList.map((m) => ({ label: m.name, value: m.model }))}
            onChange={(e) => updateAI({ imageModel: e })}
          />
        </Flex>
      )}

      <MyDivider my={4} />

      {/* ===== 增强说明 ===== */}
      <Text fontSize="sm" fontWeight="500" color="myGray.800" mb={3}>
        增强说明
      </Text>

      <Box bg="myGray.50" borderRadius="md" p={4} fontSize="sm" color="myGray.700" lineHeight={1.8}>
        <Text mb={2}>
          <Text as="span" fontWeight="500">
            Q 字段
          </Text>
          （检索问句）：AI 生成 1-2 句语义摘要，包含知识标题、条号、主题和核心要点，并模拟 2-3
          个用户可能提出的问题。
        </Text>
        <Text mb={2}>
          <Text as="span" fontWeight="500">
            A 字段
          </Text>
          （主体答案）：在切片正文前补充上下文头（标题 | 章节 |
          条号），确保内容自包含，脱离上下文也能独立理解。
        </Text>
        <Text mb={2}>
          <Text as="span" fontWeight="500">
            Index 字段
          </Text>
          （辅助索引）：AI 生成 6-10 个口语化检索标签，用分号分隔，用于关键词/BM25 检索。
        </Text>
        <Text fontSize="xs" color="myGray.400">
          标签会在 Q 和 Index 中双写，向量检索 + 关键词检索互补，实测召回效果最佳。
        </Text>
      </Box>
    </Box>
  );
};

export default React.memo(RuleConfig);
