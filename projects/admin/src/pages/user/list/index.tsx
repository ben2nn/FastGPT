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
  useDisclosure,
  useToast,
  Flex,
  Text,
  Divider,
  Avatar
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ProtectedRoute } from '@/web/context/ProtectedRoute';
import type { User } from '@/types/user';
import { fetchUsers, addUser, updateUser, deleteUser } from '@/web/core/extend/api';
import Layout from '@/web/context/Layout';
import { DEFAULT_TIMEZONE } from '@/web/common/constants';

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | undefined>(undefined);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

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
    <ProtectedRoute>
      <Layout title="用户管理">
        <Box bg="white" borderWidth="1px" borderColor="borderColor.low" borderRadius="lg" p={6}>
          <Flex justify="space-between" align="center" mb={6}>
            <Text fontSize="xl" fontWeight="600" color="myGray.900">
              用户列表
            </Text>
            <Button
              variant="primary"
              leftIcon={<MyIcon name="common/addLight" w="16px" h="16px" />}
              onClick={() => {
                setCurrentUser(undefined);
                onOpen();
              }}
            >
              添加用户
            </Button>
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
                placeholder="搜索用户名..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                border="none"
                bg="transparent"
                _focus={{ boxShadow: 'none' }}
              />
            </Flex>
          </Box>

          <Divider mb={6} borderColor="borderColor.low" />

          <Table variant="simple">
            <Thead>
              <Tr>
                <Th color="myGray.500" fontSize="xs" fontWeight="500" textTransform="none">
                  用户
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
              {filteredUsers.map((user) => (
                <Tr key={user._id} _hover={{ bg: 'myGray.50' }}>
                  <Td>
                    <HStack spacing={3}>
                      <Avatar name={user.username} src={user.avatar} size="sm" />
                      <Text fontWeight="500" color="myGray.900">
                        {user.username}
                      </Text>
                    </HStack>
                  </Td>
                  <Td>
                    <HStack spacing={1}>
                      <Box
                        w="8px"
                        h="8px"
                        borderRadius="full"
                        bg={user.status === 'active' ? 'green.500' : 'myGray.400'}
                      />
                      <Text
                        fontSize="sm"
                        color={user.status === 'active' ? 'green.600' : 'myGray.500'}
                      >
                        {user.status === 'active' ? '活跃' : '未激活'}
                      </Text>
                    </HStack>
                  </Td>
                  <Td isNumeric color="myGray.700">
                    {user.balance ? user.balance.toLocaleString() : '0'}
                  </Td>
                  <Td color="myGray.700">{user.promotionRate ?? 0}%</Td>
                  <Td fontSize="sm" color="myGray.500">
                    {user.timezone || '-'}
                  </Td>
                  <Td textAlign="right">
                    <HStack spacing={2} justify="flex-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        color="primary.600"
                        leftIcon={<MyIcon name="common/edit" w="14px" h="14px" />}
                        onClick={() => handleEditUser(user)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="adora.600"
                        leftIcon={<MyIcon name="common/lock" w="14px" h="14px" />}
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
                          variant="ghost"
                          color="red.600"
                          leftIcon={<MyIcon name="common/trash" w="14px" h="14px" />}
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
        {isOpen && (
          <UserModal
            user={currentUser}
            isOpen={isOpen}
            onClose={onClose}
            onSubmit={currentUser ? handleUpdateUser : handleAddUser}
          />
        )}

        {/* 密码模态框 */}
        {isPasswordModalOpen && (
          <PasswordModal
            isOpen={isPasswordModalOpen}
            onClose={() => setIsPasswordModalOpen(false)}
            onSubmit={handleChangePassword}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}

// 简化的模态框组件
function UserModal({
  user,
  isOpen,
  onClose,
  onSubmit
}: {
  user?: User;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: User) => void;
}) {
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

  if (!isOpen) return null;

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
      <Box bg="white" borderRadius="lg" p={6} maxW="500px" w="full" maxH="90vh" overflow="auto">
        <Flex justify="space-between" align="center" mb={4}>
          <Text fontSize="lg" fontWeight="600" color="myGray.900">
            {user ? '编辑用户' : '创建用户'}
          </Text>
          <MyIcon
            name="common/closeLight"
            w="20px"
            h="20px"
            cursor="pointer"
            color="myGray.400"
            onClick={onClose}
          />
        </Flex>
        <form onSubmit={handleSubmit}>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                用户名
              </FormLabel>
              <Input
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="请输入用户名"
                bg="myGray.50"
                border="1px"
                borderColor="borderColor.low"
              />
            </FormControl>
            {!user && (
              <FormControl isRequired>
                <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                  密码
                </FormLabel>
                <Input
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="请输入密码（至少4位）"
                  bg="myGray.50"
                  border="1px"
                  borderColor="borderColor.low"
                />
              </FormControl>
            )}
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                状态
              </FormLabel>
              <Box
                as="select"
                name="status"
                value={formData.status}
                onChange={handleChange}
                w="full"
                p={2}
                borderRadius="md"
                border="1px"
                borderColor="borderColor.low"
                bg="myGray.50"
              >
                <option value="active">活跃</option>
                <option value="inactive">未激活</option>
              </Box>
            </FormControl>
            <HStack spacing={4} w="full">
              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                  账户余额
                </FormLabel>
                <Input
                  name="balance"
                  type="number"
                  value={formData.balance}
                  onChange={handleChange}
                  bg="myGray.50"
                  border="1px"
                  borderColor="borderColor.low"
                />
              </FormControl>
              <FormControl flex={1}>
                <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                  分成比例 (%)
                </FormLabel>
                <Input
                  name="promotionRate"
                  type="number"
                  value={formData.promotionRate}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  bg="myGray.50"
                  border="1px"
                  borderColor="borderColor.low"
                />
              </FormControl>
            </HStack>
            <Divider />
            <HStack spacing={3} w="full" justify="flex-end">
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="primary">
                {user ? '保存' : '创建'}
              </Button>
            </HStack>
          </VStack>
        </form>
      </Box>
    </Box>
  );
}

// 密码修改模态框
function PasswordModal({
  isOpen,
  onClose,
  onSubmit
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
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

  if (!isOpen) return null;

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
      <Box bg="white" borderRadius="lg" p={6} maxW="400px" w="full">
        <Flex justify="space-between" align="center" mb={4}>
          <Text fontSize="lg" fontWeight="600" color="myGray.900">
            修改密码
          </Text>
          <MyIcon
            name="common/closeLight"
            w="20px"
            h="20px"
            cursor="pointer"
            color="myGray.400"
            onClick={onClose}
          />
        </Flex>
        <form onSubmit={handleSubmit}>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                新密码
              </FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                bg="myGray.50"
                border="1px"
                borderColor="borderColor.low"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
                确认密码
              </FormLabel>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                bg="myGray.50"
                border="1px"
                borderColor="borderColor.low"
              />
            </FormControl>
            {error && (
              <Text color="red.500" fontSize="sm">
                {error}
              </Text>
            )}
            <HStack spacing={3} w="full" justify="flex-end">
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="primary">
                确认修改
              </Button>
            </HStack>
          </VStack>
        </form>
      </Box>
    </Box>
  );
}
