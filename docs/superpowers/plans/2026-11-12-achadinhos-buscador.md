# Achadinhos: buscador + painel de aprovação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Robô diário que busca ofertas na Shopee e grava como rascunho no Supabase da Gabi, painel com login para ela aprovar/descartar/cadastrar por link (Amazon com tag automática), e site público mostrando só o que foi aprovado.

**Architecture:** Python no GitHub Actions (pacote `scripts/buscador/` + orquestrador `scripts/buscar_ofertas.py`) fala com a API GraphQL da Shopee e com o PostgREST do Supabase usando a chave secreta. Painel estático em `achadinhos/painel/` usa supabase-js (UMD com SRI) com login por link mágico; permissões garantidas por RLS + função `eh_admin()`. Site público (`achadinhos/achadinhos.js`) lê com a chave publicável só `status = aprovado`.

**Tech Stack:** Python 3.12, requests 2.32.3, pytest 8.3.3; JavaScript ES modules sem build, supabase-js 2.45.4, `node --test` (Node 24); Supabase Postgres + Auth; GitHub Actions; GitHub Pages.

Spec: `docs/superpowers/specs/2026-11-12-achadinhos-buscador-design.md`

## Global Constraints

- Repo: `E:\Claude Projetos\gabrielarabelo-site` (público). Nunca commitar segredo; nunca logar dados de oferta nem de usuário no Actions (só contagens).
- Supabase da Gabi: `https://kjcmorylizjelnnfjbas.supabase.co`, chave publicável `sb_publishable_JTFPBNC2iM1LXi0IDYxSfQ_HPAH6BB0`. Mudanças de schema rodam no SQL Editor do dashboard (Brave já logado na conta dela); o conector MCP do Supabase NÃO acessa esse projeto.
- Tag Amazon: `gabirabelobea-20`. Vitrine Shopee: `collshp.com/gabrielarabelo61630`. Admin: `gabi.rabelobeauty@gmail.com`.
- Status válidos: `rascunho`, `aprovado`, `descartado`. Origens válidas: `shopee`, `amazon`, `mercadolivre`, `manual`.
- Filtros iniciais: `avaliacao_min 4.7`, `vendas_min 100`, `comissao_min_pct 5`, `por_busca 10`. Rascunhos com `atualizado_em` > 14 dias são apagados.
- Links e imagens só `https://`. Links de oferta no HTML com `rel="sponsored noopener noreferrer"`.
- Todo texto do usuário renderizado com `textContent` (nunca `innerHTML` com dado do banco).
- Cache-busting: todo deploy que muda CSS/JS sobe o `?v=N` (hoje `v=10`).
- Sem raspagem de Amazon/Mercado Livre.
- Copy em português do Brasil, sem jargão de IA.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/achadinhos_v2.sql` | Migração: colunas novas, `status`, `admins`, `eh_admin()`, RLS |
| `scripts/buscador/__init__.py` | Marca o pacote |
| `scripts/buscador/oferta.py` | `Oferta` (dataclass), `formatar_preco`, `passa_filtros`, `ranquear` |
| `scripts/buscador/shopee.py` | Assinatura, chamada GraphQL, conversão para `Oferta` |
| `scripts/buscador/repositorio.py` | Leitura/escrita na tabela via PostgREST (chave secreta) |
| `scripts/buscar_ofertas.py` | Orquestra: config → conectores → filtros → sincroniza → limpa |
| `config/buscas.json` | Termos de busca e filtros |
| `tests/test_oferta.py`, `tests/test_shopee.py`, `tests/test_repositorio.py`, `tests/test_buscar_ofertas.py` | pytest |
| `tests/fixtures/shopee_resposta.json` | Resposta de exemplo da API |
| `pytest.ini`, `requirements-dev.txt` | Config de teste |
| `.github/workflows/buscar-ofertas.yml` | Agenda diária + execução manual |
| `package.json` | `"type": "module"` para `node --test` |
| `achadinhos/painel/links.js` | Funções puras: link de afiliado, texto do grupo, preço |
| `tests/links.test.js` | `node --test` de `links.js` |
| `achadinhos/painel/index.html`, `achadinhos/painel/painel.js` | Painel com login |
| `styles.css` | Estilos do painel e do preço riscado no site |
| `achadinhos/achadinhos.js`, `achadinhos/index.html` | Site público filtra `status` e mostra desconto |
| `scripts/verificar_rls.py` | Checagem das permissões com a chave publicável |

---

### Task 1: Migração do banco + site público lendo `status`

O site público hoje filtra `ativo=eq.true`; a migração remove `ativo`. Os dois mudam juntos, senão o site quebra.

**Files:**
- Create: `supabase/achadinhos_v2.sql`
- Create: `scripts/verificar_rls.py`
- Modify: `achadinhos/achadinhos.js` (constante `CAMPOS`, função `carregar`, função `card`)
- Modify: `achadinhos/index.html` (`?v=10` → `?v=11`)
- Modify: `styles.css` (bloco Achadinhos, adicionar preço riscado)

**Interfaces:**
- Produces: colunas `origem, id_externo, preco_atual, preco_original, desconto_pct, comissao_pct, avaliacao, vendas, status, atualizado_em`; constraint `achadinhos_origem_id_externo_key`; função `public.eh_admin()`; tabela `public.admins`.

- [ ] **Step 1: Escrever a migração**

`supabase/achadinhos_v2.sql`:
```sql
-- Achadinhos v2: buscador automático + painel de aprovação.
-- Rodar uma vez no SQL Editor do Supabase da Gabi, depois de achadinhos.sql.

alter table public.achadinhos
  add column if not exists origem text not null default 'manual'
    check (origem in ('shopee', 'amazon', 'mercadolivre', 'manual')),
  add column if not exists id_externo text check (id_externo is null or char_length(id_externo) <= 80),
  add column if not exists preco_atual numeric(10,2) check (preco_atual is null or preco_atual >= 0),
  add column if not exists preco_original numeric(10,2) check (preco_original is null or preco_original >= 0),
  add column if not exists desconto_pct numeric(5,2) check (desconto_pct is null or desconto_pct between 0 and 100),
  add column if not exists comissao_pct numeric(5,2) check (comissao_pct is null or comissao_pct between 0 and 100),
  add column if not exists avaliacao numeric(3,2) check (avaliacao is null or avaliacao between 0 and 5),
  add column if not exists vendas integer check (vendas is null or vendas >= 0),
  add column if not exists status text not null default 'rascunho'
    check (status in ('rascunho', 'aprovado', 'descartado')),
  add column if not exists atualizado_em timestamptz not null default now();

-- NULLs não colidem: itens manuais sem id_externo podem repetir.
alter table public.achadinhos drop constraint if exists achadinhos_origem_id_externo_key;
alter table public.achadinhos add constraint achadinhos_origem_id_externo_key unique (origem, id_externo);

-- Troca "ativo" por "status".
drop policy if exists "anon le achadinhos ativos" on public.achadinhos;
alter table public.achadinhos drop column if exists ativo;

-- Quem administra
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
insert into public.admins (email) values ('gabi.rabelobeauty@gmail.com') on conflict do nothing;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- Público: só leitura dos aprovados, só colunas de exibição
revoke all on public.achadinhos from anon, authenticated;
grant select (titulo, descricao, preco, imagem_url, link, loja, categoria, ordem, created_at,
              preco_atual, preco_original, desconto_pct, status)
  on public.achadinhos to anon;
drop policy if exists "anon le aprovados" on public.achadinhos;
create policy "anon le aprovados" on public.achadinhos
  for select to anon using (status = 'aprovado');

-- Admin logado: lê, cria e edita (sem delete)
grant select, insert, update on public.achadinhos to authenticated;
drop policy if exists "admin le" on public.achadinhos;
drop policy if exists "admin cria" on public.achadinhos;
drop policy if exists "admin edita" on public.achadinhos;
create policy "admin le" on public.achadinhos for select to authenticated using (public.eh_admin());
create policy "admin cria" on public.achadinhos for insert to authenticated with check (public.eh_admin());
create policy "admin edita" on public.achadinhos for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
```

- [ ] **Step 2: Escrever o verificador de permissões**

`scripts/verificar_rls.py`:
```python
"""Confere as permissões públicas da tabela achadinhos (chave publicável).

Uso: python scripts/verificar_rls.py
Sai com código 1 se alguma permissão estiver errada.
"""
import sys

import requests

URL = "https://kjcmorylizjelnnfjbas.supabase.co/rest/v1/achadinhos"
CHAVE = "sb_publishable_JTFPBNC2iM1LXi0IDYxSfQ_HPAH6BB0"
H = {"apikey": CHAVE, "Content-Type": "application/json"}


def checar(nome: str, ok: bool) -> bool:
    print(("OK   " if ok else "FALHA"), nome)
    return ok


def main() -> int:
    r_aprov = requests.get(URL, params={"select": "titulo", "status": "eq.aprovado"}, headers=H, timeout=20)
    r_rasc = requests.get(URL, params={"select": "titulo", "status": "eq.rascunho"}, headers=H, timeout=20)
    r_id = requests.get(URL, params={"select": "id"}, headers=H, timeout=20)
    r_com = requests.get(URL, params={"select": "comissao_pct"}, headers=H, timeout=20)
    r_ins = requests.post(URL, json={"titulo": "x teste", "link": "https://a.b"}, headers=H, timeout=20)
    r_upd = requests.patch(URL, params={"status": "eq.aprovado"}, json={"titulo": "x"}, headers=H, timeout=20)
    resultados = [
        checar("anon lê aprovados (200)", r_aprov.status_code == 200),
        checar("anon não recebe rascunhos (lista vazia)", r_rasc.status_code == 200 and r_rasc.json() == []),
        checar("anon não lê id (401)", r_id.status_code == 401),
        checar("anon não lê comissão (401)", r_com.status_code == 401),
        checar("anon não insere (401)", r_ins.status_code == 401),
        checar("anon não edita (401)", r_upd.status_code == 401),
    ]
    return 0 if all(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Rodar o verificador ANTES da migração para ver falhar**

Run: `python scripts/verificar_rls.py`
Expected: pelo menos `FALHA anon lê aprovados` (coluna `status` ainda não existe → 400). Código de saída 1.

- [ ] **Step 4: Aplicar a migração no SQL Editor**

No Brave, abrir `https://supabase.com/dashboard/project/kjcmorylizjelnnfjbas/sql/new`, colar o conteúdo de `supabase/achadinhos_v2.sql` (via `window.monaco.editor.getModels().slice(-1)[0].setValue(...)` para evitar o autofechamento de parênteses), clicar Run e confirmar o aviso "destructive operations".
Expected: `Success. No rows returned`.

- [ ] **Step 5: Rodar o verificador de novo**

Run: `python scripts/verificar_rls.py`
Expected: 6 linhas `OK`, código 0.

- [ ] **Step 6: Atualizar o site público**

Em `achadinhos/achadinhos.js`, trocar a constante:
```js
  const CAMPOS = "titulo,descricao,preco,imagem_url,link,loja,categoria,preco_original,desconto_pct";
```
Na função `carregar`, trocar a URL do fetch:
```js
        `${SUPABASE_URL}/rest/v1/achadinhos?select=${CAMPOS}&status=eq.aprovado&order=ordem.asc,created_at.desc&limit=200`,
```
Na função `card`, substituir a linha `if (item.preco) rodape.append(el("span", "achado__preco", item.preco));` por:
```js
    if (item.preco) {
      const precos = el("div", "achado__precos");
      if (item.preco_original && item.desconto_pct > 0) {
        precos.append(el("s", "achado__de", formatarBRL(item.preco_original)));
        precos.append(el("span", "achado__off", `-${Math.round(item.desconto_pct)}%`));
      }
      precos.append(el("span", "achado__preco", item.preco));
      rodape.append(precos);
    }
```
E adicionar, logo abaixo da função `el`:
```js
  function formatarBRL(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
```
Em `achadinhos/index.html`, trocar `styles.css?v=10` por `styles.css?v=11` e `achadinhos.js?v=10` por `achadinhos.js?v=11`.

No fim do bloco `/* ---------- Achadinhos da Gabi (/achadinhos) ---------- */` de `styles.css` (antes do `@media (max-width: 560px)` desse bloco), adicionar:
```css
.achado__precos { display: flex; align-items: baseline; flex-wrap: wrap; gap: .35rem; }
.achado__de { font-size: .78rem; color: var(--muted); }
.achado__off { font-size: .7rem; font-weight: 600; color: #fff; background: #b4475f; border-radius: 999px; padding: .1rem .45rem; }
```

- [ ] **Step 7: Conferir o site localmente**

Run: `python -m http.server 8951` na raiz do repo (ou `preview_start gabibeauty-site`) e abrir `http://localhost:8951/achadinhos/`.
Expected: aparece "Os primeiros achadinhos chegam em breve" (tabela sem aprovados), sem erro no console.

- [ ] **Step 8: Commit**

```bash
git add supabase/achadinhos_v2.sql scripts/verificar_rls.py achadinhos/achadinhos.js achadinhos/index.html styles.css
git commit -m "feat(achadinhos): status de aprovacao, admins e RLS do painel"
```

---

### Task 2: Configurar o Supabase Auth para o painel (dashboard)

Sem código. Deixa o login por link mágico pronto e fechado.

**Files:** nenhum.

**Interfaces:**
- Produces: usuária `gabi.rabelobeauty@gmail.com` em Auth; redirect permitido `https://gabibeauty.com.br/achadinhos/painel/`.

- [ ] **Step 1: Desligar cadastro aberto**

Dashboard → Authentication → Sign In / Providers (ou "Settings") → desligar **Allow new users to sign up**. Salvar.

- [ ] **Step 2: Configurar URLs**

Authentication → URL Configuration:
- Site URL: `https://gabibeauty.com.br`
- Redirect URLs: adicionar `https://gabibeauty.com.br/achadinhos/painel/` e `http://localhost:8951/achadinhos/painel/`

- [ ] **Step 3: Criar a usuária**

Authentication → Users → Add user → **Send invitation** para `gabi.rabelobeauty@gmail.com`. (Pedir confirmação ao usuário antes: envia e-mail real para a Gabi.)
Expected: usuária aparece na lista como "Waiting for verification".

- [ ] **Step 4: Registrar na nota do projeto**

Em `G:\Obsidian\CerebroClaude\projects\Gabriela Rabelo Beauty.md`, seção Achadinhos, adicionar: "Auth: cadastro aberto desligado; redirect do painel liberado; Gabi convidada em AAAA-MM-DD."

---

### Task 3: Modelo `Oferta`, preço e filtros (Python)

**Files:**
- Create: `scripts/buscador/__init__.py` (vazio)
- Create: `scripts/buscador/oferta.py`
- Create: `tests/test_oferta.py`
- Create: `pytest.ini`
- Create: `requirements-dev.txt`

**Interfaces:**
- Produces:
  - `@dataclass Oferta(origem: str, id_externo: str, titulo: str, link: str, imagem_url: str | None = None, loja: str | None = None, preco_atual: float | None = None, preco_original: float | None = None, desconto_pct: float | None = None, comissao_pct: float | None = None, avaliacao: float | None = None, vendas: int | None = None, categoria: str | None = None)`
  - `Oferta.para_insert() -> dict`
  - `Oferta.para_update(agora_iso: str) -> dict`
  - `formatar_preco(valor: float | None) -> str | None`
  - `passa_filtros(o: Oferta, filtros: dict) -> bool`
  - `ranquear(ofertas: list[Oferta]) -> list[Oferta]`

- [ ] **Step 1: Configurar pytest**

`pytest.ini`:
```ini
[pytest]
pythonpath = scripts
testpaths = tests
```
`requirements-dev.txt`:
```
requests==2.32.3
pytest==8.3.3
```
Run: `pip install -r requirements-dev.txt`

- [ ] **Step 2: Escrever os testes**

`tests/test_oferta.py`:
```python
from buscador.oferta import Oferta, formatar_preco, passa_filtros, ranquear

FILTROS = {"avaliacao_min": 4.7, "vendas_min": 100, "comissao_min_pct": 5}


def oferta(**kw):
    base = dict(origem="shopee", id_externo="1", titulo="Sérum", link="https://s.shopee.com.br/x",
                avaliacao=4.8, vendas=500, comissao_pct=8.0, preco_atual=59.9)
    base.update(kw)
    return Oferta(**base)


def test_formatar_preco():
    assert formatar_preco(59.9) == "R$ 59,90"
    assert formatar_preco(1234.5) == "R$ 1.234,50"
    assert formatar_preco(None) is None


def test_passa_filtros_aceita_boa_oferta():
    assert passa_filtros(oferta(), FILTROS)


def test_passa_filtros_recusa_nota_baixa():
    assert not passa_filtros(oferta(avaliacao=4.5), FILTROS)


def test_passa_filtros_recusa_poucas_vendas():
    assert not passa_filtros(oferta(vendas=20), FILTROS)


def test_passa_filtros_recusa_comissao_baixa():
    assert not passa_filtros(oferta(comissao_pct=2.0), FILTROS)


def test_passa_filtros_recusa_dado_ausente():
    assert not passa_filtros(oferta(avaliacao=None), FILTROS)


def test_passa_filtros_recusa_link_sem_https():
    assert not passa_filtros(oferta(link="http://x"), FILTROS)


def test_ranquear_por_comissao_vezes_vendas():
    a = oferta(id_externo="a", comissao_pct=10, vendas=100)   # 1000
    b = oferta(id_externo="b", comissao_pct=5, vendas=1000)   # 5000
    assert [o.id_externo for o in ranquear([a, b])] == ["b", "a"]


def test_para_insert_corta_e_formata():
    d = oferta(titulo="x" * 200, loja="L" * 60).para_insert()
    assert len(d["titulo"]) == 120
    assert len(d["loja"]) == 40
    assert d["preco"] == "R$ 59,90"
    assert "status" not in d  # default do banco = rascunho


def test_para_update_nao_mexe_em_titulo_categoria_status():
    d = oferta(categoria="Skincare").para_update("2026-11-12T10:00:00+00:00")
    assert "titulo" not in d and "categoria" not in d and "status" not in d
    assert d["atualizado_em"] == "2026-11-12T10:00:00+00:00"
    assert d["preco_atual"] == 59.9
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest tests/test_oferta.py -q`
Expected: erro `ModuleNotFoundError: No module named 'buscador'`.

- [ ] **Step 4: Implementar**

`scripts/buscador/__init__.py`: arquivo vazio.

`scripts/buscador/oferta.py`:
```python
"""Formato comum das ofertas, independente da loja de origem."""
from dataclasses import dataclass


@dataclass
class Oferta:
    origem: str
    id_externo: str
    titulo: str
    link: str
    imagem_url: str | None = None
    loja: str | None = None
    preco_atual: float | None = None
    preco_original: float | None = None
    desconto_pct: float | None = None
    comissao_pct: float | None = None
    avaliacao: float | None = None
    vendas: int | None = None
    categoria: str | None = None

    def _comuns(self) -> dict:
        return {
            "link": self.link,
            "imagem_url": self.imagem_url if (self.imagem_url or "").startswith("https://") else None,
            "preco": formatar_preco(self.preco_atual),
            "preco_atual": self.preco_atual,
            "preco_original": self.preco_original,
            "desconto_pct": self.desconto_pct,
            "comissao_pct": self.comissao_pct,
            "avaliacao": self.avaliacao,
            "vendas": self.vendas,
        }

    def para_insert(self) -> dict:
        """Linha nova. Sem 'status': o banco aplica o default 'rascunho'."""
        return {
            "origem": self.origem,
            "id_externo": self.id_externo,
            "titulo": self.titulo.strip()[:120],
            "loja": (self.loja or "").strip()[:40] or None,
            "categoria": (self.categoria or "").strip()[:40] or None,
            **self._comuns(),
        }

    def para_update(self, agora_iso: str) -> dict:
        """Atualização de oferta já existente: preserva título, categoria e status da Gabi."""
        return {**self._comuns(), "atualizado_em": agora_iso}


def formatar_preco(valor: float | None) -> str | None:
    if valor is None:
        return None
    texto = f"{valor:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {texto}"


def passa_filtros(o: Oferta, filtros: dict) -> bool:
    if not o.link.startswith("https://"):
        return False
    if o.avaliacao is None or o.vendas is None or o.comissao_pct is None:
        return False
    return (
        o.avaliacao >= filtros["avaliacao_min"]
        and o.vendas >= filtros["vendas_min"]
        and o.comissao_pct >= filtros["comissao_min_pct"]
    )


def ranquear(ofertas: list[Oferta]) -> list[Oferta]:
    return sorted(ofertas, key=lambda o: (o.comissao_pct or 0) * (o.vendas or 0), reverse=True)
```

- [ ] **Step 5: Rodar e ver passar**

Run: `python -m pytest tests/test_oferta.py -q`
Expected: `10 passed`.

- [ ] **Step 6: Commit**

```bash
git add pytest.ini requirements-dev.txt scripts/buscador/__init__.py scripts/buscador/oferta.py tests/test_oferta.py
git commit -m "feat(buscador): modelo Oferta, preco e filtros"
```

---

### Task 4: Conector Shopee

**Files:**
- Create: `scripts/buscador/shopee.py`
- Create: `tests/fixtures/shopee_resposta.json`
- Create: `tests/test_shopee.py`

**Interfaces:**
- Consumes: `Oferta` (Task 3)
- Produces:
  - `ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql"`
  - `assinatura(app_id: str, timestamp: int, payload: str, segredo: str) -> str`
  - `converter(no: dict) -> Oferta | None`
  - `class ConectorShopee(app_id: str, segredo: str, sessao: requests.Session | None = None)` com `origem = "shopee"` e `buscar(termo: str, limite: int = 50) -> list[Oferta]`

Antes de implementar: abrir a documentação da API aberta (painel affiliate.shopee.com.br → Open API → documentação) e conferir nome da query `productOfferV2`, argumentos e campos. Se algum nome diferir, ajustar a fixture e o código juntos.

- [ ] **Step 1: Criar a fixture**

`tests/fixtures/shopee_resposta.json`:
```json
{
  "data": {
    "productOfferV2": {
      "nodes": [
        {
          "itemId": 22334455,
          "productName": "Sérum Vitamina C 30ml",
          "priceMin": "59.90",
          "priceMax": "59.90",
          "priceDiscountRate": 25,
          "commissionRate": "0.08",
          "sales": 1520,
          "ratingStar": "4.9",
          "imageUrl": "https://down-br.img.susercontent.com/file/abc",
          "offerLink": "https://s.shopee.com.br/AbC123",
          "productLink": "https://shopee.com.br/product/1/22334455",
          "shopName": "Loja Beleza Oficial"
        },
        {
          "itemId": 99887766,
          "productName": "Item sem link",
          "priceMin": "10.00",
          "priceDiscountRate": 0,
          "commissionRate": "0.05",
          "sales": 300,
          "ratingStar": "4.8",
          "imageUrl": "https://down-br.img.susercontent.com/file/def",
          "offerLink": "",
          "shopName": "Outra"
        }
      ],
      "pageInfo": { "page": 1, "limit": 50, "hasNextPage": false }
    }
  }
}
```

- [ ] **Step 2: Escrever os testes**

`tests/test_shopee.py`:
```python
import json
from pathlib import Path

import pytest

from buscador.shopee import ConectorShopee, assinatura, converter

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "shopee_resposta.json").read_text(encoding="utf-8"))


def test_assinatura_vetor_fixo():
    payload = '{"query":"{ ping }"}'
    assert assinatura("123", 1700000000, payload, "segredo") == (
        "e140dc37086445424012413a0da4e4f07573130309a2481963905c6302c385ed"
    )


def test_converter_campos():
    o = converter(FIXTURE["data"]["productOfferV2"]["nodes"][0])
    assert o.origem == "shopee"
    assert o.id_externo == "22334455"
    assert o.titulo == "Sérum Vitamina C 30ml"
    assert o.link == "https://s.shopee.com.br/AbC123"
    assert o.loja == "Loja Beleza Oficial"
    assert o.preco_atual == 59.9
    assert o.desconto_pct == 25
    assert o.preco_original == pytest.approx(79.87, abs=0.01)
    assert o.comissao_pct == pytest.approx(8.0)
    assert o.avaliacao == 4.9
    assert o.vendas == 1520


def test_converter_descarta_sem_link():
    assert converter(FIXTURE["data"]["productOfferV2"]["nodes"][1]) is None


class SessaoFalsa:
    def __init__(self, resposta):
        self.resposta = resposta
        self.chamadas = []

    def post(self, url, data=None, headers=None, timeout=None):
        self.chamadas.append({"url": url, "data": data, "headers": headers})
        sessao = self

        class R:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return sessao.resposta

        return R()


def test_buscar_monta_requisicao_assinada():
    sessao = SessaoFalsa(FIXTURE)
    ofertas = ConectorShopee("123", "segredo", sessao=sessao).buscar("vitamina c", limite=20)
    assert [o.id_externo for o in ofertas] == ["22334455"]
    chamada = sessao.chamadas[0]
    assert chamada["url"] == "https://open-api.affiliate.shopee.com.br/graphql"
    auth = chamada["headers"]["Authorization"]
    assert auth.startswith("SHA256 Credential=123, Timestamp=")
    assert "Signature=" in auth
    corpo = json.loads(chamada["data"])
    assert corpo["variables"] == {"keyword": "vitamina c", "limit": 20, "page": 1}


def test_buscar_erro_graphql_vira_excecao():
    sessao = SessaoFalsa({"errors": [{"message": "invalid signature"}]})
    with pytest.raises(RuntimeError, match="invalid signature"):
        ConectorShopee("123", "segredo", sessao=sessao).buscar("x")
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest tests/test_shopee.py -q`
Expected: `ModuleNotFoundError: No module named 'buscador.shopee'`.

- [ ] **Step 4: Implementar**

`scripts/buscador/shopee.py`:
```python
"""Conector da API aberta da Shopee Afiliados (GraphQL)."""
import hashlib
import json
import time

import requests

from buscador.oferta import Oferta

ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql"

QUERY = """
query Buscar($keyword: String, $limit: Int, $page: Int) {
  productOfferV2(keyword: $keyword, limit: $limit, page: $page, sortType: 2) {
    nodes {
      itemId productName priceMin priceMax priceDiscountRate commissionRate
      sales ratingStar imageUrl offerLink productLink shopName
    }
    pageInfo { page limit hasNextPage }
  }
}
""".strip()


def assinatura(app_id: str, timestamp: int, payload: str, segredo: str) -> str:
    return hashlib.sha256(f"{app_id}{timestamp}{payload}{segredo}".encode("utf-8")).hexdigest()


def _num(valor) -> float | None:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def converter(no: dict) -> Oferta | None:
    link = (no.get("offerLink") or "").strip()
    titulo = (no.get("productName") or "").strip()
    if not link.startswith("https://") or len(titulo) < 2 or not no.get("itemId"):
        return None
    preco = _num(no.get("priceMin"))
    desconto = _num(no.get("priceDiscountRate")) or 0
    original = round(preco / (1 - desconto / 100), 2) if preco and 0 < desconto < 100 else None
    comissao = _num(no.get("commissionRate"))
    vendas = no.get("sales")
    return Oferta(
        origem="shopee",
        id_externo=str(no["itemId"]),
        titulo=titulo,
        link=link,
        imagem_url=no.get("imageUrl"),
        loja=no.get("shopName"),
        preco_atual=preco,
        preco_original=original,
        desconto_pct=desconto or None,
        comissao_pct=round(comissao * 100, 2) if comissao is not None else None,
        avaliacao=_num(no.get("ratingStar")),
        vendas=int(vendas) if isinstance(vendas, (int, float)) else None,
    )


class ConectorShopee:
    origem = "shopee"

    def __init__(self, app_id: str, segredo: str, sessao=None):
        self.app_id = app_id
        self.segredo = segredo
        self.sessao = sessao or requests.Session()

    def buscar(self, termo: str, limite: int = 50) -> list[Oferta]:
        payload = json.dumps(
            {"query": QUERY, "variables": {"keyword": termo, "limit": limite, "page": 1}},
            separators=(",", ":"),
            ensure_ascii=False,
        )
        ts = int(time.time())
        cabecalho = (
            f"SHA256 Credential={self.app_id}, Timestamp={ts}, "
            f"Signature={assinatura(self.app_id, ts, payload, self.segredo)}"
        )
        resp = self.sessao.post(
            ENDPOINT,
            data=payload.encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": cabecalho},
            timeout=30,
        )
        resp.raise_for_status()
        corpo = resp.json()
        if corpo.get("errors"):
            raise RuntimeError("; ".join(e.get("message", "erro") for e in corpo["errors"]))
        nos = corpo.get("data", {}).get("productOfferV2", {}).get("nodes", [])
        return [o for o in (converter(n) for n in nos) if o]
```

Nota: o teste lê `chamada["data"]` com `json.loads`, que aceita `bytes`.

- [ ] **Step 5: Rodar e ver passar**

Run: `python -m pytest tests/test_shopee.py -q`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/buscador/shopee.py tests/test_shopee.py tests/fixtures/shopee_resposta.json
git commit -m "feat(buscador): conector da API de afiliados da Shopee"
```

---

### Task 5: Repositório (PostgREST com chave secreta)

**Files:**
- Create: `scripts/buscador/repositorio.py`
- Create: `tests/test_repositorio.py`

**Interfaces:**
- Consumes: `Oferta` (Task 3)
- Produces: `class Repositorio(url: str, chave: str, sessao=None)` com:
  - `existentes(origem: str, ids: list[str]) -> set[str]`
  - `sincronizar(ofertas: list[Oferta], agora_iso: str) -> tuple[int, int]` → (novas, atualizadas)
  - `limpar_rascunhos(antes_de_iso: str) -> int` → apagadas

- [ ] **Step 1: Escrever os testes**

`tests/test_repositorio.py`:
```python
from buscador.oferta import Oferta
from buscador.repositorio import Repositorio


class Resp:
    def __init__(self, status=200, corpo=None):
        self.status_code = status
        self._corpo = corpo if corpo is not None else []

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._corpo


class SessaoFalsa:
    def __init__(self, existentes=()):
        self.existentes = list(existentes)
        self.log = []

    def request(self, metodo, url, params=None, json=None, headers=None, timeout=None):
        self.log.append((metodo, params, json, headers))
        if metodo == "GET":
            return Resp(200, [{"id_externo": i} for i in self.existentes])
        if metodo == "DELETE":
            return Resp(200, [{"id": "a"}, {"id": "b"}])
        return Resp(201 if metodo == "POST" else 204)


def of(i):
    return Oferta(origem="shopee", id_externo=i, titulo=f"Produto {i}", link=f"https://s.shopee.com.br/{i}",
                  preco_atual=10.0, avaliacao=4.9, vendas=200, comissao_pct=8.0)


def repo(sessao):
    return Repositorio("https://x.supabase.co", "sb_secret_teste", sessao=sessao)


def test_existentes_monta_filtro_in():
    s = SessaoFalsa(existentes=["1"])
    assert repo(s).existentes("shopee", ["1", "2"]) == {"1"}
    metodo, params, _, headers = s.log[0]
    assert metodo == "GET"
    assert params["origem"] == "eq.shopee"
    assert params["id_externo"] == 'in.("1","2")'
    assert headers["apikey"] == "sb_secret_teste"
    assert headers["Authorization"] == "Bearer sb_secret_teste"


def test_sincronizar_insere_novas_e_atualiza_existentes():
    s = SessaoFalsa(existentes=["1"])
    novas, atualizadas = repo(s).sincronizar([of("1"), of("2")], "2026-11-12T10:00:00+00:00")
    assert (novas, atualizadas) == (1, 1)
    post = [x for x in s.log if x[0] == "POST"][0]
    assert [linha["id_externo"] for linha in post[2]] == ["2"]
    patch = [x for x in s.log if x[0] == "PATCH"][0]
    assert patch[1] == {"origem": "eq.shopee", "id_externo": "eq.1"}
    assert "titulo" not in patch[2]


def test_sincronizar_vazio_nao_chama_api():
    s = SessaoFalsa()
    assert repo(s).sincronizar([], "2026-11-12T10:00:00+00:00") == (0, 0)
    assert s.log == []


def test_limpar_rascunhos_so_rascunho_antigo():
    s = SessaoFalsa()
    assert repo(s).limpar_rascunhos("2026-10-29T00:00:00+00:00") == 2
    metodo, params, _, headers = s.log[0]
    assert metodo == "DELETE"
    assert params["status"] == "eq.rascunho"
    assert params["atualizado_em"] == "lt.2026-10-29T00:00:00+00:00"
    assert headers["Prefer"] == "return=representation"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m pytest tests/test_repositorio.py -q`
Expected: `ModuleNotFoundError: No module named 'buscador.repositorio'`.

- [ ] **Step 3: Implementar**

`scripts/buscador/repositorio.py`:
```python
"""Acesso à tabela public.achadinhos via PostgREST, com a chave secreta do robô."""
from collections import defaultdict

import requests

from buscador.oferta import Oferta


class Repositorio:
    def __init__(self, url: str, chave: str, sessao=None):
        self.base = f"{url.rstrip('/')}/rest/v1/achadinhos"
        self.chave = chave
        self.sessao = sessao or requests.Session()

    def _req(self, metodo: str, params=None, corpo=None, prefer: str | None = None):
        headers = {
            "apikey": self.chave,
            "Authorization": f"Bearer {self.chave}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        resp = self.sessao.request(metodo, self.base, params=params, json=corpo, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp

    def existentes(self, origem: str, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        lista = ",".join(f'"{i}"' for i in ids)
        resp = self._req("GET", params={"select": "id_externo", "origem": f"eq.{origem}", "id_externo": f"in.({lista})"})
        return {linha["id_externo"] for linha in resp.json()}

    def sincronizar(self, ofertas: list[Oferta], agora_iso: str) -> tuple[int, int]:
        por_origem: dict[str, list[Oferta]] = defaultdict(list)
        for o in ofertas:
            por_origem[o.origem].append(o)
        novas = atualizadas = 0
        for origem, grupo in por_origem.items():
            ja = self.existentes(origem, [o.id_externo for o in grupo])
            inserir = [o.para_insert() for o in grupo if o.id_externo not in ja]
            if inserir:
                self._req("POST", corpo=inserir, prefer="return=minimal")
                novas += len(inserir)
            for o in grupo:
                if o.id_externo in ja:
                    self._req(
                        "PATCH",
                        params={"origem": f"eq.{origem}", "id_externo": f"eq.{o.id_externo}"},
                        corpo=o.para_update(agora_iso),
                        prefer="return=minimal",
                    )
                    atualizadas += 1
        return novas, atualizadas

    def limpar_rascunhos(self, antes_de_iso: str) -> int:
        resp = self._req(
            "DELETE",
            params={"status": "eq.rascunho", "atualizado_em": f"lt.{antes_de_iso}", "select": "id"},
            prefer="return=representation",
        )
        return len(resp.json())
```

Nota: o teste `test_existentes_monta_filtro_in` checa `params` parcialmente (`select` também vai, sem problema).

- [ ] **Step 4: Rodar e ver passar**

Run: `python -m pytest tests/test_repositorio.py -q`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/buscador/repositorio.py tests/test_repositorio.py
git commit -m "feat(buscador): repositorio PostgREST com upsert que preserva ajustes"
```

---

### Task 6: Orquestrador + configuração + workflow agendado

**Files:**
- Create: `config/buscas.json`
- Create: `scripts/buscar_ofertas.py`
- Create: `tests/test_buscar_ofertas.py`
- Create: `.github/workflows/buscar-ofertas.yml`

**Interfaces:**
- Consumes: `Oferta`, `passa_filtros`, `ranquear` (Task 3); `ConectorShopee` (Task 4); `Repositorio` (Task 5)
- Produces: `executar(config: dict, conectores: list, repo, agora: datetime) -> dict` com chaves `buscas`, `falhas`, `novas`, `atualizadas`, `apagadas`; `main() -> int`

- [ ] **Step 1: Criar a configuração**

`config/buscas.json`:
```json
{
  "filtros": { "avaliacao_min": 4.7, "vendas_min": 100, "comissao_min_pct": 5, "por_busca": 10 },
  "dias_rascunho": 14,
  "buscas": [
    { "termo": "protetor solar facial", "categoria": "Skincare" },
    { "termo": "sérum vitamina C", "categoria": "Skincare" },
    { "termo": "ácido hialurônico", "categoria": "Skincare" },
    { "termo": "hidratante corporal firmador", "categoria": "Corpo" },
    { "termo": "óleo corporal", "categoria": "Corpo" },
    { "termo": "máscara capilar", "categoria": "Cabelo" }
  ]
}
```

- [ ] **Step 2: Escrever os testes**

`tests/test_buscar_ofertas.py`:
```python
from datetime import datetime, timezone

import buscar_ofertas
from buscador.oferta import Oferta

CONFIG = {
    "filtros": {"avaliacao_min": 4.7, "vendas_min": 100, "comissao_min_pct": 5, "por_busca": 1},
    "dias_rascunho": 14,
    "buscas": [{"termo": "a", "categoria": "Skincare"}, {"termo": "b", "categoria": "Corpo"}],
}
AGORA = datetime(2026, 11, 12, 11, 0, tzinfo=timezone.utc)


def of(i, vendas=500):
    return Oferta(origem="shopee", id_externo=i, titulo=f"P{i}", link=f"https://s.shopee.com.br/{i}",
                  avaliacao=4.9, vendas=vendas, comissao_pct=8.0)


class ConectorFalso:
    origem = "shopee"

    def __init__(self, respostas):
        self.respostas = respostas

    def buscar(self, termo, limite=50):
        r = self.respostas[termo]
        if isinstance(r, Exception):
            raise r
        return r


class RepoFalso:
    def __init__(self):
        self.sincronizadas = None
        self.limpeza = None

    def sincronizar(self, ofertas, agora_iso):
        self.sincronizadas = ofertas
        return len(ofertas), 0

    def limpar_rascunhos(self, antes_de_iso):
        self.limpeza = antes_de_iso
        return 3


def test_executar_filtra_ranqueia_categoriza_e_deduplica():
    con = ConectorFalso({"a": [of("1", 200), of("2", 900), of("x", 10)], "b": [of("2", 900)]})
    repo = RepoFalso()
    r = buscar_ofertas.executar(CONFIG, [con], repo, AGORA)
    assert [o.id_externo for o in repo.sincronizadas] == ["2"]
    assert repo.sincronizadas[0].categoria == "Skincare"  # primeira busca que achou vence
    assert r == {"buscas": 2, "falhas": 0, "novas": 1, "atualizadas": 0, "apagadas": 3}
    assert repo.limpeza == "2026-10-29T11:00:00+00:00"


def test_executar_conta_falhas_sem_parar():
    con = ConectorFalso({"a": RuntimeError("caiu"), "b": [of("9")]})
    repo = RepoFalso()
    r = buscar_ofertas.executar(CONFIG, [con], repo, AGORA)
    assert r["falhas"] == 1 and r["novas"] == 1


def test_main_sem_credenciais_shopee_termina_ok(monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    monkeypatch.delenv("SHOPEE_APP_ID", raising=False)
    monkeypatch.delenv("SHOPEE_SECRET", raising=False)
    monkeypatch.setattr(buscar_ofertas, "Repositorio", lambda url, chave: RepoFalso())
    assert buscar_ofertas.main() == 0
    assert "Shopee sem credenciais" in capsys.readouterr().out
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `python -m pytest tests/test_buscar_ofertas.py -q`
Expected: `ModuleNotFoundError: No module named 'buscar_ofertas'`.

- [ ] **Step 4: Implementar**

`scripts/buscar_ofertas.py`:
```python
"""Busca ofertas de afiliado e grava como rascunho na tabela achadinhos.

Roda no GitHub Actions (.github/workflows/buscar-ofertas.yml).

Variáveis de ambiente:
  SUPABASE_URL          https://<ref>.supabase.co
  SUPABASE_SECRET_KEY   chave sb_secret_... do robô
  SHOPEE_APP_ID         opcional; sem ele a Shopee é pulada
  SHOPEE_SECRET         opcional

Repositório público: o log mostra só contagens.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from buscador.oferta import passa_filtros, ranquear
from buscador.repositorio import Repositorio
from buscador.shopee import ConectorShopee

CONFIG = Path(__file__).resolve().parent.parent / "config" / "buscas.json"


def executar(config: dict, conectores: list, repo, agora: datetime) -> dict:
    filtros = config["filtros"]
    escolhidas: dict[tuple[str, str], object] = {}
    buscas = falhas = 0
    for conector in conectores:
        for busca in config["buscas"]:
            buscas += 1
            try:
                achadas = conector.buscar(busca["termo"], limite=50)
            except Exception as erro:  # uma busca ruim não derruba as outras
                falhas += 1
                print(f"Falha em {conector.origem} ({type(erro).__name__})")
                continue
            boas = ranquear([o for o in achadas if passa_filtros(o, filtros)])[: filtros["por_busca"]]
            for o in boas:
                chave = (o.origem, o.id_externo)
                if chave not in escolhidas:
                    o.categoria = busca.get("categoria")
                    escolhidas[chave] = o
    novas, atualizadas = repo.sincronizar(list(escolhidas.values()), agora.isoformat())
    limite = agora - timedelta(days=config.get("dias_rascunho", 14))
    apagadas = repo.limpar_rascunhos(limite.isoformat())
    return {"buscas": buscas, "falhas": falhas, "novas": novas, "atualizadas": atualizadas, "apagadas": apagadas}


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").strip()
    chave = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not url or not chave:
        print("SUPABASE_URL/SUPABASE_SECRET_KEY ausentes")
        return 1
    conectores = []
    app_id = os.environ.get("SHOPEE_APP_ID", "").strip()
    segredo = os.environ.get("SHOPEE_SECRET", "").strip()
    if app_id and segredo:
        conectores.append(ConectorShopee(app_id, segredo))
    else:
        print("Shopee sem credenciais: busca pulada")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    r = executar(config, conectores, Repositorio(url, chave), datetime.now(timezone.utc))
    print(f"Buscas: {r['buscas']} | falhas: {r['falhas']} | novas: {r['novas']} | "
          f"atualizadas: {r['atualizadas']} | rascunhos antigos apagados: {r['apagadas']}")
    return 1 if r["buscas"] and r["falhas"] == r["buscas"] else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Rodar todos os testes Python**

Run: `python -m pytest -q`
Expected: `22 passed` (10 + 5 + 4 + 3).

- [ ] **Step 6: Criar o workflow**

`.github/workflows/buscar-ofertas.yml`:
```yaml
name: Buscar ofertas (achadinhos)

on:
  schedule:
    # Todo dia 11:00 UTC = 08:00 em Brasília
    - cron: "0 11 * * *"
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  buscar:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Instalar dependências
        run: pip install --disable-pip-version-check -q -r requirements-dev.txt

      - name: Testes
        run: python -m pytest -q

      - name: Buscar e gravar rascunhos
        env:
          SUPABASE_URL: https://kjcmorylizjelnnfjbas.supabase.co
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
          SHOPEE_APP_ID: ${{ secrets.SHOPEE_APP_ID }}
          SHOPEE_SECRET: ${{ secrets.SHOPEE_SECRET }}
        working-directory: scripts
        run: python buscar_ofertas.py
```

O keepalive de 60 dias já é feito pelo workflow do relatório semanal (commit vazio no mesmo repo), então não se repete aqui.

- [ ] **Step 7: Commit**

```bash
git add config/buscas.json scripts/buscar_ofertas.py tests/test_buscar_ofertas.py .github/workflows/buscar-ofertas.yml
git commit -m "feat(buscador): orquestrador diario e workflow agendado"
```

---

### Task 7: Funções do painel (link de afiliado, texto do grupo, preço) em JS

**Files:**
- Create: `package.json`
- Create: `achadinhos/painel/links.js`
- Create: `tests/links.test.js`

**Interfaces:**
- Produces (ES module `achadinhos/painel/links.js`):
  - `export const AMAZON_TAG = "gabirabelobea-20"`
  - `export function montarLinkAfiliado(url: string) -> { origem: "amazon"|"mercadolivre"|"shopee", link: string, id_externo: string|null }` (lança `Error` com mensagem em português se não aceitar)
  - `export function lerPreco(texto: string) -> number|null` ("59,90", "R$ 1.234,50" → número)
  - `export function formatarPreco(valor: number|null) -> string|null` ("R$ 59,90")
  - `export function textoGrupo(item) -> string`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 2: Escrever os testes**

`tests/links.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { AMAZON_TAG, montarLinkAfiliado, lerPreco, formatarPreco, textoGrupo } from "../achadinhos/painel/links.js";

test("amazon /dp/ ganha tag e perde rastreio", () => {
  const r = montarLinkAfiliado("https://www.amazon.com.br/Serum-Vitamina/dp/B0ABCDE123/ref=sr_1_3?crid=XYZ&keywords=serum");
  assert.deepEqual(r, { origem: "amazon", link: `https://www.amazon.com.br/dp/B0ABCDE123?tag=${AMAZON_TAG}`, id_externo: "B0ABCDE123" });
});

test("amazon /gp/product/ e tag de outra pessoa substituída", () => {
  const r = montarLinkAfiliado("https://amazon.com.br/gp/product/B012345678?tag=outra-20");
  assert.equal(r.link, `https://www.amazon.com.br/dp/B012345678?tag=${AMAZON_TAG}`);
});

test("amzn.to é recusado com explicação", () => {
  assert.throws(() => montarLinkAfiliado("https://amzn.to/3abc"), /link completo/);
});

test("mercado livre afiliado entra como está", () => {
  const url = "https://mercadolivre.com/sec/1aBcD2e";
  assert.deepEqual(montarLinkAfiliado(url), { origem: "mercadolivre", link: url, id_externo: null });
});

test("mercado livre com MLB extrai id", () => {
  const r = montarLinkAfiliado("https://produto.mercadolivre.com.br/MLB-1234567890-serum-_JM");
  assert.equal(r.id_externo, "MLB1234567890");
});

test("shopee curto de afiliado aceito", () => {
  const url = "https://s.shopee.com.br/AbC123";
  assert.deepEqual(montarLinkAfiliado(url), { origem: "shopee", link: url, id_externo: null });
});

test("http e lojas desconhecidas recusados", () => {
  assert.throws(() => montarLinkAfiliado("http://www.amazon.com.br/dp/B0ABCDE123"), /https/);
  assert.throws(() => montarLinkAfiliado("https://loja-qualquer.com/x"), /Amazon, Mercado Livre ou Shopee/);
  assert.throws(() => montarLinkAfiliado("não é link"), /link válido/);
});

test("preço", () => {
  assert.equal(lerPreco("59,90"), 59.9);
  assert.equal(lerPreco("R$ 1.234,50"), 1234.5);
  assert.equal(lerPreco(""), null);
  assert.equal(formatarPreco(1234.5), "R$ 1.234,50");
  assert.equal(formatarPreco(null), null);
});

test("texto do grupo com desconto", () => {
  const t = textoGrupo({ titulo: "Sérum C", preco_atual: 59.9, preco_original: 79.9, desconto_pct: 25, link: "https://s.shopee.com.br/A" });
  assert.equal(t, "✨ Achadinho da Gabi\nSérum C\nDe R$ 79,90 por R$ 59,90 (25% off)\nhttps://s.shopee.com.br/A\nLink de afiliado. Preço e estoque podem mudar.");
});

test("texto do grupo sem desconto", () => {
  const t = textoGrupo({ titulo: "Óleo", preco_atual: 30, link: "https://x.com" });
  assert.match(t, /\nPor R\$ 30,00\n/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/*.test.js`
Expected: falha com `Cannot find module ... achadinhos/painel/links.js`.

- [ ] **Step 4: Implementar**

`achadinhos/painel/links.js`:
```js
// Funções puras do painel dos achadinhos (testadas com node --test).

export const AMAZON_TAG = "gabirabelobea-20";

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarPreco(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  return fmt.format(valor).replace(/\u00a0/g, " ");
}

export function lerPreco(texto) {
  const limpo = String(texto || "").replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function terminaCom(host, dominio) {
  return host === dominio || host.endsWith(`.${dominio}`);
}

export function montarLinkAfiliado(texto) {
  let u;
  try { u = new URL(String(texto).trim()); } catch { throw new Error("Cole um link válido, começando com https://"); }
  if (u.protocol !== "https:") throw new Error("O link precisa começar com https://");
  const host = u.hostname.toLowerCase();

  if (host === "amzn.to") throw new Error("Use o link completo do produto na Amazon (amazon.com.br/...), não o link encurtado.");
  if (terminaCom(host, "amazon.com.br")) {
    const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (!m) throw new Error("Não achei o código do produto nesse link da Amazon. Abra a página do produto e copie o link de lá.");
    const asin = m[1].toUpperCase();
    return { origem: "amazon", link: `https://www.amazon.com.br/dp/${asin}?tag=${AMAZON_TAG}`, id_externo: asin };
  }
  if (terminaCom(host, "mercadolivre.com.br") || terminaCom(host, "mercadolivre.com") || host === "meli.la") {
    const m = u.pathname.match(/MLB-?(\d+)/i);
    return { origem: "mercadolivre", link: u.href, id_externo: m ? `MLB${m[1]}` : null };
  }
  if (host === "s.shopee.com.br" || host === "collshp.com") {
    return { origem: "shopee", link: u.href, id_externo: null };
  }
  throw new Error("Por enquanto só aceito links da Amazon, Mercado Livre ou Shopee.");
}

export function textoGrupo(item) {
  const linhas = ["✨ Achadinho da Gabi", item.titulo];
  const atual = formatarPreco(item.preco_atual ?? null);
  const original = formatarPreco(item.preco_original ?? null);
  if (atual && original && item.desconto_pct > 0) {
    linhas.push(`De ${original} por ${atual} (${Math.round(item.desconto_pct)}% off)`);
  } else if (atual) {
    linhas.push(`Por ${atual}`);
  } else if (item.preco) {
    linhas.push(`Por ${item.preco}`);
  }
  linhas.push(item.link, "Link de afiliado. Preço e estoque podem mudar.");
  return linhas.join("\n");
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/*.test.js`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json achadinhos/painel/links.js tests/links.test.js
git commit -m "feat(painel): link de afiliado Amazon/ML/Shopee e texto do grupo"
```

---

### Task 8: Painel com login (HTML + JS + CSS)

**Files:**
- Create: `achadinhos/painel/index.html`
- Create: `achadinhos/painel/painel.js`
- Modify: `styles.css` (bloco novo no fim: `/* ---------- Painel dos achadinhos ---------- */`)

**Interfaces:**
- Consumes: `montarLinkAfiliado`, `lerPreco`, `formatarPreco`, `textoGrupo` (Task 7); colunas e RLS (Task 1); Auth configurado (Task 2)
- Produces: página `https://gabibeauty.com.br/achadinhos/painel/`

- [ ] **Step 1: HTML**

`achadinhos/painel/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Painel dos Achadinhos</title>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; script-src 'self' https://cdn.jsdelivr.net; connect-src https://kjcmorylizjelnnfjbas.supabase.co wss://kjcmorylizjelnnfjbas.supabase.co; base-uri 'self'; form-action 'none'">
  <meta name="referrer" content="no-referrer">
  <link rel="icon" href="../../assets/logo.svg" type="image/svg+xml">
  <link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../styles.css?v=11">
</head>
<body class="achados-pagina painel">

<header class="achados-topo">
  <span class="marca"><img src="../../assets/logo.svg" alt="" width="36" height="36"><span class="marca__nome">Painel<small>Achadinhos</small></span></span>
  <button type="button" class="btn btn--linha btn--sm" id="sair" hidden><span>Sair</span></button>
</header>

<main class="achados">
  <section id="telaLogin" class="painel__login" hidden>
    <h1>Entrar no painel</h1>
    <p>Digite seu e-mail. Você recebe um link para entrar, sem senha.</p>
    <form id="formLogin">
      <input id="email" type="email" autocomplete="email" required placeholder="seu@email.com">
      <button class="btn btn--escuro" type="submit"><span>Enviar link</span></button>
    </form>
    <p class="painel__msg" id="msgLogin" role="status"></p>
  </section>

  <section id="telaPainel" hidden>
    <nav class="achados__filtros" aria-label="Situação">
      <button type="button" class="achados__chip" data-status="rascunho" aria-pressed="true">Para aprovar</button>
      <button type="button" class="achados__chip" data-status="aprovado" aria-pressed="false">No ar</button>
      <button type="button" class="achados__chip" data-status="descartado" aria-pressed="false">Descartados</button>
      <button type="button" class="achados__chip" id="abrirNovo">+ Adicionar por link</button>
    </nav>

    <form id="formNovo" class="painel__novo" hidden>
      <h2>Adicionar por link</h2>
      <label>Link do produto (Amazon, Mercado Livre ou Shopee)<input name="url" type="url" required></label>
      <label>Nome do produto<input name="titulo" required minlength="2" maxlength="120"></label>
      <label>Preço (ex.: 59,90)<input name="preco" inputmode="decimal"></label>
      <label>Link da foto (botão direito na foto → copiar endereço da imagem)<input name="imagem_url" type="url"></label>
      <label>Categoria<input name="categoria" maxlength="40" list="categorias"></label>
      <datalist id="categorias"><option value="Skincare"><option value="Corpo"><option value="Cabelo"><option value="Maquiagem"></datalist>
      <div class="painel__acoes">
        <button class="btn btn--escuro btn--sm" type="submit"><span>Publicar</span></button>
        <button class="btn btn--linha btn--sm" type="button" id="cancelarNovo"><span>Cancelar</span></button>
      </div>
      <p class="painel__msg" id="msgNovo" role="status"></p>
    </form>

    <p class="painel__msg" id="msgLista" role="status"></p>
    <ul class="achados__grade" id="lista"></ul>
  </section>
</main>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js" integrity="sha384-GFr3yTh5lJznCbZfpTtXnwboFsxqtTQoeTZCRHhE0579KrRmlCzen5AA8ohaB5ug" crossorigin="anonymous"></script>
<script type="module" src="painel.js?v=11"></script>
</body>
</html>
```

- [ ] **Step 2: JS**

`achadinhos/painel/painel.js`:
```js
import { montarLinkAfiliado, lerPreco, formatarPreco, textoGrupo } from "./links.js";

const SUPABASE_URL = "https://kjcmorylizjelnnfjbas.supabase.co";
const SUPABASE_KEY = "sb_publishable_JTFPBNC2iM1LXi0IDYxSfQ_HPAH6BB0";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = s => document.querySelector(s);
let statusAtual = "rascunho";

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined && texto !== null) e.textContent = texto;
  return e;
}

function botao(rotulo, classe, acao) {
  const b = el("button", `btn ${classe} btn--sm`);
  b.type = "button";
  b.append(el("span", "", rotulo));
  b.addEventListener("click", acao);
  return b;
}

function aviso(alvo, texto, erro = false) {
  alvo.textContent = texto;
  alvo.classList.toggle("painel__msg--erro", erro);
}

async function mudarStatus(id, status) {
  const { error } = await db.from("achadinhos").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return aviso($("#msgLista"), "Não consegui salvar. Tente de novo.", true);
  carregar();
}

async function salvarEdicao(id, titulo, categoria, msg) {
  const { error } = await db.from("achadinhos").update({ titulo: titulo.trim(), categoria: categoria.trim() || null }).eq("id", id);
  aviso(msg, error ? "Não salvou: confira o nome (2 a 120 letras)." : "Salvo.", Boolean(error));
}

function card(item) {
  const li = el("li", "achado");
  const foto = el("div", "achado__foto");
  if (item.imagem_url) {
    const img = el("img");
    img.src = item.imagem_url; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    foto.append(img);
  }
  foto.append(el("span", "achado__loja", item.loja || item.origem));
  li.append(foto);

  const corpo = el("div", "achado__corpo");
  const titulo = el("input", "painel__campo"); titulo.value = item.titulo; titulo.maxLength = 120; titulo.setAttribute("aria-label", "Nome do produto");
  const categoria = el("input", "painel__campo"); categoria.value = item.categoria || ""; categoria.maxLength = 40; categoria.placeholder = "Categoria"; categoria.setAttribute("list", "categorias");
  const msg = el("p", "painel__msg");
  corpo.append(titulo, categoria);

  const dados = [];
  if (item.preco_atual != null) dados.push(formatarPreco(Number(item.preco_atual)));
  if (item.desconto_pct > 0) dados.push(`-${Math.round(item.desconto_pct)}%`);
  if (item.comissao_pct != null) dados.push(`comissão ${Number(item.comissao_pct).toLocaleString("pt-BR")}%`);
  if (item.avaliacao != null) dados.push(`★ ${Number(item.avaliacao).toLocaleString("pt-BR")}`);
  if (item.vendas != null) dados.push(`${item.vendas} vendas`);
  corpo.append(el("p", "achado__desc", dados.join(" · ")));

  const abrir = el("a", "painel__link", "Abrir na loja ↗");
  abrir.href = item.link; abrir.target = "_blank"; abrir.rel = "noopener noreferrer";
  corpo.append(abrir);

  const acoes = el("div", "painel__acoes");
  acoes.append(botao("Salvar texto", "btn--linha", () => salvarEdicao(item.id, titulo.value, categoria.value, msg)));
  if (item.status !== "aprovado") acoes.append(botao("Aprovar", "btn--escuro", () => mudarStatus(item.id, "aprovado")));
  if (item.status !== "descartado") acoes.append(botao("Descartar", "btn--linha", () => mudarStatus(item.id, "descartado")));
  if (item.status !== "rascunho") acoes.append(botao("Voltar p/ aprovar", "btn--linha", () => mudarStatus(item.id, "rascunho")));
  acoes.append(botao("Copiar p/ grupo", "btn--dourado", async () => {
    try { await navigator.clipboard.writeText(textoGrupo({ ...item, titulo: titulo.value })); aviso(msg, "Texto copiado. Cole no grupo."); }
    catch { aviso(msg, "Não consegui copiar. Segure o dedo no texto para copiar.", true); }
  }));
  corpo.append(acoes, msg);
  li.append(corpo);
  return li;
}

async function carregar() {
  aviso($("#msgLista"), "Carregando…");
  const { data, error } = await db.from("achadinhos").select("*").eq("status", statusAtual)
    .order("atualizado_em", { ascending: false }).limit(200);
  if (error) return aviso($("#msgLista"), "Não consegui carregar. Seu e-mail tem acesso ao painel?", true);
  $("#lista").replaceChildren(...data.map(card));
  aviso($("#msgLista"), data.length ? `${data.length} item(ns)` : "Nada por aqui.");
}

async function adicionar(e) {
  e.preventDefault();
  const f = e.target;
  const msg = $("#msgNovo");
  let destino;
  try { destino = montarLinkAfiliado(f.url.value); } catch (erro) { return aviso(msg, erro.message, true); }
  const imagem = f.imagem_url.value.trim();
  if (imagem && !imagem.startsWith("https://")) return aviso(msg, "O link da foto precisa começar com https://", true);
  const preco = lerPreco(f.preco.value);
  const { error } = await db.from("achadinhos").insert({
    ...destino,
    titulo: f.titulo.value.trim(),
    preco_atual: preco,
    preco: formatarPreco(preco),
    imagem_url: imagem || null,
    categoria: f.categoria.value.trim() || null,
    loja: { amazon: "Amazon", mercadolivre: "Mercado Livre", shopee: "Shopee" }[destino.origem],
    status: "aprovado",
  });
  if (error) {
    const repetido = error.code === "23505";
    return aviso(msg, repetido ? "Esse produto já está cadastrado." : "Não consegui salvar. Confira os campos.", true);
  }
  f.reset();
  f.hidden = true;
  statusAtual = "aprovado";
  marcarAba();
  carregar();
}

function marcarAba() {
  document.querySelectorAll("[data-status]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.status === statusAtual)));
}

function mostrar(logado) {
  $("#telaLogin").hidden = logado;
  $("#telaPainel").hidden = !logado;
  $("#sair").hidden = !logado;
  if (logado) carregar();
}

$("#formLogin").addEventListener("submit", async e => {
  e.preventDefault();
  const { error } = await db.auth.signInWithOtp({
    email: $("#email").value.trim(),
    options: { emailRedirectTo: `${location.origin}/achadinhos/painel/`, shouldCreateUser: false },
  });
  aviso($("#msgLogin"), error ? "Não consegui enviar. Confira o e-mail." : "Pronto! Abra seu e-mail e toque no link para entrar.", Boolean(error));
});
$("#sair").addEventListener("click", async () => { await db.auth.signOut(); mostrar(false); });
document.querySelectorAll("[data-status]").forEach(b => b.addEventListener("click", () => { statusAtual = b.dataset.status; marcarAba(); carregar(); }));
$("#abrirNovo").addEventListener("click", () => { $("#formNovo").hidden = false; $("#formNovo").url.focus(); });
$("#cancelarNovo").addEventListener("click", () => { $("#formNovo").reset(); $("#formNovo").hidden = true; });
$("#formNovo").addEventListener("submit", adicionar);

db.auth.onAuthStateChange((_evento, sessao) => mostrar(Boolean(sessao)));
const { data: { session } } = await db.auth.getSession();
mostrar(Boolean(session));
```

- [ ] **Step 3: CSS**

Adicionar ao fim de `styles.css`:
```css
/* ---------- Painel dos achadinhos (/achadinhos/painel) ---------- */
.painel__login { max-width: 420px; margin: 3rem auto; background: #fff; border-radius: 20px; padding: 2rem; text-align: center; }
.painel__login h1 { font-family: var(--serif); font-weight: 400; font-size: 1.8rem; margin-bottom: .5rem; }
.painel__login form { display: grid; gap: .8rem; margin-top: 1.2rem; }
.painel input { font: 400 .9rem var(--sans); padding: .7rem .8rem; border: 1px solid var(--nude-2); border-radius: 10px; width: 100%; background: #fff; }
.painel__novo { background: #fff; border-radius: 20px; padding: 1.4rem; margin: 0 auto 2rem; max-width: 560px; display: grid; gap: .8rem; }
.painel__novo h2 { font-family: var(--serif); font-weight: 400; font-size: 1.4rem; }
.painel__novo label { display: grid; gap: .3rem; font-size: .78rem; color: var(--muted); }
.painel__campo { margin-bottom: .2rem; }
.painel__acoes { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .4rem; }
.painel__link { font-size: .78rem; color: var(--dourado); }
.painel__msg { font-size: .8rem; color: var(--muted); text-align: center; margin: .4rem 0; min-height: 1em; }
.painel__msg--erro { color: #b4475f; }
@media (max-width: 560px) {
  .painel .achados__grade { grid-template-columns: 1fr; }
  .painel .achado__foto { aspect-ratio: 16 / 9; }
}
```

- [ ] **Step 4: Testar localmente (login real)**

Run: `preview_start gabibeauty-site` (ou `python -m http.server 8951`) e abrir `http://localhost:8951/achadinhos/painel/`.
Expected: tela "Entrar no painel", console sem erro de CSP/SRI.
Pedir ao usuário que a Gabi (ou ele, com acesso ao Gmail dela) digite o e-mail e toque no link recebido. Expected: abre o painel na aba "Para aprovar" com "Nada por aqui."

- [ ] **Step 5: Testar o acesso de não-admin**

Em aba anônima, tentar entrar com um e-mail fora de `admins`.
Expected: com cadastro desligado e `shouldCreateUser: false`, o envio falha ("Não consegui enviar"). Nenhum dado visível.

- [ ] **Step 6: Commit**

```bash
git add achadinhos/painel/index.html achadinhos/painel/painel.js styles.css
git commit -m "feat(painel): aprovacao de achadinhos com login por link magico"
```

---

### Task 9: Ponta a ponta, publicação e registro

**Files:**
- Modify: `G:\Obsidian\CerebroClaude\projects\Gabriela Rabelo Beauty.md`

- [ ] **Step 1: Teste ponta a ponta com rascunho falso**

No SQL Editor:
```sql
insert into public.achadinhos (origem, id_externo, titulo, link, imagem_url, loja, categoria, preco, preco_atual, preco_original, desconto_pct, comissao_pct, avaliacao, vendas)
values ('shopee', 'TESTE-1', 'TESTE Sérum (apagar)', 'https://gabibeauty.com.br/#teste', 'https://gabibeauty.com.br/assets/img/ultrassom-1-capa.webp', 'Shopee', 'Skincare', 'R$ 59,90', 59.90, 79.90, 25, 8, 4.9, 1520)
returning id;
```
Expected: o item aparece em "Para aprovar" no painel; NÃO aparece em `/achadinhos/`. `python scripts/verificar_rls.py` → 6 OK.
Aprovar no painel → aparece em `/achadinhos/` com "R$ 79,90" riscado e selo "-25%". "Copiar p/ grupo" copia o texto do modelo.

- [ ] **Step 2: Limpar o teste**

```sql
delete from public.achadinhos where id_externo = 'TESTE-1' returning titulo;
```

- [ ] **Step 3: Publicar**

```bash
git push origin main
```
Esperar o Pages (≈1 min) e conferir `https://gabibeauty.com.br/achadinhos/painel/` (200) e `/achadinhos/` sem erro.

- [ ] **Step 4: Rodar o workflow manualmente**

GitHub → Actions → "Buscar ofertas (achadinhos)" → Run workflow (ou `gh workflow run buscar-ofertas.yml`).
Expected sem credenciais da Shopee: testes passam, log mostra "Shopee sem credenciais: busca pulada" e "Buscas: 0 | ...", job verde.

- [ ] **Step 5: Quando a Gabi mandar as credenciais**

Ela cadastra em GitHub → repo → Settings → Secrets and variables → Actions: `SHOPEE_APP_ID` e `SHOPEE_SECRET` (nunca pelo chat). Rodar o workflow de novo.
Expected: "Buscas: 6 | falhas: 0 | novas: N" e os rascunhos aparecem no painel.

- [ ] **Step 6: Atualizar a nota do projeto**

Na seção "Achadinhos da Gabi" de `projects/Gabriela Rabelo Beauty.md`, trocar o passo a passo de cadastro pelo Table Editor por: painel em `/achadinhos/painel/` (login por link mágico), aprovação de rascunhos do robô, "Adicionar por link" (Amazon com tag `gabirabelobea-20`), robô diário 08:00 com filtros de `config/buscas.json`, credenciais da Shopee pendentes ou configuradas.
