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
