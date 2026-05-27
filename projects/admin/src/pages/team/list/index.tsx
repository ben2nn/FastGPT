import type { FormEvent } from 'react';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  Flex,
  Text,
  Divider,
  Avatar
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import type { User, Team } from '@/types/user';
import {
  fetchUsers,
  fetchTeams,
  fetchTeamMembers,
  addTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateUser
} from '@/web/core/extend/api';
import Layout from '@/web/context/Layout';

interface TeamMember {
  _id: string;
  userId: {
    _id: string;
    username: string;
  };
  role: string;
}

export default function TeamManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);

  const toast = useToast();

  useEffect(() => {
    loadUsers();
    loadTeams();
  }, []);

  useEffect(() => {
    if (selectedTeam) {
      loadTeamMembers(selectedTeam._id);
    }
  }, [selectedTeam]);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const loadTeams = async () => {
    try {
      const data = await fetchTeams();
      setTeams(data);
      if (data.length > 0 && !selectedTeam) {
        setSelectedTeam(data[0]);
      }
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      const data = await fetchTeamMembers(teamId);
      setTeamMembers(data);
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleAddTeam = async (teamData: { name: string; ownerId: string }) => {
    try {
      await addTeam(teamData);
      await loadTeams();
      await loadUsers();
      setIsTeamModalOpen(false);
      toast({ title: '添加团队成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleUpdateTeam = async (teamData: { name: string }) => {
    try {
      if (!currentTeam?._id) throw new Error('无效的团队ID');
      await updateTeam(currentTeam._id, teamData);
      await loadTeams();
      await loadUsers();
      if (selectedTeam) await loadTeamMembers(selectedTeam._id);
      setIsTeamModalOpen(false);
      toast({ title: '更新团队成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    const team = teams.find((t) => t._id === teamId);
    if (team?.ownerId?.username === 'root') {
      toast({ title: '不能删除 root 用户的团队', status: 'error', duration: 3000 });
      return;
    }

    try {
      const members = await fetchTeamMembers(teamId);
      if (members.length > 0) {
        toast({
          title: '无法删除团队',
          description: `该团队还有 ${members.length} 个成员，请先移除所有成员后再删除团队`,
          status: 'warning',
          duration: 4000,
          isClosable: true
        });
        return;
      }
    } catch (error) {
      toast({ title: '检查团队成员失败', status: 'error', duration: 3000 });
      return;
    }

    if (!confirm('确定要删除这个团队吗？')) return;
    try {
      await deleteTeam(teamId);
      await loadTeams();
      await loadUsers();
      setSelectedTeam(null);
      toast({ title: '删除团队成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleAddMemberToTeam = async (userId: string) => {
    try {
      if (!selectedTeam) return;
      await addTeamMember(selectedTeam._id, userId);
      await loadTeamMembers(selectedTeam._id);
      await loadUsers();
      await loadTeams();
      setIsAddMemberModalOpen(false);
      toast({ title: '添加成员成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleRemoveMemberFromTeam = async (userId: string) => {
    if (!confirm('确定要从团队中移除此成员吗？')) return;
    try {
      if (!selectedTeam) return;
      await removeTeamMember(selectedTeam._id, userId);
      await loadTeamMembers(selectedTeam._id);
      await loadUsers();
      await loadTeams();
      toast({ title: '移除成员成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleChangeOwner = async (newOwnerId: string) => {
    try {
      if (!selectedTeam) return;

      await updateUser(newOwnerId, { isTeamOwner: true } as User);

      if (selectedTeam.ownerId._id !== newOwnerId) {
        await updateUser(selectedTeam.ownerId._id, { isTeamOwner: false } as User);
      }

      await loadUsers();
      await loadTeams();
      await loadTeamMembers(selectedTeam._id);
      setIsOwnerModalOpen(false);
      toast({ title: '更换所有者成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const filteredMembers = teamMembers.filter((member) =>
    member.userId?.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ProtectedRoute>
      <Layout title="团队管理">
        <Box bg="myGray.50" minH="100%" mx={-4} mt={-4} p={4}>
          <Flex gap={4} h="calc(100vh - 200px)">
            {/* 左侧：团队列表 */}
            <Box
              w="300px"
              bg="white"
              borderRadius="lg"
              boxShadow="sm"
              px={5}
              py={4}
              overflowY="auto"
            >
              <Flex justify="space-between" align="center" mb={4}>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<MyIcon name="common/addLight" w="14px" h="14px" />}
                  onClick={() => {
                    setCurrentTeam(undefined);
                    setIsTeamModalOpen(true);
                  }}
                >
                  新建
                </Button>
              </Flex>
              <Divider mb={4} borderColor="borderColor.low" />
              <VStack spacing={2} align="stretch">
                {teams.map((team) => (
                  <Box
                    key={team._id}
                    p={3}
                    borderWidth="1px"
                    borderRadius="md"
                    cursor="pointer"
                    bg={selectedTeam?._id === team._id ? 'primary.50' : 'transparent'}
                    borderColor={selectedTeam?._id === team._id ? 'primary.600' : 'borderColor.low'}
                    _hover={{ bg: 'myGray.50' }}
                    transition="all 0.2s"
                    onClick={() => setSelectedTeam(team)}
                  >
                    <Flex justify="space-between" align="center">
                      <Box flex={1}>
                        <Text fontWeight="600" mb={1} color="myGray.900">
                          {team.name}
                        </Text>
                        <Text fontSize="xs" color="myGray.500">
                          所有者: {team.ownerId?.username}
                        </Text>
                      </Box>
                      <HStack spacing={1}>
                        <MyIcon
                          name="common/edit"
                          w="14px"
                          h="14px"
                          color="myGray.400"
                          cursor="pointer"
                          _hover={{ color: 'primary.600' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentTeam(team);
                            setIsTeamModalOpen(true);
                          }}
                        />
                        {team.ownerId?.username !== 'root' && (
                          <MyIcon
                            name="common/trash"
                            w="14px"
                            h="14px"
                            color="myGray.400"
                            cursor="pointer"
                            _hover={{ color: 'red.600' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTeam(team._id);
                            }}
                          />
                        )}
                      </HStack>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            </Box>

            {/* 右侧：团队成员列表 */}
            <Box
              flex={1}
              bg="white"
              borderRadius="lg"
              boxShadow="sm"
              px={5}
              py={4}
              overflowY="auto"
            >
              {selectedTeam ? (
                <>
                  <Flex justify="space-between" align="center" mb={4}>
                    <Text fontSize="lg" fontWeight="600" color="myGray.900">
                      {selectedTeam.name} - 成员管理
                    </Text>
                    <HStack>
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<MyIcon name="common/addUser" w="14px" h="14px" />}
                        onClick={() => setIsAddMemberModalOpen(true)}
                      >
                        添加成员
                      </Button>
                      <Button
                        size="sm"
                        variant="primaryOutline"
                        leftIcon={<MyIcon name="common/refresh" w="14px" h="14px" />}
                        onClick={() => setIsOwnerModalOpen(true)}
                      >
                        更换所有者
                      </Button>
                    </HStack>
                  </Flex>

                  <Box mb={4}>
                    <Flex
                      align="center"
                      bg="myGray.50"
                      borderRadius="md"
                      border="1px"
                      borderColor="borderColor.low"
                      px={3}
                    >
                      <MyIcon name="common/searchLight" w="16px" h="16px" color="myGray.400" />
                      <Input
                        placeholder="搜索成员用户名..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        border="none"
                        bg="transparent"
                        _focus={{ boxShadow: 'none' }}
                      />
                    </Flex>
                  </Box>

                  <Divider mb={4} borderColor="borderColor.low" />

                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                          用户
                        </Th>
                        <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                          角色
                        </Th>
                        <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                          状态
                        </Th>
                        <Th
                          color="myGray.500"
                          fontSize="xs"
                          fontWeight="500"
                          textTransform="none"
                          isNumeric
                        >
                          余额
                        </Th>
                        <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                          分成比例
                        </Th>
                        <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                          时区
                        </Th>
                        <Th
                          color="myGray.500"
                          fontSize="xs"
                          fontWeight="500"
                          textTransform="none"
                          textAlign="right"
                        >
                          操作
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredMembers.map((member) => {
                        const user = users.find((u) => u._id === member.userId?._id);
                        return (
                          <Tr key={member._id} _hover={{ bg: 'myGray.50' }}>
                            <Td>
                              <HStack spacing={3}>
                                <Avatar
                                  name={member.userId?.username}
                                  src={user?.avatar}
                                  size="sm"
                                />
                                <Text fontWeight="500" color="myGray.900">
                                  {member.userId?.username || '未知'}
                                </Text>
                              </HStack>
                            </Td>
                            <Td>
                              <HStack spacing={1}>
                                <Box
                                  w="6px"
                                  h="6px"
                                  borderRadius="full"
                                  bg={member.role === 'owner' ? 'adora.600' : 'myGray.400'}
                                />
                                <Text
                                  fontSize="sm"
                                  color={member.role === 'owner' ? 'adora.600' : 'myGray.600'}
                                >
                                  {member.role === 'owner' ? '所有者' : '成员'}
                                </Text>
                              </HStack>
                            </Td>
                            <Td>
                              <HStack spacing={1}>
                                <Box
                                  w="6px"
                                  h="6px"
                                  borderRadius="full"
                                  bg={user?.status === 'active' ? 'green.500' : 'myGray.400'}
                                />
                                <Text
                                  fontSize="sm"
                                  color={user?.status === 'active' ? 'green.600' : 'myGray.500'}
                                >
                                  {user?.status === 'active' ? '活跃' : '未激活'}
                                </Text>
                              </HStack>
                            </Td>
                            <Td isNumeric color="myGray.700">
                              {user?.balance ? user.balance.toLocaleString() : '0'}
                            </Td>
                            <Td color="myGray.700">{user?.promotionRate ?? 0}%</Td>
                            <Td fontSize="sm" color="myGray.500">
                              {user?.timezone || '-'}
                            </Td>
                            <Td textAlign="right">
                              <HStack spacing={2} justify="flex-end">
                                {member.userId?.username !== 'root' && member.role !== 'owner' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    color="red.600"
                                    leftIcon={<MyIcon name="common/closeLight" w="14px" h="14px" />}
                                    onClick={() =>
                                      member.userId?._id &&
                                      handleRemoveMemberFromTeam(member.userId._id)
                                    }
                                  >
                                    移除
                                  </Button>
                                )}
                              </HStack>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </>
              ) : (
                <Flex h="full" align="center" justify="center">
                  <Text color="myGray.400" fontSize="lg">
                    请选择一个团队查看成员
                  </Text>
                </Flex>
              )}
            </Box>
          </Flex>

          {/* 团队模态框 */}
          {isTeamModalOpen && (
            <Modal onClose={() => setIsTeamModalOpen(false)}>
              <Text fontSize="lg" fontWeight="600" color="myGray.900" mb={4}>
                {currentTeam ? '编辑团队' : '创建团队'}
              </Text>
              <TeamForm
                team={currentTeam}
                users={users}
                onSubmit={currentTeam ? handleUpdateTeam : handleAddTeam}
              />
            </Modal>
          )}

          {/* 添加成员模态框 */}
          {isAddMemberModalOpen && (
            <Modal onClose={() => setIsAddMemberModalOpen(false)}>
              <Text fontSize="lg" fontWeight="600" color="myGray.900" mb={4}>
                添加团队成员
              </Text>
              <AddMemberForm
                users={users}
                existingMembers={teamMembers}
                onSubmit={handleAddMemberToTeam}
              />
            </Modal>
          )}

          {/* 更换所有者模态框 */}
          {isOwnerModalOpen && (
            <Modal onClose={() => setIsOwnerModalOpen(false)}>
              <Text fontSize="lg" fontWeight="600" color="myGray.900" mb={4}>
                更换团队所有者
              </Text>
              <ChangeOwnerForm
                teamMembers={teamMembers}
                currentOwnerId={selectedTeam?.ownerId._id}
                onSubmit={handleChangeOwner}
              />
            </Modal>
          )}
        </Box>
      </Layout>
    </ProtectedRoute>
  );
}

// 简化的模态框组件
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="blackAlpha.600"
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        bg="white"
        borderRadius="lg"
        p={6}
        maxW="500px"
        w="full"
        maxH="90vh"
        overflow="auto"
        position="relative"
      >
        <MyIcon
          name="common/closeLight"
          w="20px"
          h="20px"
          cursor="pointer"
          color="myGray.400"
          position="absolute"
          top={4}
          right={4}
          onClick={onClose}
        />
        {children}
      </Box>
    </Box>
  );
}

// 表单组件
function TeamForm({
  team,
  users,
  onSubmit
}: {
  team?: Team;
  users: User[];
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: team?.name || '',
    ownerId: team?.ownerId?._id || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (team) {
      onSubmit({ name: formData.name });
    } else {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4}>
        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
            团队名称
          </FormLabel>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            bg="myGray.50"
            border="1px"
            borderColor="borderColor.low"
          />
        </FormControl>
        {!team && (
          <FormControl isRequired>
            <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
              选择所有者
            </FormLabel>
            <Box
              as="select"
              name="ownerId"
              value={formData.ownerId}
              onChange={handleChange}
              w="full"
              p={2}
              borderRadius="md"
              border="1px"
              borderColor="borderColor.low"
              bg="myGray.50"
            >
              <option value="">请选择所有者</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.username}
                </option>
              ))}
            </Box>
          </FormControl>
        )}
        <Button type="submit" variant="primary" width="full">
          {team ? '更新团队' : '创建团队'}
        </Button>
      </VStack>
    </form>
  );
}

function AddMemberForm({
  users,
  existingMembers,
  onSubmit
}: {
  users: User[];
  existingMembers: TeamMember[];
  onSubmit: (userId: string) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const existingUserIds = existingMembers
    .map((m) => m.userId?._id)
    .filter((id): id is string => !!id);
  const availableUsers = users.filter((u) => u._id && !existingUserIds.includes(u._id));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selectedUserId) onSubmit(selectedUserId);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4}>
        {availableUsers.length === 0 ? (
          <Text color="myGray.500">所有用户都已加入团队</Text>
        ) : (
          <>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                选择用户
              </FormLabel>
              <Box
                as="select"
                value={selectedUserId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedUserId(e.target.value)
                }
                w="full"
                p={2}
                borderRadius="md"
                border="1px"
                borderColor="borderColor.low"
                bg="myGray.50"
              >
                <option value="">选择要添加的用户</option>
                {availableUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.username}
                  </option>
                ))}
              </Box>
            </FormControl>
            <Button type="submit" variant="primary" width="full" isDisabled={!selectedUserId}>
              添加成员
            </Button>
          </>
        )}
      </VStack>
    </form>
  );
}

function ChangeOwnerForm({
  teamMembers,
  currentOwnerId,
  onSubmit
}: {
  teamMembers: TeamMember[];
  currentOwnerId?: string;
  onSubmit: (userId: string) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selectedUserId && selectedUserId !== currentOwnerId) {
      if (confirm('确定要更换团队所有者吗？此操作将转移团队的所有权。')) {
        onSubmit(selectedUserId);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4}>
        <FormControl isRequired>
          <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
            选择新的所有者
          </FormLabel>
          <Box
            as="select"
            value={selectedUserId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedUserId(e.target.value)
            }
            w="full"
            p={2}
            borderRadius="md"
            border="1px"
            borderColor="borderColor.low"
            bg="myGray.50"
          >
            <option value="">请选择新的所有者</option>
            {teamMembers.map((member) => (
              <option
                key={member._id}
                value={member.userId._id}
                disabled={member.userId._id === currentOwnerId}
              >
                {member.userId.username}
                {member.userId._id === currentOwnerId ? ' (当前所有者)' : ''}
              </option>
            ))}
          </Box>
        </FormControl>
        <Button
          type="submit"
          variant="primary"
          width="full"
          isDisabled={!selectedUserId || selectedUserId === currentOwnerId}
        >
          确认更换
        </Button>
      </VStack>
    </form>
  );
}
