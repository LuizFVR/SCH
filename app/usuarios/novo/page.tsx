import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { createUserAction } from "../actions";
import { requireRole } from "../../../lib/auth";
import { listOrganizationUnits } from "../../../lib/organization";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid: "Revise os campos e use uma senha com pelo menos 12 caracteres.",
  scope: "Selecione a unidade ou o setor que este usuário poderá acessar.",
  exists: "Já existe um usuário com este e-mail.",
  save: "Não foi possível cadastrar o usuário.",
};

export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireRole(["ADMIN"]);
  const units = await listOrganizationUnits(actor);
  const { error } = await searchParams;

  return (
    <AppShell active="usuarios" eyebrow="Novo acesso" title="Cadastrar usuário" subtitle="Defina o perfil e o limite de acesso do novo gestor.">
      <form className="entity-form" action={createUserAction}>
        <header><div><h2>Dados do usuário</h2><p>A senha poderá ser alterada posteriormente pelo administrador.</p></div><Link className="text-button" href="/usuarios">Cancelar</Link></header>
        {error ? <div className="login-error" role="alert">{errors[error] ?? errors.save}</div> : null}
        <div className="form-grid">
          <label>Nome completo<input name="name" minLength={3} maxLength={160} required /></label>
          <label>E-mail institucional<input name="email" type="email" maxLength={254} required /></label>
          <label>Perfil<select name="role" defaultValue="SECTOR_MANAGER" required><option value="ADMIN">Administrador geral</option><option value="UNIT_MANAGER">Gerente de unidade</option><option value="SECTOR_MANAGER">Gerente de setor</option><option value="ANALYST">Analista</option></select></label>
          <label>Unidade permitida<select name="unitId" defaultValue=""><option value="">Somente para gerente de unidade</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></label>
          <label>Setor permitido<select name="sectorId" defaultValue=""><option value="">Somente para gerente de setor ou analista</option>{units.map((unit) => <optgroup label={unit.name} key={unit.id}>{unit.sectors.map((sector) => <option value={sector.id} key={sector.id}>{sector.name}</option>)}</optgroup>)}</select></label>
          <label>Senha inicial<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label>
          <label>Confirmar senha<input name="passwordConfirmation" type="password" minLength={12} maxLength={256} autoComplete="new-password" required /></label>
        </div>
        <footer><p>Gerente de unidade usa o campo de unidade; gerente de setor e analista usam o campo de setor.</p><button className="button button-primary" type="submit">Cadastrar usuário</button></footer>
      </form>
    </AppShell>
  );
}
