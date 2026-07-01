/**
 * Admin 项目的简化 useUserStore
 * 提供知识库管理所需的用户信息
 */
import { create, devtools, immer } from '@fastgpt/web/common/zustand';

type UserInfoType = {
  username: string;
  language?: string;
  team?: {
    teamId: string;
    teamName: string;
    permission: {
      hasManagePer: boolean;
      hasDatasetCreatePer: boolean;
    };
  };
};

type State = {
  userInfo: UserInfoType | null;
  teamPlanStatus: {
    standardConstants?: {
      maxUploadFileCount?: number;
      maxUploadFileSize?: number;
    };
  } | null;
  updateUserInfo: (updates: Partial<UserInfoType>) => Promise<void>;
};

export const useUserStore = create<State>()(
  devtools(
    immer((set) => ({
      userInfo: {
        username: 'admin',
        team: {
          teamId: '',
          teamName: 'Admin',
          permission: {
            hasManagePer: true,
            hasDatasetCreatePer: true
          }
        }
      },
      teamPlanStatus: null,
      updateUserInfo: async (updates: Partial<UserInfoType>) => {
        set((state) => {
          if (state.userInfo) {
            Object.assign(state.userInfo, updates);
          }
        });
      }
    }))
  )
);
