import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

export const checkTeamAiPointsAndLock = async (teamId: string) => {
  try {
    await checkTeamAIPoints(teamId);
    return true;
  } catch (error: any) {
    if (error === TeamErrEnum.aiPointsNotEnough) {
      console.log('余额不足，暂停知识库处理');
    }
    return false;
  }
};
