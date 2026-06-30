import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authAdmin } from '@/service/support/permission/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { method } = req;
  await authAdmin(req);

  switch (method) {
    case 'GET':
      try {
        const teams = await MongoTeam.find().populate('ownerId', 'username');
        res.status(200).json(teams);
      } catch (error) {
        addLog.error('获取团队列表失败', error);
        res.status(500).json({ error: '获取团队列表失败' });
      }
      break;

    case 'POST':
      try {
        const { name, ownerId } = req.body;

        if (!name) {
          return res.status(400).json({ error: '团队名称不能为空' });
        }

        let savedTeam;
        if (!ownerId) {
          const newTeam = new MongoTeam({
            name,
            ownerId
          });

          savedTeam = await newTeam.save();

          // 添加所有者为团队成员
          const teamMember = new MongoTeamMember({
            teamId: savedTeam._id,
            userId: ownerId,
            name: 'Owner',
            role: 'owner',
            defaultTeam: false
          });
          await teamMember.save();
        } else {
          const newTeam = new MongoTeam({
            name
          });
          savedTeam = await newTeam.save();
        }
        res.status(201).json({ success: true, team: savedTeam });
      } catch (error) {
        addLog.error('创建团队失败', error);
        res.status(500).json({ error: '创建团队失败' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default NextAPI(handler);
