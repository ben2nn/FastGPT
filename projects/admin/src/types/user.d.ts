export interface User {
  _id?: string;
  username: string;
  password: string;
  status: string;
  avatar?: string;
  balance: number;
  promotionRate: number;
  timezone: string;
  teamId?: string;
  isTeamOwner?: boolean;
}

export interface Team {
  _id: string;
  name: string;
  ownerId: {
    _id: string;
    username: string;
  };
  createdAt?: string;
}

export interface UserFormProps {
  user?: User;
  team?: Team;
  teams?: Team[];
  selectedTeam?: Team | null;
  onSubmit: (formData: User) => void;
}
