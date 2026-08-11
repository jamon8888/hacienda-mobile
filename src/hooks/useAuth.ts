import { userId } from "@/utils/chat";

export function useAuth() {
  return {
    user: { id: userId },
  };
}
