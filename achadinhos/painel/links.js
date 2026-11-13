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
