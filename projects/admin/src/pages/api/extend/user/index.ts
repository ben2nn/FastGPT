// pages/api/support/user/index.js
import { connectToDatabase } from '@/service/common/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addLog } from '@fastgpt/service/common/system/log';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  const { method } = req;
  await connectToDatabase();

  /**
  const { userId } = await authCert({ req, authToken: true });

  const curUser = await MongoUser.findById(userId).select('-password');
  if (curUser.username !== 'root') {
    return res.status(200).json([]);
  }
   **/

  switch (method) {
    case 'GET':
      try {
        addLog.debug('GET /api/support/user', { MongoUser: MongoUser.modelName });
        const users = await MongoUser.find().select('-password');
        res.status(200).json(users);
      } catch (error) {
        addLog.error('Error fetching users', error);
        res.status(500).json({ error: 'Error fetching users' });
      }
      break;

    case 'POST':
      try {
        const {
          username,
          password,
          status,
          avatar,
          balance,
          promotionRate,
          timezone,
          teamId,
          isTeamOwner
        } = req.body;

        // Check if user already exists
        const existingUser = await MongoUser.findOne({ username });
        if (existingUser) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        addLog.debug('POST /api/support/user', {
          username,
          passwordHash: hashStr(password)
        });
        // Hash password
        const hashedPassword = hashStr(password);

        const newUser = new MongoUser({
          username,
          password: hashedPassword,
          status,
          avatar,
          balance,
          promotionRate,
          timezone
        });

        const savedUser = await newUser.save();

        // 如果指定了团队
        if (teamId) {
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
              ownerId: savedUser._id
            });
          }

          // Add user to team_members
          const teamMember = new MongoTeamMember({
            teamId: teamId,
            userId: savedUser._id,
            name: isTeamOwner ? 'Owner' : 'Member',
            role: isTeamOwner ? 'owner' : 'member',
            defaultTeam: true
          });
          await teamMember.save();
        }

        res.status(201).json({
          success: true,
          user: savedUser.toObject({
            versionKey: false,
            transform: (_doc, ret) => {
              delete ret.password;
              return ret;
            }
          })
        });
      } catch (error) {
        addLog.error('Error creating user', error);
        res.status(500).json({ error: 'Error creating user' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

export default NextAPI(handler);
