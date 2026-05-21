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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Select,
  Flex,
  Text,
  Badge,
  IconButton,
  Divider,
  useColorModeValue,
  Avatar
} from '@chakra-ui/react';
import { AddIcon, EditIcon, DeleteIcon } from '@chakra-ui/icons';
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

export default function TeamManagement({ ssrAuthenticated }: { ssrAuthenticated?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    isOpen: isTeamModalOpen,
    onOpen: onTeamModalOpen,
    onClose: onTeamModalClose
  } = useDisclosure();
  const {
    isOpen: isAddMemberModalOpen,
    onOpen: onAddMemberModalOpen,
    onClose: onAddMemberModalClose
  } = useDisclosure();
  const {
    isOpen: isOwnerModalOpen,
    onOpen: onOwnerModalOpen,
    onClose: onOwnerModalClose
  } = useDisclosure();

  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

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
      onTeamModalClose();
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
      onTeamModalClose();
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
      onAddMemberModalClose();
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

      // 更新新所有者
      await updateUser(newOwnerId, { isTeamOwner: true } as User);

      // 更新旧所有者
      if (selectedTeam.ownerId._id !== newOwnerId) {
        await updateUser(selectedTeam.ownerId._id, { isTeamOwner: false } as User);
      }

      await loadUsers();
      await loadTeams();
      await loadTeamMembers(selectedTeam._id);
      onOwnerModalClose();
      toast({ title: '更换所有者成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const filteredMembers = teamMembers.filter((member) =>
    member.userId?.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ProtectedRoute ssrAuthenticated={ssrAuthenticated}>
      <Layout title="团队管理">
        <Flex gap={4} h="calc(100vh - 200px)">
          {/* 左侧：团队列表 */}
          <Box
            w="300px"
            bg={bgColor}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            p={4}
            overflowY="auto"
          >
            <Flex justify="space-between" align="center" mb={4}>
              <Text fontSize="lg" fontWeight="600">
                团队列表
              </Text>
              <Button
                size="sm"
                leftIcon={<AddIcon />}
                colorScheme="blue"
                onClick={() => {
                  setCurrentTeam(undefined);
                  onTeamModalOpen();
                }}
              >
                新建
              </Button>
            </Flex>
            <Divider mb={4} />
            <VStack spacing={2} align="stretch">
              {teams.map((team) => (
                <Box
                  key={team._id}
                  p={3}
                  borderWidth="1px"
                  borderRadius="md"
                  cursor="pointer"
                  bg={selectedTeam?._id === team._id ? 'blue.50' : 'transparent'}
                  borderColor={selectedTeam?._id === team._id ? 'blue.500' : borderColor}
                  _hover={{ bg: 'gray.50' }}
                  onClick={() => setSelectedTeam(team)}
                >
                  <Flex justify="space-between" align="center">
                    <Box flex={1}>
                      <Text fontWeight="600" mb={1}>
                        {team.name}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        所有者: {team.ownerId?.username}
                      </Text>
                    </Box>
                    <HStack spacing={1}>
                      <IconButton
                        aria-label="编辑"
                        icon={<EditIcon />}
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentTeam(team);
                          onTeamModalOpen();
                        }}
                      />
                      {team.ownerId?.username !== 'root' && (
                        <IconButton
                          aria-label="删除"
                          icon={<DeleteIcon />}
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
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
            bg={bgColor}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            p={4}
            overflowY="auto"
          >
            {selectedTeam ? (
              <>
                <Flex justify="space-between" align="center" mb={4}>
                  <Text fontSize="lg" fontWeight="600">
                    {selectedTeam.name} - 成员管理
                  </Text>
                  <HStack>
                    <Button
                      size="sm"
                      leftIcon={<AddIcon />}
                      colorScheme="green"
                      onClick={onAddMemberModalOpen}
                    >
                      添加成员
                    </Button>
                    <Button size="sm" colorScheme="purple" onClick={onOwnerModalOpen}>
                      更换所有者
                    </Button>
                  </HStack>
                </Flex>

                <Box mb={4}>
                  <Input
                    placeholder="搜索成员用户名..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </Box>

                <Divider mb={4} />

                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>用户</Th>
                      <Th>角色</Th>
                      <Th>状态</Th>
                      <Th isNumeric>余额</Th>
                      <Th>分成比例</Th>
                      <Th>时区</Th>
                      <Th textAlign="right">操作</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filteredMembers.map((member) => {
                      const user = users.find((u) => u._id === member.userId?._id);
                      return (
                        <Tr key={member._id}>
                          <Td>
                            <HStack spacing={3}>
                              <Avatar name={member.userId?.username} src={user?.avatar} size="sm" />
                              <Text fontWeight="500">{member.userId?.username || '未知'}</Text>
                            </HStack>
                          </Td>
                          <Td>
                            <Badge colorScheme={member.role === 'owner' ? 'purple' : 'gray'}>
                              {member.role === 'owner' ? '所有者' : '成员'}
                            </Badge>
                          </Td>
                          <Td>
                            <Badge colorScheme={user?.status === 'active' ? 'green' : 'gray'}>
                              {user?.status === 'active' ? '活跃' : '未激活'}
                            </Badge>
                          </Td>
                          <Td isNumeric>{user?.balance ? user.balance.toLocaleString() : '0'}</Td>
                          <Td>{user?.promotionRate ?? 0}%</Td>
                          <Td fontSize="sm" color="gray.600">
                            {user?.timezone || '-'}
                          </Td>
                          <Td textAlign="right">
                            <HStack spacing={2} justify="flex-end">
                              {member.userId?.username !== 'root' && member.role !== 'owner' && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  colorScheme="red"
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
                <Text color="gray.500" fontSize="lg">
                  请选择一个团队查看成员
                </Text>
              </Flex>
            )}
          </Box>
        </Flex>

        {/* 团队模态框 */}
        <Modal isOpen={isTeamModalOpen} onClose={onTeamModalClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{currentTeam ? '编辑团队' : '创建团队'}</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <TeamForm
                team={currentTeam}
                users={users}
                onSubmit={currentTeam ? handleUpdateTeam : handleAddTeam}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* 添加成员模态框 */}
        <Modal isOpen={isAddMemberModalOpen} onClose={onAddMemberModalClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>添加团队成员</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <AddMemberForm
                users={users}
                existingMembers={teamMembers}
                onSubmit={handleAddMemberToTeam}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* 更换所有者模态框 */}
        <Modal isOpen={isOwnerModalOpen} onClose={onOwnerModalClose} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>更换团队所有者</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <ChangeOwnerForm
                teamMembers={teamMembers}
                currentOwnerId={selectedTeam?.ownerId._id}
                onSubmit={handleChangeOwner}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      </Layout>
    </ProtectedRoute>
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
          <FormLabel>团队名称</FormLabel>
          <Input name="name" value={formData.name} onChange={handleChange} />
        </FormControl>
        {!team && (
          <FormControl isRequired>
            <FormLabel>选择所有者</FormLabel>
            <Select
              name="ownerId"
              value={formData.ownerId}
              onChange={handleChange}
              placeholder="请选择所有者"
            >
              {users.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.username}
                </option>
              ))}
            </Select>
          </FormControl>
        )}
        <Button type="submit" colorScheme="blue" width="full">
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
          <Text color="gray.500">所有用户都已加入团队</Text>
        ) : (
          <>
            <FormControl isRequired>
              <FormLabel>选择用户</FormLabel>
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                placeholder="选择要添加的用户"
              >
                {availableUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.username}
                  </option>
                ))}
              </Select>
            </FormControl>
            <Button type="submit" colorScheme="blue" width="full" isDisabled={!selectedUserId}>
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
          <FormLabel>选择新的所有者</FormLabel>
          <Select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            placeholder="请选择新的所有者"
          >
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
          </Select>
        </FormControl>
        <Button
          type="submit"
          colorScheme="purple"
          width="full"
          isDisabled={!selectedUserId || selectedUserId === currentOwnerId}
        >
          确认更换
        </Button>
      </VStack>
    </form>
  );
}

export async function getServerSideProps(context: any) {
  try {
    const token = context.req.cookies?.admin_token;

    if (!token) {
      return {
        redirect: {
          destination: '/login',
          permanent: false
        }
      };
    }

    return {
      props: { ssrAuthenticated: true }
    };
  } catch (error) {
    console.error('getServerSideProps error:', error);
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    };
  }
}
