import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoOrgMemberModel } from '@fastgpt/service/support/permission/org/orgMemberSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { getTmbPermission } from '@fastgpt/service/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamDefaultRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import type { TeamMemberItemType, TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import type {
  GroupMemberItemType,
  MemberGroupListItemType
} from '@fastgpt/global/support/permission/memberGroup/type';

type ProUser = {
  userId: string;
  teamId: string;
  tmbId: string;
  isRoot: boolean;
};

type Pagination = {
  pageSize: number;
  offset: number;
};

export const authProUser = async (req: ApiRequestProps): Promise<ProUser> => {
  const auth = await authCert({ req, authToken: true });
  return {
    userId: auth.userId,
    teamId: auth.teamId,
    tmbId: auth.tmbId,
    isRoot: auth.isRoot
  };
};

export const assertTeamManager = async (user: ProUser) => {
  if (user.isRoot) return;

  const member = await getTmbInfoByTmbId({ tmbId: user.tmbId });
  if (!member.permission.hasManagePer) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }
};

export const parsePagination = (data: Record<string, any> = {}): Pagination => {
  const pageSize = Math.max(1, Number(data.pageSize || 20));
  const offset =
    data.offset !== undefined
      ? Math.max(0, Number(data.offset))
      : Math.max(0, Number(data.pageNum || 1) - 1) * pageSize;

  return {
    pageSize,
    offset
  };
};

export const toPaginationResponse = <T>(list: T[], total: number) => ({
  list,
  total
});

const getTeamPermission = async ({
  teamId,
  tmbId,
  role
}: {
  teamId: string;
  tmbId: string;
  role?: string;
}) => {
  const permission =
    (await getTmbPermission({
      resourceType: PerResourceTypeEnum.team,
      teamId,
      tmbId
    })) ?? TeamDefaultRoleVal;

  return new TeamPermission({
    role: permission,
    isOwner: role === TeamMemberRoleEnum.owner
  });
};

const serializeMember = async (
  member: any,
  options: {
    withPermission?: boolean;
    withOrgs?: boolean;
    withGroupRole?: boolean;
    groupId?: string;
  } = {}
): Promise<TeamMemberItemType> => {
  const user = member.userId && typeof member.userId === 'object' ? member.userId : undefined;
  const item: any = {
    userId: String(user?._id || member.userId),
    tmbId: String(member._id),
    teamId: String(member.teamId),
    memberName: member.name,
    avatar: member.avatar,
    role: member.role,
    status: member.status,
    contact: user?.contact || user?.username,
    createTime: member.createTime,
    updateTime: member.updateTime
  };

  if (options.withPermission) {
    item.permission = await getTeamPermission({
      teamId: String(member.teamId),
      tmbId: String(member._id),
      role: member.role
    });
  }

  if (options.withOrgs) {
    item.orgs = await getMemberOrgNames({
      teamId: String(member.teamId),
      tmbId: String(member._id)
    });
  }

  if (options.withGroupRole && options.groupId) {
    const groupMember = await MongoGroupMemberModel.findOne({
      groupId: options.groupId,
      tmbId: member._id
    }).lean();
    item.groupRole = groupMember?.role;
  }

  return item;
};

const getMemberOrgNames = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) => {
  const orgMembers = await MongoOrgMemberModel.find({ teamId, tmbId }).populate('org').lean();
  return orgMembers
    .map((item: any) => item.org)
    .filter(Boolean)
    .map((org: any) => org.name);
};

const getRootOrg = async (teamId: string) => {
  let root = await MongoOrgModel.findOne({ teamId, path: '' }).lean();
  if (!root) {
    const [created] = await MongoOrgModel.create([{ teamId, name: 'ROOT', path: '' }]);
    root = created.toObject();
  }
  return root;
};

const orgListItem = async ({
  org,
  withPermission,
  user
}: {
  org: any;
  withPermission?: boolean;
  user: ProUser;
}): Promise<OrgListItemType> => {
  const childPath = getOrgChildrenPath(org);
  const [childrenCount, memberCount] = await Promise.all([
    MongoOrgModel.countDocuments({ teamId: user.teamId, path: childPath }),
    MongoOrgMemberModel.countDocuments({ teamId: user.teamId, orgId: org._id })
  ]);

  return {
    _id: String(org._id),
    teamId: String(org.teamId),
    pathId: org.pathId,
    path: org.path,
    name: org.name,
    avatar: org.avatar || DEFAULT_ORG_AVATAR,
    description: org.description,
    updateTime: org.updateTime,
    total: childrenCount + memberCount,
    ...(withPermission
      ? {
          permission: await getTeamPermission({
            teamId: user.teamId,
            tmbId: user.tmbId
          })
        }
      : {})
  };
};

const getGroupPermission = (role?: `${GroupMemberRole}`, teamManage = false) =>
  new Permission({
    role:
      teamManage || role === GroupMemberRole.owner
        ? 0b001
        : role === GroupMemberRole.admin
          ? 0b010
          : 0b100,
    isOwner: teamManage || role === GroupMemberRole.owner
  });

const ensureDefaultGroup = async (teamId: string) => {
  let group = await MongoMemberGroupModel.findOne({ teamId, name: DefaultGroupName }).lean();
  if (!group) {
    const [created] = await MongoMemberGroupModel.create([{ teamId, name: DefaultGroupName }]);
    group = created.toObject();
  }
  return group;
};

export async function handleTeamApi({
  path,
  req,
  res
}: {
  path: string[];
  req: ApiRequestProps;
  res: ApiResponseType<any>;
}) {
  const user = await authProUser(req);
  const route = path.join('/');

  switch (route) {
    case 'list':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await listTeams(user, req.query?.status as string)
      });
    case 'switch':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await switchTeam(user, req.body?.teamId)
      });
    case 'member/list':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await listMembers(user, req.body || {})
      });
    case 'member/count':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: { count: await MongoTeamMember.countDocuments({ teamId: user.teamId }) }
      });
    case 'member/updateNameByManager':
      await updateMemberNameByManager(user, req.body?.tmbId, req.body?.name);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'member/updateName':
      await MongoTeamMember.updateOne(
        { _id: user.tmbId, teamId: user.teamId },
        { name: req.body?.name }
      );
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'member/delete':
      await removeMember(user, (req.query?.tmbId || req.body?.tmbId) as string);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'member/restore':
      await restoreMember(user, req.body?.tmbId);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'member/leave':
      await leaveTeam(user);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/list':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await listOrgs(user, req.body || {})
      });
    case 'org/create':
      await createOrg(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/delete':
      await deleteOrg(user, (req.query?.orgId || req.body?.orgId) as string);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/move':
      await moveOrg(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/update':
      await updateOrg(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/updateMembers':
      await updateOrgMembers(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'org/members':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await listOrgMembers(user, req.query || {})
      });
    case 'org/deleteMember':
      await deleteOrgMember(user, {
        orgId: (req.query?.orgId || req.body?.orgId) as string,
        tmbId: (req.query?.tmbId || req.body?.tmbId) as string
      });
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'group/list':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await listGroups(user, req.body || {})
      });
    case 'group/create':
      await createGroup(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'group/delete':
      await deleteGroup(user, (req.query?.groupId || req.body?.groupId) as string);
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'group/update':
      await updateGroup(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    case 'group/members':
      return res.json({
        code: 200,
        statusText: '',
        message: '',
        data: await getGroupMembers((req.query?.groupId || req.body?.groupId) as string)
      });
    case 'group/changeOwner':
      await changeGroupOwner(user, req.body || {});
      return res.json({ code: 200, statusText: '', message: '', data: null });
    default:
      return res
        .status(404)
        .json({ code: 404, statusText: 'notFound', message: 'Not found', data: null });
  }
}

async function listTeams(user: ProUser, status?: string): Promise<TeamTmbItemType[]> {
  const match: any = {
    userId: user.userId
  };
  if (status) {
    match.status =
      status === 'inactive'
        ? { $in: [TeamMemberStatusEnum.leave, TeamMemberStatusEnum.forbidden] }
        : status;
  }

  const members = await MongoTeamMember.find(match).populate('team').lean();
  return Promise.all(
    members
      .filter((item: any) => item.team)
      .map(async (item: any) => ({
        userId: String(item.userId),
        teamId: String(item.teamId),
        teamAvatar: item.team.avatar,
        teamName: item.team.name,
        memberName: item.name,
        avatar: item.avatar,
        balance: item.team.balance,
        tmbId: String(item._id),
        teamDomain: item.team.teamDomain,
        role: item.role,
        status: item.status,
        permission: await getTeamPermission({
          teamId: String(item.teamId),
          tmbId: String(item._id),
          role: item.role
        }),
        notificationAccount: item.team.notificationAccount,
        lafAccount: item.team.lafAccount,
        openaiAccount: item.team.openaiAccount,
        externalWorkflowVariables: item.team.externalWorkflowVariables,
        isWecomTeam: !!item.team.meta?.wecom
      }))
  );
}

async function switchTeam(user: ProUser, teamId: string) {
  const member = await MongoTeamMember.findOne({
    userId: user.userId,
    teamId,
    status: TeamMemberStatusEnum.active
  }).lean();
  if (!member) return Promise.reject(TeamErrEnum.unAuthTeam);

  await MongoUser.updateOne({ _id: user.userId }, { lastLoginTmbId: member._id });
  return String(member._id);
}

async function listMembers(user: ProUser, body: Record<string, any>) {
  const { pageSize, offset } = parsePagination(body);
  const match: any = { teamId: user.teamId };

  if (body.status === 'inactive') {
    match.status = { $in: [TeamMemberStatusEnum.leave, TeamMemberStatusEnum.forbidden] };
  } else if (body.status) {
    match.status = body.status;
  }

  if (body.orgId) {
    const orgMemberTmbIds = await MongoOrgMemberModel.find({
      teamId: user.teamId,
      orgId: body.orgId
    }).distinct('tmbId');
    match._id = { $in: orgMemberTmbIds };
  }

  if (body.groupId) {
    const groupMemberTmbIds = await MongoGroupMemberModel.find({
      groupId: body.groupId
    }).distinct('tmbId');
    match._id = { $in: groupMemberTmbIds };
  }

  if (body.searchKey) {
    match.name = { $regex: body.searchKey, $options: 'i' };
  }

  const [total, list] = await Promise.all([
    MongoTeamMember.countDocuments(match),
    MongoTeamMember.find(match)
      .populate('userId', 'username contact avatar')
      .sort({ createTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean()
  ]);

  return toPaginationResponse(
    await Promise.all(
      list.map((member) =>
        serializeMember(member, {
          withPermission: body.withPermission !== false,
          withOrgs: !!body.withOrgs,
          withGroupRole: !!body.groupId,
          groupId: body.groupId
        })
      )
    ),
    total
  );
}

async function updateMemberNameByManager(user: ProUser, tmbId: string, name: string) {
  await assertTeamManager(user);
  await MongoTeamMember.updateOne({ _id: tmbId, teamId: user.teamId }, { name });
}

async function removeMember(user: ProUser, tmbId: string) {
  await assertTeamManager(user);
  const member = await MongoTeamMember.findOne({ _id: tmbId, teamId: user.teamId }).lean();
  if (!member) return Promise.reject('member not exist');
  if (member.role === TeamMemberRoleEnum.owner) return Promise.reject('can not remove owner');

  await MongoTeamMember.updateOne(
    { _id: tmbId, teamId: user.teamId },
    { status: TeamMemberStatusEnum.leave, updateTime: new Date() }
  );
  await Promise.all([
    MongoOrgMemberModel.deleteMany({ teamId: user.teamId, tmbId }),
    MongoGroupMemberModel.deleteMany({ tmbId })
  ]);
}

async function restoreMember(user: ProUser, tmbId: string) {
  await assertTeamManager(user);
  await MongoTeamMember.updateOne(
    { _id: tmbId, teamId: user.teamId },
    { status: TeamMemberStatusEnum.active, updateTime: new Date() }
  );
}

async function leaveTeam(user: ProUser) {
  const member = await MongoTeamMember.findOne({ _id: user.tmbId, teamId: user.teamId }).lean();
  if (member?.role === TeamMemberRoleEnum.owner) return Promise.reject('owner can not leave team');
  await MongoTeamMember.updateOne(
    { _id: user.tmbId, teamId: user.teamId },
    { status: TeamMemberStatusEnum.leave, updateTime: new Date() }
  );
}

async function listOrgs(user: ProUser, body: Record<string, any>) {
  const parentOrg = body.orgId
    ? await MongoOrgModel.findOne({ _id: body.orgId, teamId: user.teamId }).lean()
    : await getRootOrg(user.teamId);

  if (!parentOrg) return [];

  const match: any = {
    teamId: user.teamId,
    path: getOrgChildrenPath(parentOrg)
  };
  if (body.searchKey) {
    match.name = { $regex: body.searchKey, $options: 'i' };
    delete match.path;
  }

  const orgs = await MongoOrgModel.find(match).sort({ updateTime: -1 }).lean();
  return Promise.all(
    orgs.map((org) =>
      orgListItem({
        org,
        withPermission: body.withPermission !== false,
        user
      })
    )
  );
}

async function createOrg(user: ProUser, body: Record<string, any>) {
  await assertTeamManager(user);
  const parent = body.orgId
    ? await MongoOrgModel.findOne({ _id: body.orgId, teamId: user.teamId }).lean()
    : await getRootOrg(user.teamId);
  if (!parent) return Promise.reject(TeamErrEnum.orgParentNotExist);

  await MongoOrgModel.create({
    teamId: user.teamId,
    name: body.name,
    avatar: body.avatar || DEFAULT_ORG_AVATAR,
    description: body.description,
    path: getOrgChildrenPath(parent)
  });
}

async function updateOrg(user: ProUser, body: Record<string, any>) {
  await assertTeamManager(user);
  if (!body.orgId) return Promise.reject(TeamErrEnum.cannotModifyRootOrg);
  await MongoOrgModel.updateOne(
    { _id: body.orgId, teamId: user.teamId },
    {
      $set: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.avatar ? { avatar: body.avatar } : {}),
        ...(body.description !== undefined ? { description: body.description } : {})
      }
    }
  );
}

async function deleteOrg(user: ProUser, orgId: string) {
  await assertTeamManager(user);
  if (!orgId) return Promise.reject(TeamErrEnum.cannotModifyRootOrg);

  const org = await MongoOrgModel.findOne({ _id: orgId, teamId: user.teamId }).lean();
  if (!org) return Promise.reject(TeamErrEnum.orgNotExist);

  const [childCount, memberCount] = await Promise.all([
    MongoOrgModel.countDocuments({ teamId: user.teamId, path: getOrgChildrenPath(org) }),
    MongoOrgMemberModel.countDocuments({ teamId: user.teamId, orgId })
  ]);
  if (childCount + memberCount > 0) return Promise.reject(TeamErrEnum.cannotDeleteNonEmptyOrg);

  await MongoOrgModel.deleteOne({ _id: orgId, teamId: user.teamId });
}

async function moveOrg(user: ProUser, body: Record<string, any>) {
  await assertTeamManager(user);
  const org = await MongoOrgModel.findOne({ _id: body.orgId, teamId: user.teamId }).lean();
  if (!org) return Promise.reject(TeamErrEnum.orgNotExist);

  const target = body.targetOrgId
    ? await MongoOrgModel.findOne({ _id: body.targetOrgId, teamId: user.teamId }).lean()
    : await getRootOrg(user.teamId);
  if (!target) return Promise.reject(TeamErrEnum.orgParentNotExist);

  const oldChildrenPath = getOrgChildrenPath(org);
  const newParentPath = getOrgChildrenPath(target);
  if (newParentPath.startsWith(oldChildrenPath))
    return Promise.reject('can not move org to its child');

  const newChildrenPath = `${newParentPath}/${org.pathId}`;
  const children = await MongoOrgModel.find({
    teamId: user.teamId,
    path: { $regex: `^${oldChildrenPath}` }
  }).lean();

  await MongoOrgModel.updateOne({ _id: org._id }, { path: newParentPath });
  await Promise.all(
    children.map((child) =>
      MongoOrgModel.updateOne(
        { _id: child._id },
        { path: child.path.replace(oldChildrenPath, newChildrenPath) }
      )
    )
  );
}

async function updateOrgMembers(user: ProUser, body: Record<string, any>) {
  await assertTeamManager(user);
  const orgId = body.orgId || (await getRootOrg(user.teamId))._id;
  const members = Array.isArray(body.members) ? body.members : [];

  await MongoOrgMemberModel.deleteMany({ teamId: user.teamId, orgId });
  if (members.length) {
    await MongoOrgMemberModel.insertMany(
      members.map((item: any) => ({
        teamId: user.teamId,
        orgId,
        tmbId: item.tmbId
      })),
      { ordered: false }
    ).catch(() => undefined);
  }
}

async function listOrgMembers(user: ProUser, query: Record<string, any>) {
  const { pageSize, offset } = parsePagination(query);
  const match: any = { teamId: user.teamId };

  if (query.orgPath !== undefined) {
    const org = query.orgPath
      ? await MongoOrgModel.findOne({ teamId: user.teamId, pathId: query.orgPath }).lean()
      : await getRootOrg(user.teamId);
    if (org) match.orgId = org._id;
  }

  const orgMembers = await MongoOrgMemberModel.find(match).distinct('tmbId');
  const memberMatch = { _id: { $in: orgMembers }, teamId: user.teamId };
  const [total, members] = await Promise.all([
    MongoTeamMember.countDocuments(memberMatch),
    MongoTeamMember.find(memberMatch).skip(offset).limit(pageSize).lean()
  ]);

  return toPaginationResponse(
    await Promise.all(members.map((member) => serializeMember(member, { withPermission: true }))),
    total
  );
}

async function deleteOrgMember(user: ProUser, data: { orgId: string; tmbId: string }) {
  await assertTeamManager(user);
  await MongoOrgMemberModel.deleteOne({
    teamId: user.teamId,
    orgId: data.orgId,
    tmbId: data.tmbId
  });
}

async function listGroups(user: ProUser, body: Record<string, any>) {
  await ensureDefaultGroup(user.teamId);
  const match: any = { teamId: user.teamId };
  if (body.searchKey) match.name = { $regex: body.searchKey, $options: 'i' };

  const [currentMember, groups] = await Promise.all([
    getTmbInfoByTmbId({ tmbId: user.tmbId }),
    MongoMemberGroupModel.find(match).sort({ updateTime: -1 }).lean()
  ]);

  const teamManage = currentMember.permission.hasManagePer;
  return Promise.all(
    groups.map(async (group: any): Promise<MemberGroupListItemType<boolean>> => {
      const groupMembers = await MongoGroupMemberModel.find({ groupId: group._id }).lean();
      const tmbIds = groupMembers.map((item) => item.tmbId);
      const members = await MongoTeamMember.find({ _id: { $in: tmbIds } }).lean();
      const ownerRole = groupMembers.find((item) => item.role === GroupMemberRole.owner);
      const ownerMember = ownerRole
        ? members.find((item) => String(item._id) === String(ownerRole.tmbId))
        : undefined;
      const myGroupRole = groupMembers.find((item) => String(item.tmbId) === user.tmbId)?.role;

      return {
        _id: String(group._id),
        teamId: String(group.teamId),
        name: group.name,
        avatar: group.avatar || DEFAULT_TEAM_AVATAR,
        updateTime: group.updateTime,
        members: body.withMembers
          ? members.map((item) => ({
              tmbId: String(item._id),
              name: item.name,
              avatar: item.avatar
            }))
          : undefined,
        count: body.withMembers ? members.length : undefined,
        owner:
          body.withMembers && ownerMember
            ? {
                tmbId: String(ownerMember._id),
                name: ownerMember.name,
                avatar: ownerMember.avatar
              }
            : undefined,
        permission: body.withMembers ? getGroupPermission(myGroupRole, teamManage) : undefined
      } as any;
    })
  );
}

async function createGroup(user: ProUser, body: Record<string, any>) {
  await assertTeamManager(user);
  const group = await MongoMemberGroupModel.create({
    teamId: user.teamId,
    name: body.name,
    avatar: body.avatar || DEFAULT_TEAM_AVATAR
  });

  const memberIdList = Array.isArray(body.memberIdList) ? body.memberIdList : [];
  const members = Array.from(new Set([user.tmbId, ...memberIdList]));
  await MongoGroupMemberModel.insertMany(
    members.map((tmbId) => ({
      groupId: group._id,
      tmbId,
      role: tmbId === user.tmbId ? GroupMemberRole.owner : GroupMemberRole.member
    }))
  );
}

async function updateGroup(user: ProUser, body: Record<string, any>) {
  const group = await MongoMemberGroupModel.findOne({
    _id: body.groupId,
    teamId: user.teamId
  }).lean();
  if (!group) return Promise.reject(TeamErrEnum.groupNotExist);
  await assertGroupManager(user, body.groupId);

  await MongoMemberGroupModel.updateOne(
    { _id: body.groupId, teamId: user.teamId },
    {
      $set: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.avatar ? { avatar: body.avatar } : {})
      }
    }
  );

  if (Array.isArray(body.memberList)) {
    const hasOwner = body.memberList.some((item: any) => item.role === GroupMemberRole.owner);
    if (!hasOwner) return Promise.reject('group must have owner');
    await MongoGroupMemberModel.deleteMany({ groupId: body.groupId });
    await MongoGroupMemberModel.insertMany(
      body.memberList.map((item: any) => ({
        groupId: body.groupId,
        tmbId: item.tmbId,
        role: item.role || GroupMemberRole.member
      }))
    );
  }
}

async function deleteGroup(user: ProUser, groupId: string) {
  await assertGroupManager(user, groupId, true);
  const group = await MongoMemberGroupModel.findOne({ _id: groupId, teamId: user.teamId }).lean();
  if (!group) return Promise.reject(TeamErrEnum.groupNotExist);
  if (group.name === DefaultGroupName) return Promise.reject(TeamErrEnum.cannotDeleteDefaultGroup);
  await Promise.all([
    MongoGroupMemberModel.deleteMany({ groupId }),
    MongoMemberGroupModel.deleteOne({ _id: groupId, teamId: user.teamId })
  ]);
}

async function getGroupMembers(groupId: string): Promise<GroupMemberItemType[]> {
  const groupMembers = await MongoGroupMemberModel.find({ groupId }).lean();
  const members = await MongoTeamMember.find({
    _id: { $in: groupMembers.map((item) => item.tmbId) }
  }).lean();

  return groupMembers.map((item) => {
    const member = members.find((m) => String(m._id) === String(item.tmbId));
    return {
      tmbId: String(item.tmbId),
      name: member?.name || '',
      avatar: member?.avatar || DEFAULT_TEAM_AVATAR,
      role: item.role
    };
  });
}

async function changeGroupOwner(user: ProUser, body: Record<string, any>) {
  await assertGroupManager(user, body.groupId, true);
  await MongoGroupMemberModel.updateMany(
    { groupId: body.groupId, role: GroupMemberRole.owner },
    { role: GroupMemberRole.admin }
  );
  await MongoGroupMemberModel.updateOne(
    { groupId: body.groupId, tmbId: body.tmbId },
    { role: GroupMemberRole.owner },
    { upsert: true }
  );
}

async function assertGroupManager(user: ProUser, groupId: string, ownerOnly = false) {
  const member = await getTmbInfoByTmbId({ tmbId: user.tmbId });
  if (member.permission.hasManagePer) return;

  const groupMember = await MongoGroupMemberModel.findOne({ groupId, tmbId: user.tmbId }).lean();
  if (
    groupMember?.role === GroupMemberRole.owner ||
    (!ownerOnly && groupMember?.role === GroupMemberRole.admin)
  ) {
    return;
  }
  return Promise.reject(TeamErrEnum.unAuthTeam);
}
