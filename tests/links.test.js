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
