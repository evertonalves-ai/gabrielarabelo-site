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
