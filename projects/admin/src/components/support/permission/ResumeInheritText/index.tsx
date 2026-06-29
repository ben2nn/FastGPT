import { Box, type BoxProps } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React from 'react';

const ResumeInherit = ({
  onResume,
  ...props
}: BoxProps & {
  onResume?: () => Promise<any> | any;
}) => {
  const { toast } = useToast();
  const { ConfirmModal: CommonConfirmModal, openConfirm: openCommonConfirm } = useConfirm({});

  return onResume ? (
    <Box display={'inline'} fontSize={'sm'} {...props}>
      未继承父级权限
      <Box
        display={'inline'}
        textDecoration={'underline'}
        cursor={'pointer'}
        _hover={{ color: 'primary.600' }}
        onClick={() => {
          openCommonConfirm({
            onConfirm: () =>
              onResume()?.then(() => {
                toast({
                  title: '已恢复继承父级权限',
                  status: 'success'
                });
              }),
            customContent: '确认恢复继承父级权限？'
          })();
        }}
      >
        点击恢复
      </Box>
      <CommonConfirmModal />
    </Box>
  ) : null;
};

export default ResumeInherit;
