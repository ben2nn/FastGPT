import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authAdmin } from '@/service/support/permission/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const {
    query: { id },
    method
  } = req;

  await authAdmin(req);

  switch (method) {
    case 'GET':
      try {
        const team = await MongoTeam.findById(id).populate('ownerId', 'username');
        if (!team) {
          return res.status(404).json({ error: '团队不存在' });
        }

        // 获取团队成员
        const members = await MongoTeamMember.find({ teamId: id }).populate('userId', 'username');

        res.status(200).json({ team, members });
      } catch (error) {
        addLog.error('获取团队信息失败', error);
        res.status(500).json({ error: '获取团队信息失败' });
      }
      break;

    case 'PUT':
      try {
        const { name, ownerId } = req.body;
        const updateDoc: any = {};

        if (name) updateDoc.name = name;
        if (ownerId) updateDoc.ownerId = ownerId;

        const team = await MongoTeam.findByIdAndUpdate(id, updateDoc, {
          new: true,
          runValidators: true
        });

        if (!team) {
          return res.status(404).json({ error: '团队不存在' });
        }

        res.status(200).json(team);
      } catch (error) {
        addLog.error('更新团队失败', error);
        res.status(500).json({ error: '更新团队失败' });
      }
      break;

    case 'DELETE':
      try {
        const team = await MongoTeam.findById(id).populate('ownerId', 'username');
        if (!team) {
          return res.status(404).json({ error: '团队不存在' });
        }

        // 检查是否是 root 用户的团队
        if ((team.ownerId as any)?.username === 'root') {
          return res.status(403).json({ error: '不能删除 root 用户的团队' });
        }

        // 检查团队是否有成员
        const memberCount = await MongoTeamMember.countDocuments({ teamId: id });
        if (memberCount > 0) {
          return res.status(400).json({
            error: `该团队还有 ${memberCount} 个成员，请先移除所有成员后再删除团队`
          });
        }

        await MongoTeam.findByIdAndDelete(id);

        res.status(200).json({ success: true });
      } catch (error) {
        addLog.error('删除团队失败', error);
        res.status(500).json({ error: '删除团队失败' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default NextAPI(handler);
