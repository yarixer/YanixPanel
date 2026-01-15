// src/auth/auth.types.ts
export type AuthUser = {
  id: bigint;        // ID пользователя из БД
  isAdmin: boolean;  // флаг админа
  verified: boolean; // подтверждённый аккаунт
  ip?: string | null;
};
