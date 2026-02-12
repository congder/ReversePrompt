// 此项目使用 NextAuth 进行身份验证，不再使用 Supabase Auth
// Supabase 现在仅作为数据库使用

// 如果需要直接操作 Supabase 数据库，可以使用以下方式：
// import { createClient } from '@supabase/supabase-js';
//
// export const createSupabaseClient = () => {
//   return createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//   );
// };

export const createSupabaseClient = () => {
  throw new Error('Supabase client not configured. This project uses NextAuth for authentication.');
};