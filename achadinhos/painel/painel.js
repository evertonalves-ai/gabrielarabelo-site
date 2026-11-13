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
