import React, { useState, useMemo, useRef } from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import Loading from '@fastgpt/web/components/common/MyLoading';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemoizedFn } from 'ahooks';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';

type DatasetItem = {
  _id: string;
  name: string;
  type: string;
  avatar?: string;
};

type TreeItem = DatasetItem & {
  open: boolean;
  children?: TreeItem[];
};

const ROOT_ID = 'root';

const DatasetTreeSelect = ({
  value,
  onChange,
  placeholder = '请选择知识库或文件夹',
  fetchList
}: {
  value?: string;
  onChange: (id: string, type: string) => void;
  placeholder?: string;
  fetchList: (parentId?: string | null) => Promise<DatasetItem[]>;
}) => {
  const [dataList, setDataList] = useState<TreeItem[]>([]);
  const [requestingIds, setRequestingIds] = useState<string[]>([]);
  const [currentSelected, setCurrentSelected] = useState<DatasetItem | null>(null);
  const onCloseRef = useRef<() => void>(() => {});

  const concatRoot = useMemo(() => {
    const root: TreeItem = {
      _id: ROOT_ID,
      name: '根目录',
      type: 'root',
      avatar: FolderImgUrl,
      open: true,
      children: dataList
    };
    return [root];
  }, [dataList]);

  const { runAsync: loadChildren } = useRequest((parentId: string) => {
    if (requestingIds.includes(parentId)) return Promise.reject(null);
    setRequestingIds((prev) => [...prev, parentId]);
    return fetchList(parentId).finally(() =>
      setRequestingIds((prev) => prev.filter((id) => id !== parentId))
    );
  }, {});

  const { loading } = useRequest(() => fetchList(null), {
    manual: false,
    onSuccess: (data) => {
      setDataList(data.map((item) => ({ ...item, open: false })));
    }
  });

  const selectedName = useMemo(() => {
    if (!value) return '根目录';
    const find = (items: TreeItem[]): string | undefined => {
      for (const item of items) {
        if (item._id === value) return item.name;
        if (item.children) {
          const found = find(item.children);
          if (found) return found;
        }
      }
    };
    return find(dataList) || value;
  }, [value, dataList]);

  const selectedAvatar = useMemo(() => {
    if (!value) return FolderImgUrl;
    const find = (items: TreeItem[]): string | undefined => {
      for (const item of items) {
        if (item._id === value) return item.avatar;
        if (item.children) {
          const found = find(item.children);
          if (found) return found;
        }
      }
    };
    return find(dataList);
  }, [value, dataList]);

  const Render = useMemoizedFn(({ list, index = 0 }: { list: TreeItem[]; index?: number }) => {
    return (
      <>
        {list.map((item) => {
          const isFolder = item.type === 'folder';
          const isLoading = requestingIds.includes(item._id);
          const isSelected = value === item._id;

          return (
            <Box key={item._id} _notLast={{ mb: 0.5 }}>
              <Flex
                alignItems="center"
                cursor="pointer"
                py={1.5}
                pl={index === 0 ? 2 : `${1.75 * (index - 1) + 0.5}rem`}
                pr={2}
                borderRadius="md"
                bg={isSelected ? 'primary.50' : 'transparent'}
                _hover={{ bg: isSelected ? 'primary.50' : 'myGray.50' }}
                onClick={async () => {
                  if (item._id === ROOT_ID) {
                    onChange('', '');
                    onCloseRef.current();
                    return;
                  }
                  if (isFolder) {
                    onChange(item._id, 'folder');
                    setCurrentSelected(item);
                    if (!item.children) {
                      const data = await loadChildren(item._id);
                      item.children = (data || []).map((child) => ({
                        ...child,
                        open: false
                      }));
                    }
                    item.open = !item.open;
                    setDataList([...dataList]);
                  } else {
                    onChange(item._id, 'dataset');
                    setCurrentSelected(item);
                    onCloseRef.current();
                  }
                }}
              >
                {index !== 0 && (
                  <Flex
                    alignItems="center"
                    justifyContent="center"
                    visibility={isFolder ? 'visible' : 'hidden'}
                    w="1.25rem"
                    h="1.25rem"
                    cursor="pointer"
                    borderRadius="xs"
                    flexShrink={0}
                    _hover={{ bg: 'rgba(31, 35, 41, 0.08)' }}
                  >
                    <MyIcon
                      name={isLoading ? 'common/loading' : 'common/rightArrowFill'}
                      w="14px"
                      color="myGray.500"
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <Avatar
                  ml={index !== 0 ? 2 : 0}
                  src={item.avatar || (isFolder ? FolderImgUrl : '/icon/logo.svg')}
                  w="1.25rem"
                  borderRadius="sm"
                />
                <Box fontSize="sm" ml={2} className="textEllipsis" flex={1}>
                  {item.name}
                </Box>
                {isSelected && (
                  <MyIcon name="common/tickFill" w="14px" color="primary.600" flexShrink={0} />
                )}
              </Flex>
              {item.children && item.open && (
                <Box mt={0.5}>
                  <Render list={item.children} index={index + 1} />
                </Box>
              )}
            </Box>
          );
        })}
      </>
    );
  });

  return (
    <Box flex={1}>
      <MyPopover
        placement="bottom"
        p={0}
        w="300px"
        trigger="click"
        hasArrow={false}
        closeOnBlur
        Trigger={
          <Button
            w="280px"
            bg="myGray.50"
            variant="whitePrimaryOutline"
            size="sm"
            fontSize="sm"
            px={3}
            outline="none"
            rightIcon={<MyIcon name="core/chat/chevronDown" w="1rem" color="myGray.500" />}
            iconSpacing={2}
            _active={{ transform: 'none' }}
            _hover={{ borderColor: 'primary.500' }}
            borderColor="myGray.200"
          >
            <Flex w="100%" alignItems="center" gap={1.5}>
              <Avatar src={selectedAvatar || '/icon/logo.svg'} w={4} borderRadius="sm" />
              <Text isTruncated>{selectedName}</Text>
            </Flex>
          </Button>
        }
      >
        {({ onClose }) => {
          onCloseRef.current = onClose;
          return (
            <Box minH="200px" maxH="50vh" overflow="auto" py={1}>
              {loading ? <Loading fixed={false} /> : <Render list={concatRoot} />}
            </Box>
          );
        }}
      </MyPopover>
    </Box>
  );
};

export default DatasetTreeSelect;
