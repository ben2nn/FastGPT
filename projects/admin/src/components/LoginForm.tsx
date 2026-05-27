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
      <VStack spacing={5}>
        <FormControl isInvalid={!!errors.username} isRequired>
          <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
            用户名
          </FormLabel>
          <Input
            size="lg"
            placeholder="请输入用户名"
            disabled={loading}
            bg="myGray.50"
            border="1px"
            borderColor="borderColor.low"
            _focus={{
              borderColor: 'primary.600',
              boxShadow: '0 0 0 1px var(--chakra-colors-primary-600)'
            }}
            {...register('username', {
              required: '请输入用户名'
            })}
          />
          <FormErrorMessage>{errors.username?.message}</FormErrorMessage>
        </FormControl>

        <FormControl isInvalid={!!errors.password} isRequired>
          <FormLabel fontSize="sm" fontWeight="500" color="myGray.700">
            密码
          </FormLabel>
          <Input
            type="password"
            size="lg"
            placeholder="请输入密码"
            disabled={loading}
            bg="myGray.50"
            border="1px"
            borderColor="borderColor.low"
            _focus={{
              borderColor: 'primary.600',
              boxShadow: '0 0 0 1px var(--chakra-colors-primary-600)'
            }}
            {...register('password', {
              required: '请输入密码'
            })}
          />
          <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
        </FormControl>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          width="full"
          isLoading={loading}
          loadingText="登录中..."
          mt={2}
        >
          登录
        </Button>
      </VStack>
    </form>
  );
};

export default LoginForm;
