import React from 'react';

type ConfigPerModalProps = {
  onChangeOwner?: (tmbId: string) => Promise<any>;
  hasParent?: boolean;
  refetchResource?: () => Promise<any>;
  isInheritPermission?: boolean;
  resumeInheritPermission?: () => Promise<any>;
  avatar?: string;
  name?: string;
  managePer?: {
    defaultRole?: any;
    permission?: any;
    onGetCollaboratorList?: () => Promise<any>;
    roleList?: any;
    onUpdateCollaborators?: (props: any) => Promise<any>;
    onDelOneCollaborator?: (props: any) => Promise<any>;
    refreshDeps?: any[];
  };
  onClose?: () => void;
  [key: string]: any;
};

const ConfigPerModal = ({ ...props }: ConfigPerModalProps) => null;
export default ConfigPerModal;
