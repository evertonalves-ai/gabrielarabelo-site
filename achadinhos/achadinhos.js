(() => {
  "use strict";

  // Chave publicável: só permite LER os achadinhos ativos (RLS + grants por coluna).
  const SUPABASE_URL = "https://kjcmorylizjelnnfjbas.supabase.co";
  const SUPABASE_KEY = "sb_publishable_JTFPBNC2iM1LXi0IDYxSfQ_HPAH6BB0";
  const CAMPOS = "titulo,descricao,preco,imagem_url,link,loja,categoria";

  // Convite do grupo de ofertas (https://chat.whatsapp.com/...). Vazio = botão escondido.
  const GRUPO_WHATSAPP = "";

  const $ = s => document.querySelector(s);
  const grade = $("#achadosGrade");
  const filtros = $("#achadosFiltros");
  const vazio = $("#achadosVazio");
  let itens = [];

  if (GRUPO_WHATSAPP.startsWith("https://chat.whatsapp.com/")) {
    const grupo = $("#achadosGrupo");
    grupo.href = GRUPO_WHATSAPP;
    grupo.hidden = false;
  }

  // Só aceita https; qualquer outra coisa vira null e o item/imagem é ignorado
  function urlSegura(valor) {
    try {
      const u = new URL(valor);
      return u.protocol === "https:" ? u.href : null;
    } catch { return null; }
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto) e.textContent = texto;
    return e;
  }

  function card(item) {
    const li = el("li", "achado");
    const img = urlSegura(item.imagem_url);
    const foto = el("div", "achado__foto");
    if (img) {
      const i = el("img");
      i.src = img;
      i.alt = item.titulo;
      i.loading = "lazy";
      i.decoding = "async";
      i.referrerPolicy = "no-referrer";
      i.addEventListener("error", () => i.remove());
      foto.append(i);
    }
    if (item.loja) foto.append(el("span", "achado__loja", item.loja));
    li.append(foto);

    const corpo = el("div", "achado__corpo");
    corpo.append(el("h2", "achado__titulo", item.titulo));
    if (item.descricao) corpo.append(el("p", "achado__desc", item.descricao));
    const rodape = el("div", "achado__rodape");
    if (item.preco) rodape.append(el("span", "achado__preco", item.preco));
    const a = el("a", "btn btn--escuro btn--sm");
    a.href = item.link;
    a.target = "_blank";
    a.rel = "sponsored noopener noreferrer";
    a.append(el("span", "", "Ver oferta"));
    rodape.append(a);
    corpo.append(rodape);
    li.append(corpo);
    return li;
  }

  function mostrar(categoria) {
    grade.replaceChildren(...itens
      .filter(i => !categoria || i.categoria === categoria)
      .map(card));
  }

  function montarFiltros() {
    const cats = [...new Set(itens.map(i => i.categoria).filter(Boolean))];
    if (cats.length < 2) return;
    const botoes = [["Tudo", ""], ...cats.map(c => [c, c])].map(([rotulo, valor], n) => {
      const b = el("button", "achados__chip", rotulo);
      b.type = "button";
      b.setAttribute("aria-pressed", n === 0 ? "true" : "false");
      b.addEventListener("click", () => {
        filtros.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        mostrar(valor);
      });
      return b;
    });
    filtros.replaceChildren(...botoes);
    filtros.hidden = false;
  }

  async function carregar() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/achadinhos?select=${CAMPOS}&ativo=eq.true&order=ordem.asc,created_at.desc&limit=200`,
        { headers: { apikey: SUPABASE_KEY } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      itens = (await res.json())
        .map(i => ({ ...i, link: urlSegura(i.link) }))
        .filter(i => i.link && i.titulo);
    } catch {
      itens = [];
    }
    if (!itens.length) { vazio.hidden = false; return; }
    montarFiltros();
    mostrar("");
  }

  carregar();
})();
