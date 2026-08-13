import type { Metadata } from "next";
import { currentUser } from "./lib/request-context";
import { BookStageApp } from "./bookstage-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BookStage — Operação de shows", description: "Todo o modelo operacional de shows em um só lugar." };

export default async function Home() {
  const user = await currentUser();
  if (!user) return <main className="center"><section className="auth-card"><span className="brand-mark">B</span><h1>BookStage</h1><p>Entre para acessar o ambiente da sua organização.</p><a className="primary" href="/signin-with-chatgpt?return_to=%2F">Entrar com ChatGPT</a></section></main>;
  return <BookStageApp user={user} isDevelopment={process.env.NODE_ENV !== "production"} />;
}
