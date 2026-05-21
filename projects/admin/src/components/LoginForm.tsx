import React from 'react';
import { VStack, FormControl, FormLabel, Input, Button, FormErrorMessage } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';

export interface LoginFormData {
  username: string;
  password: string;
}

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => Promise<void>;
  isLoading?: boolean;
}

const LoginForm = ({ onSubmit, isLoading = false }: LoginFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    defaultValues: {
      username: '',
      password: ''
    }
  });

  const loading = isLoading || isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <VStack spacing={4}>
        <FormControl isInvalid={!!errors.username} isRequired>
          <FormLabel>用户名</FormLabel>
          <Input
            size="lg"
            placeholder="请输入用户名"
            disabled={loading}
            {...register('username', {
              required: '请输入用户名'
            })}
          />
          <FormErrorMessage>{errors.username?.message}</FormErrorMessage>
        </FormControl>

        <FormControl isInvalid={!!errors.password} isRequired>
          <FormLabel>密码</FormLabel>
          <Input
            type="password"
            size="lg"
            placeholder="请输入密码"
            disabled={loading}
            {...register('password', {
              required: '请输入密码'
            })}
          />
          <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
        </FormControl>

        <Button
          type="submit"
          colorScheme="blue"
          size="lg"
          width="full"
          isLoading={loading}
          loadingText="登录中..."
          mt={4}
        >
          登录
        </Button>
      </VStack>
    </form>
  );
};

export default LoginForm;
