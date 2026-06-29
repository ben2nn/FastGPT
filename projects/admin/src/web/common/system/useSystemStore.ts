/**
 * Admin 项目的 useSystemStore
 * 从后台 getInitData API 获取和 App 项目完全一致的模型提供商配置
 */
import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import {
  defaultProvider,
  formatModelProviders,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import { getInitDataWithRetry } from '@/web/common/system/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type {
  LLMModelItemType,
  EmbeddingModelItemType,
  TTSModelType,
  RerankModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.d';
import type { SystemDefaultModelType } from '@fastgpt/service/core/ai/type';
import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

type State = {
  loading: boolean;
  setLoading: (val: boolean) => null;

  // 缓存 ID，用于 bufferId 优化
  initDataBufferId?: string;

  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;

  llmModelList: LLMModelItemType[];
  embeddingModelList: EmbeddingModelItemType[];
  datasetModelList: LLMModelItemType[];
  ttsModelList: TTSModelType[];
  reRankModelList: RerankModelItemType[];
  sttModelList: STTModelType[];

  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  aiproxyIdMap: NonNullable<InitDateResponse['aiproxyIdMap']>;
  defaultModels: SystemDefaultModelType;

  initData: any;
  myModelList: { modelSet: Set<string>; versionKey: string };

  initStaticData: () => Promise<void>;
  getMyModelList: () => Promise<Set<string>>;
  getModelProviders: (language?: string) => ModelProviderItemType[];
  getModelProvider: (provider?: string, language?: string) => ModelProviderItemType;
  getVlmModelList: () => LLMModelItemType[];
};

export const useSystemStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        loading: true,
        setLoading: (val: boolean) => {
          set((state) => {
            state.loading = val;
          });
          return null;
        },

        initDataBufferId: undefined,
        feConfigs: {
          uploadFileMaxSize: 1000,
          uploadFileMaxAmount: 1000
        } as FastGPTFeConfigsType,
        subPlans: undefined,
        systemVersion: '0.0.0',

        llmModelList: [],
        embeddingModelList: [],
        datasetModelList: [],
        ttsModelList: [],
        reRankModelList: [],
        sttModelList: [],

        modelProviders: { en: [], 'zh-CN': [], 'zh-Hant': [] },
        modelProviderMap: { en: {}, 'zh-CN': {}, 'zh-Hant': {} },
        aiproxyIdMap: {},
        defaultModels: {} as SystemDefaultModelType,

        initData: null,
        myModelList: { modelSet: new Set<string>(), versionKey: '' },

        initStaticData: async () => {
          try {
            const res = await getInitDataWithRetry(get().initDataBufferId);

            // bufferId 未变化且模型列表不为空，说明数据未更新，跳过
            if (
              res.bufferId &&
              res.bufferId === get().initDataBufferId &&
              !res.activeModelList &&
              get().llmModelList.length > 0
            ) {
              return;
            }

            set((state) => {
              state.initData = res;
              state.initDataBufferId = res.bufferId ?? state.initDataBufferId;
              state.feConfigs = res.feConfigs ?? state.feConfigs;
              state.subPlans = res.subPlans ?? state.subPlans;
              state.systemVersion = res.systemVersion ?? state.systemVersion;

              if (res.modelProviders) {
                const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(
                  res.modelProviders
                );
                state.modelProviders = ModelProviderListCache ?? state.modelProviders;
                state.modelProviderMap = ModelProviderMapCache ?? state.modelProviderMap;
              }
              if (res.aiproxyIdMap && Object.keys(res.aiproxyIdMap).length > 0) {
                state.aiproxyIdMap = res.aiproxyIdMap;
              }

              // 与主应用一致：activeModelList 已由服务端按 isActive 过滤
              state.llmModelList =
                (res.activeModelList?.filter(
                  (item: any) => item.type === ModelTypeEnum.llm
                ) as typeof state.llmModelList) ?? state.llmModelList;
              state.datasetModelList = state.llmModelList.filter(
                (item: any) => item.datasetProcess
              );
              state.embeddingModelList =
                (res.activeModelList?.filter(
                  (item: any) => item.type === ModelTypeEnum.embedding
                ) as typeof state.embeddingModelList) ?? state.embeddingModelList;
              state.ttsModelList =
                (res.activeModelList?.filter(
                  (item: any) => item.type === ModelTypeEnum.tts
                ) as typeof state.ttsModelList) ?? state.ttsModelList;
              state.reRankModelList =
                (res.activeModelList?.filter(
                  (item: any) => item.type === ModelTypeEnum.rerank
                ) as typeof state.reRankModelList) ?? state.reRankModelList;
              state.sttModelList =
                (res.activeModelList?.filter(
                  (item: any) => item.type === ModelTypeEnum.stt
                ) as typeof state.sttModelList) ?? state.sttModelList;

              if (res.defaultModels && Object.keys(res.defaultModels).length > 0) {
                state.defaultModels = res.defaultModels as SystemDefaultModelType;
              }
            });
          } catch (e) {
            console.error('Failed to init system data:', e);
          } finally {
            set((state) => {
              state.loading = false;
            });
          }
        },

        getMyModelList: async () => {
          // Admin 返回所有可用模型
          const models = get().llmModelList.concat(get().embeddingModelList as any);
          return new Set(models.map((m: any) => m.model));
        },

        getModelProviders: (language = 'zh-CN') => {
          return get().modelProviders[language as langType] ?? [];
        },

        getModelProvider: (provider?: string, language = 'zh-CN') => {
          if (!provider) return defaultProvider;
          return get().modelProviderMap[language as langType]?.[provider] ?? defaultProvider;
        },

        getVlmModelList: () => {
          return get().llmModelList.filter((item) => item.vision);
        }
      })),
      {
        name: 'adminGlobalStore',
        partialize: (state) => ({
          initDataBufferId: state.initDataBufferId,
          feConfigs: state.feConfigs,
          subPlans: state.subPlans,
          systemVersion: state.systemVersion,

          modelProviders: state.modelProviders,
          modelProviderMap: state.modelProviderMap,
          aiproxyIdMap: state.aiproxyIdMap,
          defaultModels: state.defaultModels,
          llmModelList: state.llmModelList,
          datasetModelList: state.datasetModelList,
          embeddingModelList: state.embeddingModelList,
          ttsModelList: state.ttsModelList,
          reRankModelList: state.reRankModelList,
          sttModelList: state.sttModelList
        })
      }
    )
  )
);
