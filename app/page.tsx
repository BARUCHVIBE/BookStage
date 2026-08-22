import type { Metadata } from "next";
import { BookStageApp } from "./bookstage-app";
import { LoginForm } from "./login-form";
import { currentUser } from "./lib/request-context";
import { appearanceBootScript } from "./lib/appearance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "BookStage — Operação de shows",
  description: "Todo o modelo operacional de shows em um só lugar.",
};

export default async function Home() {
  const user = await currentUser();
  if (!user) return <LoginForm />;
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: appearanceBootScript(user.id) }}
      />
      <BookStageApp user={user} />
    </>
  );
}
