import { cookies } from "next/headers";
import { sessionUser } from "./local-auth";

export type CurrentUser = { id: string; email: string; name: string };

export async function currentUser(): Promise<CurrentUser | null> {
  return sessionUser();
}

export async function activeOrganizationId() {
  return (await cookies()).get("bookstage_active_organization")?.value ?? null;
}
