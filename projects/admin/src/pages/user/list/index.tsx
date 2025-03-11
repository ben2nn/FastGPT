import React, { useState, useEffect, FormEvent } from 'react';
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
  Container,
  Heading
} from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/utils/i18n';

interface User {
  _id?: string;
  username: string;
  password: string;
  status: string;
  avatar?: string;
  balance: number;
  promotionRate: number;
  timezone: string;
}

// 定义组件props类型
interface UserFormProps {
  user?: User;
  onSubmit: (formData: User) => void;
}

const fetchUsers = async () => {
  const response = await fetch('/api/extend/user');
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
};

const addUser = async (userData: User) => {
  const response = await fetch('/api/extend/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('Failed to add user');
  return response.json();
};

const updateUser = async (userId: string, userData: User) => {
  const response = await fetch(`/api/extend/user/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!response.ok) throw new Error('Failed to update user');
  return response.json();
};

const deleteUser = async (userId: string) => {
  const response = await fetch(`/api/extend/user/${userId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete user');
  return response.json();
};

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | undefined>(undefined);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const fetchedUsers = await fetchUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      toast({
        title: '加载用户失败。',
        description: (error as any).message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleAddUser = async (userData: User) => {
    try {
      const newUser = await addUser(userData);
      setUsers([...users, newUser.user]);
      onClose();
      toast({
        title: '添加用户成功。',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: '添加用户失败。',
        description: (error as any).message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleUpdateUser = async (userData: User) => {
    try {
      if (!currentUser || !currentUser._id) {
        throw new Error('无效的用户ID');
      }
      const updatedUser = await updateUser(currentUser._id, userData);
      setUsers(users.map((user) => (user._id === updatedUser._id ? updatedUser : user)));
      onClose();
      toast({
        title: '更新用户成功。',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: '更新用户失败。',
        description: (error as any).message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
      setUsers(users.filter((user) => user._id !== userId));
      toast({
        title: '删除用户成功。',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: '删除用户失败。',
        description: (error as any).message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  const openAddModal = () => {
    setCurrentUser(undefined);
    onOpen();
  };

  const openEditModal = (user: User) => {
    setCurrentUser(user);
    onOpen();
  };

  return (
    <Container maxW="container.lg" py={8}>
      <Heading as="h1" mb={6} textAlign="center">
        用户管理
      </Heading>
      <Button onClick={openAddModal} colorScheme="blue" mb={4}>
        添加用户
      </Button>
      <Table variant="striped" colorScheme="teal">
        <Thead>
          <Tr>
            <Th>用户名</Th>
            <Th>状态</Th>
            <Th>余额</Th>
            <Th>分成比例</Th>
            <Th>时区</Th>
            <Th>操作</Th>
          </Tr>
        </Thead>
        <Tbody>
          {users.map((user) => (
            <Tr key={user._id}>
              <Td>{user.username}</Td>
              <Td>{user.status}</Td>
              <Td>{user.balance}</Td>
              <Td>{user.promotionRate}%</Td>
              <Td>{user.timezone}</Td>
              <Td>
                <HStack spacing={2}>
                  <Button size="sm" onClick={() => openEditModal(user)}>
                    编辑
                  </Button>
                  <Button size="sm" colorScheme="red" onClick={() => handleDeleteUser(user._id!)}>
                    删除
                  </Button>
                </HStack>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{currentUser ? '编辑用户' : '添加用户'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <UserForm
              user={currentUser}
              onSubmit={currentUser ? handleUpdateUser : handleAddUser}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}

function UserForm({ user, onSubmit }: UserFormProps) {
  const [formData, setFormData] = useState<User>(
    user || {
      username: '',
      password: '',
      status: 'active',
      balance: 100000,
      promotionRate: 10,
      timezone: 'Asia/Shanghai'
    }
  );

  // 处理表单字段变化
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'balance' || name === 'promotionRate' ? Number(value) : value
    }));
  };

  // 处理表单提交
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4}>
        <FormControl isRequired>
          <FormLabel>用户名</FormLabel>
          <Input name="username" value={formData.username} onChange={handleChange} />
        </FormControl>
        {!user && (
          <FormControl isRequired>
            <FormLabel>密码</FormLabel>
            <Input
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
            />
          </FormControl>
        )}
        <FormControl>
          <FormLabel>状态</FormLabel>
          <Select name="status" value={formData.status} onChange={handleChange}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel>余额</FormLabel>
          <Input name="balance" type="number" value={formData.balance} onChange={handleChange} />
        </FormControl>
        <FormControl>
          <FormLabel>分成比例 (%)</FormLabel>
          <Input
            name="promotionRate"
            type="number"
            value={formData.promotionRate}
            onChange={handleChange}
          />
        </FormControl>
        <FormControl>
          <FormLabel>时区</FormLabel>
          <Input name="timezone" value={formData.timezone} onChange={handleChange} />
        </FormControl>
        <Button type="submit" colorScheme="blue">
          {user ? '更新用户' : '添加用户'}
        </Button>
      </VStack>
    </form>
  );
}
