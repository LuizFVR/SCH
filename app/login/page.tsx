import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { isDemoMode } from "../../lib/database";

const errorMessages: Record<string, string> = {
  invalid: "E-mail ou senha incorretos.",
  blocked: "Muitas tentativas sem sucesso. Aguarde 15 minutos e tente novamente.",
  unavailable: "O acesso está temporariamente indisponível. Tente novamente em alguns instantes.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <main className="login-page">
      <section className="login-brand">
        <div><span className="brand-mark brand-mark-light">VP</span><span>Voz do Paciente</span></div>
        <div><span>GESTÃO DA EXPERIÊNCIA</span><h1>Ouvir melhor para cuidar melhor.</h1><p>Indicadores, pesquisas e alertas de satisfação em um só lugar.</p></div>
        <small>Hospital principal · Ambiente interno</small>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" action="/api/auth/login" method="post">
          <span>ACESSO RESTRITO</span>
          <h2>Entre na sua conta</h2>
          <p>Use as credenciais fornecidas pelo administrador.</p>
          {errorMessage ? <div className="login-error" role="alert">{errorMessage}</div> : null}
          {isDemoMode() ? <div className="login-demo-note">O modo de demonstração está ativo somente neste ambiente local.</div> : null}
          <label>E-mail institucional<input autoComplete="username" name="email" required type="email" placeholder="nome@hospital.local" /></label>
          <label>Senha<input autoComplete="current-password" minLength={12} maxLength={256} name="password" required type="password" placeholder="Digite sua senha" /></label>
          <div className="login-options"><label><input name="remember" type="checkbox" /> Manter conectado</label><span>Contate o administrador para redefinir a senha.</span></div>
          <button className="button button-primary login-button" type="submit">Entrar</button>
          <small>A sessão é protegida e expira automaticamente.</small>
        </form>
      </section>
    </main>
  );
}
