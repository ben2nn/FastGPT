// pages/api/support/user/index.js
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req, res) {
  console.log('123');
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
        console.log('GET /api/support/user', MongoUser);
        const users = await MongoUser.find({ username: { $ne: 'root' } }).select('-password');
        res.status(200).json(users);
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Error fetching users' });
      }
      break;

    case 'POST':
      try {
        const { username, password, status, avatar, balance, promotionRate, timezone } = req.body;

        // Check if user already exists
        const existingUser = await MongoUser.findOne({ username });
        if (existingUser) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        console.log(
          'POST /api/support/user',
          password,
          hashStr(password),
          hashStr(hashStr(password))
        );
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

        // Create a new team for the user
        const team = new MongoTeam({
          name: `${username}'s Team`,
          ownerId: savedUser._id
        });
        const savedTeam = await team.save();

        // Add user to team_members
        const teamMember = new MongoTeamMember({
          teamId: savedTeam._id,
          userId: savedUser._id,
          name: 'Owner',
          role: 'owner',
          defaultTeam: true
        });
        await teamMember.save();

        res.status(201).json({
          success: true,
          user: savedUser.toObject({
            versionKey: false,
            transform: (doc, ret) => {
              delete ret.password;
              return ret;
            }
          })
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Error creating user' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
