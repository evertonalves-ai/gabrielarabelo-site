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
