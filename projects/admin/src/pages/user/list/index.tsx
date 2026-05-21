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
  Divider,
  useColorModeValue,
  Avatar
} from '@chakra-ui/react';
import { AddIcon, EditIcon } from '@chakra-ui/icons';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import type { User } from '@/types/user';
import { fetchUsers, addUser, updateUser, deleteUser } from '@/web/core/extend/api';
import Layout from '@/web/context/Layout';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

export default function UserManagement({ ssrAuthenticated }: { ssrAuthenticated?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | undefined>(undefined);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleAddUser = async (userData: User) => {
    try {
      await addUser(userData);
      await loadUsers();
      onClose();
      toast({ title: '添加用户成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleUpdateUser = async (userData: User) => {
    try {
      if (!currentUser?._id) throw new Error('无效的用户ID');
      await updateUser(currentUser._id, userData);
      await loadUsers();
      onClose();
      toast({ title: '更新用户成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('确定要删除此用户吗？')) return;
    try {
      await deleteUser(userId);
      await loadUsers();
      toast({ title: '删除用户成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const handleEditUser = (user: User) => {
    setCurrentUser(user);
    onOpen();
  };

  const handleChangePassword = async (newPassword: string) => {
    try {
      await updateUser(passwordUserId, { password: newPassword } as User);
      await loadUsers();
      setIsPasswordModalOpen(false);
      setPasswordUserId('');
      toast({ title: '密码修改成功', status: 'success', duration: 2000 });
    } catch (error) {
      toast({ title: (error as Error).message, status: 'error', duration: 3000 });
    }
  };

  const filteredUsers = users.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ProtectedRoute ssrAuthenticated={ssrAuthenticated}>
      <Layout title="用户管理">
        <Box bg={bgColor} borderWidth="1px" borderColor={borderColor} borderRadius="md" p={6}>
          <Flex justify="space-between" align="center" mb={6}>
            <Text fontSize="2xl" fontWeight="600">
              用户列表
            </Text>
            <Button
              leftIcon={<AddIcon />}
              colorScheme="blue"
              onClick={() => {
                setCurrentUser(undefined);
                onOpen();
              }}
            >
              添加用户
            </Button>
          </Flex>

          <Box mb={4}>
            <Input
              placeholder="搜索用户名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="lg"
            />
          </Box>

          <Divider mb={6} />

          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>用户</Th>
                <Th>状态</Th>
                <Th isNumeric>余额</Th>
                <Th>分成比例</Th>
                <Th>时区</Th>
                <Th textAlign="right">操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredUsers.map((user) => (
                <Tr key={user._id}>
                  <Td>
                    <HStack spacing={3}>
                      <Avatar name={user.username} src={user.avatar} size="sm" />
                      <Text fontWeight="500">{user.username}</Text>
                    </HStack>
                  </Td>
                  <Td>
                    <Badge colorScheme={user.status === 'active' ? 'green' : 'gray'}>
                      {user.status === 'active' ? '活跃' : '未激活'}
                    </Badge>
                  </Td>
                  <Td isNumeric>{user.balance ? user.balance.toLocaleString() : '0'}</Td>
                  <Td>{user.promotionRate ?? 0}%</Td>
                  <Td fontSize="sm" color="gray.600">
                    {user.timezone || '-'}
                  </Td>
                  <Td textAlign="right">
                    <HStack spacing={2} justify="flex-end">
                      <Button size="sm" variant="outline" onClick={() => handleEditUser(user)}>
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="purple"
                        onClick={() => {
                          setPasswordUserId(user._id!);
                          setIsPasswordModalOpen(true);
                        }}
                      >
                        密码
                      </Button>
                      {user.username !== 'root' && (
                        <Button
                          size="sm"
                          variant="outline"
                          colorScheme="red"
                          onClick={() => handleDeleteUser(user._id!)}
                        >
                          删除
                        </Button>
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>

        {/* 用户模态框 */}
        <Modal isOpen={isOpen} onClose={onClose} size="2xl">
          <ModalOverlay backdropFilter="blur(4px)" />
          <ModalContent maxW="900px">
            <ModalHeader fontSize="xl" fontWeight="700" borderBottomWidth="1px" pb={4}>
              {currentUser ? '✏️ 编辑用户信息' : '➕ 创建新用户'}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody py={6}>
              <UserForm
                user={currentUser}
                onSubmit={currentUser ? handleUpdateUser : handleAddUser}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* 密码模态框 */}
        <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} size="md">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>修改密码</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <PasswordForm onSubmit={handleChangePassword} />
            </ModalBody>
          </ModalContent>
        </Modal>
      </Layout>
    </ProtectedRoute>
  );
}

// 表单组件
function PasswordForm({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 4) {
      setError('密码长度至少为 4 位');
      return;
    }
    onSubmit(password);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4}>
        <FormControl isRequired>
          <FormLabel>新密码</FormLabel>
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>确认密码</FormLabel>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError('');
            }}
          />
        </FormControl>
        {error && (
          <Text color="red.500" fontSize="sm">
            {error}
          </Text>
        )}
        <Button type="submit" colorScheme="blue" width="full">
          确认修改
        </Button>
      </VStack>
    </form>
  );
}

interface UserFormProps {
  user?: User;
  onSubmit: (data: User) => void;
}

function UserForm({ user, onSubmit }: UserFormProps) {
  const [formData, setFormData] = useState<User>(
    user || {
      username: '',
      password: '',
      status: 'active',
      avatar: '',
      balance: 100000,
      promotionRate: 10,
      timezone: DEFAULT_TIMEZONE
    }
  );

  const bgColor = useColorModeValue('gray.50', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // 可用的头像列表
  const avatarOptions = [
    { name: '蓝色', path: '/imgs/avatar/BlueAvatar.svg' },
    { name: '亮蓝色', path: '/imgs/avatar/BrightBlueAvatar.svg' },
    { name: '绿色', path: '/imgs/avatar/GreenAvatar.svg' },
    { name: '橙色', path: '/imgs/avatar/OrangeAvatar.svg' },
    { name: '紫色', path: '/imgs/avatar/PurpleAvatar.svg' },
    { name: '红色', path: '/imgs/avatar/RedAvatar.svg' },
    { name: '皇家蓝', path: '/imgs/avatar/RoyalBlueAvatar.svg' },
    { name: '青色', path: '/imgs/avatar/TealAvatar.svg' },
    { name: '灰色现代', path: '/imgs/avatar/GrayModernAvatar.svg' },
    { name: 'Adora', path: '/imgs/avatar/AdoraAvatar.svg' }
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'balance' || name === 'promotionRate' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={6} align="stretch">
        {/* 头像选择区域 */}
        <Box>
          <Text fontSize="md" fontWeight="600" mb={3} color="gray.700">
            头像设置
          </Text>
          <VStack
            spacing={4}
            p={4}
            bg={bgColor}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
          >
            <Flex w="full" gap={6} align="flex-start">
              <VStack spacing={2}>
                <Text fontSize="sm" fontWeight="500" color="gray.600">
                  当前头像
                </Text>
                <Avatar
                  name={formData.username}
                  src={formData.avatar}
                  size="xl"
                  borderWidth="2px"
                  borderColor="blue.400"
                />
              </VStack>

              <Box flex={1}>
                <Text fontSize="sm" fontWeight="500" mb={3} color="gray.600">
                  选择头像（点击切换）
                </Text>
                <Flex wrap="wrap" gap={3}>
                  {avatarOptions.map((avatar) => (
                    <Box
                      key={avatar.path}
                      cursor="pointer"
                      p={2}
                      borderWidth="2px"
                      borderRadius="lg"
                      borderColor={formData.avatar === avatar.path ? 'blue.500' : 'transparent'}
                      bg={formData.avatar === avatar.path ? 'blue.50' : 'transparent'}
                      _hover={{
                        borderColor: 'blue.400',
                        transform: 'scale(1.05)',
                        shadow: 'md'
                      }}
                      transition="all 0.2s"
                      onClick={() => setFormData((prev) => ({ ...prev, avatar: avatar.path }))}
                      title={avatar.name}
                    >
                      <Avatar src={avatar.path} size="sm" />
                    </Box>
                  ))}
                </Flex>
              </Box>
            </Flex>
          </VStack>
        </Box>

        {/* 基本信息区域 */}
        <Box>
          <Text fontSize="md" fontWeight="600" mb={3} color="gray.700">
            基本信息
          </Text>
          <VStack
            spacing={4}
            p={4}
            bg={bgColor}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
          >
            <HStack spacing={4} w="full">
              <FormControl flex={1} isRequired>
                <FormLabel fontSize="sm" fontWeight="500">
                  用户名
                </FormLabel>
                <Input
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="请输入用户名"
                  size="md"
                />
              </FormControl>
              {!user && (
                <FormControl flex={1} isRequired>
                  <FormLabel fontSize="sm" fontWeight="500">
                    密码
                  </FormLabel>
                  <Input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="请输入密码（至少4位）"
                    size="md"
                  />
                </FormControl>
              )}
            </HStack>

            <HStack spacing={4} w="full">
              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500">
                  状态
                </FormLabel>
                <Select name="status" value={formData.status} onChange={handleChange} size="md">
                  <option value="active">✓ 活跃</option>
                  <option value="inactive">✗ 未激活</option>
                </Select>
              </FormControl>

              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500">
                  时区
                </FormLabel>
                <Input
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  placeholder="例如: Asia/Shanghai"
                  size="md"
                />
              </FormControl>
            </HStack>
            <HStack spacing={4} w="full">
              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500">
                  <HStack spacing={2}>
                    <Text>账户余额</Text>
                    <Badge colorScheme="green" fontSize="xs">
                      积分
                    </Badge>
                  </HStack>
                </FormLabel>
                <Input
                  name="balance"
                  type="number"
                  value={formData.balance}
                  onChange={handleChange}
                  size="md"
                  placeholder="0"
                />
              </FormControl>

              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500">
                  <HStack spacing={2}>
                    <Text>分成比例</Text>
                    <Badge colorScheme="purple" fontSize="xs">
                      %
                    </Badge>
                  </HStack>
                </FormLabel>
                <Input
                  name="promotionRate"
                  type="number"
                  value={formData.promotionRate}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  size="md"
                  placeholder="0-100"
                />
              </FormControl>
            </HStack>
          </VStack>
        </Box>

        {/* 提交按钮 */}
        <Divider />
        <HStack spacing={3} justify="flex-end">
          <Button
            type="submit"
            colorScheme="blue"
            size="lg"
            px={8}
            leftIcon={user ? <EditIcon /> : <AddIcon />}
          >
            {user ? '保存更新' : '创建用户'}
          </Button>
        </HStack>
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
