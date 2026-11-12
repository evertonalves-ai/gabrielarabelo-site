# Achadinhos: buscador de ofertas + painel de aprovação

Data: 2026-11-12
Status: aprovado em conversa, aguardando revisão desta spec

## Objetivo

Encontrar ofertas de beleza, skincare e cuidados com o corpo nos programas de afiliado da Gabi, guardar como rascunho e deixar a Gabi aprovar pelo celular o que vai para https://gabibeauty.com.br/achadinhos/ e para o grupo de ofertas no WhatsApp.

## Programas de afiliado

| Programa | Identificação | Como entra nesta etapa |
|---|---|---|
| Shopee Afiliados | vitrine `collshp.com/gabrielarabelo61630` | busca automática pela API oficial (GraphQL) |
| Amazon Associados | tag `gabirabelobea-20` | "Adicionar por link": o painel acrescenta a tag ao link colado |
| Mercado Livre Afiliados | conta da Gabi | "Adicionar por link": link de afiliado gerado no painel do ML e colado pronto |
| Awin / Rakuten / Lomadee | a definir | etapa futura |

Restrições:
- A Amazon cancela a conta se nenhum link gerar pedido em 180 dias a partir do cadastro (2026-11-12). Prioridade: publicar achadinhos da Amazon cedo.
- A API de produtos da Amazon (PA-API) só libera após 3 vendas qualificadas. Até lá, nada automático na Amazon.
- Sem raspagem de páginas da Amazon ou do Mercado Livre (proibido nos termos dos dois programas).

## Fora do escopo

- Postagem automática no grupo do WhatsApp (exige WhatsApp Business API). O painel gera o texto para copiar.
- Busca automática no Mercado Livre, Amazon PA-API e redes Awin/Rakuten/Lomadee (etapas futuras, cada uma um conector novo).

## Arquitetura

```
GitHub Actions (cron diário 08:00 BRT)
  └─ scripts/buscar_ofertas.py
       ├─ lê config/buscas.json (palavras-chave + filtros)
       ├─ conectores/shopee.py  → API Shopee Afiliados
       └─ upsert em public.achadinhos (status = rascunho)   [chave secreta]

Painel  /achadinhos/painel/   (login por link mágico, só admins)
  ├─ lista rascunhos → Aprovar / Descartar / Ajustar
  ├─ Adicionar por link (Amazon com tag automática, ML com link pronto)
  └─ Copiar texto para o grupo

Site público  /achadinhos/   → lê só status = aprovado   [chave publicável]
```

Tudo no repo `gabrielarabelo-site` (público). Segredos só em GitHub Actions secrets.

## Dados

Migração da tabela `public.achadinhos` (criada em 2026-11-12, hoje vazia):

Colunas novas:
- `origem text not null default 'manual'` — `shopee`, `amazon`, `mercadolivre`, `manual`
- `id_externo text` — id do produto na loja; único junto com `origem` (evita duplicata)
- `preco_atual numeric(10,2)`, `preco_original numeric(10,2)`, `desconto_pct numeric(5,2)`
- `comissao_pct numeric(5,2)`, `avaliacao numeric(3,2)`, `vendas integer`
- `status text not null default 'rascunho'` — `rascunho`, `aprovado`, `descartado`
- `atualizado_em timestamptz not null default now()`

Mudanças:
- `preco` (texto) continua como texto de exibição; o buscador preenche a partir de `preco_atual` (ex. "R$ 59,90").
- `ativo` é removida; o site passa a filtrar `status = 'aprovado'`.
- Índice único parcial em `(origem, id_externo)` quando `id_externo` não é nulo.

Tabela nova `public.admins (email text primary key)` com `gabi.rabelobeauty@gmail.com`.

Permissões (RLS):
- `anon`: SELECT só nas colunas de exibição e só onde `status = 'aprovado'`. Sem escrita.
- `authenticated` + e-mail do JWT em `admins`: SELECT, INSERT, UPDATE em `achadinhos`. Sem DELETE (descartar = mudar status).
- `authenticated` fora de `admins`: nada.
- Robô: chave secreta (ignora RLS), usada só no GitHub Actions.
- Supabase Auth: cadastro aberto desligado; usuária da Gabi criada por convite.

## Buscador

`config/buscas.json`:
```json
{
  "filtros": { "avaliacao_min": 4.7, "vendas_min": 100, "comissao_min_pct": 5, "por_busca": 10 },
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

Fluxo de `buscar_ofertas.py`:
1. Para cada busca, chama o conector, aplica os filtros, mantém as `por_busca` melhores (ordem: comissão × vendas).
2. Upsert por `(origem, id_externo)`:
   - novo → insere como `rascunho`;
   - já existe → atualiza preços, nota, vendas, `atualizado_em`; não mexe em `status`, `titulo` nem `categoria` (preserva ajustes da Gabi).
3. Apaga rascunhos com `atualizado_em` mais antigo que 14 dias.
4. Log só com contagens (repo público).

Conector Shopee (`conectores/shopee.py`):
- POST GraphQL em `https://open-api.affiliate.shopee.com.br/graphql`, query `productOfferV2(keyword, sortType, page, limit)`.
- Header `Authorization: SHA256 Credential={AppId}, Timestamp={ts}, Signature={sha256(AppId + ts + payload + Secret)}`. Confirmar formato exato na documentação oficial ao implementar.
- Usa `offerLink` (já é o link de afiliado) como `link`; `imageUrl`, `productName`, `priceMin`, `priceDiscountRate`, `commissionRate`, `sales`, `ratingStar`, `itemId`.
- Interface comum: `buscar(termo, limite) -> list[Oferta]`, onde `Oferta` é um dataclass com os campos da tabela.
- Sem credenciais (`SHOPEE_APP_ID`/`SHOPEE_SECRET` vazios), o conector é pulado com aviso e o job termina com sucesso.

Erros: falha numa busca não derruba as outras; o job falha (vermelho no Actions) só se todas falharem ou se o Supabase recusar a escrita.

## Painel `/achadinhos/painel/`

- HTML/CSS/JS estático no mesmo padrão do site, supabase-js v2 via CDN com SRI.
- Login: campo de e-mail → `signInWithOtp` (link mágico). Sessão guardada pelo supabase-js.
- Abas: Rascunhos (padrão), Aprovados, Descartados.
- Card: foto, loja, título (editável), categoria (editável), preço atual, preço original riscado, desconto, comissão, nota, vendas, link "abrir na loja".
- Ações: Aprovar, Descartar, Voltar para rascunho, Copiar texto para o grupo.
- Texto do grupo (modelo):
  ```
  ✨ Achadinho da Gabi
  {titulo}
  De R$ {preco_original} por R$ {preco_atual} ({desconto}% off)
  {link}
  Link de afiliado. Preço e estoque podem mudar.
  ```
- Adicionar por link: cola URL, informa título, preço, URL da imagem e categoria.
  - URL da Amazon (`amazon.com.br`): remove parâmetros de rastreio, garante `tag=gabirabelobea-20`, `origem = amazon`, `id_externo` = ASIN extraído da URL.
  - URL do ML de afiliado (`mercadolivre.com`, `meli.la`): usa como está, `origem = mercadolivre`.
  - Outras: recusa com mensagem.
  - Entra direto como `aprovado` (a própria Gabi está cadastrando).
- `noindex` na página do painel.

## Site público

`achadinhos.js` passa a filtrar `status=eq.aprovado` e a mostrar preço original riscado e selo de desconto quando houver.

## Segredos (GitHub Actions)

- `SUPABASE_SECRET_KEY` (já existe)
- `SHOPEE_APP_ID`, `SHOPEE_SECRET` (a Gabi obtém em affiliate.shopee.com.br → API aberta)

## Testes

- pytest: assinatura Shopee com vetor fixo; conversão de resposta da API (fixture JSON) para `Oferta`; filtros; montagem do link Amazon (com/sem tag existente, com parâmetros de rastreio, ASIN em `/dp/` e `/gp/product/`).
- RLS via REST com a chave publicável: anon não vê rascunho; anon não escreve; usuário logado fora de `admins` não lê nem atualiza.
- Ponta a ponta: rodar o job com conector de teste (oferta falsa) → aparece no painel → aprovar → aparece no site → apagar.
- Quando houver credenciais: rodar o job real uma vez manualmente (`workflow_dispatch`) e conferir os rascunhos.
