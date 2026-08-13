"use client";

import { LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";

export function LoginForm() {
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setLoading(true);setError("");const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});const data=await response.json() as {error?:string};if(!response.ok){setError(data.error||"Não foi possível entrar.");setLoading(false);return}location.reload()}
  return <main className="login-page"><section className="login-brand"><div className="brand"><span className="brand-mark">B<span/></span><b>BookStage</b></div><div><p className="eyebrow">Operação centralizada</p><h1>Todo o modelo operacional de shows em um só lugar.</h1><p>Gestão comercial e operacional em um ambiente seguro para sua organização.</p></div><small>BookStage · Ambiente local</small></section><section className="login-panel"><form className="login-form" onSubmit={submit}><div className="login-heading"><h2>Acesse sua conta</h2><p>Entre com as credenciais do seu ambiente local.</p></div>{error&&<div className="login-error" role="alert">{error}</div>}<label>E-mail<div className="input-with-icon"><Mail/><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required/></div></label><label>Senha<div className="input-with-icon"><LockKeyhole/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha" required/></div></label><button className="button button-primary login-submit" disabled={loading}>{loading?"Entrando…":"Entrar"}</button></form></section></main>
}
