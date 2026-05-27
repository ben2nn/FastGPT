import React, { useState, useRef, useMemo } from 'react';
import {
  Box,
  Button,
  Input,
  Switch,
  FormControl,
  FormLabel,
  HStack,
  VStack,
  Text,
  useToast,
  Flex,
  IconButton
} from '@chakra-ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import {
  exportDataset,
  importDataset,
  exportApp,
  importApp,
  exportTools,
  importTools,
  exportModels,
  importModels,
  exportChannels,
  importChannels
} from '@/web/core/extend/api';

const MotionBox = motion(Box);

const MAX_FILE_SIZE = 500 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function downloadJSON(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function readFileAsJSON(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大允许 500MB`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// ========== Tab 配置 ==========

type ExportField = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'input' | 'select';
  options?: { value: string; label: string }[];
};

type TabConfig = {
  label: string;
  icon: string;
  exportTitle: string;
  importTitle: string;
  exportFields: ExportField[];
  importFields?: ExportField[];
  showKeepOriginalId?: boolean;
  exportDescription?: string;
  importDescription?: string;
  importResultLabels: Record<string, string>;
};

const MODEL_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'llm', label: '对话模型 (LLM)' },
  { value: 'embedding', label: '向量嵌入' },
  { value: 'tts', label: '语音合成' },
  { value: 'stt', label: '语音识别' },
  { value: 'rerank', label: '重排模型' }
];

const TAB_CONFIGS: TabConfig[] = [
  {
    label: '知识库',
    icon: 'navbar/datasetLight',
    exportTitle: '导出知识库',
    importTitle: '导入知识库',
    exportFields: [
      { key: 'parentId', label: 'parentId', placeholder: '输入知识库或文件夹 ID', required: true }
    ],
    importFields: [
      { key: 'targetParentId', label: '目标父文件夹 ID', placeholder: '留空则导入到根目录' }
    ],
    showKeepOriginalId: true,
    importResultLabels: {
      datasetsCount: '数据集',
      collectionsCount: '集合',
      datasCount: '数据',
      dataTextsCount: '全文索引',
      collectionTagsCount: '标签'
    }
  },
  {
    label: '工作流',
    icon: 'core/app/type/workflow',
    exportTitle: '导出工作流',
    importTitle: '导入工作流',
    exportFields: [
      { key: 'parentId', label: 'parentId', placeholder: '输入工作流或文件夹 ID', required: true }
    ],
    importFields: [
      { key: 'targetParentId', label: '目标父文件夹 ID', placeholder: '留空则导入到根目录' }
    ],
    showKeepOriginalId: true,
    importResultLabels: { appsCount: '应用', versionsCount: '版本' }
  },
  {
    label: '工具',
    icon: 'common/toolkit',
    exportTitle: '导出工具',
    importTitle: '导入工具',
    exportFields: [{ key: 'parentId', label: 'parentId', placeholder: '留空导出全部工具' }],
    importFields: [
      { key: 'targetParentId', label: '目标父文件夹 ID', placeholder: '留空则导入到根目录' }
    ],
    showKeepOriginalId: true,
    importResultLabels: { appsCount: '应用', versionsCount: '版本' }
  },
  {
    label: '模型配置',
    icon: 'common/model',
    exportTitle: '导出模型配置',
    importTitle: '导入模型配置',
    exportFields: [
      { key: 'provider', label: '提供商', placeholder: '如 openai、anthropic' },
      {
        key: 'modelType',
        label: '模型类型',
        placeholder: '全部类型',
        type: 'select',
        options: MODEL_TYPE_OPTIONS
      }
    ],
    showKeepOriginalId: true,
    importResultLabels: { insertedCount: '新增', updatedCount: '更新', failedCount: '失败' }
  },
  {
    label: '渠道',
    icon: 'common/link',
    exportTitle: '导出渠道',
    importTitle: '导入渠道',
    exportFields: [],
    exportDescription: '导出所有渠道配置（不含 API Key）',
    showKeepOriginalId: true,
    importDescription: '按渠道名称匹配：已存在的渠道会更新，不存在的会创建',
    importResultLabels: { insertedCount: '新增', updatedCount: '更新', failedCount: '失败' }
  }
];

// ========== 表单字段 ==========

function FieldInput({
  field,
  value,
  onChange
}: {
  field: ExportField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FormControl>
      <Flex align="center" gap={3}>
        <Text fontSize="sm" color="myGray.600" w="120px" flexShrink={0} lineHeight="36px">
          {field.label}
          {field.required && (
            <Text as="span" color="red.500" ml={0.5}>
              *
            </Text>
          )}
        </Text>
        {field.type === 'select' ? (
          <Box
            as="select"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
            flex={1}
            h="36px"
            px={3}
            borderRadius="md"
            border="1px solid"
            borderColor="borderColor.low"
            bg="myGray.50"
            fontSize="sm"
            color="myGray.700"
            outline="none"
            _focus={{ borderColor: 'primary.400' }}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Box>
        ) : (
          <Input
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            size="sm"
            h="36px"
            flex={1}
            bg="myGray.50"
            border="1px solid"
            borderColor="borderColor.low"
            borderRadius="md"
            fontSize="sm"
            _focus={{ borderColor: 'primary.400', boxShadow: 'none' }}
          />
        )}
      </Flex>
    </FormControl>
  );
}

// ========== 通用 Tab 内容 ==========

function TabContent({ config, tabIndex }: { config: TabConfig; tabIndex: number }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [keepOriginalId, setKeepOriginalId] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);

  const setField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    for (const field of config.exportFields) {
      if (field.required && !fieldValues[field.key]?.trim()) {
        toast({ title: `请输入${field.label}`, status: 'warning', duration: 3000 });
        return;
      }
    }

    setExporting(true);
    try {
      let data: object;
      const parentId = fieldValues.parentId?.trim();
      const provider = fieldValues.provider?.trim();
      const modelType = fieldValues.modelType;

      switch (tabIndex) {
        case 0:
          data = await exportDataset(parentId!);
          break;
        case 1:
          data = await exportApp(parentId!);
          break;
        case 2:
          data = await exportTools(parentId || undefined);
          break;
        case 3:
          data = await exportModels(provider || undefined, modelType || undefined);
          break;
        case 4:
          data = await exportChannels();
          break;
        default:
          throw new Error('未知的导出类型');
      }

      const prefix = config.label.toLowerCase().replace(/\s/g, '-');
      downloadJSON(data, `${prefix}-export-${Date.now()}.json`);
      toast({ title: '导出成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({ title: '请选择 JSON 文件', status: 'warning', duration: 3000 });
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      const targetParentId = fieldValues.targetParentId?.trim();
      let result: { data: Record<string, number> };

      if (tabIndex === 0) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('keepOriginalId', String(keepOriginalId));
        if (targetParentId) formData.append('targetParentId', targetParentId);
        result = await importDataset(formData);
      } else {
        const text = await readFileAsJSON(selectedFile);
        switch (tabIndex) {
          case 1:
            result = await importApp(text, keepOriginalId, targetParentId || undefined);
            break;
          case 2:
            result = await importTools(text, keepOriginalId, targetParentId || undefined);
            break;
          case 3:
            result = await importModels(text, keepOriginalId);
            break;
          case 4:
            result = await importChannels(text, keepOriginalId);
            break;
          default:
            throw new Error('未知的导入类型');
        }
      }

      setImportResult(result.data);
      toast({ title: '导入成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex gap={5} direction={{ base: 'column', md: 'row' }}>
      {/* ===== 左：导出卡片 ===== */}
      <Box
        flex={1}
        bg="white"
        borderRadius="lg"
        border="1px solid"
        borderColor="borderColor.low"
        px={5}
        py={4}
      >
        <Flex align="center" gap={2} mb={4}>
          <MyIcon name="common/download" w="15px" h="15px" color="primary.600" />
          <Text fontSize="sm" fontWeight="600" color="myGray.800">
            {config.exportTitle}
          </Text>
        </Flex>

        {config.exportDescription && (
          <Text fontSize="sm" color="myGray.500" mb={4}>
            {config.exportDescription}
          </Text>
        )}

        <Box pl={4}>
          <VStack spacing={3} align="stretch" mb={4}>
            {config.exportFields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={fieldValues[field.key] || ''}
                onChange={(v) => setField(field.key, v)}
              />
            ))}
          </VStack>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<MyIcon name="common/download" w="14px" h="14px" />}
            onClick={handleExport}
            isLoading={exporting}
            loadingText="导出中..."
          >
            导出
          </Button>
        </Box>
      </Box>

      {/* ===== 右：导入卡片 ===== */}
      <Box
        flex={1}
        bg="white"
        borderRadius="lg"
        border="1px solid"
        borderColor="borderColor.low"
        px={5}
        py={4}
      >
        <Flex align="center" gap={2} mb={4}>
          <MyIcon name="common/importLight" w="15px" h="15px" color="green.600" />
          <Text fontSize="sm" fontWeight="600" color="myGray.800">
            {config.importTitle}
          </Text>
        </Flex>

        {config.importDescription && (
          <Text fontSize="sm" color="myGray.500" mb={4}>
            {config.importDescription}
          </Text>
        )}

        <Box pl={4}>
          {/* 表单行 */}
          <VStack spacing={3} align="stretch" mb={4}>
            {/* 文件选择 */}
            <Flex align="center" gap={3}>
              <Text fontSize="sm" color="myGray.600" w="120px" flexShrink={0} lineHeight="36px">
                文件
              </Text>
              <Box flex={1}>
                <FilePicker
                  fileRef={fileRef}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              </Box>
            </Flex>

            {/* 保留原 ID */}
            {config.showKeepOriginalId && (
              <Flex align="center" gap={3}>
                <Text fontSize="sm" color="myGray.600" w="120px" flexShrink={0} lineHeight="36px">
                  保留原 ID
                </Text>
                <Switch
                  isChecked={keepOriginalId}
                  onChange={(e) => setKeepOriginalId(e.target.checked)}
                  size="sm"
                />
              </Flex>
            )}

            {/* 导入字段 */}
            {config.importFields?.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={fieldValues[field.key] || ''}
                onChange={(v) => setField(field.key, v)}
              />
            ))}
          </VStack>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<MyIcon name="common/importLight" w="14px" h="14px" />}
            onClick={handleImport}
            isLoading={importing}
            loadingText="导入中..."
            isDisabled={!selectedFile}
          >
            导入
          </Button>
        </Box>

        {/* 导入结果 */}
        {importResult && (
          <Box mt={3}>
            <ImportResultStats result={importResult} labels={config.importResultLabels} />
          </Box>
        )}
      </Box>
    </Flex>
  );
}

// ========== 文件选择器 ==========

function FilePicker({
  fileRef,
  selectedFile,
  onSelect
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  onSelect: (f: File | null) => void;
}) {
  const toast = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_FILE_SIZE) {
      toast({ title: `文件过大：${formatFileSize(f.size)}`, status: 'error', duration: 4000 });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    onSelect(f);
  };

  return (
    <Box>
      <input
        ref={fileRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {selectedFile ? (
        <HStack
          spacing={2}
          px={3}
          py={2}
          bg="primary.50"
          borderRadius="md"
          border="1px solid"
          borderColor="primary.200"
          cursor="pointer"
          transition="all 0.15s"
          _hover={{ borderColor: 'primary.300' }}
          onClick={() => fileRef.current?.click()}
        >
          <MyIcon name="common/detail" w="16px" h="16px" color="primary.600" />
          <Text fontSize="sm" color="primary.700" fontWeight="500" isTruncated>
            {selectedFile.name}
          </Text>
          <Text fontSize="xs" color="myGray.400" flexShrink={0}>
            {formatFileSize(selectedFile.size)}
          </Text>
          <Box flex={1} />
          <IconButton
            aria-label="清除文件"
            icon={<MyIcon name="common/closeLight" w="12px" h="12px" />}
            size="xs"
            variant="ghost"
            color="myGray.400"
            _hover={{ color: 'red.500', bg: 'red.50' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(null);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
        </HStack>
      ) : (
        <Box
          borderWidth="1px"
          borderStyle="dashed"
          borderColor="borderColor.base"
          borderRadius="md"
          py={5}
          textAlign="center"
          cursor="pointer"
          transition="all 0.15s"
          _hover={{ borderColor: 'primary.400', bg: 'primary.50' }}
          onClick={() => fileRef.current?.click()}
        >
          <VStack spacing={1}>
            <MyIcon name="common/uploadFileFill" w="20px" h="20px" color="myGray.300" />
            <Text fontSize="sm" color="myGray.500">
              点击选择 JSON 文件
            </Text>
            <Text fontSize="xs" color="myGray.400">
              最大 500MB
            </Text>
          </VStack>
        </Box>
      )}
    </Box>
  );
}

// ========== 导入结果 ==========

function ImportResultStats({
  result,
  labels
}: {
  result: Record<string, number>;
  labels: Record<string, string>;
}) {
  const entries = Object.entries(labels);
  const total = entries.reduce((sum, [key]) => sum + (result[key] ?? 0), 0);

  return (
    <Box bg="green.50" borderRadius="md" border="1px solid" borderColor="green.100" px={4} py={3}>
      <Flex align="center" gap={2} mb={2}>
        <MyIcon name="common/tickFill" w="14px" h="14px" color="green.500" />
        <Text fontSize="sm" fontWeight="600" color="green.700">
          导入完成
        </Text>
        <Text fontSize="xs" color="green.600">
          共 {total} 条
        </Text>
      </Flex>
      <Flex gap={5} flexWrap="wrap">
        {entries.map(([key, label]) => (
          <HStack key={key} spacing={1.5}>
            <Text fontSize="md" fontWeight="700" color="green.700">
              {result[key] ?? 0}
            </Text>
            <Text fontSize="xs" color="green.600">
              {label}
            </Text>
          </HStack>
        ))}
      </Flex>
    </Box>
  );
}

// ========== 主页面 ==========

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState(0);

  const tabList = useMemo(
    () =>
      TAB_CONFIGS.map((config, index) => ({
        icon: config.icon,
        label: config.label,
        value: String(index)
      })),
    []
  );

  return (
    <ProtectedRoute>
      <Layout title="导入导出">
        <Box>
          <Box mb={5}>
            <FillRowTabs
              list={tabList}
              value={String(activeTab)}
              onChange={(v) => setActiveTab(Number(v))}
              py="2"
              px="4"
              iconSize="15px"
              labelSize="sm"
              w="fit-content"
            />
          </Box>

          <AnimatePresence mode="wait">
            <MotionBox
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              <TabContent config={TAB_CONFIGS[activeTab]} tabIndex={activeTab} />
            </MotionBox>
          </AnimatePresence>
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}
