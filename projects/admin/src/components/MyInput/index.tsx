import React from 'react';
import { Input, type InputProps } from '@chakra-ui/react';

type MyInputProps = InputProps & {
  leftIcon?: React.ReactNode;
};

const MyInput = React.forwardRef<HTMLInputElement, MyInputProps>(({ leftIcon, ...props }, ref) => (
  <Input ref={ref} bg={'myGray.50'} {...props} />
));
MyInput.displayName = 'MyInput';
export default MyInput;
