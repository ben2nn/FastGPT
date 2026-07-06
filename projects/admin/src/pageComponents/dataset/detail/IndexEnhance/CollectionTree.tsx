import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Text, Checkbox, Badge, Collapse, Spinner } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollections } from '@/web/core/dataset/api';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const CollectionTree = ({
  datasetId,
  selectedIds,
  selectAll,
  onToggleSelect,
  onToggleSelectAll
}: {
  datasetId: string;
  selectedIds: Set<string>;
  selectAll: boolean;
  onToggleSelect: React.Dispatch<React.SetStateAction<Set<string>>>;
  onToggleSelectAll: (selectAll: boolean) => void;
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<
    Record<string, { list: any[]; loading: boolean }>
  >({});

  const { data: rootData, isLoading: rootLoading } = useRequest(
    () => getDatasetCollections({ datasetId, parentId: '', pageSize: 200, pageNum: 1 }),
    { manual: false, refreshDeps: [datasetId] }
  );

  const formatItem = useCallback(
    (item: any) => ({
      ...item,
      icon: getCollectionIcon({ type: item.type, name: item.name }),
      isFolder: item.type === DatasetCollectionTypeEnum.folder
    }),
    []
  );

  const rootCollections = useMemo(
    () => (rootData?.list || []).map(formatItem),
    [rootData, formatItem]
  );

  const toggleExpand = useCallback(
    async (folderId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.has(folderId) ? next.delete(folderId) : next.add(folderId);
        return next;
      });
      if (!childrenCache[folderId]) {
        setChildrenCache((prev) => ({ ...prev, [folderId]: { list: [], loading: true } }));
        try {
          const res = await getDatasetCollections({
            datasetId,
            parentId: folderId,
            pageSize: 200,
            pageNum: 1
          });
          setChildrenCache((prev) => ({
            ...prev,
            [folderId]: { list: res.list || [], loading: false }
          }));
        } catch {
          setChildrenCache((prev) => ({
            ...prev,
            [folderId]: { list: [], loading: false }
          }));
        }
      }
    },
    [datasetId, childrenCache]
  );

  const toggleSelect = useCallback(
    (id: string) => {
      onToggleSelectAll(false);
      onToggleSelect((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    },
    [onToggleSelect, onToggleSelectAll]
  );

  const selectFolder = useCallback(
    async (folderId: string) => {
      onToggleSelectAll(false);

      if (!childrenCache[folderId]) {
        setChildrenCache((prev) => ({ ...prev, [folderId]: { list: [], loading: true } }));
        setExpandedIds((prev) => new Set(prev).add(folderId));
        try {
          const res = await getDatasetCollections({
            datasetId,
            parentId: folderId,
            pageSize: 200,
            pageNum: 1
          });
          setChildrenCache((prev) => ({
            ...prev,
            [folderId]: { list: res.list || [], loading: false }
          }));
          const fileIds = (res.list || [])
            .filter((c: any) => c.type !== DatasetCollectionTypeEnum.folder)
            .map((c: any) => c._id);
          onToggleSelect((prev) => {
            const next = new Set(prev);
            const allSelected = fileIds.length > 0 && fileIds.every((id: string) => next.has(id));
            if (allSelected) {
              fileIds.forEach((id: string) => next.delete(id));
            } else {
              fileIds.forEach((id: string) => next.add(id));
            }
            return next;
          });
        } catch {
          setChildrenCache((prev) => ({
            ...prev,
            [folderId]: { list: [], loading: false }
          }));
        }
        return;
      }

      const children = childrenCache[folderId]?.list || [];
      const fileIds = children
        .filter((c) => c.type !== DatasetCollectionTypeEnum.folder)
        .map((c) => c._id);
      onToggleSelect((prev) => {
        const next = new Set(prev);
        const allSelected = fileIds.length > 0 && fileIds.every((id: string) => next.has(id));
        if (allSelected) {
          fileIds.forEach((id: string) => next.delete(id));
        } else {
          fileIds.forEach((id: string) => next.add(id));
        }
        return next;
      });
    },
    [datasetId, childrenCache, onToggleSelect, onToggleSelectAll]
  );

  const renderNode = (item: any, depth: number = 0) => {
    const isFolder = item.isFolder;
    const isExpanded = expandedIds.has(item._id);
    const isSelected = selectedIds.has(item._id);
    const children = childrenCache[item._id]?.list?.map(formatItem) || [];
    const childLoading = childrenCache[item._id]?.loading;
    const childFileIds = children.filter((c: any) => !c.isFolder).map((c: any) => c._id);
    const allChildrenSelected =
      childFileIds.length > 0 && childFileIds.every((id: string) => selectedIds.has(id));
    const someChildrenSelected =
      childFileIds.some((id: string) => selectedIds.has(id)) && !allChildrenSelected;

    return (
      <React.Fragment key={item._id}>
        <Flex
          py={1.5}
          px={3}
          pl={3 + depth * 24}
          alignItems="center"
          mx={1}
          borderRadius="sm"
          _hover={{ bg: 'myGray.50' }}
          cursor="pointer"
          userSelect="none"
          bg={isSelected ? 'primary.50' : isFolder && allChildrenSelected ? 'blue.50' : undefined}
          onClick={() => (isFolder ? selectFolder(item._id) : toggleSelect(item._id))}
        >
          <Box
            onClick={(e) => {
              e.stopPropagation();
              if (isFolder) toggleExpand(item._id);
            }}
            w="24px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            mr={1}
          >
            {isFolder ? (
              <MyIcon
                name={isExpanded ? 'common/downArrowFill' : 'common/rightArrowLight'}
                w="12px"
                color="myGray.400"
              />
            ) : null}
          </Box>
          <Checkbox
            isChecked={isFolder ? allChildrenSelected : isSelected}
            isIndeterminate={isFolder ? someChildrenSelected : undefined}
            size="sm"
            mr={2}
            flexShrink={0}
            pointerEvents="none"
          />
          <MyIcon name={item.icon} w="16px" mr={2} color="myGray.500" flexShrink={0} />
          <Text
            fontSize="sm"
            fontWeight={isFolder ? '500' : '400'}
            color="myGray.800"
            className="textEllipsis"
            flex={1}
            minW={0}
          >
            {item.name}
          </Text>
          {!isFolder && (
            <Badge ml={2} colorScheme="blue" variant="subtle" fontSize="xs" flexShrink={0}>
              {item.dataAmount || 0}
            </Badge>
          )}
          {isFolder && childLoading && <Spinner size="xs" ml={2} />}
        </Flex>
        {isFolder && isExpanded && !childLoading && (
          <Collapse in={isExpanded} animateOpacity>
            {children.length > 0 ? (
              children.map((child: any) => renderNode(child, depth + 1))
            ) : (
              <Text fontSize="xs" color="myGray.400" py={2} pl={3 + (depth + 1) * 24 + 12 + 8}>
                空文件夹
              </Text>
            )}
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  const selectedCount = selectedIds.size;

  return (
    <Box flex={1} overflow="auto">
      {/* 选择范围标题 */}
      <Flex px={3} py={2} alignItems="center" borderBottom="1px solid" borderColor="myGray.100">
        <Text fontSize="sm" fontWeight="500" color="myGray.700">
          选择增强范围
        </Text>
        <Badge
          ml={2}
          colorScheme={selectAll ? 'orange' : selectedCount > 0 ? 'blue' : 'gray'}
          fontSize="xs"
          variant="subtle"
        >
          {selectAll ? '整个数据集' : selectedCount > 0 ? `已选 ${selectedCount} 个` : '未选择'}
        </Badge>
      </Flex>

      {/* 整个数据集 */}
      <Flex
        py={2}
        px={3}
        alignItems="center"
        borderBottom="1px solid"
        borderColor="myGray.100"
        bg={selectAll ? 'orange.50' : 'white'}
        cursor="pointer"
        userSelect="none"
        _hover={{ bg: selectAll ? 'orange.50' : 'myGray.50' }}
        onClick={() => onToggleSelectAll(!selectAll)}
      >
        <Checkbox
          isChecked={selectAll}
          onChange={() => onToggleSelectAll(!selectAll)}
          size="sm"
          mr={2}
        />
        <MyIcon name="core/dataset/commonDatasetOutline" w="16px" mr={2} color="orange.500" />
        <Text fontSize="sm" fontWeight="600" color="orange.700">
          增强整个数据集
        </Text>
        <Text fontSize="xs" color="myGray.400" ml={2}>
          包含所有子目录
        </Text>
      </Flex>

      {/* 树形目录 */}
      <Box>
        {rootLoading ? (
          <Flex justify="center" py={8}>
            <Spinner />
          </Flex>
        ) : rootCollections.length === 0 ? (
          <EmptyTip text="暂无数据" py={8} />
        ) : (
          rootCollections.map((item: any) => renderNode(item))
        )}
      </Box>
    </Box>
  );
};

export default React.memo(CollectionTree);
