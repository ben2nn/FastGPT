import { hashStr } from '@fastgpt/global/common/string/tools';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authAdmin } from '@/service/support/permission/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
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
        const user = await MongoUser.findById(id).select('-password');
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json(user);
      } catch (error) {
        res.status(500).json({ error: 'Error fetching user' });
      }
      break;

    case 'PUT':
      try {
        const {
          username,
          status,
          avatar,
          balance,
          promotionRate,
          timezone,
          password,
          teamId,
          isTeamOwner
        } = req.body;
        const updateDoc = {
          username,
          status,
          avatar,
          balance,
          promotionRate,
          timezone
        };

        if (password) {
          (updateDoc as any).password = hashStr(password);
        }

        const user = await MongoUser.findByIdAndUpdate(id, updateDoc, {
          new: true,
          runValidators: true
        }).select('-password');

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // 如果指定了团队
        if (teamId) {
          // 检查用户是否已经在团队中
          const existingMember = await MongoTeamMember.findOne({
            teamId: teamId,
            userId: id
          });

          if (existingMember) {
            // 更新现有成员的角色
            (existingMember as any).role = isTeamOwner ? 'owner' : 'member';
            existingMember.name = isTeamOwner ? 'Owner' : 'Member';
            await existingMember.save();
          } else {
            // 添加用户到团队
            const teamMember = new MongoTeamMember({
              teamId: teamId,
              userId: id,
              name: isTeamOwner ? 'Owner' : 'Member',
              role: isTeamOwner ? 'owner' : 'member',
              defaultTeam: true
            });
            await teamMember.save();
          }

          // 如果用户是团队所有者，更新团队的 ownerId
          if (isTeamOwner) {
            // 获取当前团队信息
            const team = await MongoTeam.findById(teamId);

            if (team && team.ownerId) {
              // 将之前的所有者角色改为成员
              const previousOwnerMember = await MongoTeamMember.findOne({
                teamId: teamId,
                userId: team.ownerId
              });

              if (previousOwnerMember) {
                (previousOwnerMember as any).role = 'member';
                previousOwnerMember.name = 'Member';
                await previousOwnerMember.save();
              }
            }

            // 更新团队的 ownerId 为新的所有者
            await MongoTeam.findByIdAndUpdate(teamId, {
              ownerId: id
            });
          }
        }

        res.status(200).json(user);
      } catch (error) {
        res.status(500).json({ error: 'Error updating user' });
      }
      break;

    case 'DELETE':
      try {
        // 先查询用户信息
        const userToDelete = await MongoUser.findById(id);
        if (!userToDelete) {
          return res.status(404).json({ error: 'User not found' });
        }

        // 检查是否为 root 用户
        if (userToDelete.username === 'root') {
          return res.status(403).json({ error: '不能删除 root 用户' });
        }

        const deletedUser = await MongoUser.findByIdAndDelete(id);

        // Remove user from teams
        await MongoTeamMember.deleteMany({ userId: id });

        // Delete teams owned by this user
        const ownedTeams = await MongoTeam.find({ ownerId: id });
        for (const team of ownedTeams) {
          await MongoTeamMember.deleteMany({ teamId: team._id });
          await MongoTeam.findByIdAndDelete(team._id);
        }

        res.status(200).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Error deleting user' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default NextAPI(handler);
