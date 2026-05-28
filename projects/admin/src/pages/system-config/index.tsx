import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  Text,
  Switch,
  Input,
  Textarea,
  VStack,
  HStack,
  Grid,
  GridItem,
  Divider,
  useToast,
  Spinner,
  Badge,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import Layout from '@/web/context/Layout';
import { getSystemConfig, updateSystemConfig } from '@/web/core/systemConfig/api';
import type { CommercialFeatureForm } from '@/types/systemConfig';

// 默认配置
const defaultConfig: CommercialFeatureForm = {
  license: {
    enabled: false,
    company: '',
    description: '',
    expiredTime: '2099-12-31',
    maxUsers: 0,
    maxApps: 0,
    maxDatasets: 0,
    functions: {
      sso: false,
      pay: false,
      customTemplates: false,
      datasetEnhance: false,
      batchEval: false
    }
  },
  features: {
    show_publish_feishu: true,
    show_publish_dingtalk: true,
    show_publish_wecom: false,
    show_publish_offiaccount: true,
    show_dataset_feishu: true,
    show_dataset_yuque: true,
    show_dataset_enhance: false,
    show_batch_eval: false,
    show_pay: false,
    show_promotion: false,
    show_team_chat: false,
    show_appStore: true,
    show_aiproxy: false,
    show_coupon: false,
    show_discount_coupon: false,
    show_git: true,
    show_openai_account: false,
    show_compliance_copywriting: false,
    showWecomConfig: false,
    show_emptyChat: true,
    hideChatCopyrightSetting: false,
    systemTitle: '',
    docUrl: '',
    openAPIDocUrl: '',
    submitPluginRequestUrl: '',
    appTemplateCourse: '',
    concatMd: '',
    payFormUrl: '',
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0
  }
};

// 功能开关分组
const featureGroups = [
  {
    title: '发布渠道',
    icon: 'common/link',
    features: [
      { key: 'show_publish_feishu', label: '飞书发布', desc: '允许将应用发布到飞书机器人' },
      { key: 'show_publish_dingtalk', label: '钉钉发布', desc: '允许将应用发布到钉钉机器人' },
      { key: 'show_publish_wecom', label: '企业微信发布', desc: '允许将应用发布到企业微信机器人' },
      {
        key: 'show_publish_offiaccount',
        label: '公众号发布',
        desc: '允许将应用发布到微信公众号'
      }
    ]
  },
  {
    title: '数据集',
    icon: 'core/dataset/datasetLight',
    features: [
      { key: 'show_dataset_feishu', label: '飞书数据集', desc: '支持从飞书导入数据' },
      { key: 'show_dataset_yuque', label: '语雀数据集', desc: '支持从语雀导入数据' },
      { key: 'show_dataset_enhance', label: '知识库增强索引', desc: '启用增强的向量索引功能' }
    ]
  },
  {
    title: '核心功能',
    icon: 'core/app/simpleBot',
    features: [
      { key: 'show_batch_eval', label: '批量评测', desc: '支持批量评测应用效果' },
      { key: 'show_pay', label: '支付功能', desc: '启用积分充值和支付功能' },
      { key: 'show_promotion', label: '推广功能', desc: '启用推广返利功能' },
      { key: 'show_team_chat', label: '团队聊天', desc: '启用团队内部聊天功能' },
      { key: 'show_appStore', label: '应用商店', desc: '显示应用模板商店' },
      { key: 'show_aiproxy', label: 'AI Proxy', desc: '启用 AI Proxy 代理功能' }
    ]
  },
  {
    title: '优惠券',
    icon: 'support/account/promotionLight',
    features: [
      { key: 'show_coupon', label: '优惠券', desc: '启用优惠券功能' },
      { key: 'show_discount_coupon', label: '折扣券', desc: '启用折扣券功能' }
    ]
  },
  {
    title: '界面与合规',
    icon: 'common/setting',
    features: [
      { key: 'show_git', label: 'GitHub 入口', desc: '显示 GitHub 链接入口' },
      { key: 'show_openai_account', label: 'OpenAI 账户', desc: '显示 OpenAI 账户管理' },
      {
        key: 'show_compliance_copywriting',
        label: '合规文案',
        desc: '显示合规相关文案提示'
      },
      { key: 'showWecomConfig', label: '企业微信配置', desc: '显示企业微信配置入口' },
      { key: 'show_emptyChat', label: '空聊天页', desc: '显示空白聊天引导页' },
      {
        key: 'hideChatCopyrightSetting',
        label: '隐藏版权设置',
        desc: '隐藏聊天页版权设置选项'
      }
    ]
  }
];

export default function SystemConfigPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<CommercialFeatureForm>(defaultConfig);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getSystemConfig();
      setConfig(data);
    } catch (error) {
      toast({
        title: '加载配置失败',
        description: (error as Error).message,
        status: 'error',
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSystemConfig(config);
      toast({
        title: '保存成功',
        description:
          '配置已保存到数据库和 config.json。如未设置 PRO_URL 环境变量，请重启主应用生效',
        status: 'success',
        duration: 5000
      });
    } catch (error) {
      toast({
        title: '保存失败',
        description: (error as Error).message,
        status: 'error',
        duration: 5000
      });
    } finally {
      setSaving(false);
    }
  };

  // 更新 license 配置
  const updateLicense = (updates: Partial<CommercialFeatureForm['license']>) => {
    setConfig((prev) => ({
      ...prev,
      license: { ...prev.license, ...updates }
    }));
  };

  // 更新 license 函数配置
  const updateLicenseFunction = (key: keyof CommercialFeatureForm['license']['functions']) => {
    setConfig((prev) => ({
      ...prev,
      license: {
        ...prev.license,
        functions: {
          ...prev.license.functions,
          [key]: !prev.license.functions[key]
        }
      }
    }));
  };

  // 更新功能开关
  const updateFeature = (key: keyof CommercialFeatureForm['features']) => {
    setConfig((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: !prev.features[key]
      }
    }));
  };

  // 更新文本配置
  const updateFeatureText = (key: keyof CommercialFeatureForm['features'], value: string) => {
    setConfig((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value
      }
    }));
  };

  // 更新数字配置
  const updateFeatureNumber = (key: keyof CommercialFeatureForm['features'], value: number) => {
    setConfig((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value
      }
    }));
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="商业版功能配置">
          <Flex justify="center" align="center" h="400px">
            <Spinner size="xl" color="primary.600" />
          </Flex>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout title="商业版功能配置">
        <VStack spacing={6} align="stretch">
          {/* 顶部操作栏 */}
          <Flex justify="space-between" align="center">
            <Box>
              <Text fontSize="sm" color="myGray.500">
                管理商业版 License 和功能开关
              </Text>
              <Text fontSize="xs" color="myGray.400" mt={1}>
                配置保存后通过 MongoDB Change Stream 自动同步（几秒内生效）
              </Text>
            </Box>
            <HStack spacing={3}>
              <Button
                variant="ghost"
                leftIcon={<MyIcon name="common/refresh" w="16px" h="16px" />}
                onClick={loadConfig}
                isLoading={loading}
              >
                刷新
              </Button>
              <Button
                variant="primary"
                leftIcon={<MyIcon name="common/check" w="16px" h="16px" />}
                onClick={handleSave}
                isLoading={saving}
                loadingText="保存中..."
              >
                保存配置
              </Button>
            </HStack>
          </Flex>

          {/* 配置优先级说明 */}
          <Box bg="yellow.50" borderRadius="lg" border="1px" borderColor="yellow.200" p={4}>
            <Flex align="flex-start" gap={2}>
              <MyIcon name="common/info" w="18px" h="18px" color="yellow.600" mt={0.5} />
              <Box>
                <Text fontSize="sm" fontWeight="500" color="yellow.800" mb={1}>
                  配置生效说明
                </Text>
                <Text fontSize="xs" color="yellow.700">
                  配置会同时保存到数据库和 config.json 文件：
                </Text>
                <Text fontSize="xs" color="yellow.700" mt={1}>
                  • 设置了 PRO_URL 环境变量 → 从数据库读取（实时生效）
                </Text>
                <Text fontSize="xs" color="yellow.700">
                  • 未设置 PRO_URL → 从 config.json 读取（需重启主应用）
                </Text>
                <Text fontSize="xs" color="yellow.700" mt={2} fontWeight="500">
                  部分配置受环境变量强制覆盖，此处修改无效：
                </Text>
                <Text fontSize="xs" color="yellow.700" mt={1}>
                  • show_coupon / show_discount_coupon → SHOW_COUPON / SHOW_DISCOUNT_COUPON
                </Text>
                <Text fontSize="xs" color="yellow.700">
                  • show_aiproxy → AIPROXY_API_ENDPOINT
                </Text>
                <Text fontSize="xs" color="yellow.700">
                  • hideChatCopyrightSetting → HIDE_CHAT_COPYRIGHT_SETTING
                </Text>
                <Text fontSize="xs" color="yellow.700">
                  • show_dataset_enhance / show_batch_eval → 由 License functions 控制
                </Text>
              </Box>
            </Flex>
          </Box>

          {/* License 配置 */}
          <Box bg="white" borderRadius="lg" border="1px" borderColor="borderColor.low" p={6}>
            <Flex align="center" gap={2} mb={4}>
              <MyIcon name="key" w="20px" h="20px" color="primary.600" />
              <Text fontSize="lg" fontWeight="600" color="myGray.900">
                License 配置
              </Text>
              <Badge colorScheme={config.license.enabled ? 'green' : 'gray'} ml={2}>
                {config.license.enabled ? '已激活' : '未激活'}
              </Badge>
            </Flex>

            <VStack spacing={4} align="stretch">
              {/* License 开关 */}
              <Flex justify="space-between" align="center" p={4} bg="myGray.50" borderRadius="md">
                <Box>
                  <Text fontWeight="500" color="myGray.900">
                    启用商业版 License
                  </Text>
                  <Text fontSize="sm" color="myGray.500">
                    启用后将开启 isPlus 模式，隐藏所有升级提示
                  </Text>
                </Box>
                <Switch
                  isChecked={config.license.enabled}
                  onChange={() => updateLicense({ enabled: !config.license.enabled })}
                  colorScheme="green"
                  size="lg"
                />
              </Flex>

              {config.license.enabled && (
                <>
                  <Divider />

                  {/* License 详情 */}
                  <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                    <GridItem>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          公司名称
                        </FormLabel>
                        <Input
                          value={config.license.company}
                          onChange={(e) => updateLicense({ company: e.target.value })}
                          placeholder="输入公司名称"
                          bg="myGray.50"
                        />
                      </FormControl>
                    </GridItem>
                    <GridItem>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          到期时间
                        </FormLabel>
                        <Input
                          type="date"
                          value={config.license.expiredTime}
                          onChange={(e) => updateLicense({ expiredTime: e.target.value })}
                          bg="myGray.50"
                        />
                      </FormControl>
                    </GridItem>
                    <GridItem colSpan={2}>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          描述
                        </FormLabel>
                        <Input
                          value={config.license.description}
                          onChange={(e) => updateLicense({ description: e.target.value })}
                          placeholder="License 描述（可选）"
                          bg="myGray.50"
                        />
                      </FormControl>
                    </GridItem>
                  </Grid>

                  <Divider />

                  {/* 资源限制 */}
                  <Text fontWeight="500" color="myGray.900" mb={2}>
                    资源限制（0 表示不限制）
                  </Text>
                  <Grid templateColumns="repeat(3, 1fr)" gap={4}>
                    <GridItem>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          最大用户数
                        </FormLabel>
                        <NumberInput
                          value={config.license.maxUsers}
                          onChange={(_, val) => updateLicense({ maxUsers: val })}
                          min={0}
                          bg="myGray.50"
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </GridItem>
                    <GridItem>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          最大应用数
                        </FormLabel>
                        <NumberInput
                          value={config.license.maxApps}
                          onChange={(_, val) => updateLicense({ maxApps: val })}
                          min={0}
                          bg="myGray.50"
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </GridItem>
                    <GridItem>
                      <FormControl>
                        <FormLabel fontSize="sm" color="myGray.700">
                          最大数据集数
                        </FormLabel>
                        <NumberInput
                          value={config.license.maxDatasets}
                          onChange={(_, val) => updateLicense({ maxDatasets: val })}
                          min={0}
                          bg="myGray.50"
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </GridItem>
                  </Grid>

                  <Divider />

                  {/* License 功能 */}
                  <Text fontWeight="500" color="myGray.900" mb={2}>
                    License 功能
                  </Text>
                  <Grid templateColumns="repeat(3, 1fr)" gap={3}>
                    {Object.entries(config.license.functions).map(([key, value]) => (
                      <GridItem key={key}>
                        <Flex
                          justify="space-between"
                          align="center"
                          p={3}
                          bg="myGray.50"
                          borderRadius="md"
                        >
                          <Text fontSize="sm" color="myGray.700">
                            {key === 'sso' && 'SSO 登录'}
                            {key === 'pay' && '支付功能'}
                            {key === 'customTemplates' && '自定义模板'}
                            {key === 'datasetEnhance' && '知识库增强'}
                            {key === 'batchEval' && '批量评测'}
                          </Text>
                          <Switch
                            isChecked={value}
                            onChange={() =>
                              updateLicenseFunction(
                                key as keyof CommercialFeatureForm['license']['functions']
                              )
                            }
                            colorScheme="green"
                            size="sm"
                          />
                        </Flex>
                      </GridItem>
                    ))}
                  </Grid>
                </>
              )}
            </VStack>
          </Box>

          {/* 功能开关配置 */}
          <Box bg="white" borderRadius="lg" border="1px" borderColor="borderColor.low" p={6}>
            <Flex align="center" gap={2} mb={4}>
              <MyIcon name="common/setting" w="20px" h="20px" color="primary.600" />
              <Text fontSize="lg" fontWeight="600" color="myGray.900">
                功能开关
              </Text>
            </Flex>

            <VStack spacing={6} align="stretch">
              {featureGroups.map((group) => (
                <Box key={group.title}>
                  <Flex align="center" gap={2} mb={3}>
                    <MyIcon name={group.icon as any} w="18px" h="18px" color="myGray.600" />
                    <Text fontWeight="500" color="myGray.800">
                      {group.title}
                    </Text>
                  </Flex>
                  <Grid templateColumns="repeat(2, 1fr)" gap={3}>
                    {group.features.map((feature) => (
                      <GridItem key={feature.key}>
                        <Flex
                          justify="space-between"
                          align="center"
                          p={3}
                          bg="myGray.50"
                          borderRadius="md"
                        >
                          <Box>
                            <Text fontSize="sm" fontWeight="500" color="myGray.900">
                              {feature.label}
                            </Text>
                            <Text fontSize="xs" color="myGray.500">
                              {feature.desc}
                            </Text>
                          </Box>
                          <Switch
                            isChecked={
                              config.features[
                                feature.key as keyof CommercialFeatureForm['features']
                              ] as boolean
                            }
                            onChange={() =>
                              updateFeature(feature.key as keyof CommercialFeatureForm['features'])
                            }
                            colorScheme="primary"
                            size="sm"
                          />
                        </Flex>
                      </GridItem>
                    ))}
                  </Grid>
                </Box>
              ))}
            </VStack>
          </Box>

          {/* 界面配置 */}
          <Box bg="white" borderRadius="lg" border="1px" borderColor="borderColor.low" p={6}>
            <Flex align="center" gap={2} mb={4}>
              <MyIcon name="core/app/simpleBot" w="20px" h="20px" color="primary.600" />
              <Text fontSize="lg" fontWeight="600" color="myGray.900">
                界面与文案配置
              </Text>
            </Flex>

            <VStack spacing={4} align="stretch">
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      系统标题
                    </FormLabel>
                    <Input
                      value={config.features.systemTitle}
                      onChange={(e) => updateFeatureText('systemTitle', e.target.value)}
                      placeholder="FastGPT"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      文档地址
                    </FormLabel>
                    <Input
                      value={config.features.docUrl}
                      onChange={(e) => updateFeatureText('docUrl', e.target.value)}
                      placeholder="https://doc.fastgpt.io"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      OpenAPI 文档地址
                    </FormLabel>
                    <Input
                      value={config.features.openAPIDocUrl}
                      onChange={(e) => updateFeatureText('openAPIDocUrl', e.target.value)}
                      placeholder="https://doc.fastgpt.io/docs/introduction/development/openapi/intro"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      插件提交地址
                    </FormLabel>
                    <Input
                      value={config.features.submitPluginRequestUrl}
                      onChange={(e) => updateFeatureText('submitPluginRequestUrl', e.target.value)}
                      placeholder="https://github.com/labring/fastgpt-plugin/issues"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      应用模板教程
                    </FormLabel>
                    <Input
                      value={config.features.appTemplateCourse}
                      onChange={(e) => updateFeatureText('appTemplateCourse', e.target.value)}
                      placeholder="教程链接"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel fontSize="sm" color="myGray.700">
                      支付表单地址
                    </FormLabel>
                    <Input
                      value={config.features.payFormUrl}
                      onChange={(e) => updateFeatureText('payFormUrl', e.target.value)}
                      placeholder="支付表单链接"
                      bg="myGray.50"
                    />
                  </FormControl>
                </GridItem>
              </Grid>

              <FormControl>
                <FormLabel fontSize="sm" color="myGray.700">
                  社区文案（Markdown）
                </FormLabel>
                <Textarea
                  value={config.features.concatMd}
                  onChange={(e) => updateFeatureText('concatMd', e.target.value)}
                  placeholder="社区交流文案，支持 Markdown 格式"
                  bg="myGray.50"
                  rows={4}
                />
              </FormControl>
            </VStack>
          </Box>

          {/* 限制配置 */}
          <Box bg="white" borderRadius="lg" border="1px" borderColor="borderColor.low" p={6}>
            <Flex align="center" gap={2} mb={4}>
              <MyIcon name="common/setting" w="20px" h="20px" color="primary.600" />
              <Text fontSize="lg" fontWeight="600" color="myGray.900">
                限制配置
              </Text>
            </Flex>

            <Grid templateColumns="repeat(2, 1fr)" gap={4}>
              <GridItem>
                <FormControl>
                  <FormLabel fontSize="sm" color="myGray.700">
                    导出数据集限制（分钟）
                  </FormLabel>
                  <NumberInput
                    value={config.features.exportDatasetLimitMinutes}
                    onChange={(_, val) => updateFeatureNumber('exportDatasetLimitMinutes', val)}
                    min={0}
                    bg="myGray.50"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text fontSize="xs" color="myGray.500" mt={1}>
                    两次导出之间的最小间隔，0 表示不限制
                  </Text>
                </FormControl>
              </GridItem>
              <GridItem>
                <FormControl>
                  <FormLabel fontSize="sm" color="myGray.700">
                    网站同步限制（分钟）
                  </FormLabel>
                  <NumberInput
                    value={config.features.websiteSyncLimitMinuted}
                    onChange={(_, val) => updateFeatureNumber('websiteSyncLimitMinuted', val)}
                    min={0}
                    bg="myGray.50"
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text fontSize="xs" color="myGray.500" mt={1}>
                    两次网站同步之间的最小间隔，0 表示不限制
                  </Text>
                </FormControl>
              </GridItem>
            </Grid>
          </Box>

          {/* 底部操作栏 */}
          <Flex justify="flex-end" gap={3} pb={4}>
            <Button variant="ghost" onClick={loadConfig}>
              重置
            </Button>
            <Button
              variant="primary"
              leftIcon={<MyIcon name="common/check" w="16px" h="16px" />}
              onClick={handleSave}
              isLoading={saving}
              loadingText="保存中..."
            >
              保存配置
            </Button>
          </Flex>
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}
