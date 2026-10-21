export interface User {
  id: string;
  email: string;
  role: string;
  duties?: string[];
  has_teaching_assignments?: boolean | null;
  profile?: {
    first_name: string;
    last_name: string;
    display_name?: string;
    avatar_url?: string;
    staff_id?: string;
  };
}