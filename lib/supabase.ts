import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

// 创建客户端组件可用的Supabase客户端
export const createSupabaseClient = (): SupabaseClient => {
  return createClientComponentClient({
    options: {
      auth: {
        persistSession: true, // 持久化登录会话
      },
    },
  });
};

// 服务端组件专用客户端（可选）
// import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
// import { cookies } from 'next/headers';
// export const createSupabaseServerClient = () => {
//   return createServerComponentClient({ cookies });
// };