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
