import { AppShell, Panel, StatusPill } from "../components/AppShell";
import { requireUser } from "../../lib/auth";
import { listOrganizationUnits } from "../../lib/organization";

export const dynamic = "force-dynamic";

export default async function StructurePage() {
  const user = await requireUser();
  const organizationUnits = await listOrganizationUnits(user);
  const sectorCount = organizationUnits.reduce((total, unit) => total + unit.sectors.length, 0);
  const physiotherapyCount = organizationUnits.reduce((total, unit) => total + unit.sectors.filter((sector) => sector.serviceType === "Fisioterapia").length, 0);

  return (
    <AppShell active="estrutura" eyebrow="Organização" title="Unidades e setores" subtitle="A mesma especialidade pode existir em locais diferentes e ser analisada separadamente ou em conjunto.">
      <div className="structure-grid">
        <Panel title={user.hospitalName} description={`${organizationUnits.length} unidades · ${sectorCount} setores visíveis para seu perfil`}>
          <div className="tree-list">
            {organizationUnits.map((unit) => (
              <section key={unit.id}>
                <header><span className="tree-mark">{unit.name.split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase()}</span><div><h3>{unit.name}</h3><p>{unit.sectors.length} setores</p></div><StatusPill tone={unit.active ? "success" : "neutral"}>{unit.active ? "Ativa" : "Inativa"}</StatusPill></header>
                <div className="tree-children">{unit.sectors.map((sector) => <div key={sector.id}><strong>{sector.name}</strong><span>{sector.serviceType ?? "Sem tipo de serviço"}</span></div>)}</div>
              </section>
            ))}
            {organizationUnits.length === 0 ? <p className="empty-state">Nenhuma unidade foi vinculada a este usuário.</p> : null}
          </div>
        </Panel>
        <aside className="info-card"><span>COMPARAÇÃO DE SERVIÇOS</span><h2>Fisioterapia</h2><p>Os setores ligados ao mesmo tipo de serviço poderão ter resultados consolidados ou comparados.</p><div><strong>{physiotherapyCount}</strong><small>setores de fisioterapia visíveis</small></div></aside>
      </div>
    </AppShell>
  );
}
