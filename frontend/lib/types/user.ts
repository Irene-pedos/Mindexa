export interface User {
  id: string;
  email: string;
  role: string;
  profile?: {
    first_name: string;
    last_name: string;
    display_name?: string;
    avatar_url?: string;
    staff_id?: string;
  };
}