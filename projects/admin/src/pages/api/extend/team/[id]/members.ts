import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const {
    query: { id },
    method
  } = req;

  switch (method) {
    case 'GET':
      try {
        // 获取团队成员列表
        const members = await MongoTeamMember.find({ teamId: id }).populate(
          'userId',
          'username avatar'
        );
        res.status(200).json(members);
      } catch (error) {
        addLog.error('获取团队成员失败', error);
        res.status(500).json({ error: '获取团队成员失败' });
      }
      break;

    case 'POST':
      try {
        const { userId, role = 'member' } = req.body;

        if (!userId) {
          return res.status(400).json({ error: '用户ID不能为空' });
        }

        // 检查用户是否存在
        const user = await MongoUser.findById(userId);
        if (!user) {
          return res.status(404).json({ error: '用户不存在' });
        }

        // 检查是否已经是团队成员
        const existingMember = await MongoTeamMember.findOne({ teamId: id, userId });
        if (existingMember) {
          return res.status(400).json({ error: '用户已经是团队成员' });
        }

        const newMember = new MongoTeamMember({
          teamId: id,
          userId,
          name: user.username,
          role,
          defaultTeam: false
        });

        const savedMember = await newMember.save();
        res.status(201).json({ success: true, member: savedMember });
      } catch (error) {
        addLog.error('添加团队成员失败', error);
        res.status(500).json({ error: '添加团队成员失败' });
      }
      break;

    case 'DELETE':
      try {
        const { userId } = req.body;

        if (!userId) {
          return res.status(400).json({ error: '用户ID不能为空' });
        }

        const result = await MongoTeamMember.findOneAndDelete({ teamId: id, userId });

        if (!result) {
          return res.status(404).json({ error: '团队成员不存在' });
        }

        res.status(200).json({ success: true });
      } catch (error) {
        addLog.error('移除团队成员失败', error);
        res.status(500).json({ error: '移除团队成员失败' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default NextAPI(handler);
