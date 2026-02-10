import { supabase } from "./db";
import { User } from "@/types/user";
import { getSupabaseClient } from "@/models/db";

export async function insertUser(user: User): Promise<User> {
  console.log("[DB] Inserting new user into Supabase...");
  console.log("[DB] User data:", {
    uuid: user.uuid,
    email: user.email,
    nickname: user.nickname,
    signin_provider: user.signin_provider
  });

  const { data, error } = await supabase
    .from("users")
    .insert([user])
    .select()
    .single();

  if (error) {
    console.error("[DB] ❌ Error inserting user:", error);
    console.error("[DB] Error code:", error.code);
    console.error("[DB] Error message:", error.message);
    console.error("[DB] Error details:", error.details);
    throw error;
  }

  console.log("[DB] ✅ User inserted successfully");
  console.log("[DB] Inserted user ID:", (data as any).id);
  console.log("[DB] Inserted user UUID:", (data as User).uuid);

  return data as User;
}

export async function findUserByEmail(email: string, provider?: string): Promise<User | null> {
  console.log("[DB] Finding user by email:", email, "provider:", provider || "any");

  let query = supabase.from("users").select("*").eq("email", email);

  if (provider) {
    query = query.eq("signin_provider", provider);
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") {
    console.error("[DB] Error finding user by email:", error);
    return null;
  }

  if (error && error.code === "PGRST116") {
    console.log("[DB] User not found (PGRST116)");
    return null;
  }

  if (data) {
    console.log("[DB] ✅ User found:", {
      uuid: (data as User).uuid,
      email: (data as User).email,
      created_at: (data as User).created_at
    });
  }

  return data as User | null;
}

export async function findUserByUuid(uuid: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("uuid", uuid)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error finding user by uuid:", error);
    return null;
  }

  return data as User | null;
}

export async function updateUser(uuid: string, updates: Partial<User>): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("uuid", uuid)
    .select()
    .single();

  if (error) {
    console.error("Error updating user:", error);
    return null;
  }

  return data as User;
}

export async function getUsersTotal(): Promise<number | undefined> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id");

  if (error) {
    return undefined;
  }

  return data?.length || 0;
}

export async function getUserCountByDate(
  startTime: string
): Promise<Map<string, number> | undefined> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("created_at")
    .gte("created_at", startTime)
    .order("created_at", { ascending: true });

  if (error) {
    return undefined;
  }

  // Group by date in memory since Supabase doesn't support GROUP BY directly
  const dateCountMap = new Map<string, number>();
  data.forEach((item: any) => {
    const date = item.created_at.split("T")[0];
    dateCountMap.set(date, (dateCountMap.get(date) || 0) + 1);
  });

  return dateCountMap;
}

export async function getUsers(
  page: number = 1,
  limit: number = 50
): Promise<User[]> {
  const supabase = getSupabaseClient();
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching users:", error);
    return [];
  }

  return data as User[];
}

export async function getUsersByUuids(uuids: string[]): Promise<User[]> {
  if (!uuids || uuids.length === 0) {
    return [];
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("uuid", uuids);

  if (error) {
    console.error("Error fetching users by uuids:", error);
    return [];
  }

  return data as User[];
}
