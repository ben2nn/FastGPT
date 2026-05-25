import React, { useState, useRef } from 'react';
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Button,
  Input,
  Select,
  Switch,
  FormControl,
  FormLabel,
  VStack,
  HStack,
  Text,
  useToast,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  Divider,
  useColorModeValue,
  Flex,
  Badge,
  Spinner
} from '@chakra-ui/react';
import { DownloadIcon, AttachmentIcon } from '@chakra-ui/icons';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import {
  exportDataset,
  importDataset,
  exportApp,
  importApp,
  exportModels,
  importModels,
  exportChannels,
  importChannels
} from '@/web/core/extend/api';

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

// 文件大小限制：500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大允许 50MB`);
  }
}

function readFileAsJSON(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // 先验证文件大小
    try {
      validateFileSize(file);
    } catch (e) {
      reject(e);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// ========== 知识库 Tab ==========
function DatasetTab() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportParentId, setExportParentId] = useState('');
  const [importParentId, setImportParentId] = useState('');
  const [keepOriginalId, setKeepOriginalId] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    if (!exportParentId.trim()) {
      toast({ title: '请输入知识库 parentId', status: 'warning', duration: 3000 });
      return;
    }
    setExporting(true);
    try {
      const data = await exportDataset(exportParentId.trim());
      downloadJSON(data, `dataset-export-${Date.now()}.json`);
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
      // 使用 FormData 上传文件，避免 JSON.stringify 内存翻倍
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('keepOriginalId', String(keepOriginalId));
      if (importParentId.trim()) {
        formData.append('targetParentId', importParentId.trim());
      }

      const result = await importDataset(formData);
      setImportResult(result.data);
      toast({ title: '导入成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
      <ExportPanel title="导出知识库">
        <FormControl>
          <FormLabel fontSize="sm">parentId</FormLabel>
          <Input
            placeholder="输入知识库或文件夹 ID"
            value={exportParentId}
            onChange={(e) => setExportParentId(e.target.value)}
          />
        </FormControl>
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="blue"
          onClick={handleExport}
          isLoading={exporting}
          loadingText="导出中..."
          w="full"
        >
          导出
        </Button>
      </ExportPanel>

      <ImportPanel title="导入知识库">
        <FileUpload fileRef={fileRef} selectedFile={selectedFile} onSelect={setSelectedFile} />
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0} fontSize="sm">
            保留原 ID
          </FormLabel>
          <Switch
            isChecked={keepOriginalId}
            onChange={(e) => setKeepOriginalId(e.target.checked)}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">目标父文件夹 ID（可选）</FormLabel>
          <Input
            placeholder="留空则导入到根目录"
            value={importParentId}
            onChange={(e) => setImportParentId(e.target.value)}
          />
        </FormControl>
        <Button
          leftIcon={<AttachmentIcon />}
          colorScheme="green"
          onClick={handleImport}
          isLoading={importing}
          loadingText="导入中..."
          w="full"
        >
          导入
        </Button>
        {importResult && (
          <ImportResultStats
            result={importResult}
            labels={{
              datasetsCount: '数据集',
              collectionsCount: '集合',
              datasCount: '数据',
              dataTextsCount: '全文索引',
              collectionTagsCount: '标签'
            }}
          />
        )}
      </ImportPanel>
    </Flex>
  );
}

// ========== 工作流 Tab ==========
function AppTab() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportParentId, setExportParentId] = useState('');
  const [importParentId, setImportParentId] = useState('');
  const [keepOriginalId, setKeepOriginalId] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    if (!exportParentId.trim()) {
      toast({ title: '请输入工作流 parentId', status: 'warning', duration: 3000 });
      return;
    }
    setExporting(true);
    try {
      const data = await exportApp(exportParentId.trim());
      downloadJSON(data, `app-export-${Date.now()}.json`);
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
      const text = await readFileAsJSON(selectedFile);
      const result = await importApp(text, keepOriginalId, importParentId.trim() || undefined);
      setImportResult(result.data);
      toast({ title: '导入成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
      <ExportPanel title="导出工作流">
        <FormControl>
          <FormLabel fontSize="sm">parentId</FormLabel>
          <Input
            placeholder="输入工作流或文件夹 ID"
            value={exportParentId}
            onChange={(e) => setExportParentId(e.target.value)}
          />
        </FormControl>
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="blue"
          onClick={handleExport}
          isLoading={exporting}
          loadingText="导出中..."
          w="full"
        >
          导出
        </Button>
      </ExportPanel>

      <ImportPanel title="导入工作流">
        <FileUpload fileRef={fileRef} selectedFile={selectedFile} onSelect={setSelectedFile} />
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0} fontSize="sm">
            保留原 ID
          </FormLabel>
          <Switch
            isChecked={keepOriginalId}
            onChange={(e) => setKeepOriginalId(e.target.checked)}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">目标父文件夹 ID（可选）</FormLabel>
          <Input
            placeholder="留空则导入到根目录"
            value={importParentId}
            onChange={(e) => setImportParentId(e.target.value)}
          />
        </FormControl>
        <Button
          leftIcon={<AttachmentIcon />}
          colorScheme="green"
          onClick={handleImport}
          isLoading={importing}
          loadingText="导入中..."
          w="full"
        >
          导入
        </Button>
        {importResult && (
          <ImportResultStats
            result={importResult}
            labels={{ appsCount: '应用', versionsCount: '版本' }}
          />
        )}
      </ImportPanel>
    </Flex>
  );
}

// ========== 模型配置 Tab ==========
function ModelTab() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState('');
  const [modelType, setModelType] = useState('');
  const [keepOriginalId, setKeepOriginalId] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportModels(provider.trim() || undefined, modelType || undefined);
      downloadJSON(data, `model-export-${Date.now()}.json`);
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
      const text = await readFileAsJSON(selectedFile);
      const result = await importModels(text, keepOriginalId);
      setImportResult(result.data);
      toast({ title: '导入成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
      <ExportPanel title="导出模型配置">
        <FormControl>
          <FormLabel fontSize="sm">提供商（可选）</FormLabel>
          <Input
            placeholder="如 openai、anthropic"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm">模型类型（可选）</FormLabel>
          <Select value={modelType} onChange={(e) => setModelType(e.target.value)}>
            <option value="">全部类型</option>
            <option value="llm">对话模型 (LLM)</option>
            <option value="embedding">向量嵌入</option>
            <option value="tts">语音合成</option>
            <option value="stt">语音识别</option>
            <option value="rerank">重排模型</option>
          </Select>
        </FormControl>
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="blue"
          onClick={handleExport}
          isLoading={exporting}
          loadingText="导出中..."
          w="full"
        >
          导出
        </Button>
      </ExportPanel>

      <ImportPanel title="导入模型配置">
        <FileUpload fileRef={fileRef} selectedFile={selectedFile} onSelect={setSelectedFile} />
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0} fontSize="sm">
            保留原 ID
          </FormLabel>
          <Switch
            isChecked={keepOriginalId}
            onChange={(e) => setKeepOriginalId(e.target.checked)}
          />
        </FormControl>
        <Button
          leftIcon={<AttachmentIcon />}
          colorScheme="green"
          onClick={handleImport}
          isLoading={importing}
          loadingText="导入中..."
          w="full"
        >
          导入
        </Button>
        {importResult && (
          <ImportResultStats
            result={importResult}
            labels={{ insertedCount: '新增', updatedCount: '更新', failedCount: '失败' }}
          />
        )}
      </ImportPanel>
    </Flex>
  );
}

// ========== 渠道 Tab ==========
function ChannelTab() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [keepOriginalId, setKeepOriginalId] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportChannels();
      downloadJSON(data, `channel-export-${Date.now()}.json`);
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
      const text = await readFileAsJSON(selectedFile);
      const result = await importChannels(text, keepOriginalId);
      setImportResult(result.data);
      toast({ title: '导入成功', status: 'success', duration: 3000 });
    } catch (e) {
      toast({ title: (e as Error).message, status: 'error', duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
      <ExportPanel title="导出渠道">
        <Text fontSize="sm" color="gray.500">
          导出所有渠道配置（不含 API Key）
        </Text>
        <Button
          leftIcon={<DownloadIcon />}
          colorScheme="blue"
          onClick={handleExport}
          isLoading={exporting}
          loadingText="导出中..."
          w="full"
        >
          导出全部渠道
        </Button>
      </ExportPanel>

      <ImportPanel title="导入渠道">
        <FileUpload fileRef={fileRef} selectedFile={selectedFile} onSelect={setSelectedFile} />
        <FormControl display="flex" alignItems="center">
          <FormLabel mb={0} fontSize="sm">
            保留原 ID
          </FormLabel>
          <Switch
            isChecked={keepOriginalId}
            onChange={(e) => setKeepOriginalId(e.target.checked)}
          />
        </FormControl>
        <Text fontSize="xs" color="gray.500">
          按渠道名称匹配：已存在的渠道会更新，不存在的会创建
        </Text>
        <Button
          leftIcon={<AttachmentIcon />}
          colorScheme="green"
          onClick={handleImport}
          isLoading={importing}
          loadingText="导入中..."
          w="full"
        >
          导入
        </Button>
        {importResult && (
          <ImportResultStats
            result={importResult}
            labels={{ insertedCount: '新增', updatedCount: '更新', failedCount: '失败' }}
          />
        )}
      </ImportPanel>
    </Flex>
  );
}

// ========== 共用组件 ==========

function ExportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box flex={1} bg={bgColor} borderWidth="1px" borderColor={borderColor} borderRadius="md" p={6}>
      <Text fontSize="lg" fontWeight="600" mb={4}>
        <Badge colorScheme="blue" mr={2}>
          导出
        </Badge>
        {title}
      </Text>
      <VStack spacing={4} align="stretch">
        {children}
      </VStack>
    </Box>
  );
}

function ImportPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box flex={1} bg={bgColor} borderWidth="1px" borderColor={borderColor} borderRadius="md" p={6}>
      <Text fontSize="lg" fontWeight="600" mb={4}>
        <Badge colorScheme="green" mr={2}>
          导入
        </Badge>
        {title}
      </Text>
      <VStack spacing={4} align="stretch">
        {children}
      </VStack>
    </Box>
  );
}

function FileUpload({
  fileRef,
  selectedFile,
  onSelect
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  onSelect: (f: File | null) => void;
}) {
  const borderColor = useColorModeValue('gray.300', 'gray.600');
  const bgColor = useColorModeValue('gray.50', 'gray.700');
  const toast = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f) {
      // 验证文件大小
      if (f.size > MAX_FILE_SIZE) {
        toast({
          title: '文件过大',
          description: `文件大小 ${formatFileSize(f.size)}，最大允许 500MB`,
          status: 'error',
          duration: 5000
        });
        // 清空 input
        if (fileRef.current) {
          fileRef.current.value = '';
        }
        return;
      }
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
      <Box
        borderWidth="2px"
        borderStyle="dashed"
        borderColor={borderColor}
        borderRadius="md"
        p={4}
        bg={bgColor}
        textAlign="center"
        cursor="pointer"
        _hover={{ borderColor: 'blue.400' }}
        onClick={() => fileRef.current?.click()}
      >
        {selectedFile ? (
          <VStack spacing={1}>
            <Text fontSize="sm" color="blue.600">
              {selectedFile.name}
            </Text>
            <Text fontSize="xs" color={selectedFile.size > MAX_FILE_SIZE ? 'red.500' : 'gray.500'}>
              {formatFileSize(selectedFile.size)}
              {selectedFile.size > MAX_FILE_SIZE && ' (超出限制)'}
            </Text>
          </VStack>
        ) : (
          <VStack spacing={1}>
            <Text fontSize="sm" color="gray.500">
              点击选择 JSON 文件
            </Text>
            <Text fontSize="xs" color="gray.400">
              最大支持 500MB
            </Text>
          </VStack>
        )}
      </Box>
    </Box>
  );
}

function ImportResultStats({
  result,
  labels
}: {
  result: Record<string, number>;
  labels: Record<string, string>;
}) {
  return (
    <Box>
      <Divider my={2} />
      <Text fontSize="sm" fontWeight="600" mb={2}>
        导入结果
      </Text>
      <StatGroup>
        {Object.entries(labels).map(([key, label]) => (
          <Stat key={key}>
            <StatLabel fontSize="xs">{label}</StatLabel>
            <StatNumber fontSize="lg">{result[key] ?? 0}</StatNumber>
          </Stat>
        ))}
      </StatGroup>
    </Box>
  );
}

// ========== 主页面 ==========

export default function ImportExportPage({ ssrAuthenticated }: { ssrAuthenticated?: boolean }) {
  return (
    <ProtectedRoute ssrAuthenticated={ssrAuthenticated}>
      <Layout title="导入导出">
        <Tabs colorScheme="blue" variant="enclosed">
          <TabList>
            <Tab>知识库</Tab>
            <Tab>工作流</Tab>
            <Tab>模型配置</Tab>
            <Tab>渠道</Tab>
          </TabList>

          <TabPanels>
            <TabPanel px={0}>
              <DatasetTab />
            </TabPanel>
            <TabPanel px={0}>
              <AppTab />
            </TabPanel>
            <TabPanel px={0}>
              <ModelTab />
            </TabPanel>
            <TabPanel px={0}>
              <ChannelTab />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Layout>
    </ProtectedRoute>
  );
}

export async function getServerSideProps(context: any) {
  try {
    const token = context.req.cookies?.admin_token;
    if (!token) {
      return { redirect: { destination: '/login', permanent: false } };
    }
    return { props: { ssrAuthenticated: true } };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    return { redirect: { destination: '/login', permanent: false } };
  }
}
